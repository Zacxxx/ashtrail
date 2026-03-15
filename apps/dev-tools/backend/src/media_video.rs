use std::{env, fs, path::Path, time::Duration};

use axum::http::StatusCode;
use base64::Engine as _;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::time::sleep;
use tracing::warn;

use crate::{
    gemini,
    media_audio::{
        interleaved_model, GeneratedMediaImageAsset, GeneratedMediaMetadata, GeneratedMediaStatus,
        InterleavedTranscript,
    },
};

const GEMINI_VIDEO_MODEL_DEFAULT: &str = "veo-3.1-generate-preview";
const GEMINI_TTS_MODEL_DEFAULT: &str = "gemini-2.5-flash-preview-tts";
const TOOL_LOGICAL_NAME: &str = "generatemedia.video";
const TOOL_API_NAME: &str = "generatemedia_video";
const DEFAULT_DURATION_SECONDS: u32 = 8;
const DEFAULT_ASPECT_RATIO: &str = "16:9";
const DEFAULT_VOICE_NAME: &str = "Charon";
const DEFAULT_VIDEO_RESOLUTION: &str = "720p";
const VEO_POLL_MAX_ATTEMPTS: usize = 80;
const NARRATION_GAP_MS: u32 = 180;
const NARRATION_BASE_SEGMENT_MS: u32 = 700;
const NARRATION_WORD_MS: u32 = 540;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMediaVideoRequest {
    pub prompt: String,
    #[serde(default)]
    pub duration_seconds: Option<u32>,
    #[serde(default)]
    pub aspect_ratio: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub mood: Option<String>,
    #[serde(default)]
    pub camera_direction: Option<String>,
    #[serde(default)]
    pub narration_tone: Option<String>,
    #[serde(default)]
    pub narration_intent: Option<String>,
    #[serde(default)]
    pub voice_name: Option<String>,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub global_direction: Option<String>,
    #[serde(default)]
    pub keep_veo_audio: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaVideoAsset {
    pub url: String,
    pub duration_seconds: u32,
    pub mime_type: String,
    pub aspect_ratio: String,
    pub resolution: String,
    pub keep_veo_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaNarrationSegment {
    pub segment_id: String,
    pub start_ms: u32,
    pub end_ms: u32,
    pub text: String,
    pub audio_url: String,
    pub mime_type: String,
    pub duck_video_to: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaNarration {
    pub language: String,
    pub voice_name: String,
    pub script: String,
    pub segments: Vec<GeneratedMediaNarrationSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaVideoArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub status: GeneratedMediaStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<GeneratedMediaVideoAsset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poster: Option<GeneratedMediaImageAsset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub narration: Option<GeneratedMediaNarration>,
    pub metadata: GeneratedMediaMetadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedMediaVideoResult {
    pub artifact: GeneratedMediaVideoArtifact,
    pub transcript: InterleavedTranscript,
}

#[derive(Debug, Clone)]
pub struct MediaVideoExecution {
    pub result: GeneratedMediaVideoResult,
    pub video_preview: Option<String>,
    pub poster_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolExecutionPayload {
    prompt: String,
    duration_seconds: u32,
    aspect_ratio: String,
    style: String,
    intent: String,
    category: String,
    mood: String,
    camera_direction: String,
    narration_tone: String,
    narration_intent: String,
    voice_name: String,
    negative_prompt: String,
    global_direction: String,
    keep_veo_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlannedNarrationSegment {
    text: String,
    start_ms: u32,
    end_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaVideoPlan {
    title: String,
    description: String,
    intent: String,
    tags: Vec<String>,
    video_prompt_en_us: String,
    poster_prompt: String,
    narration_language: String,
    narration_script: String,
    narration_segments: Vec<PlannedNarrationSegment>,
    voice_direction: String,
}

#[derive(Debug, Clone)]
struct VideoGeneration {
    url: String,
    mime_type: String,
    duration_seconds: u32,
    aspect_ratio: String,
    resolution: String,
    provider_has_audio: bool,
}

#[derive(Debug, Clone)]
struct PosterGeneration {
    url: String,
}

#[derive(Debug, Clone)]
struct NarrationGeneration {
    language: String,
    voice_name: String,
    script: String,
    segments: Vec<GeneratedMediaNarrationSegment>,
}

#[derive(Debug, Deserialize)]
struct VeoOperationResponse {
    name: Option<String>,
    done: Option<bool>,
    response: Option<VeoOperationPayload>,
    error: Option<VeoOperationError>,
}

#[derive(Debug, Deserialize)]
struct VeoOperationError {
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VeoOperationPayload {
    #[serde(rename = "generateVideoResponse")]
    generate_video_response: Option<VeoGenerateVideoResponse>,
}

#[derive(Debug, Deserialize)]
struct VeoGenerateVideoResponse {
    #[serde(rename = "generatedSamples", default)]
    generated_samples: Vec<VeoGeneratedSample>,
}

#[derive(Debug, Deserialize)]
struct VeoGeneratedSample {
    video: Option<VeoGeneratedVideo>,
}

#[derive(Debug, Deserialize)]
struct VeoGeneratedVideo {
    uri: Option<String>,
    #[serde(rename = "encodedVideo")]
    encoded_video: Option<String>,
    encoding: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TtsResponse {
    candidates: Option<Vec<TtsCandidate>>,
    error: Option<TtsError>,
}

#[derive(Debug, Deserialize)]
struct TtsCandidate {
    content: Option<TtsContent>,
}

#[derive(Debug, Deserialize)]
struct TtsContent {
    parts: Option<Vec<TtsPart>>,
}

#[derive(Debug, Deserialize)]
struct TtsPart {
    #[serde(rename = "inlineData")]
    inline_data: Option<TtsInlineData>,
}

#[derive(Debug, Deserialize)]
struct TtsInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct TtsError {
    message: String,
}

pub fn snap_duration_seconds(value: Option<u32>) -> u32 {
    match value.unwrap_or(DEFAULT_DURATION_SECONDS) {
        0..=5 => 4,
        6..=7 => 6,
        _ => 8,
    }
}

pub fn video_model() -> String {
    env::var("GEMINI_VEO_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| GEMINI_VIDEO_MODEL_DEFAULT.to_string())
}

fn tts_model() -> String {
    env::var("GEMINI_TTS_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| GEMINI_TTS_MODEL_DEFAULT.to_string())
}

pub async fn run_interleaved_video_demo(
    request: &GenerateMediaVideoRequest,
    output_root: &Path,
    _job_id: &str,
) -> Result<MediaVideoExecution, (StatusCode, String)> {
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
            "Gemini did not emit a function call for video generation".to_string(),
        )
    })?;
    let payload = normalize_tool_payload(
        request,
        &tool_call
            .get("args")
            .cloned()
            .unwrap_or_else(|| json!({})),
    );
    let plan = build_media_video_plan(&payload).await;

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create media video directory: {error}"),
        )
    })?;
    fs::create_dir_all(output_root.join("narration")).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create narration directory: {error}"),
        )
    })?;

    let (video, video_warning) = match generate_video_asset(output_root, &payload, &plan).await {
        Ok(asset) => (Some(asset), None),
        Err((_code, message)) => (None, Some(message)),
    };
    let (poster, poster_warning) = match generate_poster_asset(output_root, &plan, &payload).await {
        Ok(asset) => (Some(asset), None),
        Err((_code, message)) => (None, Some(message)),
    };
    let (narration, narration_warning) =
        match generate_narration_assets(output_root, &payload, &plan).await {
            Ok(asset) => (Some(asset), None),
            Err((_code, message)) => (None, Some(message)),
        };

    let mut warnings = Vec::new();
    if let Some(message) = video_warning {
        warnings.push(format!("Video generation failed: {message}"));
    }
    if let Some(message) = poster_warning {
        warnings.push(format!("Poster generation failed: {message}"));
    }
    if let Some(message) = narration_warning {
        warnings.push(format!("Narration generation failed: {message}"));
    }
    if request.duration_seconds.unwrap_or(DEFAULT_DURATION_SECONDS) > 8 {
        warnings.push(
            "Requested duration was snapped to the nearest Veo clip length (4s, 6s, or 8s)."
                .to_string(),
        );
    }
    if payload.keep_veo_audio
        && video
            .as_ref()
            .map(|asset| !asset.provider_has_audio)
            .unwrap_or(false)
    {
        warnings.push("The current Gemini Veo API path did not expose a native video audio track. Narration sync is still available.".to_string());
    }

    let artifact = GeneratedMediaVideoArtifact {
        artifact_type: "generated_media_video".to_string(),
        status: compute_artifact_status(video.is_some(), narration.is_some(), poster.is_some()),
        video: video.as_ref().map(|asset| GeneratedMediaVideoAsset {
            url: asset.url.clone(),
            duration_seconds: asset.duration_seconds,
            mime_type: asset.mime_type.clone(),
            aspect_ratio: asset.aspect_ratio.clone(),
            resolution: asset.resolution.clone(),
            keep_veo_audio: payload.keep_veo_audio,
        }),
        poster: poster.as_ref().map(|asset| GeneratedMediaImageAsset {
            url: asset.url.clone(),
            mime_type: "image/png".to_string(),
        }),
        narration: narration.as_ref().map(|asset| GeneratedMediaNarration {
            language: asset.language.clone(),
            voice_name: asset.voice_name.clone(),
            script: asset.script.clone(),
            segments: asset.segments.clone(),
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
        poster.as_ref().and_then(|_| fs::read(output_root.join("poster.png")).ok()),
    );
    let followup_body =
        build_followup_request(request, model_content.clone(), function_response_content);
    let followup_response = post_generate_content(&model, &followup_body).await?;
    let final_response_text = extract_text_response(&followup_response).unwrap_or_else(|| {
        format!(
            "{} is ready. The package includes a single-shot video, synchronized narration, poster art, and production metadata.",
            plan.title
        )
    });

    let result = GeneratedMediaVideoResult {
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
        output_root.join("generated_media_artifact.json"),
        serde_json::to_string_pretty(&result).map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize media video artifact: {error}"),
            )
        })?,
    )
    .map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write media video artifact manifest: {error}"),
        )
    })?;

    Ok(MediaVideoExecution {
        video_preview: result.artifact.video.as_ref().map(|asset| asset.url.clone()),
        poster_preview: result.artifact.poster.as_ref().map(|asset| asset.url.clone()),
        result,
    })
}

fn build_initial_interleaved_request(
    request: &GenerateMediaVideoRequest,
    tool_name: &str,
) -> Value {
    let prompt = format!(
        "User request: {prompt}\nRequested duration: {duration}s.\nAspect ratio: {aspect_ratio}\nStyle: {style}\nIntent: {intent}\nCategory: {category}\nMood: {mood}\nCamera direction: {camera}\nNarration tone: {narration_tone}\nNarration intent: {narration_intent}\nVoice: {voice}\n\n\
You are demonstrating a Gemini 3 interleaved function calling flow. You must call the media generation tool exactly once before answering. \
The tool represents the business capability `{logical_tool}`. After the tool response arrives, produce a final user-facing answer that presents the title, usage, cinematic intent, narration, tags, and associated poster.",
        prompt = request.prompt.trim(),
        duration = snap_duration_seconds(request.duration_seconds),
        aspect_ratio = request.aspect_ratio.as_deref().unwrap_or(DEFAULT_ASPECT_RATIO),
        style = request.style.as_deref().unwrap_or("cinematic"),
        intent = request.intent.as_deref().unwrap_or("scene support"),
        category = request.category.as_deref().unwrap_or("cinematic"),
        mood = request.mood.as_deref().unwrap_or("tense"),
        camera = request.camera_direction.as_deref().unwrap_or("slow cinematic push"),
        narration_tone = request.narration_tone.as_deref().unwrap_or("grave, cinematic"),
        narration_intent = request.narration_intent.as_deref().unwrap_or("introduce the scene"),
        voice = request.voice_name.as_deref().unwrap_or(DEFAULT_VOICE_NAME),
        logical_tool = TOOL_LOGICAL_NAME,
    );

    json!({
        "systemInstruction": {
            "parts": [{
                "text": "You are a Gemini 3 cinematic director. Use one function call to request an enriched video artifact, then continue with a concise final answer. Never claim that the base model natively produced video, narration, poster art, and metadata in one monolithic response."
            }]
        },
        "contents": [{
            "role": "user",
            "parts": [{ "text": prompt }]
        }],
        "tools": [{
            "functionDeclarations": [{
                "name": tool_name,
                "description": "Single business tool for generating a unified cinematic video artifact with video, poster image, timed narration, title, description, and classification tags.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "prompt": { "type": "STRING", "description": "The user's cinematic brief." },
                        "duration_seconds": { "type": "INTEGER", "description": "Requested duration snapped to 4, 6, or 8 seconds." },
                        "aspect_ratio": { "type": "STRING", "description": "Aspect ratio such as 16:9 or 9:16." },
                        "style": { "type": "STRING", "description": "Visual style direction." },
                        "intent": { "type": "STRING", "description": "Narrative or product intent." },
                        "category": { "type": "STRING", "description": "Classification such as cinematic, cutscene, trailer, or lore." },
                        "mood": { "type": "STRING", "description": "Emotional tone." },
                        "camera_direction": { "type": "STRING", "description": "Camera movement or framing direction." },
                        "narration_tone": { "type": "STRING", "description": "Voice-over tone." },
                        "narration_intent": { "type": "STRING", "description": "What the narrator should achieve." },
                        "voice_name": { "type": "STRING", "description": "Preferred TTS voice name." },
                        "negative_prompt": { "type": "STRING", "description": "Things to avoid visually." },
                        "global_direction": { "type": "STRING", "description": "Additional global direction for the package." },
                        "keep_veo_audio": { "type": "BOOLEAN", "description": "Whether to keep provider-native video audio under narration when available." }
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
    request: &GenerateMediaVideoRequest,
    model_content: Value,
    function_response_content: Value,
) -> Value {
    json!({
        "systemInstruction": {
            "parts": [{
                "text": "Continue the current interleaved Gemini 3 function-calling turn. Present the generated cinematic package clearly, mention the title, intended use, narration language, tags, and poster art. Do not call any more tools."
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
    artifact: &GeneratedMediaVideoArtifact,
    poster_bytes: Option<Vec<u8>>,
) -> Value {
    let mut function_response = json!({
        "name": tool_name,
        "response": {
            "artifact": {
                "type": "generated_media_video",
                "status": artifact.status,
                "video": artifact.video,
                "poster": artifact.poster.as_ref().map(|poster| json!({
                    "url": poster.url,
                    "mime_type": poster.mime_type
                })),
                "narration": artifact.narration,
                "metadata": artifact.metadata,
                "warnings": artifact.warnings
            }
        }
    });

    if let Some(bytes) = poster_bytes {
        function_response["parts"] = json!([{
            "inlineData": {
                "mimeType": "image/png",
                "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                "displayName": "video_poster.png"
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
    request: &GenerateMediaVideoRequest,
    args: &Value,
) -> ToolExecutionPayload {
    ToolExecutionPayload {
        prompt: pick_arg(args, "prompt", Some(request.prompt.as_str()), request.prompt.as_str()),
        duration_seconds: snap_duration_seconds(
            args.get("duration_seconds")
                .and_then(Value::as_u64)
                .map(|value| value as u32)
                .or(request.duration_seconds),
        ),
        aspect_ratio: pick_arg(
            args,
            "aspect_ratio",
            request.aspect_ratio.as_deref(),
            DEFAULT_ASPECT_RATIO,
        ),
        style: pick_arg(args, "style", request.style.as_deref(), "cinematic"),
        intent: pick_arg(args, "intent", request.intent.as_deref(), "scene support"),
        category: pick_arg(args, "category", request.category.as_deref(), "cinematic"),
        mood: pick_arg(args, "mood", request.mood.as_deref(), "tense"),
        camera_direction: pick_arg(
            args,
            "camera_direction",
            request.camera_direction.as_deref(),
            "slow cinematic push",
        ),
        narration_tone: pick_arg(
            args,
            "narration_tone",
            request.narration_tone.as_deref(),
            "grave, cinematic",
        ),
        narration_intent: pick_arg(
            args,
            "narration_intent",
            request.narration_intent.as_deref(),
            "introduce the scene",
        ),
        voice_name: pick_arg(args, "voice_name", request.voice_name.as_deref(), DEFAULT_VOICE_NAME),
        negative_prompt: pick_arg(args, "negative_prompt", request.negative_prompt.as_deref(), ""),
        global_direction: pick_arg(args, "global_direction", request.global_direction.as_deref(), ""),
        keep_veo_audio: args
            .get("keep_veo_audio")
            .and_then(Value::as_bool)
            .or(request.keep_veo_audio)
            .unwrap_or(true),
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

async fn build_media_video_plan(payload: &ToolExecutionPayload) -> MediaVideoPlan {
    let fallback = fallback_media_video_plan(payload);
    let word_budget = narration_word_budget(payload.duration_seconds);
    let segment_limit = narration_segment_limit(payload.duration_seconds);
    let prompt = format!(
        "Return strict JSON only with keys title, description, intent, tags, videoPromptEnUs, posterPrompt, narrationLanguage, narrationScript, narrationSegments, voiceDirection.\n\
  Build a unified cinematic package plan.\n\
User prompt: {prompt}\n\
Duration: {duration}s\n\
Aspect ratio: {aspect_ratio}\n\
Style: {style}\n\
Intent: {intent}\n\
Category: {category}\n\
Mood: {mood}\n\
Camera direction: {camera}\n\
Narration tone: {narration_tone}\n\
Narration intent: {narration_intent}\n\
Global direction: {global_direction}\n\
Rules:\n\
- Title: 2 to 6 words.\n\
- Description: 2 short sentences explaining utility, tone, and cinematic intention.\n\
- Intent: normalize to a concise production phrase.\n\
- Tags: array of 2 to 4 lowercase tags.\n\
- videoPromptEnUs: concise but vivid en-US Veo prompt.\n\
- posterPrompt: concise concept-art still prompt.\n\
- narrationLanguage: BCP-47 language tag matching the user's language when possible.\n\
- narrationScript: concise narrator script matching the same language.\n\
- narrationScript must be speakable by a slow cinematic narrator in under {duration} seconds.\n\
- narrationScript max words: {word_budget}.\n\
- narrationSegments: array of 1 to {segment_limit} objects with text, startMs, endMs.\n\
- each narration segment must be extremely short and easy to read aloud in one breath.\n\
- narrationSegments must fit entirely in {duration}000 ms.\n\
- voiceDirection: short narrator direction.\n\
- No markdown.\n\
Fallback JSON:\n{fallback}",
        prompt = payload.prompt,
        duration = payload.duration_seconds,
        aspect_ratio = payload.aspect_ratio,
        style = payload.style,
        intent = payload.intent,
        category = payload.category,
        mood = payload.mood,
        camera = payload.camera_direction,
        word_budget = word_budget,
        segment_limit = segment_limit,
        narration_tone = payload.narration_tone,
        narration_intent = payload.narration_intent,
        global_direction = payload.global_direction,
        fallback = serde_json::to_string(&fallback).unwrap_or_else(|_| "{}".to_string()),
    );

    match gemini::generate_text_with_options(&prompt, 0.6).await {
        Ok(text) => parse_media_video_plan(&text, payload.duration_seconds).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

fn fallback_media_video_plan(payload: &ToolExecutionPayload) -> MediaVideoPlan {
    let title = fallback_title(&payload.prompt, "Cinematic");
    let language = detect_language_tag(&payload.prompt);
    let tags = normalize_video_tags(&payload.category, &payload.intent, &payload.mood);
    let description = format!(
        "{} shot for {} usage, carrying a {} tone with {} framing.",
        payload.category, payload.intent, payload.mood, payload.camera_direction
    );
    let script = if language.starts_with("fr") {
        format!(
            "{}. {}. {}.",
            title,
            normalize_sentence("La nuit s'ouvre sur un affrontement fragile et brutal"),
            normalize_sentence("Cette cinematique pose l'intention, le danger et la tension du moment")
        )
    } else {
        format!(
            "{}. {}. {}.",
            title,
            "Night closes over a fragile, violent clash.",
            "This cinematic frames the threat, the purpose, and the pressure of the moment."
        )
    };
    let segments = fallback_narration_segments(&script, payload.duration_seconds);
    MediaVideoPlan {
        title,
        description,
        intent: payload.intent.clone(),
        tags,
        video_prompt_en_us: [
            payload.prompt.clone(),
            payload.style.clone(),
            payload.category.clone(),
            payload.mood.clone(),
            payload.camera_direction.clone(),
            payload.global_direction.clone(),
            "single cinematic shot, no subtitles, no on-screen text".to_string(),
        ]
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(", "),
        poster_prompt: [
            payload.prompt.clone(),
            payload.style.clone(),
            "cinematic poster still".to_string(),
            payload.mood.clone(),
        ]
        .join(", "),
        narration_language: language,
        narration_script: script,
        narration_segments: segments,
        voice_direction: payload.narration_tone.clone(),
    }
}

fn fallback_title(prompt: &str, default_prefix: &str) -> String {
    let words = prompt
        .split_whitespace()
        .take(4)
        .map(|word| {
            let clean = word
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_ascii_lowercase();
            let mut chars = clean.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    if words.is_empty() {
        default_prefix.to_string()
    } else {
        words.join(" ")
    }
}

fn normalize_sentence(text: &str) -> String {
    let trimmed = text.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        return String::new();
    }
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

fn fallback_narration_segments(script: &str, duration_seconds: u32) -> Vec<PlannedNarrationSegment> {
    rebalance_narration_segments(
        script
            .split('.')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| format!("{}.", value))
            .collect(),
        duration_seconds,
    )
}

fn parse_media_video_plan(raw: &str, duration_seconds: u32) -> Option<MediaVideoPlan> {
    let value = extract_first_json_object(raw)?;
    let mut plan = MediaVideoPlan {
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
            .unwrap_or_else(|| vec!["cinematic".to_string()]),
        video_prompt_en_us: value.get("videoPromptEnUs")?.as_str()?.trim().to_string(),
        poster_prompt: value.get("posterPrompt")?.as_str()?.trim().to_string(),
        narration_language: value
            .get("narrationLanguage")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "fr-FR".to_string()),
        narration_script: value
            .get("narrationScript")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())?,
        narration_segments: value
            .get("narrationSegments")
            .and_then(Value::as_array)
            .map(|segments| {
                segments
                    .iter()
                    .filter_map(|segment| {
                        Some(PlannedNarrationSegment {
                            text: segment.get("text")?.as_str()?.trim().to_string(),
                            start_ms: segment.get("startMs")?.as_u64()? as u32,
                            end_ms: segment.get("endMs")?.as_u64()? as u32,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        voice_direction: value
            .get("voiceDirection")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "grave, cinematic".to_string()),
    };
    if plan.title.is_empty()
        || plan.description.is_empty()
        || plan.video_prompt_en_us.is_empty()
        || plan.poster_prompt.is_empty()
    {
        return None;
    }
    let candidate_texts = if plan.narration_segments.is_empty() {
        split_script_sentences(&plan.narration_script)
    } else {
        plan.narration_segments
            .iter()
            .map(|segment| segment.text.clone())
            .collect::<Vec<_>>()
    };
    plan.narration_script = trim_script_to_budget(&plan.narration_script, duration_seconds);
    plan.narration_segments = rebalance_narration_segments(candidate_texts, duration_seconds);
    if plan.narration_segments.is_empty() {
        plan.narration_segments = fallback_narration_segments(&plan.narration_script, duration_seconds);
    }
    Some(plan)
}

fn extract_first_json_object(raw: &str) -> Option<Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Some(value);
    }
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    serde_json::from_str::<Value>(&trimmed[start..=end]).ok()
}

fn validate_narration_segments(
    segments: &[PlannedNarrationSegment],
    duration_seconds: u32,
) -> Vec<PlannedNarrationSegment> {
    let total_ms = duration_seconds * 1000;
    let mut previous_end = 0u32;
    segments
        .iter()
        .filter_map(|segment| {
            let text = segment.text.trim();
            if text.is_empty() {
                return None;
            }
            let start_ms = segment
                .start_ms
                .max(previous_end)
                .min(total_ms.saturating_sub(400));
            let mut end_ms = segment.end_ms.max(start_ms + 600).min(total_ms);
            if end_ms <= start_ms {
                end_ms = (start_ms + 1200).min(total_ms);
            }
            previous_end = end_ms;
            Some(PlannedNarrationSegment {
                text: text.to_string(),
                start_ms,
                end_ms,
            })
        })
        .take(3)
        .collect()
}

fn split_script_sentences(script: &str) -> Vec<String> {
    script
        .split(['.', '!', '?'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("{}.", value))
        .collect()
}

fn count_words(text: &str) -> usize {
    text.split_whitespace()
        .filter(|word| word.chars().any(|ch| ch.is_alphanumeric()))
        .count()
}

fn narration_word_budget(duration_seconds: u32) -> usize {
    match duration_seconds {
        0..=4 => 6,
        5..=6 => 9,
        _ => 13,
    }
}

fn narration_segment_limit(duration_seconds: u32) -> usize {
    match duration_seconds {
        0..=4 => 1,
        _ => 2,
    }
}

fn trim_text_to_words(text: &str, max_words: usize) -> String {
    if max_words == 0 {
        return String::new();
    }
    let mut kept = Vec::new();
    for word in text.split_whitespace() {
        let clean = word.trim();
        if clean.is_empty() {
            continue;
        }
        kept.push(clean);
        if kept.len() >= max_words {
            break;
        }
    }
    let mut result = kept.join(" ");
    result = result.trim().trim_end_matches(['.', '!', '?']).to_string();
    if result.is_empty() {
        String::new()
    } else {
        format!("{}.", result)
    }
}

fn trim_script_to_budget(script: &str, duration_seconds: u32) -> String {
    let budget = narration_word_budget(duration_seconds);
    let units = select_narration_units(split_script_sentences(script), duration_seconds);
    if units.is_empty() {
        trim_text_to_words(script, budget)
    } else {
        units.join(" ")
    }
}

fn estimated_segment_duration_ms(text: &str) -> u32 {
    let words = count_words(text) as u32;
    (NARRATION_BASE_SEGMENT_MS + words.saturating_mul(NARRATION_WORD_MS)).clamp(1200, 4800)
}

fn split_into_clauses(text: &str) -> Vec<String> {
    let mut clauses = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, ',' | ';' | ':' | '.' | '!' | '?') {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                clauses.push(trimmed.to_string());
            }
            current.clear();
        }
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        clauses.push(format!("{}.", trimmed.trim_end_matches(['.', '!', '?'])));
    }
    clauses
}

fn select_narration_units(texts: Vec<String>, duration_seconds: u32) -> Vec<String> {
    let total_word_budget = narration_word_budget(duration_seconds);
    let segment_limit = narration_segment_limit(duration_seconds);
    let mut units = Vec::new();
    let mut used_words = 0usize;

    for text in texts {
        for clause in split_into_clauses(&text) {
            let clause_words = count_words(&clause);
            if clause_words == 0 {
                continue;
            }
            if units.len() >= segment_limit {
                return units;
            }
            if used_words + clause_words <= total_word_budget {
                used_words += clause_words;
                units.push(clause);
                continue;
            }
            if units.is_empty() {
                let trimmed = trim_text_to_words(&clause, total_word_budget.max(1));
                if !trimmed.is_empty() {
                    units.push(trimmed);
                }
            }
            return units;
        }
    }

    units
}

fn rebalance_narration_segments(mut texts: Vec<String>, duration_seconds: u32) -> Vec<PlannedNarrationSegment> {
    let total_ms = duration_seconds.saturating_mul(1000);
    if total_ms < 1200 {
        return Vec::new();
    }

    texts = texts
        .into_iter()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .collect();
    if texts.is_empty() {
        return Vec::new();
    }

    let mut normalized = select_narration_units(texts, duration_seconds);
    if normalized.is_empty() {
        return Vec::new();
    }

    let gaps_total = NARRATION_GAP_MS.saturating_mul(normalized.len().saturating_sub(1) as u32);
    let usable_ms = total_ms.saturating_sub(gaps_total).max(1200);
    let estimates = normalized
        .iter()
        .map(|text| estimated_segment_duration_ms(text))
        .collect::<Vec<_>>();
    let estimate_total: u32 = estimates.iter().copied().sum();
    let mut cursor = 0u32;

    normalized
        .into_iter()
        .enumerate()
        .map(|(index, text)| {
            let remaining_segments = (estimates.len() - index - 1) as u32;
            let remaining_gap_budget = NARRATION_GAP_MS.saturating_mul(remaining_segments);
            let available_until_end = total_ms
                .saturating_sub(cursor)
                .saturating_sub(remaining_gap_budget)
                .max(1000);
            let proportional = if estimate_total == 0 {
                available_until_end
            } else {
                ((usable_ms as u64 * estimates[index] as u64) / estimate_total as u64) as u32
            };
            let duration_ms = proportional.clamp(1200, available_until_end);
            let start_ms = cursor;
            let end_ms = (start_ms + duration_ms).min(total_ms);
            cursor = end_ms.saturating_add(NARRATION_GAP_MS);
            PlannedNarrationSegment {
                text,
                start_ms,
                end_ms,
            }
        })
        .collect()
}

fn normalize_video_tags(category: &str, intent: &str, mood: &str) -> Vec<String> {
    let mut tags = vec![category.trim().to_lowercase()];
    for value in [intent, mood] {
        let normalized = value.trim().to_lowercase();
        if !normalized.is_empty() && !tags.contains(&normalized) {
            tags.push(normalized);
        }
    }
    if !tags.iter().any(|tag| {
        tag == "cinematic" || tag == "cutscene" || tag == "trailer" || tag == "lore"
    }) {
        tags.push("cinematic".to_string());
    }
    tags.into_iter().take(4).collect()
}

fn detect_language_tag(prompt: &str) -> String {
    let lower = prompt.to_lowercase();
    let french_markers = [
        " le ", " la ", " les ", " des ", " une ", " un ", " dans ", " avec ", " contre ",
    ];
    if french_markers.iter().any(|marker| lower.contains(marker)) {
        "fr-FR".to_string()
    } else {
        "en-US".to_string()
    }
}

async fn generate_video_asset(
    output_root: &Path,
    payload: &ToolExecutionPayload,
    plan: &MediaVideoPlan,
) -> Result<VideoGeneration, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GEMINI_API_KEY environment variable not set".to_string(),
        )
    })?;
    let model = video_model();
    let client = Client::new();
    let base_url = "https://generativelanguage.googleapis.com/v1beta";
    let body = json!({
        "instances": [{
            "prompt": plan.video_prompt_en_us
        }],
        "parameters": {
            "sampleCount": 1,
            "durationSeconds": payload.duration_seconds,
            "aspectRatio": payload.aspect_ratio,
            "resolution": DEFAULT_VIDEO_RESOLUTION,
            "negativePrompt": payload.negative_prompt
        }
    });

    let response = client
        .post(format!("{base_url}/models/{model}:predictLongRunning"))
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Veo request failed: {error}"),
            )
        })?;
    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Veo response read failed: {error}"),
        )
    })?;
    let operation: VeoOperationResponse = serde_json::from_str(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Veo response parse failed: {error}"),
        )
    })?;
    if !status.is_success() {
        return Err((
            StatusCode::BAD_REQUEST,
            operation
                .error
                .and_then(|error| error.message)
                .unwrap_or(raw),
        ));
    }

    let operation_name = operation.name.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Veo operation name missing from response".to_string(),
        )
    })?;
    let operation = poll_veo_operation(&client, &api_key, base_url, &operation_name).await?;
    let generated_video = operation
        .response
        .and_then(|response| response.generate_video_response)
        .and_then(|response| {
            response
                .generated_samples
                .into_iter()
                .find_map(|sample| sample.video)
        })
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Veo operation completed without a generated video".to_string(),
            )
        })?;

    let mime_type = generated_video
        .encoding
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "video/mp4".to_string());
    let video_bytes = if let Some(encoded) = generated_video.encoded_video {
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| {
                (
                    StatusCode::BAD_GATEWAY,
                    format!("Failed to decode generated video bytes: {error}"),
                )
            })?
    } else if let Some(uri) = generated_video.uri {
        client
            .get(uri)
            .header("x-goog-api-key", &api_key)
            .send()
            .await
            .map_err(|error| {
                (
                    StatusCode::BAD_GATEWAY,
                    format!("Video download failed: {error}"),
                )
            })?
            .bytes()
            .await
            .map_err(|error| {
                (
                    StatusCode::BAD_GATEWAY,
                    format!("Video download read failed: {error}"),
                )
            })?
            .to_vec()
    } else {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Veo returned neither encoded video bytes nor a downloadable URI".to_string(),
        ));
    };

    fs::write(output_root.join("video.mp4"), video_bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write generated video: {error}"),
        )
    })?;

    Ok(VideoGeneration {
        url: format!(
            "/api/generated-media-video/{}/video.mp4",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
        mime_type,
        duration_seconds: payload.duration_seconds,
        aspect_ratio: payload.aspect_ratio.clone(),
        resolution: DEFAULT_VIDEO_RESOLUTION.to_string(),
        provider_has_audio: false,
    })
}

async fn poll_veo_operation(
    client: &Client,
    api_key: &str,
    base_url: &str,
    operation_name: &str,
) -> Result<VeoOperationResponse, (StatusCode, String)> {
    let operation_url = format!("{base_url}/{}", operation_name.trim_start_matches('/'));
    for attempt in 0..VEO_POLL_MAX_ATTEMPTS {
        let response = client
            .get(&operation_url)
            .header("x-goog-api-key", api_key)
            .send()
            .await
            .map_err(|error| {
                (
                    StatusCode::BAD_GATEWAY,
                    format!("Veo operation poll failed: {error}"),
                )
            })?;
        let status = response.status();
        let raw = response.text().await.map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Veo operation read failed: {error}"),
            )
        })?;
        let operation: VeoOperationResponse = serde_json::from_str(&raw).map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Veo operation parse failed: {error}"),
            )
        })?;
        if !status.is_success() {
            return Err((
                StatusCode::BAD_REQUEST,
                operation
                    .error
                    .and_then(|error| error.message)
                    .unwrap_or(raw),
            ));
        }
        if operation.done.unwrap_or(false) {
            if let Some(error) = operation.error.as_ref().and_then(|value| value.message.clone()) {
                return Err((StatusCode::BAD_GATEWAY, error));
            }
            return Ok(operation);
        }
        let wait_ms = if attempt < 4 { 1500 } else { 2500 };
        sleep(Duration::from_millis(wait_ms)).await;
    }

    Err((
        StatusCode::GATEWAY_TIMEOUT,
        "Veo operation timed out".to_string(),
    ))
}

async fn generate_poster_asset(
    output_root: &Path,
    plan: &MediaVideoPlan,
    payload: &ToolExecutionPayload,
) -> Result<PosterGeneration, (StatusCode, String)> {
    let cols = if payload.aspect_ratio == "9:16" { 1024 } else { 1280 };
    let rows = if payload.aspect_ratio == "9:16" { 1792 } else { 720 };
    let bytes = gemini::generate_image_bytes(
        &plan.poster_prompt,
        Some(0.8),
        cols,
        rows,
        Some(payload.aspect_ratio.as_str()),
    )
    .await?;
    fs::write(output_root.join("poster.png"), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write poster image: {error}"),
        )
    })?;
    Ok(PosterGeneration {
        url: format!(
            "/api/generated-media-video/{}/poster.png",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
    })
}

async fn generate_narration_assets(
    output_root: &Path,
    payload: &ToolExecutionPayload,
    plan: &MediaVideoPlan,
) -> Result<NarrationGeneration, (StatusCode, String)> {
    let segments = validate_narration_segments(&plan.narration_segments, payload.duration_seconds);
    if segments.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Narration plan contained no usable timecoded segments".to_string(),
        ));
    }

    let mut generated_segments = Vec::new();
    for (index, segment) in segments.into_iter().enumerate() {
        match generate_tts_segment_audio(
            output_root,
            index + 1,
            &payload.voice_name,
            &segment.text,
            segment.end_ms.saturating_sub(segment.start_ms),
        )
        .await
        {
            Ok((file_name, _sample_rate_hz)) => {
                generated_segments.push(GeneratedMediaNarrationSegment {
                    segment_id: format!("seg-{:03}", index + 1),
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                    text: segment.text,
                    audio_url: format!(
                        "/api/generated-media-video/{}/narration/{}",
                        output_root
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or_default(),
                        file_name
                    ),
                    mime_type: "audio/wav".to_string(),
                    duck_video_to: 0.3,
                });
            }
            Err((_code, message)) => {
                warn!("narration segment {} failed: {}", index + 1, message);
            }
        }
    }

    if generated_segments.is_empty() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "All narration TTS segments failed".to_string(),
        ));
    }

    Ok(NarrationGeneration {
        language: plan.narration_language.clone(),
        voice_name: payload.voice_name.clone(),
        script: plan.narration_script.clone(),
        segments: generated_segments,
    })
}

async fn generate_tts_segment_audio(
    output_root: &Path,
    index: usize,
    voice_name: &str,
    text: &str,
    max_duration_ms: u32,
) -> Result<(String, u32), (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "GEMINI_API_KEY environment variable not set".to_string(),
        )
    })?;
    let body = json!({
        "contents": [{
            "parts": [{
                "text": text.trim()
            }]
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name
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
        .header("x-goog-api-key", api_key)
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
    let payload: TtsResponse = serde_json::from_str(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Gemini TTS parse failed: {error}"),
        )
    })?;
    if !status.is_success() {
        return Err((
            StatusCode::BAD_REQUEST,
            payload.error.map(|error| error.message).unwrap_or(raw),
        ));
    }

    let inline = payload
        .candidates
        .and_then(|candidates| candidates.into_iter().find_map(|candidate| candidate.content))
        .and_then(|content| content.parts)
        .and_then(|parts| parts.into_iter().find_map(|part| part.inline_data))
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Gemini TTS response did not contain audio inlineData".to_string(),
            )
        })?;

    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(inline.data)
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
    let wav_bytes = trim_wav_to_duration_ms(&wav_bytes, sample_rate_hz, max_duration_ms)
        .unwrap_or(wav_bytes);

    let file_name = format!("seg_{:03}.wav", index);
    fs::write(output_root.join("narration").join(&file_name), wav_bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write narration segment: {error}"),
        )
    })?;
    Ok((file_name, sample_rate_hz))
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

fn trim_wav_to_duration_ms(
    wav: &[u8],
    sample_rate_hz_hint: u32,
    target_ms: u32,
) -> Option<Vec<u8>> {
    if target_ms == 0 {
        return Some(wav.to_vec());
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
            block_align = u16::from_le_bytes([
                wav[chunk_data_start + 12],
                wav[chunk_data_start + 13],
            ]);
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

    let target_byte_len = ((target_ms as usize)
        .saturating_mul(bytes_per_second))
        .saturating_div(1000)
        .min(data_chunk_size);
    let trimmed_data_len = target_byte_len - (target_byte_len % block_align as usize);
    if trimmed_data_len == 0 || trimmed_data_len >= data_chunk_size {
        return Some(wav.to_vec());
    }

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
    Some(trimmed)
}

fn compute_artifact_status(
    has_video: bool,
    has_narration: bool,
    has_poster: bool,
) -> GeneratedMediaStatus {
    match (has_video, has_narration, has_poster) {
        (true, true, true) => GeneratedMediaStatus::Success,
        (true, _, _) | (_, true, true) => GeneratedMediaStatus::PartialSuccess,
        _ => GeneratedMediaStatus::Error,
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
    response
        .get("candidates")?
        .as_array()?
        .iter()
        .find_map(|candidate| {
            candidate
                .get("content")?
                .get("parts")?
                .as_array()?
                .iter()
                .find_map(|part| part.get("text").and_then(Value::as_str).map(str::to_string))
        })
}

#[cfg(test)]
mod tests {
    use super::{
        parse_media_video_plan, pcm_s16le_to_wav, rebalance_narration_segments,
        select_narration_units,
        snap_duration_seconds,
        trim_wav_to_duration_ms,
        validate_narration_segments, PlannedNarrationSegment,
    };

    #[test]
    fn snaps_duration_to_supported_values() {
        assert_eq!(snap_duration_seconds(None), 8);
        assert_eq!(snap_duration_seconds(Some(1)), 4);
        assert_eq!(snap_duration_seconds(Some(6)), 6);
        assert_eq!(snap_duration_seconds(Some(30)), 8);
    }

    #[test]
    fn parses_media_video_plan_from_json() {
        let parsed = parse_media_video_plan(
            r#"{
                "title":"Night Raid",
                "description":"A brutal night combat beat. It frames pressure and momentum.",
                "intent":"combat intro",
                "tags":["cinematic","lore"],
                "videoPromptEnUs":"night combat in ruined camp, handheld push",
                "posterPrompt":"grim night raid poster",
                "narrationLanguage":"fr-FR",
                "narrationScript":"La nuit s'ouvre sur un raid.",
                "narrationSegments":[{"text":"La nuit s'ouvre sur un raid.","startMs":0,"endMs":2400}],
                "voiceDirection":"grave"
            }"#,
            8,
        )
        .expect("plan");

        assert_eq!(parsed.title, "Night Raid");
        assert_eq!(parsed.narration_segments.len(), 1);
        assert_eq!(parsed.narration_segments[0].start_ms, 0);
    }

    #[test]
    fn validates_segments_inside_duration() {
        let segments = validate_narration_segments(
            &[PlannedNarrationSegment {
                text: "Test".to_string(),
                start_ms: 7000,
                end_ms: 12000,
            }],
            8,
        );
        assert_eq!(segments.len(), 1);
        assert!(segments[0].end_ms <= 8000);
    }

    #[test]
    fn wraps_pcm_as_wav() {
        let wav = pcm_s16le_to_wav(&[0, 1, 2, 3], 24_000, 1);
        assert!(wav.starts_with(b"RIFF"));
        assert_eq!(&wav[8..12], b"WAVE");
    }

    #[test]
    fn trims_wav_to_segment_window() {
        let sample_rate_hz = 24_000u32;
        let wav = pcm_s16le_to_wav(&vec![0u8; sample_rate_hz as usize * 2 * 4], sample_rate_hz, 1);
        let trimmed = trim_wav_to_duration_ms(&wav, sample_rate_hz, 1500).expect("trimmed wav");
        assert!(trimmed.len() < wav.len());
        assert!(trimmed.starts_with(b"RIFF"));
    }

    #[test]
    fn rebalances_narration_to_short_segments_for_eight_seconds() {
        let segments = rebalance_narration_segments(
            vec![
                "The desolate Ashlands.".to_string(),
                "A high-stakes raid commences.".to_string(),
                "Gritty survivors strike with precision. Chaos erupts.".to_string(),
            ],
            8,
        );
        assert!(segments.len() <= 2);
        assert!(segments.last().map(|segment| segment.end_ms).unwrap_or_default() <= 8000);
        assert!(segments.iter().all(|segment| !segment.text.trim().is_empty()));
    }

    #[test]
    fn selects_complete_clauses_before_truncating_words() {
        let units = select_narration_units(
            vec![
                "On a blood-red cliff, a violent shove.".to_string(),
                "One falls into the abyss.".to_string(),
            ],
            8,
        );
        assert_eq!(units, vec![
            "On a blood-red cliff,".to_string(),
            "a violent shove.".to_string(),
        ]);
    }
}
