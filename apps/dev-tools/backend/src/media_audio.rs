use std::{env, fs, path::Path};

use axum::http::StatusCode;
use base64::Engine as _;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::warn;

use crate::gemini;

const GEMINI_INTERLEAVED_MODEL_DEFAULT: &str = "gemini-3-flash-preview";
const GEMINI_TTS_MODEL: &str = "gemini-2.5-flash-preview-tts";
const DEFAULT_DURATION_SECONDS: u32 = 18;
const MAX_DURATION_SECONDS: u32 = 30;
const TTS_SAMPLE_RATE_HZ: u32 = 24_000;
const TOOL_LOGICAL_NAME: &str = "generatemedia.audio";
const TOOL_API_NAME: &str = "generatemedia_audio";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMediaAudioRequest {
    pub prompt: String,
    #[serde(default)]
    pub duration_seconds: Option<u32>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub mood: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GeneratedMediaStatus {
    Success,
    PartialSuccess,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaAudioAsset {
    pub url: String,
    pub duration_seconds: u32,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaImageAsset {
    pub url: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaMetadata {
    pub title: String,
    pub description: String,
    pub intent: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaAudioArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub status: GeneratedMediaStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<GeneratedMediaAudioAsset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<GeneratedMediaImageAsset>,
    pub metadata: GeneratedMediaMetadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterleavedTranscript {
    pub model: String,
    pub logical_tool_name: String,
    pub api_tool_name: String,
    pub tool_called: bool,
    pub thought_signature_detected: bool,
    #[serde(default)]
    pub tool_arguments: Value,
    pub final_response_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaAudioResult {
    pub artifact: GeneratedMediaAudioArtifact,
    pub transcript: InterleavedTranscript,
}

#[derive(Debug, Clone)]
pub struct MediaAudioExecution {
    pub result: GeneratedMediaAudioResult,
    pub audio_preview: Option<String>,
    pub image_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolExecutionPayload {
    prompt: String,
    duration_seconds: u32,
    style: String,
    intent: String,
    category: String,
    mood: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaPlan {
    title: String,
    description: String,
    intent: String,
    tags: Vec<String>,
    image_prompt: String,
    speech_transcript: String,
}

#[derive(Debug, Clone)]
struct AudioGeneration {
    url: String,
    duration_seconds: u32,
}

#[derive(Debug, Clone)]
struct ImageGeneration {
    url: String,
}

pub fn clamp_duration_seconds(value: Option<u32>) -> u32 {
    value.unwrap_or(DEFAULT_DURATION_SECONDS).clamp(1, MAX_DURATION_SECONDS)
}

pub fn interleaved_model() -> String {
    env::var("GEMINI_INTERLEAVED_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| GEMINI_INTERLEAVED_MODEL_DEFAULT.to_string())
}

pub async fn run_interleaved_audio_demo(
    request: &GenerateMediaAudioRequest,
    output_root: &Path,
    job_id: &str,
) -> Result<MediaAudioExecution, (StatusCode, String)> {
    let model = interleaved_model();
    let initial_body = build_initial_interleaved_request(request, TOOL_LOGICAL_NAME);
    let initial_response = match post_generate_content(&model, &initial_body).await {
        Ok(response) => response,
        Err((StatusCode::BAD_REQUEST, message))
            if message.contains("period")
                || message.contains("invalid")
                || message.contains("name") =>
        {
            let retry_body = build_initial_interleaved_request(request, TOOL_API_NAME);
            post_generate_content(&model, &retry_body).await?
        }
        Err(error) => return Err(error),
    };

    let model_content = extract_candidate_content(&initial_response).ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Gemini interleaved response missing candidate content".to_string(),
        )
    })?;
    let tool_call = extract_function_call(&model_content).ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Gemini did not emit a function call for media generation".to_string(),
        )
    })?;
    let payload = normalize_tool_payload(
        request,
        &tool_call
            .get("args")
            .cloned()
            .unwrap_or_else(|| json!({})),
    );
    let plan = build_media_plan(&payload).await;

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create media artifact directory: {error}"),
        )
    })?;

    let (audio, audio_warning) =
        match generate_audio_asset(output_root, &plan, payload.duration_seconds).await {
            Ok(asset) => (Some(asset), None),
            Err((_code, message)) => {
                warn!("audio generation failed for {job_id}: {message}");
                (None, Some(message))
            }
        };
    let (image, image_warning) = match generate_image_asset(output_root, &plan).await {
        Ok(asset) => (Some(asset), None),
        Err((_code, message)) => {
            warn!("image generation failed for {job_id}: {message}");
            (None, Some(message))
        }
    };

    let mut warnings = Vec::new();
    if let Some(message) = audio_warning {
        warnings.push(format!("Audio generation failed: {message}"));
    }
    if let Some(message) = image_warning {
        warnings.push(format!("Image generation failed: {message}"));
    }
    if request.duration_seconds.unwrap_or(DEFAULT_DURATION_SECONDS) > MAX_DURATION_SECONDS {
        warnings.push(format!(
            "Requested duration exceeded {} seconds and was clamped.",
            MAX_DURATION_SECONDS
        ));
    }

    let artifact = GeneratedMediaAudioArtifact {
        artifact_type: "generated_media_audio".to_string(),
        status: compute_artifact_status(audio.is_some(), image.is_some()),
        audio: audio.as_ref().map(|asset| GeneratedMediaAudioAsset {
            url: asset.url.clone(),
            duration_seconds: asset.duration_seconds,
            mime_type: "audio/wav".to_string(),
        }),
        image: image.as_ref().map(|asset| GeneratedMediaImageAsset {
            url: asset.url.clone(),
            mime_type: "image/png".to_string(),
        }),
        metadata: GeneratedMediaMetadata {
            title: plan.title.clone(),
            description: plan.description.clone(),
            intent: plan.intent.clone(),
            tags: plan.tags.clone(),
        },
        warnings,
    };

    let function_response_content = build_function_response_content(
        &tool_call_name(&tool_call),
        &artifact,
        image
            .as_ref()
            .and_then(|_| fs::read(output_root.join("image.png")).ok()),
    );
    let final_body = build_followup_request(request, model_content.clone(), function_response_content);
    let final_response = post_generate_content(&model, &final_body).await?;
    let final_response_text = extract_text_response(&final_response).unwrap_or_else(|| {
        format!(
            "{}\n\n{}",
            artifact.metadata.title, artifact.metadata.description
        )
    });

    let result = GeneratedMediaAudioResult {
        artifact,
        transcript: InterleavedTranscript {
            model,
            logical_tool_name: TOOL_LOGICAL_NAME.to_string(),
            api_tool_name: tool_call_name(&tool_call),
            tool_called: true,
            thought_signature_detected: contains_thought_signature(&model_content),
            tool_arguments: payload_to_value(&payload),
            final_response_text,
        },
    };

    fs::write(
        output_root.join("artifact.json"),
        serde_json::to_vec_pretty(&result).map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize media artifact manifest: {error}"),
            )
        })?,
    )
    .map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write media artifact manifest: {error}"),
        )
    })?;

    Ok(MediaAudioExecution {
        audio_preview: result.artifact.audio.as_ref().map(|audio| audio.url.clone()),
        image_preview: result.artifact.image.as_ref().map(|image| image.url.clone()),
        result,
    })
}

fn build_initial_interleaved_request(
    request: &GenerateMediaAudioRequest,
    tool_name: &str,
) -> Value {
    let prompt = format!(
        "User request: {prompt}\nDuration requested: {duration}s.\nStyle: {style}\nIntent: {intent}\nCategory: {category}\nMood: {mood}\n\n\
You are demonstrating a Gemini 3 interleaved function calling flow. You must call the media generation tool exactly once before answering. \
The tool represents the business capability `{logical_tool}`. After the tool response arrives, produce a final user-facing answer that presents the title, intent, usage, tags, and associated image.",
        prompt = request.prompt.trim(),
        duration = clamp_duration_seconds(request.duration_seconds),
        style = request.style.as_deref().unwrap_or("atmospheric"),
        intent = request.intent.as_deref().unwrap_or("scene support"),
        category = request.category.as_deref().unwrap_or("ambience"),
        mood = request.mood.as_deref().unwrap_or("mysterious"),
        logical_tool = TOOL_LOGICAL_NAME,
    );

    json!({
        "systemInstruction": {
            "parts": [{
                "text": "You are a Gemini 3 media director. Use one function call to request enriched media artifacts, then continue with a concise final answer. Never claim that the base model natively produced audio, image, and metadata in one monolithic response."
            }]
        },
        "contents": [{
            "role": "user",
            "parts": [{ "text": prompt }]
        }],
        "tools": [{
            "functionDeclarations": [{
                "name": tool_name,
                "description": "Single business tool for generating a unified audio media artifact with audio, image, title, description, and classification tags.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "prompt": { "type": "STRING", "description": "The user's media prompt." },
                        "duration_seconds": { "type": "INTEGER", "description": "Requested duration in seconds, capped at 30." },
                        "style": { "type": "STRING", "description": "Stylistic direction for the media." },
                        "intent": { "type": "STRING", "description": "Use-case or narrative purpose." },
                        "category": { "type": "STRING", "description": "Classification such as ost, ambience, or sfx." },
                        "mood": { "type": "STRING", "description": "Emotional tone." }
                    },
                    "required": ["prompt"]
                }
            }]
        }],
        "toolConfig": {
            "functionCallingConfig": {
                "mode": "ANY",
                "allowedFunctionNames": [tool_name]
            }
        },
        "generationConfig": {
            "temperature": 1.0
        },
        "thinkingConfig": {
            "includeThoughts": true
        }
    })
}

fn build_followup_request(
    request: &GenerateMediaAudioRequest,
    model_content: Value,
    function_response_content: Value,
) -> Value {
    json!({
        "systemInstruction": {
            "parts": [{
                "text": "Continue the current interleaved Gemini 3 function-calling turn. Present the generated media artifact clearly, mention the title, intended use, emotional tone, duration, tags, and the associated image. Do not call any more tools."
            }]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{ "text": request.prompt.trim() }]
            },
            model_content,
            function_response_content
        ],
        "generationConfig": {
            "temperature": 1.0
        },
        "thinkingConfig": {
            "includeThoughts": true
        }
    })
}

fn build_function_response_content(
    tool_name: &str,
    artifact: &GeneratedMediaAudioArtifact,
    image_bytes: Option<Vec<u8>>,
) -> Value {
    let image_display_name = image_bytes.as_ref().map(|_| "artifact_preview.png");
    let image_ref = image_display_name.map(|display_name| json!({ "$ref": display_name }));
    let mut function_response = json!({
        "name": tool_name,
        "response": {
            "artifact": {
                "type": "generated_media_audio",
                "status": artifact.status,
                "audio": artifact.audio,
                "image": artifact.image.as_ref().map(|image| json!({
                    "url": image.url,
                    "mime_type": image.mime_type,
                    "preview": image_ref
                })),
                "metadata": artifact.metadata,
                "warnings": artifact.warnings
            }
        }
    });

    if let Some(bytes) = image_bytes {
        function_response["parts"] = json!([{
            "inlineData": {
                "mimeType": "image/png",
                "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                "displayName": image_display_name.unwrap_or("artifact_preview.png")
            }
        }]);
    }

    json!({
        "role": "user",
        "parts": [{
            "functionResponse": function_response
        }]
    })
}

fn normalize_tool_payload(
    request: &GenerateMediaAudioRequest,
    args: &Value,
) -> ToolExecutionPayload {
    ToolExecutionPayload {
        prompt: args
            .get("prompt")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| request.prompt.trim().to_string()),
        duration_seconds: clamp_duration_seconds(
            args.get("duration_seconds")
                .and_then(Value::as_u64)
                .map(|value| value as u32)
                .or(request.duration_seconds),
        ),
        style: pick_arg(args, "style", request.style.as_deref(), "atmospheric"),
        intent: pick_arg(args, "intent", request.intent.as_deref(), "scene support"),
        category: pick_arg(args, "category", request.category.as_deref(), "ambience"),
        mood: pick_arg(args, "mood", request.mood.as_deref(), "mysterious"),
    }
}

fn pick_arg(args: &Value, key: &str, fallback: Option<&str>, default: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            fallback
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| default.to_string())
}

async fn build_media_plan(payload: &ToolExecutionPayload) -> MediaPlan {
    let fallback = fallback_media_plan(payload);
    let approx_word_count = (payload.duration_seconds.saturating_mul(11) / 5).clamp(12, 75);
    let prompt = format!(
        "Return strict JSON only with keys title, description, intent, tags, imagePrompt, speechTranscript.\n\
Build a unified game-media artifact plan.\n\
User prompt: {prompt}\n\
Requested duration: {duration}s\n\
Style: {style}\n\
Intent: {intent}\n\
Category: {category}\n\
Mood: {mood}\n\
Rules:\n\
- Title: 2 to 6 words.\n\
- Description: 2 short sentences explaining utility, intention, tone, and ambience.\n\
- Intent: normalize to a concise production phrase.\n\
- Tags: array of 2 to 4 lowercase tags, always include one of ost, ambience, or sfx when relevant.\n\
- imagePrompt: concise but vivid concept-art prompt for one associated image.\n\
- speechTranscript: around {words} words, suitable for Gemini TTS, atmospheric and usable as a narrated audio cue.\n\
- Do not use markdown.\n\
Fallback JSON:\n{fallback}",
        prompt = payload.prompt,
        duration = payload.duration_seconds,
        style = payload.style,
        intent = payload.intent,
        category = payload.category,
        mood = payload.mood,
        words = approx_word_count,
        fallback = serde_json::to_string(&fallback).unwrap_or_else(|_| "{}".to_string()),
    );

    match gemini::generate_text_with_options(&prompt, 0.6).await {
        Ok(text) => parse_media_plan(&text).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

fn fallback_media_plan(payload: &ToolExecutionPayload) -> MediaPlan {
    let category_tag = normalize_category_tag(&payload.category);
    let title = build_title(&payload.prompt);
    MediaPlan {
        title: title.clone(),
        description: format!(
            "{} is designed as a {} cue for {}. The tone stays {} with a {} surface and should support a {} second beat.",
            title, category_tag, payload.intent, payload.mood, payload.style, payload.duration_seconds
        ),
        intent: payload.intent.clone(),
        tags: vec![
            category_tag.to_string(),
            payload.mood.to_lowercase(),
            payload.intent.to_lowercase().replace(' ', "-"),
        ],
        image_prompt: format!(
            "Cinematic concept art for '{}', {}, {}, {}, game media artifact, highly legible composition, atmospheric lighting",
            payload.prompt, payload.category, payload.mood, payload.style
        ),
        speech_transcript: format!(
            "Title: {}. This cue supports {}. The sound should feel {}, with {} textures, and hold attention for roughly {} seconds while guiding the player through {}.",
            title, payload.intent, payload.mood, payload.style, payload.duration_seconds, payload.prompt
        ),
    }
}

fn build_title(prompt: &str) -> String {
    let words = prompt
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|segment| !segment.is_empty())
        .take(4)
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>();
    if words.is_empty() {
        "Media Cue".to_string()
    } else {
        words.join(" ")
    }
}

fn normalize_category_tag(category: &str) -> &'static str {
    let normalized = category.trim().to_lowercase();
    if normalized.contains("ost") || normalized.contains("music") {
        "ost"
    } else if normalized.contains("sfx") || normalized.contains("impact") || normalized.contains("stinger") {
        "sfx"
    } else {
        "ambience"
    }
}

fn parse_media_plan(raw: &str) -> Option<MediaPlan> {
    let cleaned = raw.trim();
    let cleaned = cleaned
        .strip_prefix("```json")
        .or_else(|| cleaned.strip_prefix("```"))
        .unwrap_or(cleaned)
        .trim();
    let cleaned = cleaned.strip_suffix("```").unwrap_or(cleaned).trim();
    let value = serde_json::from_str::<Value>(cleaned).ok()?;
    Some(MediaPlan {
        title: value.get("title")?.as_str()?.trim().to_string(),
        description: value.get("description")?.as_str()?.trim().to_string(),
        intent: value
            .get("intent")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "scene support".to_string()),
        tags: value
            .get("tags")
            .and_then(Value::as_array)
            .map(|items| {
                items.iter()
                    .filter_map(Value::as_str)
                    .map(|value| value.trim().to_lowercase())
                    .filter(|value| !value.is_empty())
                    .take(4)
                    .collect::<Vec<_>>()
            })
            .filter(|items| !items.is_empty())
            .unwrap_or_else(|| vec!["ambience".to_string()]),
        image_prompt: value
            .get("imagePrompt")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?,
        speech_transcript: value
            .get("speechTranscript")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?,
    })
}

async fn generate_audio_asset(
    output_root: &Path,
    plan: &MediaPlan,
    requested_duration_seconds: u32,
) -> Result<AudioGeneration, (StatusCode, String)> {
    let audio_bytes = generate_tts_audio(&plan.speech_transcript).await?;
    fs::write(output_root.join("audio.wav"), audio_bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write audio artifact: {error}"),
        )
    })?;

    Ok(AudioGeneration {
        url: format!(
            "/api/generated-media/{}/audio.wav",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
        duration_seconds: estimate_transcript_duration_seconds(&plan.speech_transcript)
            .min(requested_duration_seconds)
            .max(1),
    })
}

async fn generate_tts_audio(transcript: &str) -> Result<Vec<u8>, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GEMINI_API_KEY environment variable not set".to_string(),
        )
    })?;
    let response = Client::new()
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            GEMINI_TTS_MODEL
        ))
        .header("x-goog-api-key", api_key)
        .json(&json!({
            "contents": [{
                "parts": [{ "text": transcript }]
            }],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": "Kore"
                        }
                    }
                }
            }
        }))
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Gemini TTS request failed: {error}"),
            )
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS response read failed: {error}"),
        )
    })?;
    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS failed ({}): {}", status, body),
        ));
    }
    let value = serde_json::from_str::<Value>(&body).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS parse failed: {error}"),
        )
    })?;
    let pcm_b64 = value
        .pointer("/candidates/0/content/parts/0/inlineData/data")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Gemini TTS returned no inline audio data".to_string(),
            )
        })?;
    let pcm_bytes = base64::engine::general_purpose::STANDARD
        .decode(pcm_b64)
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Gemini TTS audio decode failed: {error}"),
            )
        })?;
    Ok(pcm_to_wav(&pcm_bytes, TTS_SAMPLE_RATE_HZ))
}

fn pcm_to_wav(pcm: &[u8], sample_rate_hz: u32) -> Vec<u8> {
    let mut wav = Vec::with_capacity(44 + pcm.len());
    let data_len = pcm.len() as u32;
    let chunk_size = 36 + data_len;
    let byte_rate = sample_rate_hz * 2;
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&chunk_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate_hz.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

fn estimate_transcript_duration_seconds(transcript: &str) -> u32 {
    let word_count = transcript.split_whitespace().count() as f32;
    ((word_count / 2.4).ceil() as u32).clamp(1, MAX_DURATION_SECONDS)
}

async fn generate_image_asset(
    output_root: &Path,
    plan: &MediaPlan,
) -> Result<ImageGeneration, (StatusCode, String)> {
    let bytes = gemini::generate_image_bytes(
        &plan.image_prompt,
        Some(0.8),
        1024,
        1024,
        Some("1:1"),
    )
    .await?;
    fs::write(output_root.join("image.png"), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write image artifact: {error}"),
        )
    })?;
    Ok(ImageGeneration {
        url: format!(
            "/api/generated-media/{}/image.png",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
    })
}

fn compute_artifact_status(has_audio: bool, has_image: bool) -> GeneratedMediaStatus {
    match (has_audio, has_image) {
        (true, true) => GeneratedMediaStatus::Success,
        (true, false) | (false, true) => GeneratedMediaStatus::PartialSuccess,
        (false, false) => GeneratedMediaStatus::Error,
    }
}

fn payload_to_value(payload: &ToolExecutionPayload) -> Value {
    serde_json::to_value(payload).unwrap_or_else(|_| json!({}))
}

async fn post_generate_content(model: &str, body: &Value) -> Result<Value, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GEMINI_API_KEY environment variable not set".to_string(),
        )
    })?;
    let response = Client::new()
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            model
        ))
        .header("x-goog-api-key", api_key)
        .json(body)
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Gemini request failed: {error}"),
            )
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini response read failed: {error}"),
        )
    })?;
    let value = serde_json::from_str::<Value>(&body).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini response parse failed: {error}"),
        )
    })?;
    if !status.is_success() {
        let message = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or(&body)
            .to_string();
        return Err((StatusCode::BAD_REQUEST, message));
    }
    Ok(value)
}

fn extract_candidate_content(response: &Value) -> Option<Value> {
    response.get("candidates")?.get(0)?.get("content").cloned()
}

fn extract_function_call(content: &Value) -> Option<Value> {
    content
        .get("parts")?
        .as_array()?
        .iter()
        .find_map(|part| part.get("functionCall").cloned())
}

fn tool_call_name(function_call: &Value) -> String {
    function_call
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(TOOL_API_NAME)
        .to_string()
}

fn contains_thought_signature(content: &Value) -> bool {
    content
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts.iter().any(|part| {
                part.get("thoughtSignature").is_some()
                    || part.get("thought_signature").is_some()
            })
        })
        .unwrap_or(false)
}

fn extract_text_response(response: &Value) -> Option<String> {
    let parts = response
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_duration_seconds, compute_artifact_status, contains_thought_signature,
        extract_function_call, parse_media_plan, pcm_to_wav, GeneratedMediaStatus,
    };
    use serde_json::json;

    #[test]
    fn clamps_duration_to_maximum() {
        assert_eq!(clamp_duration_seconds(Some(45)), 30);
        assert_eq!(clamp_duration_seconds(Some(12)), 12);
        assert_eq!(clamp_duration_seconds(None), 18);
    }

    #[test]
    fn parses_media_plan_from_json() {
        let plan = parse_media_plan(r#"{
            "title":"Dust Relay",
            "description":"A tense ambience cue.",
            "intent":"combat setup",
            "tags":["ambience","tension"],
            "imagePrompt":"dust storm relay tower",
            "speechTranscript":"Short atmospheric cue."
        }"#)
        .expect("plan");
        assert_eq!(plan.title, "Dust Relay");
        assert_eq!(plan.tags[0], "ambience");
    }

    #[test]
    fn extracts_function_call_and_signature() {
        let content = json!({
            "role": "model",
            "parts": [{
                "functionCall": {
                    "name": "generatemedia_audio",
                    "args": { "prompt": "wind over steel" }
                },
                "thoughtSignature": "abc123"
            }]
        });
        let call = extract_function_call(&content).expect("function call");
        assert_eq!(call["name"], "generatemedia_audio");
        assert!(contains_thought_signature(&content));
    }

    #[test]
    fn wraps_pcm_as_wav() {
        let wav = pcm_to_wav(&[0, 1, 2, 3], 24_000);
        assert!(wav.starts_with(b"RIFF"));
        assert_eq!(&wav[8..12], b"WAVE");
    }

    #[test]
    fn computes_partial_status() {
        assert_eq!(compute_artifact_status(true, true), GeneratedMediaStatus::Success);
        assert_eq!(
            compute_artifact_status(true, false),
            GeneratedMediaStatus::PartialSuccess
        );
        assert_eq!(compute_artifact_status(false, false), GeneratedMediaStatus::Error);
    }
}
