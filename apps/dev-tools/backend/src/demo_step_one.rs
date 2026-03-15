use std::{env, fs, path::Path};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::gemini;
use crate::media_audio::{
    self, GenerateMediaAudioRequest, GeneratedMediaAudioAsset, GeneratedMediaAudioResult,
    GeneratedMediaImageAsset, GeneratedMediaMetadata, GeneratedMediaStatus,
    InterleavedAudioRunOptions, InterleavedTranscript, MediaAudioExecution,
};

const DEMO_STEP_ONE_FOLLOWUP_SYSTEM_PROMPT: &str = "Continue the current interleaved Gemini 3 function-calling turn. Produce a concise but evocative world-introduction lore passage for the Ashtrail demo. Write diegetically, like a gifted storyteller introducing a newly discovered world to the player. The passage should feel inspired, atmospheric, and rooted in the world's implied history, dangers, and wonder. Keep the focus on mood, place, and narrative promise. Do not expose internal tool mechanics, implementation details, metadata formatting, or production language. Do not call any more tools.";
const DEFAULT_DEMO_STEP_ONE_DURATION_SECONDS: u32 = 18;
const DEMO_OUTPUT_API_ROOT: &str = "/api/demo-output";
const DEMO_STEP_ONE_GENERATE_MUSIC_ENV: &str = "DEMO_STEP_ONE_GENERATE_MUSIC";

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
pub struct DemoStepOneStoryOption {
    pub id: String,
    pub title: String,
    pub prompt_seed: String,
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
    #[serde(default)]
    pub story_options: Vec<DemoStepOneStoryOption>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneSelectionRequest {
    pub source_job_id: String,
    pub world_title: String,
    pub base_lore_text: String,
    pub option_id: String,
    pub option_title: String,
    pub option_prompt_seed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneSelectionArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub status: GeneratedMediaStatus,
    pub selected_option_id: String,
    pub selected_option_title: String,
    #[serde(default)]
    pub additional_lore_paragraphs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepOneSelectionResult {
    pub artifact: DemoStepOneSelectionArtifact,
    pub transcript: InterleavedTranscript,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoStepOneStoredArtifact {
    pub artifact: serde_json::Value,
    #[serde(default)]
    pub transcript: Option<InterleavedTranscript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoStepOneCuratedCopy {
    pub planet_name: String,
    pub lore_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoStepOneStoryOptionsPayload {
    pub story_options: Vec<DemoStepOneStoryOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoStepOneSelectionPayload {
    pub additional_lore_paragraphs: Vec<String>,
}

pub fn build_demo_step_one_media_request(
    request: &DemoStepOneGenerateRequest,
) -> GenerateMediaAudioRequest {
    let generate_music = demo_step_one_generate_music_enabled();
    let prompt = request
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            let mut parts = vec![
                "Create the first Ashtrail demo beat as one coordinated interleaved generation package.",
                "Generate a seamless equirectangular alien planetary texture for a rotating globe seen from orbit.",
                "Generate concise world-introduction lore for a cinematic game demo panel.",
            ];
            if generate_music {
                parts.push("Generate a matching instrumental song cue for this same world-introduction beat.");
                parts.push("Keep image, lore, and music coherent, atmospheric, and clearly part of one unified scene package.");
            } else {
                parts.push("Keep image and lore coherent, atmospheric, and clearly part of one unified scene package.");
            }
            parts.join(" ")
        });

    GenerateMediaAudioRequest {
        prompt,
        duration_seconds: if generate_music {
            request
                .song_duration_seconds
                .or(Some(DEFAULT_DEMO_STEP_ONE_DURATION_SECONDS))
        } else {
            None
        },
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
            story_options: Vec::new(),
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

pub fn load_pregenerated_demo_step_one(
    cache_dir: &Path,
    folder_name: &str,
) -> Result<DemoStepOneResult, String> {
    let artifact_path = cache_dir.join("artifact.json");
    let raw = fs::read_to_string(&artifact_path).map_err(|error| {
        format!(
            "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: failed to read {}: {error}",
            artifact_path.display()
        )
    })?;
    let stored = serde_json::from_str::<DemoStepOneStoredArtifact>(&raw).map_err(|error| {
        format!(
            "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: failed to parse {}: {error}",
            artifact_path.display()
        )
    })?;

    let artifact_type = stored
        .artifact
        .get("type")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            format!(
                "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: {} is missing artifact.type",
                artifact_path.display()
            )
        })?;

    let mut result = match artifact_type {
        "demo_step_one_interleaved" => serde_json::from_value::<DemoStepOneResult>(
            serde_json::json!({
                "artifact": stored.artifact,
                "transcript": stored.transcript,
            }),
        )
        .map_err(|error| {
            format!(
                "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: failed to decode demo result from {}: {error}",
                artifact_path.display()
            )
        })?,
        "generated_media_audio" => {
            let legacy = serde_json::from_str::<GeneratedMediaAudioResult>(&raw).map_err(|error| {
                format!(
                    "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: failed to decode legacy media artifact from {}: {error}",
                    artifact_path.display()
                )
            })?;
            adapt_generated_media_audio_result(legacy)
        }
        other => {
            return Err(format!(
                "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: unsupported artifact.type `{other}` in {}",
                artifact_path.display()
            ));
        }
    };

    sanitize_loaded_demo_step_one_result(&mut result);
    hydrate_loaded_demo_step_one_assets(cache_dir, &mut result);
    validate_demo_step_one_assets(cache_dir, folder_name, &result)?;
    rewrite_demo_step_one_asset_urls(&mut result, folder_name);
    Ok(result)
}

pub fn rewrite_demo_step_one_asset_urls(result: &mut DemoStepOneResult, folder_name: &str) {
    if let Some(audio) = result.artifact.audio.as_mut() {
        audio.url = format!("{DEMO_OUTPUT_API_ROOT}/{folder_name}/audio.wav");
    }
    if let Some(image) = result.artifact.image.as_mut() {
        image.url = format!("{DEMO_OUTPUT_API_ROOT}/{folder_name}/image.png");
    }
}

pub fn persist_demo_step_one_result(
    output_root: &Path,
    result: &DemoStepOneResult,
) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(result)
        .map_err(|error| format!("Failed to serialize demo step 1 artifact manifest: {error}"))?;
    fs::write(output_root.join("artifact.json"), bytes)
        .map_err(|error| format!("Failed to write demo step 1 artifact manifest: {error}"))
}

pub async fn run_demo_step_one(
    request: &DemoStepOneGenerateRequest,
    output_root: &Path,
    job_id: &str,
) -> Result<DemoStepOneExecution, (StatusCode, String)> {
    let media_request = build_demo_step_one_media_request(request);
    let generate_music = demo_step_one_generate_music_enabled();
    let base_execution = media_audio::run_interleaved_audio_with_options(
        &media_request,
        output_root,
        job_id,
        InterleavedAudioRunOptions {
            followup_system_prompt: DEMO_STEP_ONE_FOLLOWUP_SYSTEM_PROMPT,
            image_prompt_override: Some(strict_planet_prompt(&media_request.prompt)),
            generate_audio: generate_music,
        },
    )
    .await?;

    let curated = curate_demo_step_one_copy(&base_execution.result)
        .await
        .unwrap_or_else(|_| fallback_demo_step_one_copy(&base_execution.result));
    let story_options = generate_story_options(
        &curated.planet_name,
        &curated.lore_text,
        &base_execution.result.artifact.metadata,
    )
    .await
    .unwrap_or_else(|_| fallback_story_options(&curated.planet_name, &curated.lore_text));
    let mut metadata = base_execution.result.artifact.metadata.clone();
    if !curated.planet_name.trim().is_empty() {
        metadata.title = curated.planet_name.trim().to_string();
    }

    let result = DemoStepOneResult {
        artifact: DemoStepOneArtifact {
            artifact_type: "demo_step_one_interleaved".to_string(),
            status: base_execution.result.artifact.status.clone(),
            audio: base_execution.result.artifact.audio.clone(),
            image: base_execution.result.artifact.image.clone(),
            lore_text: curated.lore_text,
            metadata,
            story_options,
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

pub async fn run_demo_step_one_selection(
    request: &DemoStepOneSelectionRequest,
    output_root: &Path,
) -> Result<DemoStepOneSelectionResult, (StatusCode, String)> {
    let selection = generate_selection_lore(request)
        .await
        .unwrap_or_else(|_| fallback_selection_lore(request));
    let transcript_text = format!(
        "{}\n\n{}",
        request.option_title,
        selection.additional_lore_paragraphs.join("\n\n")
    );
    let result = DemoStepOneSelectionResult {
        artifact: DemoStepOneSelectionArtifact {
            artifact_type: "demo_step_one_selection".to_string(),
            status: GeneratedMediaStatus::Success,
            selected_option_id: request.option_id.clone(),
            selected_option_title: request.option_title.clone(),
            additional_lore_paragraphs: selection.additional_lore_paragraphs,
            warnings: Vec::new(),
        },
        transcript: InterleavedTranscript {
            model: media_audio::interleaved_model(),
            logical_tool_name: "demo.step1.selection".to_string(),
            api_tool_name: "demo.step1.selection".to_string(),
            tool_called: false,
            thought_signature_detected: false,
            tool_arguments: serde_json::to_value(request).unwrap_or_else(|_| json!({})),
            final_response_text: transcript_text,
        },
    };

    persist_demo_step_one_selection_result(output_root, &result)
        .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;

    Ok(result)
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

pub(crate) fn build_demo_step_one_lore_text(result: &GeneratedMediaAudioResult) -> String {
    fallback_demo_step_one_copy(result).lore_text
}

fn fallback_demo_step_one_copy(result: &GeneratedMediaAudioResult) -> DemoStepOneCuratedCopy {
    if let Some(candidate) = extract_user_facing_lore(&result.transcript.final_response_text) {
        let planet_name = extract_planet_name(&candidate)
            .unwrap_or_else(|| fallback_planet_name(&result.artifact.metadata));
        return DemoStepOneCuratedCopy {
            planet_name,
            lore_text: candidate,
        };
    }

    let title = result.artifact.metadata.title.trim();
    let description = result.artifact.metadata.description.trim();
    let intent = result.artifact.metadata.intent.trim();

    DemoStepOneCuratedCopy {
        planet_name: fallback_planet_name(&result.artifact.metadata),
        lore_text: format!(
            "{} drifts at the edge of memory and omen, a world spoken of in fragments by those who crossed its skies and never returned unchanged. {} Beneath its horizon lies the promise of {}, where every shore, ruin, and storm front feels like the beginning of a legend.",
            if title.is_empty() { "This world" } else { title },
            if description.is_empty() {
                "Its surface carries the weight of old weather, hidden histories, and continents that seem to remember older names."
            } else {
                description
            },
            if intent.is_empty() { "a new chapter" } else { intent }
        ),
    }
}

fn demo_step_one_generate_music_enabled() -> bool {
    env::var(DEMO_STEP_ONE_GENERATE_MUSIC_ENV)
        .ok()
        .as_deref()
        .map(parse_boolish_enabled)
        .unwrap_or(true)
}

fn parse_boolish_enabled(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        true
    } else {
        !matches!(normalized.as_str(), "0" | "false" | "no" | "off")
    }
}

pub fn persist_demo_step_one_selection_result(
    output_root: &Path,
    result: &DemoStepOneSelectionResult,
) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(result)
        .map_err(|error| format!("Failed to serialize demo step 1 selection artifact: {error}"))?;
    fs::create_dir_all(output_root)
        .map_err(|error| format!("Failed to create demo step 1 selection directory: {error}"))?;
    fs::write(output_root.join("artifact.json"), bytes)
        .map_err(|error| format!("Failed to write demo step 1 selection artifact: {error}"))
}

async fn generate_story_options(
    planet_name: &str,
    lore_text: &str,
    metadata: &GeneratedMediaMetadata,
) -> Result<Vec<DemoStepOneStoryOption>, (StatusCode, String)> {
    let prompt = format!(
        "Return strict JSON only with key storyOptions.\n\
Generate exactly 4 world-direction buttons for Ashtrail demo step 1.\n\
Each item must contain id, title, promptSeed.\n\
Requirements:\n\
- title: 2 to 5 words, evocative, button-friendly.\n\
- promptSeed: one short sentence describing the canon direction chosen by the player.\n\
- All 4 options must be distinct.\n\
- No markdown, no commentary, no extra keys.\n\
World name: {planet_name}\n\
Current lore: {lore_text}\n\
Metadata description: {description}",
        description = metadata.description.trim()
    );
    let raw = gemini::generate_text_with_options(&prompt, 0.5).await?;
    let payload = parse_json_payload::<DemoStepOneStoryOptionsPayload>(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse demo step 1 story options JSON: {error}"),
        )
    })?;
    let mut options = payload
        .story_options
        .into_iter()
        .filter(|option| !option.title.trim().is_empty() && !option.prompt_seed.trim().is_empty())
        .collect::<Vec<_>>();
    if options.len() != 4 {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!(
                "Expected exactly 4 story options, received {}",
                options.len()
            ),
        ));
    }
    for (index, option) in options.iter_mut().enumerate() {
        option.id = if option.id.trim().is_empty() {
            format!("option-{}", index + 1)
        } else {
            option.id.trim().to_string()
        };
        option.title = option.title.trim().to_string();
        option.prompt_seed = option.prompt_seed.trim().to_string();
    }
    Ok(options)
}

fn fallback_story_options(planet_name: &str, lore_text: &str) -> Vec<DemoStepOneStoryOption> {
    let world_name = if planet_name.trim().is_empty() {
        "this world"
    } else {
        planet_name.trim()
    };
    [
        (
            "option-1",
            "Forgotten Empire",
            format!("Reveal {world_name} as the buried seat of a vanished stellar empire whose ruins still influence the present."),
        ),
        (
            "option-2",
            "Living Wilderness",
            format!("Frame {world_name} as an untamed living biosphere whose strange ecologies shape every journey and settlement."),
        ),
        (
            "option-3",
            "Ashbound Pilgrimage",
            format!("Turn {world_name} into a sacred destination where factions arrive seeking prophecy, relics, and redemption."),
        ),
        (
            "option-4",
            "Silent Cataclysm",
            format!("Interpret {world_name} as a post-cataclysm frontier where the last survivors endure beneath the shadow of an old disaster."),
        ),
    ]
    .into_iter()
    .map(|(id, title, prompt_seed)| DemoStepOneStoryOption {
        id: id.to_string(),
        title: title.to_string(),
        prompt_seed: if lore_text.trim().is_empty() {
            prompt_seed
        } else {
            format!("{prompt_seed} Keep continuity with this established world introduction: {}", lore_text.trim())
        },
    })
    .collect()
}

async fn generate_selection_lore(
    request: &DemoStepOneSelectionRequest,
) -> Result<DemoStepOneSelectionPayload, (StatusCode, String)> {
    let prompt = format!(
        "Return strict JSON only with key additionalLoreParagraphs.\n\
Write exactly 2 additional paragraphs for Ashtrail demo step 1.\n\
Each paragraph should continue the existing world introduction and commit to the selected canon direction.\n\
Requirements:\n\
- exactly 2 paragraphs in the array\n\
- each paragraph 2 to 4 sentences\n\
- diegetic, atmospheric, and coherent with the existing world intro\n\
- no markdown, no labels, no commentary\n\
World name: {world_title}\n\
Existing lore: {base_lore}\n\
Selected direction title: {option_title}\n\
Selected direction seed: {option_seed}",
        world_title = request.world_title.trim(),
        base_lore = request.base_lore_text.trim(),
        option_title = request.option_title.trim(),
        option_seed = request.option_prompt_seed.trim(),
    );
    let raw = gemini::generate_text_with_options(&prompt, 0.55).await?;
    let payload = parse_json_payload::<DemoStepOneSelectionPayload>(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse demo step 1 selection JSON: {error}"),
        )
    })?;
    let paragraphs = payload
        .additional_lore_paragraphs
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if paragraphs.len() != 2 {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!(
                "Expected exactly 2 lore paragraphs, received {}",
                paragraphs.len()
            ),
        ));
    }
    Ok(DemoStepOneSelectionPayload {
        additional_lore_paragraphs: paragraphs,
    })
}

fn fallback_selection_lore(request: &DemoStepOneSelectionRequest) -> DemoStepOneSelectionPayload {
    DemoStepOneSelectionPayload {
        additional_lore_paragraphs: vec![
            format!(
                "{} now reveals itself through the path of {}. {}",
                request.world_title.trim(),
                request.option_title.trim(),
                request.option_prompt_seed.trim()
            ),
            format!(
                "Those who step onto its soil will find that the first omen was only a threshold, and that every ruin, storm front, and surviving witness bends toward this chosen fate."
            ),
        ],
    }
}

async fn curate_demo_step_one_copy(
    result: &GeneratedMediaAudioResult,
) -> Result<DemoStepOneCuratedCopy, (StatusCode, String)> {
    let seed_lore = extract_user_facing_lore(&result.transcript.final_response_text)
        .unwrap_or_else(|| build_demo_step_one_lore_text(result));
    let fallback_name = fallback_planet_name(&result.artifact.metadata);
    let prompt = format!(
        "Return strict JSON only with keys planetName and loreText.\n\
You are refining the presentation copy for Ashtrail demo step 1.\n\
Take the source material below and rewrite it into one concise, diegetic paragraph for the player-facing UI.\n\
Requirements:\n\
- planetName: short memorable proper name for the world, 1 to 4 words.\n\
- loreText: exactly one paragraph, 3 to 5 sentences, atmospheric and storyteller-like.\n\
- Do not mention prompts, thinking, planning, tools, metadata, generation, or implementation.\n\
- Do not include markdown.\n\
- Keep it elegant and game-facing.\n\
Fallback planet name: {fallback_name}\n\
Existing metadata title: {metadata_title}\n\
Existing metadata description: {metadata_description}\n\
Source material:\n{source_material}",
        fallback_name = fallback_name,
        metadata_title = result.artifact.metadata.title.trim(),
        metadata_description = result.artifact.metadata.description.trim(),
        source_material = seed_lore,
    );
    let raw = gemini::generate_text_with_options(&prompt, 0.4).await?;
    let curated = parse_json_payload::<DemoStepOneCuratedCopy>(&raw).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse demo step 1 curated copy JSON: {error}"),
        )
    })?;

    let lore_text = curated.lore_text.trim();
    Ok(DemoStepOneCuratedCopy {
        planet_name: if curated.planet_name.trim().is_empty() {
            fallback_name
        } else {
            curated.planet_name.trim().to_string()
        },
        lore_text: if lore_text.is_empty() {
            seed_lore
        } else {
            lore_text.to_string()
        },
    })
}

fn parse_json_payload<T: for<'de> Deserialize<'de>>(raw: &str) -> Result<T, String> {
    let trimmed = raw.trim().trim_matches('`').trim();
    if let Ok(parsed) = serde_json::from_str::<T>(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed
        .find(['{', '['])
        .ok_or_else(|| "No JSON object found in model response".to_string())?;
    let end = trimmed
        .rfind(['}', ']'])
        .ok_or_else(|| "No JSON terminator found in model response".to_string())?;
    serde_json::from_str(&trimmed[start..=end])
        .map_err(|error| format!("Failed to parse model JSON payload: {error}"))
}

fn sanitize_loaded_demo_step_one_result(result: &mut DemoStepOneResult) {
    if result.artifact.metadata.title.trim().is_empty()
        || looks_like_model_meta_paragraph(&result.artifact.lore_text)
        || result.artifact.lore_text.contains("Crafting the Lore")
    {
        let fallback = fallback_demo_step_one_copy(&GeneratedMediaAudioResult {
            artifact: crate::media_audio::GeneratedMediaAudioArtifact {
                artifact_type: "generated_media_audio".to_string(),
                status: result.artifact.status.clone(),
                audio: result.artifact.audio.clone(),
                image: result.artifact.image.clone(),
                metadata: result.artifact.metadata.clone(),
                warnings: result.artifact.warnings.clone(),
            },
            transcript: result.transcript.clone(),
        });
        result.artifact.metadata.title = fallback.planet_name;
        result.artifact.lore_text = fallback.lore_text;
    }
    if result.artifact.story_options.len() != 4 {
        result.artifact.story_options =
            fallback_story_options(&result.artifact.metadata.title, &result.artifact.lore_text);
    }
}

fn hydrate_loaded_demo_step_one_assets(cache_dir: &Path, result: &mut DemoStepOneResult) {
    if result.artifact.audio.is_none() && cache_dir.join("audio.wav").is_file() {
        result.artifact.audio = Some(GeneratedMediaAudioAsset {
            url: String::new(),
            duration_seconds: 0,
            mime_type: "audio/wav".to_string(),
        });
    }

    if result.artifact.image.is_none() && cache_dir.join("image.png").is_file() {
        result.artifact.image = Some(GeneratedMediaImageAsset {
            url: String::new(),
            mime_type: "image/png".to_string(),
        });
    }
}

fn fallback_planet_name(metadata: &GeneratedMediaMetadata) -> String {
    let title = metadata.title.trim();
    if !title.is_empty() && !title.eq_ignore_ascii_case("orbital survey") {
        return title.to_string();
    }
    "Ashtrail".to_string()
}

fn extract_planet_name(lore: &str) -> Option<String> {
    let sentence = lore.lines().next()?.trim();
    let after = sentence
        .strip_prefix("Behold ")
        .or_else(|| sentence.strip_prefix("Behold the "))?;
    let name = after
        .split(['—', '-', ',', '.'])
        .next()
        .map(str::trim)
        .unwrap_or_default();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

fn extract_user_facing_lore(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(quoted) = extract_quoted_story_candidate(trimmed) {
        return Some(quoted);
    }

    let filtered_paragraphs = trimmed
        .split("\n\n")
        .map(clean_story_paragraph)
        .filter(|paragraph| !paragraph.is_empty())
        .filter(|paragraph| !looks_like_model_meta_paragraph(paragraph))
        .collect::<Vec<_>>();

    if !filtered_paragraphs.is_empty() {
        return Some(filtered_paragraphs.join("\n\n"));
    }

    None
}

fn extract_quoted_story_candidate(raw: &str) -> Option<String> {
    let normalized = raw.replace(['“', '”'], "\"").replace(['‘', '’'], "'");
    let lower = normalized.to_ascii_lowercase();
    let anchor = [
        "passage idea",
        "here’s the passage",
        "here's the passage",
        "welcome to the edge",
    ]
    .iter()
    .filter_map(|needle| lower.find(needle))
    .min()?;
    let slice = &normalized[anchor..];
    let start = slice.find('"')?;
    let remainder = &slice[start + 1..];
    let end = remainder.find('"')?;
    let candidate = clean_story_paragraph(&remainder[..end]);
    if candidate.is_empty() || looks_like_model_meta_paragraph(&candidate) {
        None
    } else {
        Some(candidate)
    }
}

fn clean_story_paragraph(paragraph: &str) -> String {
    paragraph
        .trim()
        .trim_matches('*')
        .trim_matches('"')
        .trim()
        .to_string()
}

fn looks_like_model_meta_paragraph(paragraph: &str) -> bool {
    let lower = paragraph.to_ascii_lowercase();
    [
        "crafting the lore",
        "alright,",
        "my plan",
        "i need",
        "i'll need",
        "i will",
        "i want",
        "i think",
        "it's a start",
        "the passage idea",
        "final piece",
        "tool mechanics",
        "implementation details",
        "metadata formatting",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn adapt_generated_media_audio_result(legacy: GeneratedMediaAudioResult) -> DemoStepOneResult {
    let lore_text = build_demo_step_one_lore_text(&legacy);
    let world_title = if legacy.artifact.metadata.title.trim().is_empty() {
        fallback_planet_name(&legacy.artifact.metadata)
    } else {
        legacy.artifact.metadata.title.trim().to_string()
    };
    DemoStepOneResult {
        artifact: DemoStepOneArtifact {
            artifact_type: "demo_step_one_interleaved".to_string(),
            status: legacy.artifact.status.clone(),
            audio: legacy.artifact.audio.clone(),
            image: legacy.artifact.image.clone(),
            lore_text: lore_text.clone(),
            metadata: legacy.artifact.metadata.clone(),
            story_options: fallback_story_options(&world_title, &lore_text),
            warnings: legacy.artifact.warnings.clone(),
        },
        transcript: legacy.transcript,
    }
}

fn validate_demo_step_one_assets(
    cache_dir: &Path,
    folder_name: &str,
    result: &DemoStepOneResult,
) -> Result<(), String> {
    if result.artifact.audio.is_some() {
        let audio_path = cache_dir.join("audio.wav");
        if !audio_path.is_file() {
            return Err(format!(
                "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: expected audio asset at {}",
                audio_path.display()
            ));
        }
    }

    if result.artifact.image.is_some() {
        let image_path = cache_dir.join("image.png");
        if !image_path.is_file() {
            return Err(format!(
                "pregenerated demo step 1 is enabled but folder `{folder_name}` was not usable: expected image asset at {}",
                image_path.display()
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_demo_step_one_lore_text, load_pregenerated_demo_step_one, parse_boolish_enabled,
        rewrite_demo_step_one_asset_urls, DemoStepOneArtifact, DemoStepOneResult,
    };
    use crate::media_audio::{
        GeneratedMediaAudioArtifact, GeneratedMediaAudioAsset, GeneratedMediaAudioResult,
        GeneratedMediaImageAsset, GeneratedMediaMetadata, GeneratedMediaStatus,
        InterleavedTranscript,
    };
    use serde_json::json;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("ashtrail-{name}-{unique}"));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn transcript() -> InterleavedTranscript {
        InterleavedTranscript {
            model: "gemini-3-flash-preview".to_string(),
            logical_tool_name: "generatemedia.audio".to_string(),
            api_tool_name: "generatemedia.audio".to_string(),
            tool_called: true,
            thought_signature_detected: false,
            tool_arguments: json!({}),
            final_response_text: "Lore body".to_string(),
        }
    }

    #[test]
    fn loads_legacy_pregenerated_artifact_and_rewrites_urls() {
        let dir = temp_dir("demo-step-one-legacy");
        fs::write(dir.join("audio.wav"), b"wav").expect("audio");
        fs::write(dir.join("image.png"), b"png").expect("image");
        fs::write(
            dir.join("artifact.json"),
            serde_json::to_vec_pretty(&json!({
                "artifact": {
                    "type": "generated_media_audio",
                    "status": "success",
                    "audio": {
                        "url": "/api/generated-media/original/audio.wav",
                        "durationSeconds": 18,
                        "mimeType": "audio/wav"
                    },
                    "image": {
                        "url": "/api/generated-media/original/image.png",
                        "mimeType": "image/png"
                    },
                    "metadata": {
                        "title": "Ashtrail",
                        "description": "A demo world.",
                        "intent": "world introduction demo beat",
                        "tags": ["ost"]
                    },
                    "warnings": []
                },
                "transcript": {
                    "model": "gemini-3-flash-preview",
                    "logicalToolName": "generatemedia.audio",
                    "apiToolName": "generatemedia.audio",
                    "toolCalled": true,
                    "thoughtSignatureDetected": false,
                    "toolArguments": {},
                    "finalResponseText": "Lore body"
                }
            }))
            .expect("json"),
        )
        .expect("artifact");

        let result = load_pregenerated_demo_step_one(&dir, "71d2edea-0dff-443f-b65b-a37d023f71b2")
            .expect("loaded");

        assert_eq!(result.artifact.artifact_type, "demo_step_one_interleaved");
        assert_eq!(
            result
                .artifact
                .audio
                .as_ref()
                .map(|audio| audio.url.as_str()),
            Some("/api/demo-output/71d2edea-0dff-443f-b65b-a37d023f71b2/audio.wav")
        );
        assert_eq!(
            result
                .artifact
                .image
                .as_ref()
                .map(|image| image.url.as_str()),
            Some("/api/demo-output/71d2edea-0dff-443f-b65b-a37d023f71b2/image.png")
        );
        assert_eq!(result.artifact.lore_text, "Lore body");
        assert_eq!(result.artifact.story_options.len(), 4);
    }

    #[test]
    fn loads_pregenerated_artifact_and_infers_audio_from_disk() {
        let dir = temp_dir("demo-step-one-infer-audio");
        fs::write(dir.join("audio.wav"), b"wav").expect("audio");
        fs::write(dir.join("image.png"), b"png").expect("image");
        fs::write(
            dir.join("artifact.json"),
            serde_json::to_vec_pretty(&json!({
                "artifact": {
                    "type": "demo_step_one_interleaved",
                    "status": "success",
                    "image": {
                        "url": "/api/demo-output/original/image.png",
                        "mimeType": "image/png"
                    },
                    "loreText": "Lore body",
                    "metadata": {
                        "title": "Ashtrail",
                        "description": "A demo world.",
                        "intent": "world introduction demo beat",
                        "tags": ["ost"]
                    },
                    "storyOptions": []
                },
                "transcript": {
                    "model": "gemini-3-flash-preview",
                    "logicalToolName": "generatemedia.audio",
                    "apiToolName": "generatemedia.audio",
                    "toolCalled": true,
                    "thoughtSignatureDetected": false,
                    "toolArguments": {},
                    "finalResponseText": "Lore body"
                }
            }))
            .expect("json"),
        )
        .expect("artifact");

        let result = load_pregenerated_demo_step_one(&dir, "folder-4").expect("loaded");

        assert_eq!(
            result
                .artifact
                .audio
                .as_ref()
                .map(|audio| audio.url.as_str()),
            Some("/api/demo-output/folder-4/audio.wav")
        );
    }

    #[test]
    fn missing_artifact_json_fails_clearly() {
        let dir = temp_dir("demo-step-one-missing");
        let error = load_pregenerated_demo_step_one(&dir, "folder-1").expect_err("missing");
        assert!(error.contains("folder `folder-1`"));
        assert!(error.contains("artifact.json"));
    }

    #[test]
    fn invalid_artifact_json_fails_clearly() {
        let dir = temp_dir("demo-step-one-invalid");
        fs::write(dir.join("artifact.json"), b"not-json").expect("artifact");
        let error = load_pregenerated_demo_step_one(&dir, "folder-2").expect_err("invalid");
        assert!(error.contains("folder `folder-2`"));
        assert!(error.contains("failed to parse"));
    }

    #[test]
    fn rewrite_demo_step_one_asset_urls_points_to_demo_output() {
        let mut result = DemoStepOneResult {
            artifact: DemoStepOneArtifact {
                artifact_type: "demo_step_one_interleaved".to_string(),
                status: GeneratedMediaStatus::Success,
                audio: Some(GeneratedMediaAudioAsset {
                    url: "/api/generated-media/job/audio.wav".to_string(),
                    duration_seconds: 18,
                    mime_type: "audio/wav".to_string(),
                }),
                image: Some(GeneratedMediaImageAsset {
                    url: "/api/generated-media/job/image.png".to_string(),
                    mime_type: "image/png".to_string(),
                }),
                lore_text: "Lore".to_string(),
                metadata: GeneratedMediaMetadata {
                    title: "Ashtrail".to_string(),
                    description: "A demo world.".to_string(),
                    intent: "world introduction demo beat".to_string(),
                    tags: vec!["ost".to_string()],
                },
                story_options: Vec::new(),
                warnings: Vec::new(),
            },
            transcript: transcript(),
        };

        rewrite_demo_step_one_asset_urls(&mut result, "folder-3");

        assert_eq!(
            result
                .artifact
                .audio
                .as_ref()
                .map(|audio| audio.url.as_str()),
            Some("/api/demo-output/folder-3/audio.wav")
        );
        assert_eq!(
            result
                .artifact
                .image
                .as_ref()
                .map(|image| image.url.as_str()),
            Some("/api/demo-output/folder-3/image.png")
        );
    }

    #[test]
    fn build_demo_step_one_lore_text_discards_model_drafting_text() {
        let contaminated = r#"**Crafting the Lore for Ashtrail**

Alright, the media artifact is ready. Now comes the real artistry: crafting the lore passage to complete this interleaved generation package. I need something that's concise but also incredibly evocative, a diegetic piece that sounds like it was spun by a natural storyteller.

Here’s the passage idea I've got in mind: *"Behold the Ashtrail—a fractured jewel suspended in the throat of a dying nebula. Where other worlds boast sun-drenched plains, this lonely orb bleeds indigo light into the void. Beneath that swirling veil of violet clouds, obsidian continents pulse with the bioluminescent memory of a race long since ascended or extinct.

You arrive as a mere shadow in its long dusk, a scavenger picking through the cold echoes of a civilization that once commanded the stars. Tread softly; the silence here is not empty—it is heavy with the weight of everything that has been forgotten. Welcome to the edge of the known, where the light ends and the hunt begins."*"#;

        let lore = build_demo_step_one_lore_text(&GeneratedMediaAudioResult {
            artifact: GeneratedMediaAudioArtifact {
                artifact_type: "generated_media_audio".to_string(),
                status: GeneratedMediaStatus::Success,
                audio: None,
                image: None,
                metadata: GeneratedMediaMetadata {
                    title: "Ashtrail".to_string(),
                    description: "A demo world.".to_string(),
                    intent: "world introduction demo beat".to_string(),
                    tags: vec!["demo".to_string()],
                },
                warnings: Vec::new(),
            },
            transcript: InterleavedTranscript {
                final_response_text: contaminated.to_string(),
                ..transcript()
            },
        });

        assert!(lore.starts_with("Behold the Ashtrail"));
        assert!(!lore.contains("Crafting the Lore"));
        assert!(!lore.contains("Alright, the media artifact is ready"));
        assert!(!lore.contains("Here’s the passage idea"));
    }

    #[test]
    fn parse_boolish_enabled_disables_music_for_false_values() {
        assert!(!parse_boolish_enabled("false"));
        assert!(!parse_boolish_enabled("0"));
        assert!(!parse_boolish_enabled("off"));
        assert!(!parse_boolish_enabled("no"));
        assert!(parse_boolish_enabled("true"));
        assert!(parse_boolish_enabled(""));
    }
}
