use std::{fs, path::Path};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{gemini, AppState};

const DEMO_STEP_TWO_TTS_VOICE: &str = "Kore";
const DEMO_OUTPUT_API_ROOT: &str = "/api/demo-output";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoGenerateRequest {
    #[serde(default)]
    pub world_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoStats {
    pub strength: u8,
    pub agility: u8,
    pub intelligence: u8,
    pub wisdom: u8,
    pub endurance: u8,
    pub charisma: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoWeapon {
    pub id: String,
    pub name: String,
    pub description: String,
    pub rarity: String,
    pub weapon_type: String,
    pub weapon_range: u8,
    pub base_damage: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ap_cost: u8,
    pub min_range: u8,
    pub max_range: u8,
    pub cooldown: u8,
    pub effect_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoCharacterPackage {
    pub id: String,
    pub name: String,
    pub age: u8,
    pub gender: String,
    pub level: u8,
    pub title: String,
    pub faction: String,
    pub occupation_name: String,
    pub location: String,
    pub appearance_prompt: String,
    pub stats: DemoStepTwoStats,
    pub weapon: DemoStepTwoWeapon,
    pub unique_skills: Vec<DemoStepTwoSkill>,
    pub lore_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DemoStepTwoStatus {
    Success,
    PartialSuccess,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoAssetRef {
    pub url: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoArtifact {
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub status: DemoStepTwoStatus,
    pub world_id: Option<String>,
    pub character: DemoStepTwoCharacterPackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait: Option<DemoStepTwoAssetRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice: Option<DemoStepTwoAssetRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoResult {
    pub artifact: DemoStepTwoArtifact,
    pub raw_json: Value,
}

#[derive(Debug, Clone)]
pub struct DemoStepTwoExecution {
    pub result: DemoStepTwoResult,
}

pub fn build_demo_step_two_error_result(
    request: &DemoStepTwoGenerateRequest,
    message: &str,
) -> DemoStepTwoResult {
    let character = fallback_character_package(request.world_id.as_deref(), message);
    DemoStepTwoResult {
        artifact: DemoStepTwoArtifact {
            artifact_type: "demo_step_two_interleaved".to_string(),
            status: DemoStepTwoStatus::Error,
            world_id: request.world_id.clone(),
            character,
            portrait: None,
            voice: None,
            warnings: vec![message.to_string()],
        },
        raw_json: json!({ "error": message }),
    }
}

pub async fn run_demo_step_two(
    state: &AppState,
    request: &DemoStepTwoGenerateRequest,
    output_root: &Path,
    job_id: &str,
) -> Result<DemoStepTwoExecution, (StatusCode, String)> {
    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 artifact directory: {error}"),
        )
    })?;

    let world_context = load_world_context(state, request.world_id.as_deref());
    let raw_json =
        generate_character_package_json(request.world_id.as_deref(), world_context.as_deref())
            .await?;
    let mut character = parse_character_package(&raw_json).unwrap_or_else(|| {
        fallback_character_package(
            request.world_id.as_deref(),
            "Generated fallback character package.",
        )
    });
    character.id = format!("demo-googlus-{}", short_job_suffix(job_id));
    character.name = "Googlus Vertus Agentus".to_string();
    character.unique_skills.truncate(2);

    let mut warnings = Vec::new();

    let portrait = match generate_character_portrait(output_root, &character).await {
        Ok(asset) => Some(asset),
        Err((_code, message)) => {
            warnings.push(format!("Portrait generation failed: {message}"));
            None
        }
    };

    let voice = match generate_lore_voice(output_root, &character.lore_text).await {
        Ok(asset) => Some(asset),
        Err((_code, message)) => {
            warnings.push(format!("Voice generation failed: {message}"));
            None
        }
    };

    let status = match (portrait.is_some(), voice.is_some()) {
        (true, true) => DemoStepTwoStatus::Success,
        (true, false) | (false, true) => DemoStepTwoStatus::PartialSuccess,
        (false, false) => DemoStepTwoStatus::PartialSuccess,
    };

    Ok(DemoStepTwoExecution {
        result: DemoStepTwoResult {
            artifact: DemoStepTwoArtifact {
                artifact_type: "demo_step_two_interleaved".to_string(),
                status,
                world_id: request.world_id.clone(),
                character,
                portrait,
                voice,
                warnings,
            },
            raw_json,
        },
    })
}

async fn generate_character_package_json(
    world_id: Option<&str>,
    world_context: Option<&str>,
) -> Result<Value, (StatusCode, String)> {
    let prompt = format!(
        "Return strict JSON only for one Ashtrail demo hero package.\n\
Character name is fixed: Googlus Vertus Agentus.\n\
Generate a heroic but strange protagonist for a post-apocalyptic science-fantasy game demo.\n\
The output must be a single JSON object with exactly these keys:\n\
id, name, age, gender, level, title, faction, occupationName, location, appearancePrompt, stats, weapon, uniqueSkills, loreText.\n\
stats must contain: strength, agility, intelligence, wisdom, endurance, charisma.\n\
weapon must contain: id, name, description, rarity, weaponType, weaponRange, baseDamage.\n\
uniqueSkills must be an array of exactly 2 objects. Each skill must contain: id, name, description, apCost, minRange, maxRange, cooldown, effectType.\n\
loreText must be a detailed, storyteller-style character introduction written for an on-screen demo panel.\n\
Make the weapon and both skills feel coherent with the hero fantasy.\n\
Do not use markdown. Do not include explanations outside the JSON.\n\
World id: {}\n\
World context: {}\n\
The hero should feel like the chosen showcase character for an Ashtrail hackathon demo.",
        world_id.unwrap_or("none"),
        world_context.unwrap_or("No world context available."),
    );

    let raw = gemini::generate_text_with_options(&prompt, 0.7).await?;
    let cleaned = sanitize_json_payload(&raw);
    serde_json::from_str::<Value>(&cleaned).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse generated demo step 2 JSON: {error}"),
        )
    })
}

fn parse_character_package(value: &Value) -> Option<DemoStepTwoCharacterPackage> {
    serde_json::from_value::<DemoStepTwoCharacterPackage>(value.clone()).ok()
}

async fn generate_character_portrait(
    output_root: &Path,
    character: &DemoStepTwoCharacterPackage,
) -> Result<DemoStepTwoAssetRef, (StatusCode, String)> {
    let portrait_prompt = format!(
        "A gritty, high-detail post-apocalyptic hero portrait. Style: realistic, atmospheric, cinematic lighting. \
Subject: {}. Title: {}. Occupation: {}. Visual direction: {}. The image must be a single centered bust portrait with strong facial readability.",
        character.name, character.title, character.occupation_name, character.appearance_prompt
    );
    let bytes =
        gemini::generate_image_bytes(&portrait_prompt, Some(0.7), 1024, 1024, Some("1:1")).await?;
    fs::write(output_root.join("portrait.png"), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write demo step 2 portrait: {error}"),
        )
    })?;
    Ok(DemoStepTwoAssetRef {
        url: format!(
            "{DEMO_OUTPUT_API_ROOT}/{}/portrait.png",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
        mime_type: "image/png".to_string(),
    })
}

async fn generate_lore_voice(
    output_root: &Path,
    lore_text: &str,
) -> Result<DemoStepTwoAssetRef, (StatusCode, String)> {
    let (bytes, mime_type) =
        gemini::generate_speech_audio(lore_text, DEMO_STEP_TWO_TTS_VOICE).await?;
    let wav_bytes = if mime_type.contains("wav") {
        bytes
    } else {
        wrap_pcm_as_wav(&bytes, parse_sample_rate_hz(&mime_type).unwrap_or(24_000))
    };
    fs::write(output_root.join("lore.wav"), wav_bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write demo step 2 voice asset: {error}"),
        )
    })?;
    Ok(DemoStepTwoAssetRef {
        url: format!(
            "{DEMO_OUTPUT_API_ROOT}/{}/lore.wav",
            output_root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        ),
        mime_type: "audio/wav".to_string(),
    })
}

fn wrap_pcm_as_wav(bytes: &[u8], sample_rate_hz: u32) -> Vec<u8> {
    let channels = 1u16;
    let bits_per_sample = 16u16;
    let byte_rate = sample_rate_hz * channels as u32 * (bits_per_sample as u32 / 8);
    let block_align = channels * (bits_per_sample / 8);
    let data_len = bytes.len() as u32;
    let chunk_size = 36 + data_len;

    let mut wav = Vec::with_capacity(bytes.len() + 44);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&chunk_size.to_le_bytes());
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
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(bytes);
    wav
}

fn parse_sample_rate_hz(mime_type: &str) -> Option<u32> {
    mime_type.split(';').find_map(|segment| {
        let trimmed = segment.trim();
        trimmed
            .strip_prefix("rate=")
            .and_then(|value| value.parse::<u32>().ok())
    })
}

fn sanitize_json_payload(raw: &str) -> String {
    raw.trim()
        .strip_prefix("```json")
        .or_else(|| raw.trim().strip_prefix("```"))
        .unwrap_or(raw.trim())
        .trim()
        .strip_suffix("```")
        .unwrap_or(raw.trim())
        .trim()
        .to_string()
}

fn load_world_context(state: &AppState, world_id: Option<&str>) -> Option<String> {
    let world_id = world_id?;
    let path = state.planets_dir.join(world_id).join("lore_snippets.json");
    let raw = fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<Value>(&raw).ok()?;
    let entries = value.as_array()?;
    let summary = entries
        .iter()
        .filter_map(|entry| {
            entry
                .get("text")
                .or_else(|| entry.get("content"))
                .or_else(|| entry.get("summary"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");
    (!summary.is_empty()).then_some(summary)
}

fn fallback_character_package(
    world_id: Option<&str>,
    lore_text: &str,
) -> DemoStepTwoCharacterPackage {
    DemoStepTwoCharacterPackage {
        id: format!("demo-googlus-{}", Uuid::new_v4().simple()),
        name: "Googlus Vertus Agentus".to_string(),
        age: 34,
        gender: "Unknown".to_string(),
        level: 6,
        title: "Hero Of The Day".to_string(),
        faction: "Ashtrail Demonstration Corps".to_string(),
        occupation_name: "Field Operative".to_string(),
        location: world_id.unwrap_or("Frontier Threshold").to_string(),
        appearance_prompt: "Weathered explorer with intelligent eyes, a ceremonial field coat, ash-marked armor plates, and a relic sidearm.".to_string(),
        stats: DemoStepTwoStats {
            strength: 6,
            agility: 7,
            intelligence: 9,
            wisdom: 8,
            endurance: 7,
            charisma: 8,
        },
        weapon: DemoStepTwoWeapon {
            id: "googlus-archive-lance".to_string(),
            name: "Archive Lance".to_string(),
            description: "A relic polearm that unfolds into a humming survey blade.".to_string(),
            rarity: "relic".to_string(),
            weapon_type: "melee".to_string(),
            weapon_range: 1,
            base_damage: 10,
        },
        unique_skills: vec![
            DemoStepTwoSkill {
                id: "googlus-protocol-breach".to_string(),
                name: "Protocol Breach".to_string(),
                description: "Cuts through enemy guard with a surgically timed opening strike.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 1,
                cooldown: 2,
                effect_type: "physical".to_string(),
            },
            DemoStepTwoSkill {
                id: "googlus-echo-recall".to_string(),
                name: "Echo Recall".to_string(),
                description: "Recites a lost tactical memory that steadies allies and sharpens intent.".to_string(),
                ap_cost: 4,
                min_range: 0,
                max_range: 3,
                cooldown: 3,
                effect_type: "support".to_string(),
            },
        ],
        lore_text: lore_text.to_string(),
    }
}

fn short_job_suffix(job_id: &str) -> String {
    job_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(8)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::DEMO_OUTPUT_API_ROOT;
    use std::path::Path;

    #[test]
    fn demo_step_two_asset_urls_use_demo_output_route() {
        let output_root = Path::new("generated/demo-output/job-1234");
        let file_name = output_root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();

        assert_eq!(
            format!("{DEMO_OUTPUT_API_ROOT}/{file_name}/portrait.png"),
            "/api/demo-output/job-1234/portrait.png"
        );
        assert_eq!(
            format!("{DEMO_OUTPUT_API_ROOT}/{file_name}/lore.wav"),
            "/api/demo-output/job-1234/lore.wav"
        );
    }
}
