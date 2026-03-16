use std::{env, fs, io::Cursor, path::Path};

use axum::http::StatusCode;
use base64::Engine as _;
use image::ImageFormat;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::warn;

use crate::{gemini, lyria};

const GEMINI_INTERLEAVED_MODEL_DEFAULT: &str = "gemini-3-flash-preview";
const DEFAULT_DURATION_SECONDS: u32 = 18;
const MAX_DURATION_SECONDS: u32 = 30;
const TOOL_LOGICAL_NAME: &str = "generatemedia.audio";
const TOOL_API_NAME: &str = "generatemedia_audio";
const DEFAULT_FOLLOWUP_SYSTEM_PROMPT: &str = "Continue the current interleaved Gemini 3 function-calling turn. Present the generated media artifact clearly, mention the title, intended use, emotional tone, duration, tags, and the associated image. Do not call any more tools.";

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAudioSongClipDetails {
    pub title: String,
    pub prompt: String,
    pub normalized_prompt: String,
    pub negative_prompt: String,
    pub mime_type: String,
    pub duration_seconds: f32,
    pub sample_rate_hz: u32,
}

#[derive(Debug, Clone)]
pub struct MediaAudioExecution {
    pub result: GeneratedMediaAudioResult,
    pub audio_preview: Option<String>,
    pub image_preview: Option<String>,
    pub song_clip: Option<MediaAudioSongClipDetails>,
}

#[derive(Debug, Clone)]
pub(crate) struct InterleavedAudioRunOptions {
    pub(crate) followup_system_prompt: &'static str,
    pub(crate) image_prompt_override: Option<String>,
    pub(crate) generate_audio: bool,
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
    music_direction: String,
}

#[derive(Debug, Clone)]
struct AudioGeneration {
    url: String,
    mime_type: String,
    duration_seconds: u32,
    song_clip: MediaAudioSongClipDetails,
}

#[derive(Debug, Clone)]
struct ImageGeneration {
    url: String,
}

pub fn clamp_duration_seconds(value: Option<u32>) -> u32 {
    value
        .unwrap_or(DEFAULT_DURATION_SECONDS)
        .clamp(1, MAX_DURATION_SECONDS)
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
    run_interleaved_audio_with_options(
        request,
        output_root,
        job_id,
        InterleavedAudioRunOptions {
            followup_system_prompt: DEFAULT_FOLLOWUP_SYSTEM_PROMPT,
            image_prompt_override: None,
            generate_audio: true,
        },
    )
    .await
}

pub(crate) async fn run_interleaved_audio_with_options(
    request: &GenerateMediaAudioRequest,
    output_root: &Path,
    job_id: &str,
    options: InterleavedAudioRunOptions,
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
        &tool_call.get("args").cloned().unwrap_or_else(|| json!({})),
    );
    let plan = build_media_plan(&payload, options.image_prompt_override.as_deref()).await;

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create media artifact directory: {error}"),
        )
    })?;

    let (audio, audio_warning) = if options.generate_audio {
        match generate_audio_asset(output_root, &payload, &plan, payload.duration_seconds).await {
            Ok(asset) => (Some(asset), None),
            Err((_code, message)) => {
                warn!("audio generation failed for {job_id}: {message}");
                (None, Some(message))
            }
        }
    } else {
        (None, None)
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
        status: if options.generate_audio {
            compute_artifact_status(audio.is_some(), image.is_some())
        } else if image.is_some() {
            GeneratedMediaStatus::Success
        } else {
            GeneratedMediaStatus::Error
        },
        audio: audio.as_ref().map(|asset| GeneratedMediaAudioAsset {
            url: asset.url.clone(),
            mime_type: asset.mime_type.clone(),
            duration_seconds: asset.duration_seconds,
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
    let final_body = build_followup_request(
        request,
        model_content.clone(),
        function_response_content,
        options.followup_system_prompt,
    );
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
        audio_preview: result
            .artifact
            .audio
            .as_ref()
            .map(|audio| audio.url.clone()),
        image_preview: result
            .artifact
            .image
            .as_ref()
            .map(|image| image.url.clone()),
        song_clip: audio.as_ref().map(|asset| asset.song_clip.clone()),
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
            "temperature": 1.0,
            "thinkingConfig": {
                "includeThoughts": true
            }
        }
    })
}

fn build_followup_request(
    request: &GenerateMediaAudioRequest,
    model_content: Value,
    function_response_content: Value,
    system_prompt: &str,
) -> Value {
    json!({
        "systemInstruction": {
            "parts": [{
                "text": system_prompt
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
            "temperature": 1.0,
            "thinkingConfig": {
                "includeThoughts": true
            }
        }
    })
}

fn build_function_response_content(
    tool_name: &str,
    artifact: &GeneratedMediaAudioArtifact,
    image_bytes: Option<Vec<u8>>,
) -> Value {
    let mut function_response = json!({
        "name": tool_name,
        "response": {
            "artifact": {
                "type": "generated_media_audio",
                "status": artifact.status,
                "audio": artifact.audio,
                "image": artifact.image.as_ref().map(|image| json!({
                    "url": image.url,
                    "mime_type": image.mime_type
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
                "displayName": "artifact_preview.png"
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

async fn build_media_plan(
    payload: &ToolExecutionPayload,
    image_prompt_override: Option<&str>,
) -> MediaPlan {
    let fallback = fallback_media_plan(payload, image_prompt_override);
    let prompt = format!(
        "Return strict JSON only with keys title, description, intent, tags, imagePrompt, musicDirection.\n\
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
 - musicDirection: concise en-US instrumental music direction for downstream music generation.\n\
 - musicDirection must describe energy, tone, pacing, and sonic texture.\n\
 - musicDirection must never ask for vocals, lyrics, narration, or spoken word.\n\
- Do not use markdown.\n\
Fallback JSON:\n{fallback}",
        prompt = payload.prompt,
        duration = payload.duration_seconds,
        style = payload.style,
        intent = payload.intent,
        category = payload.category,
        mood = payload.mood,
        fallback = serde_json::to_string(&fallback).unwrap_or_else(|_| "{}".to_string()),
    );

    let mut plan = match gemini::generate_text_with_options(&prompt, 0.6).await {
        Ok(text) => parse_media_plan(&text).unwrap_or(fallback),
        Err(_) => fallback,
    };

    if let Some(image_prompt_override) = image_prompt_override {
        plan.image_prompt = image_prompt_override.to_string();
    }

    plan
}

fn fallback_media_plan(
    payload: &ToolExecutionPayload,
    image_prompt_override: Option<&str>,
) -> MediaPlan {
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
        image_prompt: if let Some(image_prompt_override) = image_prompt_override {
            image_prompt_override.to_string()
        } else {
            format!(
                "Cinematic concept art for '{}', {}, {}, {}, game media artifact, highly legible composition, atmospheric lighting",
                payload.prompt, payload.category, payload.mood, payload.style
            )
        },
        music_direction: format!(
            "Instrumental {} cue for {}. {} mood, {} pacing, {} production, tailored for {}. No vocals, no lyrics, no spoken word.",
            category_tag, payload.intent, payload.mood, infer_tempo(payload), payload.style, payload.prompt
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
    } else if normalized.contains("sfx")
        || normalized.contains("impact")
        || normalized.contains("stinger")
    {
        "sfx"
    } else {
        "ambience"
    }
}

fn infer_tempo(payload: &ToolExecutionPayload) -> String {
    let haystack = format!(
        "{} {} {} {}",
        payload.prompt, payload.intent, payload.category, payload.mood
    )
    .to_lowercase();
    if haystack.contains("combat")
        || haystack.contains("battle")
        || haystack.contains("raid")
        || haystack.contains("chase")
    {
        "fast".to_string()
    } else if haystack.contains("tension")
        || haystack.contains("hunt")
        || haystack.contains("stealth")
    {
        "medium".to_string()
    } else if haystack.contains("ambience") || haystack.contains("night") {
        "slow".to_string()
    } else {
        "medium".to_string()
    }
}

fn infer_rhythmic_feel(payload: &ToolExecutionPayload) -> String {
    let haystack =
        format!("{} {} {}", payload.prompt, payload.intent, payload.category).to_lowercase();
    if haystack.contains("combat") || haystack.contains("battle") || haystack.contains("raid") {
        "driving".to_string()
    } else if haystack.contains("sfx") || haystack.contains("stinger") {
        "syncopated".to_string()
    } else if haystack.contains("ambience") {
        "drone".to_string()
    } else {
        "pulse".to_string()
    }
}

fn infer_instrumentation(payload: &ToolExecutionPayload) -> Vec<String> {
    let haystack = format!(
        "{} {} {} {}",
        payload.prompt, payload.intent, payload.category, payload.mood
    )
    .to_lowercase();
    let mut items = Vec::new();
    if haystack.contains("tribal") {
        items.push("tribal percussion".to_string());
        items.push("war drums".to_string());
    }
    if haystack.contains("combat") || haystack.contains("battle") {
        items.push("cinematic drums".to_string());
        items.push("low strings".to_string());
    }
    if haystack.contains("night") || haystack.contains("dark") {
        items.push("dark synth pads".to_string());
        items.push("low pulses".to_string());
    }
    if items.is_empty() {
        items.push("cinematic percussion".to_string());
        items.push("atmospheric synth textures".to_string());
    }
    items.truncate(4);
    items
}

fn trim_wav_to_duration(
    wav: &[u8],
    sample_rate_hz_hint: u32,
    target_seconds: u32,
    generated_duration_seconds: f32,
) -> Option<(Vec<u8>, f32)> {
    if target_seconds == 0 || generated_duration_seconds <= target_seconds as f32 {
        return Some((wav.to_vec(), generated_duration_seconds));
    }
    if wav.len() < 44 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return None;
    }

    let mut cursor = 12usize;
    let mut sample_rate_hz = sample_rate_hz_hint;
    let mut block_align = 0u16;
    let mut data_chunk_offset = None;
    let mut data_chunk_size = 0usize;

    while cursor + 8 <= wav.len() {
        let chunk_id = &wav[cursor..cursor + 4];
        let chunk_size = u32::from_le_bytes([
            wav[cursor + 4],
            wav[cursor + 5],
            wav[cursor + 6],
            wav[cursor + 7],
        ]) as usize;
        let chunk_data_start = cursor + 8;
        let chunk_data_end = chunk_data_start.saturating_add(chunk_size);
        if chunk_data_end > wav.len() {
            return None;
        }

        if chunk_id == b"fmt " && chunk_size >= 16 {
            sample_rate_hz = u32::from_le_bytes([
                wav[chunk_data_start + 4],
                wav[chunk_data_start + 5],
                wav[chunk_data_start + 6],
                wav[chunk_data_start + 7],
            ]);
            block_align =
                u16::from_le_bytes([wav[chunk_data_start + 12], wav[chunk_data_start + 13]]);
        } else if chunk_id == b"data" {
            data_chunk_offset = Some(cursor);
            data_chunk_size = chunk_size;
            break;
        }

        cursor = chunk_data_end + (chunk_size % 2);
    }

    let data_chunk_offset = data_chunk_offset?;
    if sample_rate_hz == 0 || block_align == 0 {
        return None;
    }

    let bytes_per_second = sample_rate_hz as usize * block_align as usize;
    if bytes_per_second == 0 {
        return None;
    }

    let target_byte_len = (target_seconds as usize)
        .saturating_mul(bytes_per_second)
        .min(data_chunk_size);
    let trimmed_data_len = target_byte_len - (target_byte_len % block_align as usize);
    let data_start = data_chunk_offset + 8;
    let data_end = data_start + trimmed_data_len;
    if data_end > wav.len() {
        return None;
    }

    let mut trimmed = wav[..data_chunk_offset].to_vec();
    trimmed.extend_from_slice(b"data");
    trimmed.extend_from_slice(&(trimmed_data_len as u32).to_le_bytes());
    trimmed.extend_from_slice(&wav[data_start..data_end]);

    let riff_size = (trimmed.len().saturating_sub(8)) as u32;
    trimmed[4..8].copy_from_slice(&riff_size.to_le_bytes());

    let actual_duration_seconds = trimmed_data_len as f32 / bytes_per_second as f32;
    Some((trimmed, actual_duration_seconds))
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
                items
                    .iter()
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
        music_direction: value
            .get("musicDirection")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?,
    })
}

async fn generate_audio_asset(
    output_root: &Path,
    payload: &ToolExecutionPayload,
    plan: &MediaPlan,
    requested_duration_seconds: u32,
) -> Result<AudioGeneration, (StatusCode, String)> {
    let spec = lyria::SongPromptSpec {
        cue_text: payload.prompt.clone(),
        category: payload.category.clone(),
        genre: payload.style.clone(),
        moods: vec![payload.mood.clone()],
        instrumentation: infer_instrumentation(payload),
        tempo: infer_tempo(payload),
        rhythmic_feel: infer_rhythmic_feel(payload),
        soundscape: payload.prompt.clone(),
        production_style: payload.style.clone(),
        global_direction: plan.music_direction.clone(),
        negative_prompt: "No vocals, no lyrics, no spoken word, no narration, no announcer."
            .to_string(),
    };
    let normalized = lyria::normalize_song_prompt(&spec).await;
    let mut variants = lyria::generate_music_variations(&normalized, 1).await?;
    let generated = variants.pop().ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Lyria returned no generated audio".to_string(),
        )
    })?;

    let target_duration_seconds = requested_duration_seconds.clamp(1, MAX_DURATION_SECONDS);
    let (audio_bytes, actual_duration_seconds) = trim_wav_to_duration(
        &generated.audio_bytes,
        generated.sample_rate_hz,
        target_duration_seconds,
        generated.duration_seconds,
    )
    .unwrap_or_else(|| {
        (
            generated.audio_bytes.clone(),
            generated
                .duration_seconds
                .min(target_duration_seconds as f32),
        )
    });

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
        mime_type: generated.mime_type.clone(),
        duration_seconds: actual_duration_seconds
            .round()
            .clamp(1.0, MAX_DURATION_SECONDS as f32) as u32,
        song_clip: MediaAudioSongClipDetails {
            title: normalized.title,
            prompt: payload.prompt.clone(),
            normalized_prompt: normalized.prompt_en_us,
            negative_prompt: normalized.negative_prompt_en_us,
            mime_type: generated.mime_type.clone(),
            duration_seconds: actual_duration_seconds,
            sample_rate_hz: generated.sample_rate_hz,
        },
    })
}

async fn generate_image_asset(
    output_root: &Path,
    plan: &MediaPlan,
) -> Result<ImageGeneration, (StatusCode, String)> {
    let use_equirectangular = plan.image_prompt.to_lowercase().contains("equirectangular");
    let (width, height, aspect_ratio) = if use_equirectangular {
        (2048, 1024, Some("16:9"))
    } else {
        (1024, 1024, Some("1:1"))
    };
    let bytes =
        gemini::generate_image_bytes(&plan.image_prompt, Some(0.8), width, height, aspect_ratio)
            .await?;
    let bytes = if use_equirectangular {
        normalize_to_equirectangular_png(&bytes, width, height)?
    } else {
        bytes
    };
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

fn normalize_to_equirectangular_png(
    bytes: &[u8],
    target_width: u32,
    target_height: u32,
) -> Result<Vec<u8>, (StatusCode, String)> {
    let image = image::load_from_memory(bytes).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Generated image decode failed: {error}"),
        )
    })?;
    let rgba = image.to_rgba8();
    let source_width = rgba.width();
    let source_height = rgba.height();
    let target_ratio = target_width as f32 / target_height as f32;
    let source_ratio = source_width as f32 / source_height as f32;

    let cropped = if source_ratio > target_ratio {
        let cropped_width =
            ((source_height as f32 * target_ratio).round() as u32).clamp(1, source_width);
        let left = (source_width.saturating_sub(cropped_width)) / 2;
        image::imageops::crop_imm(&rgba, left, 0, cropped_width, source_height).to_image()
    } else if source_ratio < target_ratio {
        let cropped_height =
            ((source_width as f32 / target_ratio).round() as u32).clamp(1, source_height);
        let top = (source_height.saturating_sub(cropped_height)) / 2;
        image::imageops::crop_imm(&rgba, 0, top, source_width, cropped_height).to_image()
    } else {
        rgba
    };

    let resized = image::imageops::resize(
        &cropped,
        target_width,
        target_height,
        image::imageops::FilterType::Lanczos3,
    );
    let mut encoded = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(resized)
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to encode normalized planet texture: {error}"),
            )
        })?;
    Ok(encoded.into_inner())
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
                part.get("thoughtSignature").is_some() || part.get("thought_signature").is_some()
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
        extract_function_call, parse_media_plan, trim_wav_to_duration, GeneratedMediaStatus,
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
        let plan = parse_media_plan(
            r#"{
            "title":"Dust Relay",
            "description":"A tense ambience cue.",
            "intent":"combat setup",
            "tags":["ambience","tension"],
            "imagePrompt":"dust storm relay tower",
            "musicDirection":"Instrumental tense combat ambience, no vocals."
        }"#,
        )
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
    fn trims_wav_to_target_duration() {
        let sample_rate_hz = 48_000u32;
        let block_align = 2u16;
        let data_len = sample_rate_hz as usize * block_align as usize * 4;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + data_len as u32).to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate_hz.to_le_bytes());
        wav.extend_from_slice(&(sample_rate_hz * block_align as u32).to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(data_len as u32).to_le_bytes());
        wav.resize(44 + data_len, 0u8);

        let (trimmed, duration) =
            trim_wav_to_duration(&wav, sample_rate_hz, 2, 4.0).expect("trimmed wav");
        assert!(trimmed.starts_with(b"RIFF"));
        assert_eq!(&trimmed[8..12], b"WAVE");
        assert!(duration <= 2.01);
    }

    #[test]
    fn computes_partial_status() {
        assert_eq!(
            compute_artifact_status(true, true),
            GeneratedMediaStatus::Success
        );
        assert_eq!(
            compute_artifact_status(true, false),
            GeneratedMediaStatus::PartialSuccess
        );
        assert_eq!(
            compute_artifact_status(false, false),
            GeneratedMediaStatus::Error
        );
    }
}
