use std::path::Path;

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::media_audio::{
    self, GenerateMediaAudioRequest, GeneratedMediaAudioAsset, GeneratedMediaAudioResult,
    GeneratedMediaImageAsset, GeneratedMediaMetadata, GeneratedMediaStatus, InterleavedTranscript,
    InterleavedAudioRunOptions, MediaAudioExecution,
};

const DEMO_STEP_ONE_FOLLOWUP_SYSTEM_PROMPT: &str = "Continue the current interleaved Gemini 3 function-calling turn. Produce a concise but evocative world-introduction lore passage for the Ashtrail demo. Write diegetically, like a gifted storyteller introducing a newly discovered world to the player. The passage should feel inspired, atmospheric, and rooted in the world's implied history, dangers, and wonder. Keep the focus on mood, place, and narrative promise. Do not expose internal tool mechanics, implementation details, metadata formatting, or production language. Do not call any more tools.";
const DEFAULT_DEMO_STEP_ONE_DURATION_SECONDS: u32 = 18;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneGenerateRequest {
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub song_duration_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub status: GeneratedMediaStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<GeneratedMediaAudioAsset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<GeneratedMediaImageAsset>,
    pub lore_text: String,
    pub metadata: GeneratedMediaMetadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneResult {
    pub artifact: DemoStepOneArtifact,
    pub transcript: InterleavedTranscript,
}

#[derive(Debug, Clone)]
pub struct DemoStepOneExecution {
    pub request: GenerateMediaAudioRequest,
    pub base_execution: MediaAudioExecution,
    pub result: DemoStepOneResult,
}

pub fn build_demo_step_one_media_request(request: &DemoStepOneGenerateRequest) -> GenerateMediaAudioRequest {
    let prompt = request
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            [
                "Create the first Ashtrail demo beat as one coordinated interleaved generation package.",
                "Generate a seamless equirectangular alien planetary texture for a rotating globe seen from orbit.",
                "Generate concise world-introduction lore for a cinematic game demo panel.",
                "Generate a matching instrumental song cue for this same world-introduction beat.",
                "Keep image, lore, and music coherent, atmospheric, and clearly part of one unified scene package.",
            ]
            .join(" ")
        });

    GenerateMediaAudioRequest {
        prompt,
        duration_seconds: request
            .song_duration_seconds
            .or(Some(DEFAULT_DEMO_STEP_ONE_DURATION_SECONDS)),
        style: Some(
            "deep-space satellite photography | atmospheric | cinematic | high coherence across image, lore, and music"
                .to_string(),
        ),
        intent: Some("world introduction demo beat".to_string()),
        category: Some("ost".to_string()),
        mood: Some("mysterious".to_string()),
    }
}

pub fn build_demo_step_one_error_result(message: &str) -> DemoStepOneResult {
    DemoStepOneResult {
        artifact: DemoStepOneArtifact {
            artifact_type: "demo_step_one_interleaved".to_string(),
            status: GeneratedMediaStatus::Error,
            audio: None,
            image: None,
            lore_text: message.to_string(),
            metadata: GeneratedMediaMetadata {
                title: "Demo Step One Failed".to_string(),
                description: message.to_string(),
                intent: "world introduction demo beat".to_string(),
                tags: vec!["demo".to_string(), "interleaved".to_string()],
            },
            warnings: vec![message.to_string()],
        },
        transcript: InterleavedTranscript {
            model: media_audio::interleaved_model(),
            logical_tool_name: "generatemedia.audio".to_string(),
            api_tool_name: "generatemedia_audio".to_string(),
            tool_called: false,
            thought_signature_detected: false,
            tool_arguments: json!({}),
            final_response_text: message.to_string(),
        },
    }
}

pub async fn run_demo_step_one(
    request: &DemoStepOneGenerateRequest,
    output_root: &Path,
    job_id: &str,
) -> Result<DemoStepOneExecution, (StatusCode, String)> {
    let media_request = build_demo_step_one_media_request(request);
    let base_execution = media_audio::run_interleaved_audio_with_options(
        &media_request,
        output_root,
        job_id,
        InterleavedAudioRunOptions {
            followup_system_prompt: DEMO_STEP_ONE_FOLLOWUP_SYSTEM_PROMPT,
            image_prompt_override: Some(strict_planet_prompt(&media_request.prompt)),
        },
    )
    .await?;

    let result = DemoStepOneResult {
        artifact: DemoStepOneArtifact {
            artifact_type: "demo_step_one_interleaved".to_string(),
            status: base_execution.result.artifact.status.clone(),
            audio: base_execution.result.artifact.audio.clone(),
            image: base_execution.result.artifact.image.clone(),
            lore_text: build_demo_step_one_lore_text(&base_execution.result),
            metadata: base_execution.result.artifact.metadata.clone(),
            warnings: base_execution.result.artifact.warnings.clone(),
        },
        transcript: base_execution.result.transcript.clone(),
    };

    Ok(DemoStepOneExecution {
        request: media_request,
        base_execution,
        result,
    })
}

fn strict_planet_prompt(theme: &str) -> String {
    format!(
        "Generate a seamless equirectangular projection ALIEN planetary map texture. \
STYLE: Deep space satellite photography, photorealistic, top-down orthographic view as seen from orbit. \
FORMAT: Must be a valid equirectangular (cylindrical) projection that wraps seamlessly around a sphere - poles at top/bottom, equator centered. \
CRITICAL REQUIREMENT: The planet MUST NOT RESEMBLE EARTH. Do not generate Earth-like continents such as Africa, South America, Eurasia, or recognizable Earth coastlines. \
ABSOLUTELY FORBIDDEN: No text, labels, annotations, legends, icons, UI elements, borders, frames, fantasy crystals, floating islands, glowing artifacts, impossible geology, or cutaway views. \
RENDER ONLY: Realistic but completely novel alien terrain with oceans, unusual continents, deserts, forests, ice caps, mountain ranges, rivers, and coastlines as they would appear in actual satellite imagery of an undiscovered exoplanet. \
Theme/setting: {}. Interpret thematically while preserving strict realistic orbital photography.",
        theme.trim()
    )
}

fn build_demo_step_one_lore_text(result: &GeneratedMediaAudioResult) -> String {
    let candidate = result.transcript.final_response_text.trim();
    if !candidate.is_empty() {
        return candidate.to_string();
    }

    let title = result.artifact.metadata.title.trim();
    let description = result.artifact.metadata.description.trim();
    let intent = result.artifact.metadata.intent.trim();

    format!(
        "{} drifts at the edge of memory and omen, a world spoken of in fragments by those who crossed its skies and never returned unchanged. {} Beneath its horizon lies the promise of {}, where every shore, ruin, and storm front feels like the beginning of a legend.",
        if title.is_empty() { "This world" } else { title },
        if description.is_empty() {
            "Its surface carries the weight of old weather, hidden histories, and continents that seem to remember older names."
        } else {
            description
        },
        if intent.is_empty() { "a new chapter" } else { intent }
    )
}
