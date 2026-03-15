use std::{env, fs, path::PathBuf};

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use base64::Engine as _;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

use crate::AppState;

const GEMINI_TTS_MODEL_DEFAULT: &str = "gemini-2.5-flash-preview-tts";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsRequest {
    pub text: String,
    #[serde(default)]
    pub voice_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub audio_url: String,
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsResponse {
    candidates: Option<Vec<GeminiTtsCandidate>>,
    error: Option<GeminiTtsError>,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsCandidate {
    content: Option<GeminiTtsContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsContent {
    parts: Option<Vec<GeminiTtsPart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsPart {
    #[serde(rename = "inlineData")]
    inline_data: Option<GeminiTtsInlineData>,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct GeminiTtsError {
    message: String,
}

fn tts_model() -> String {
    env::var("GEMINI_TTS_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| GEMINI_TTS_MODEL_DEFAULT.to_string())
}

fn parse_sample_rate_hz(mime_type: &str) -> Option<u32> {
    let lower = mime_type.to_ascii_lowercase();
    let marker = "rate=";
    let start = lower.find(marker)? + marker.len();
    let digits = lower[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u32>().ok()
}

fn pcm_s16le_to_wav(bytes: &[u8], sample_rate_hz: u32, channels: u16) -> Vec<u8> {
    let bits_per_sample = 16u16;
    let byte_rate = sample_rate_hz * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    let mut wav = Vec::with_capacity(bytes.len() + 44);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + bytes.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate_hz.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    wav.extend_from_slice(bytes);
    wav
}

pub async fn generate_tts_handler(
    State(_state): State<AppState>,
    Json(request): Json<TtsRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GEMINI_API_KEY environment variable not set".to_string(),
        )
    })?;

    let voice = request
        .voice_name
        .as_deref()
        .unwrap_or("Kore");

    let body = json!({
        "contents": [{
            "parts": [{
                "text": request.text.trim()
            }]
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice
                    }
                }
            }
        }
    });

    let response = Client::new()
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            tts_model()
        ))
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Gemini TTS request failed: {error}"),
            )
        })?;

    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS read failed: {error}"),
        )
    })?;

    let payload: GeminiTtsResponse = serde_json::from_str(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS parse failed: {error}"),
        )
    })?;

    if !status.is_success() {
        return Err((
            StatusCode::BAD_REQUEST,
            payload
                .error
                .map(|error| error.message)
                .unwrap_or(raw),
        ));
    }

    let inline = payload
        .candidates
        .and_then(|candidates| candidates.into_iter().find_map(|c| c.content))
        .and_then(|content| content.parts)
        .and_then(|parts| parts.into_iter().find_map(|part| part.inline_data))
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Gemini TTS response did not contain audio data".to_string(),
            )
        })?;

    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&inline.data)
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to decode TTS audio bytes: {error}"),
            )
        })?;

    let sample_rate_hz = parse_sample_rate_hz(&inline.mime_type).unwrap_or(24_000);
    let wav_bytes = if inline.mime_type.eq_ignore_ascii_case("audio/wav") {
        audio_bytes
    } else {
        pcm_s16le_to_wav(&audio_bytes, sample_rate_hz, 1)
    };

    // Write to a temp file and serve it
    let tts_dir = PathBuf::from("generated/tts");
    fs::create_dir_all(&tts_dir).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create TTS directory: {error}"),
        )
    })?;

    let file_id = Uuid::new_v4().to_string();
    let file_name = format!("{file_id}.wav");
    fs::write(tts_dir.join(&file_name), &wav_bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write TTS audio: {error}"),
        )
    })?;

    Ok((
        StatusCode::OK,
        Json(TtsResult {
            audio_url: format!("/api/tts/{file_name}"),
            mime_type: "audio/wav".to_string(),
        }),
    ))
}
