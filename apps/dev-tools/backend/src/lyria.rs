use std::{
    env,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::http::StatusCode;
use base64::Engine as _;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::error;

use crate::gemini;

const DEFAULT_VERTEX_LOCATION: &str = "us-central1";
const DEFAULT_VERTEX_MODEL: &str = "lyria-002";
const DEFAULT_TOKEN_URI: &str = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_CLIP_DURATION_SECS: f32 = 32.8;
const DEFAULT_SAMPLE_RATE_HZ: u32 = 48_000;

static TOKEN_CACHE: OnceLock<Mutex<Option<CachedVertexToken>>> = OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongPromptSpec {
    pub cue_text: String,
    pub category: String,
    pub genre: String,
    #[serde(default)]
    pub moods: Vec<String>,
    #[serde(default)]
    pub instrumentation: Vec<String>,
    pub tempo: String,
    pub rhythmic_feel: String,
    pub soundscape: String,
    pub production_style: String,
    pub global_direction: String,
    pub negative_prompt: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedSongPrompt {
    pub title: String,
    pub prompt_en_us: String,
    pub negative_prompt_en_us: String,
}

#[derive(Clone, Debug)]
pub struct GeneratedSongPayload {
    pub audio_bytes: Vec<u8>,
    pub mime_type: String,
    pub duration_seconds: f32,
    pub sample_rate_hz: u32,
}

#[derive(Clone)]
struct CachedVertexToken {
    access_token: String,
    expires_at_epoch: u64,
}

#[derive(Deserialize)]
struct ServiceAccountKey {
    client_email: String,
    private_key: String,
    #[serde(default)]
    token_uri: Option<String>,
}

#[derive(Serialize)]
struct ServiceAccountClaims {
    iss: String,
    sub: String,
    aud: String,
    scope: String,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct PredictResponse {
    #[serde(default)]
    predictions: Vec<Value>,
}

pub fn vertex_location() -> String {
    env::var("VERTEX_LOCATION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_VERTEX_LOCATION.to_string())
}

pub fn vertex_model() -> String {
    env::var("VERTEX_LYRIA_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_VERTEX_MODEL.to_string())
}

pub fn vertex_project_id() -> Result<String, (StatusCode, String)> {
    env::var("VERTEX_PROJECT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "VERTEX_PROJECT_ID environment variable not set".to_string(),
            )
        })
}

pub fn build_song_prompt_fallback(spec: &SongPromptSpec) -> NormalizedSongPrompt {
    let cue = spec.cue_text.trim();
    let mut prompt_parts = Vec::new();
    prompt_parts.push(format!("Instrumental {} cue", clean_phrase(&spec.category, "music")));
    if !spec.genre.trim().is_empty() {
        prompt_parts.push(format!("in a {}", clean_phrase(&spec.genre, "cinematic")) );
    }
    if !spec.moods.is_empty() {
        prompt_parts.push(format!("with {}", spec.moods.iter().map(|m| clean_phrase(m, "")).filter(|m| !m.is_empty()).collect::<Vec<_>>().join(", ")));
    }
    if !spec.instrumentation.is_empty() {
        prompt_parts.push(format!(
            "featuring {}",
            spec.instrumentation
                .iter()
                .map(|item| clean_phrase(item, ""))
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if !spec.tempo.trim().is_empty() {
        prompt_parts.push(format!("{} tempo", clean_phrase(&spec.tempo, "medium")));
    }
    if !spec.rhythmic_feel.trim().is_empty() {
        prompt_parts.push(format!("{} rhythmic feel", clean_phrase(&spec.rhythmic_feel, "pulse")));
    }
    if !spec.soundscape.trim().is_empty() {
        prompt_parts.push(format!("immersed in {}", clean_phrase(&spec.soundscape, "")));
    }
    if !spec.production_style.trim().is_empty() {
        prompt_parts.push(format!("{} production", clean_phrase(&spec.production_style, "clean")));
    }
    if !spec.global_direction.trim().is_empty() {
        prompt_parts.push(clean_phrase(&spec.global_direction, ""));
    }
    prompt_parts.push(clean_phrase(cue, "ambient game underscore"));

    let negative = if spec.negative_prompt.trim().is_empty() {
        "No vocals, no lyrics, no spoken word, no announcer, no harsh clipping, no sudden ending.".to_string()
    } else {
        format!(
            "{}, no vocals, no lyrics, no spoken word.",
            clean_phrase(&spec.negative_prompt, "")
        )
    };

    NormalizedSongPrompt {
        title: build_title_from_cue(cue),
        prompt_en_us: prompt_parts
            .into_iter()
            .filter(|part| !part.trim().is_empty())
            .collect::<Vec<_>>()
            .join(". "),
        negative_prompt_en_us: negative,
    }
}

pub async fn normalize_song_prompt(spec: &SongPromptSpec) -> NormalizedSongPrompt {
    if env::var("GEMINI_API_KEY").is_err() {
        return build_song_prompt_fallback(spec);
    }

    let fallback = build_song_prompt_fallback(spec);
    let prompt = format!(
        "Rewrite a game-audio brief into a compact en-US instrumental music prompt for Google's Lyria model.\n\
Return strict JSON only with keys title, promptEnUs, negativePromptEnUs.\n\
Rules:\n\
- Output valid JSON only.\n\
- Keep it instrumental only.\n\
- Preserve intended mood, tone, category, and sonic texture.\n\
- Translate from French if needed.\n\
- Title must be 2-6 words, readable, no quotes.\n\
- promptEnUs must be concise, vivid, production-ready, and mention no vocals or lyrics only if needed naturally.\n\
- negativePromptEnUs must focus on what to avoid.\n\
Input JSON:\n{}\n\
Fallback JSON:\n{}",
        serde_json::to_string(spec).unwrap_or_else(|_| "{}".to_string()),
        serde_json::to_string(&fallback).unwrap_or_else(|_| "{}".to_string()),
    );

    match gemini::generate_text_with_options(&prompt, 0.3).await {
        Ok(text) => parse_normalized_song_prompt(&text).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub async fn generate_music_variations(
    normalized: &NormalizedSongPrompt,
    sample_count: usize,
) -> Result<Vec<GeneratedSongPayload>, (StatusCode, String)> {
    let project_id = vertex_project_id()?;
    let location = vertex_location();
    let model = vertex_model();
    let access_token = get_vertex_access_token().await?;
    let url = format!(
        "https://{}-aiplatform.googleapis.com/v1/projects/{}/locations/{}/publishers/google/models/{}:predict",
        location, project_id, location, model
    );

    let client = Client::new();
    let request_body = serde_json::json!({
        "instances": [{
            "prompt": normalized.prompt_en_us,
            "negative_prompt": normalized.negative_prompt_en_us,
        }],
        "parameters": {
            "sample_count": sample_count.max(1),
        }
    });

    let response = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Vertex Lyria request failed: {error}"),
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Vertex Lyria response read failed: {error}"),
        )
    })?;

    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Vertex Lyria failed ({}): {}", status, body),
        ));
    }

    let parsed: PredictResponse = serde_json::from_str(&body).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Vertex Lyria response parse failed: {error}"),
        )
    })?;

    let mut payloads = Vec::new();
    for prediction in &parsed.predictions {
        if let Some(audio_b64) = extract_audio_base64(prediction) {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(audio_b64)
                .map_err(|error| {
                    (
                        StatusCode::BAD_GATEWAY,
                        format!("Vertex Lyria audio decode failed: {error}"),
                    )
                })?;
            payloads.push(GeneratedSongPayload {
                audio_bytes: bytes,
                mime_type: "audio/wav".to_string(),
                duration_seconds: DEFAULT_CLIP_DURATION_SECS,
                sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            });
        }
    }

    if payloads.is_empty() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Vertex Lyria returned no audio predictions".to_string(),
        ));
    }

    Ok(payloads)
}

fn parse_normalized_song_prompt(raw: &str) -> Option<NormalizedSongPrompt> {
    let cleaned = raw.trim();
    let cleaned = cleaned
        .strip_prefix("```json")
        .or_else(|| cleaned.strip_prefix("```"))
        .unwrap_or(cleaned)
        .trim();
    let cleaned = cleaned.strip_suffix("```").unwrap_or(cleaned).trim();
    let value = serde_json::from_str::<Value>(cleaned).ok()?;
    Some(NormalizedSongPrompt {
        title: value
            .get("title")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Untitled Cue".to_string()),
        prompt_en_us: value
            .get("promptEnUs")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?,
        negative_prompt_en_us: value
            .get("negativePromptEnUs")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .unwrap_or_default(),
    })
}

fn clean_phrase(value: &str, fallback: &str) -> String {
    let cleaned = value
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.trim().is_empty() {
        fallback.to_string()
    } else {
        cleaned.trim().to_string()
    }
}

fn build_title_from_cue(cue: &str) -> String {
    let source = clean_phrase(cue, "Instrumental Cue");
    source
        .split_whitespace()
        .take(6)
        .map(title_case_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_case_word(word: &str) -> String {
    let mut chars = word.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase())
}

async fn get_vertex_access_token() -> Result<String, (StatusCode, String)> {
    let now = current_epoch_seconds();
    let cache = TOKEN_CACHE.get_or_init(|| Mutex::new(None));
    if let Some(cached) = cache
        .lock()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Vertex token cache lock poisoned".to_string(),
            )
        })?
        .clone()
    {
        if cached.expires_at_epoch > now + 60 {
            return Ok(cached.access_token);
        }
    }

    let credentials = load_service_account_credentials()?;
    let token_uri = credentials
        .token_uri
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_TOKEN_URI.to_string());
    let assertion = build_service_account_assertion(&credentials, &token_uri)?;
    let form_body = serde_urlencoded::to_string([
        ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
        ("assertion", assertion.as_str()),
    ])
    .map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to encode Vertex OAuth body: {error}"),
        )
    })?;
    let client = Client::new();
    let response = client
        .post(&token_uri)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_body)
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("OAuth token request failed: {error}"),
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("OAuth token response read failed: {error}"),
        )
    })?;

    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("OAuth token request failed ({}): {}", status, body),
        ));
    }

    let token: TokenResponse = serde_json::from_str(&body).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("OAuth token response parse failed: {error}"),
        )
    })?;

    let cached = CachedVertexToken {
        access_token: token.access_token.clone(),
        expires_at_epoch: now + token.expires_in,
    };
    *cache.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Vertex token cache lock poisoned".to_string(),
        )
    })? = Some(cached);

    Ok(token.access_token)
}

fn load_service_account_credentials() -> Result<ServiceAccountKey, (StatusCode, String)> {
    let path = env::var("GOOGLE_APPLICATION_CREDENTIALS").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GOOGLE_APPLICATION_CREDENTIALS environment variable not set".to_string(),
        )
    })?;
    let raw = std::fs::read_to_string(&path).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read GOOGLE_APPLICATION_CREDENTIALS file: {error}"),
        )
    })?;
    serde_json::from_str::<ServiceAccountKey>(&raw).map_err(|error| {
        error!("Failed to parse service account JSON: {}", error);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GOOGLE_APPLICATION_CREDENTIALS must point to a service-account JSON key".to_string(),
        )
    })
}

fn build_service_account_assertion(
    credentials: &ServiceAccountKey,
    token_uri: &str,
) -> Result<String, (StatusCode, String)> {
    let now = current_epoch_seconds();
    let claims = ServiceAccountClaims {
        iss: credentials.client_email.clone(),
        sub: credentials.client_email.clone(),
        aud: token_uri.to_string(),
        scope: TOKEN_SCOPE.to_string(),
        iat: now,
        exp: now + 3600,
    };
    let header = Header::new(Algorithm::RS256);
    let encoding_key = EncodingKey::from_rsa_pem(credentials.private_key.as_bytes()).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Invalid service account private key: {error}"),
        )
    })?;
    encode(&header, &claims, &encoding_key).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to sign Vertex OAuth assertion: {error}"),
        )
    })
}

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn extract_audio_base64(value: &Value) -> Option<&str> {
    match value {
        Value::Object(map) => {
            for key in ["audioContent", "audio_content", "bytesBase64Encoded", "bytes_base64_encoded"] {
                if let Some(content) = map.get(key).and_then(Value::as_str) {
                    return Some(content);
                }
            }
            for child in map.values() {
                if let Some(content) = extract_audio_base64(child) {
                    return Some(content);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(extract_audio_base64),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{build_song_prompt_fallback, extract_audio_base64, parse_normalized_song_prompt, SongPromptSpec};
    use serde_json::json;

    fn make_spec() -> SongPromptSpec {
        SongPromptSpec {
            cue_text: "brume rouge sur des ruines".to_string(),
            category: "ambience".to_string(),
            genre: "post-apocalyptic ambient".to_string(),
            moods: vec!["uneasy".to_string(), "melancholic".to_string()],
            instrumentation: vec!["drones".to_string(), "processed guitar".to_string()],
            tempo: "slow".to_string(),
            rhythmic_feel: "drone".to_string(),
            soundscape: "wind, dust, distant metallic creaks".to_string(),
            production_style: "gritty".to_string(),
            global_direction: "keep it spacious and game-ready".to_string(),
            negative_prompt: "crowd noise, vocals".to_string(),
        }
    }

    #[test]
    fn fallback_prompt_builds_stable_en_us_text() {
        let normalized = build_song_prompt_fallback(&make_spec());
        assert!(normalized.prompt_en_us.contains("Instrumental ambience cue"));
        assert!(normalized.prompt_en_us.contains("post-apocalyptic ambient"));
        assert!(normalized.negative_prompt_en_us.contains("no vocals"));
        assert!(!normalized.title.is_empty());
    }

    #[test]
    fn parses_json_wrapped_in_markdown_fences() {
        let parsed = parse_normalized_song_prompt(
            "```json\n{\"title\":\"Dust Watch\",\"promptEnUs\":\"Sparse ambient cue\",\"negativePromptEnUs\":\"No vocals\"}\n```",
        )
        .expect("parsed prompt");
        assert_eq!(parsed.title, "Dust Watch");
        assert_eq!(parsed.prompt_en_us, "Sparse ambient cue");
        assert_eq!(parsed.negative_prompt_en_us, "No vocals");
    }

    #[test]
    fn extracts_nested_audio_base64() {
        let payload = json!({
            "predictions": [{
                "content": {
                    "audioContent": "UklGRg=="
                }
            }]
        });
        let audio = extract_audio_base64(&payload).expect("audio");
        assert_eq!(audio, "UklGRg==");
    }
}
