use std::{
    fs,
    path::{Path, PathBuf},
};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{demo_output, gemini, AppState};

const DEMO_STEP_TWO_TTS_VOICE: &str = "Kore";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoGenerateRequest {
    #[serde(default)]
    pub world_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoArtifactQuery {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    #[serde(default)]
    pub hero: Option<String>,
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
pub struct DemoStepTwoBuilderDraft {
    pub name: String,
    pub age: u8,
    pub gender: String,
    pub level: u8,
    pub stats: DemoStepTwoStats,
    pub history: String,
    pub backstory: String,
    #[serde(default)]
    pub trait_names: Vec<String>,
    pub occupation_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoWorldContext {
    pub world_title: String,
    pub world_lore: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_direction_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDemoStepTwoArtifact {
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world_id: Option<String>,
    pub draft: DemoStepTwoBuilderDraft,
    pub lore_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub portrait_url: Option<String>,
    pub world_context: DemoStepTwoWorldContext,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weapon_artifact: Option<DemoStepTwoGeneratedWeaponArtifact>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice_asset: Option<DemoStepTwoAssetRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lore_illustrations: Vec<DemoStepTwoLoreIllustrationAsset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lore_insights: Vec<DemoStepTwoLoreInsightArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistDemoStepTwoArtifactRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default)]
    pub world_id: Option<String>,
    pub draft: DemoStepTwoBuilderDraft,
    pub lore_text: String,
    #[serde(default)]
    pub portrait_url: Option<String>,
    pub world_context: DemoStepTwoWorldContext,
    #[serde(default)]
    pub weapon_artifact: Option<DemoStepTwoGeneratedWeaponArtifact>,
    #[serde(default)]
    pub voice_asset: Option<DemoStepTwoAssetRef>,
    #[serde(default)]
    pub lore_illustrations: Vec<DemoStepTwoLoreIllustrationAsset>,
    #[serde(default)]
    pub lore_insights: Vec<DemoStepTwoLoreInsightArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoVoiceJobRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default)]
    pub world_id: Option<String>,
    pub lore_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoVoiceGenerationResult {
    pub voice: DemoStepTwoAssetRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreIllustrationsJobRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    pub hero_name: String,
    pub world_title: String,
    pub world_lore: String,
    pub lore_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreIllustrationAsset {
    pub paragraph_index: usize,
    pub image: DemoStepTwoAssetRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreIllustrationsGenerationResult {
    pub illustrations: Vec<DemoStepTwoLoreIllustrationAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreInsightJobRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    pub hero_name: String,
    pub world_title: String,
    pub world_lore: String,
    pub lore_text: String,
    pub term: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreInsightArtifact {
    pub term: String,
    pub title: String,
    pub explanation: String,
    pub image: DemoStepTwoAssetRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoLoreInsightGenerationResult {
    pub artifact: DemoStepTwoLoreInsightArtifact,
    pub raw_json: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoWeaponJobRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default)]
    pub world_id: Option<String>,
    pub world_title: String,
    pub world_lore: String,
    pub occupation_name: String,
    pub character_lore: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoGeneratedWeaponArtifact {
    pub weapon: DemoStepTwoWeapon,
    pub lore_text: String,
    pub image: DemoStepTwoAssetRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepTwoWeaponGenerationResult {
    pub artifact: DemoStepTwoGeneratedWeaponArtifact,
    pub raw_json: Value,
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

fn normalize_demo_hero_variant(value: Option<&str>) -> &'static str {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("jane") => "jane",
        _ => "john",
    }
}

fn normalize_generated_weapon(mut weapon: DemoStepTwoWeapon) -> DemoStepTwoWeapon {
    weapon.id = weapon.id.trim().to_string();
    if weapon.id.is_empty() {
        weapon.id = format!("demo-step-two-weapon-{}", Uuid::new_v4().simple());
    }

    weapon.name = weapon.name.trim().to_string();
    if weapon.name.is_empty() {
        weapon.name = "Ashtrail Field Arm".to_string();
    }

    weapon.description = weapon.description.trim().to_string();
    if weapon.description.is_empty() {
        weapon.description =
            "A combat-ready field weapon balanced for Ashtrail skirmishes.".to_string();
    }

    weapon.rarity = match weapon.rarity.trim().to_ascii_lowercase().as_str() {
        "salvaged" | "reinforced" | "pre-ash" | "specialized" | "relic" | "ashmarked" => {
            weapon.rarity.trim().to_ascii_lowercase()
        }
        _ => "specialized".to_string(),
    };

    weapon.weapon_type = match weapon.weapon_type.trim().to_ascii_lowercase().as_str() {
        "ranged" => "ranged".to_string(),
        _ => "melee".to_string(),
    };

    weapon.weapon_range = match weapon.weapon_type.as_str() {
        "ranged" => weapon.weapon_range.clamp(2, 6),
        _ => weapon.weapon_range.clamp(1, 2),
    };
    weapon.base_damage = weapon.base_damage.max(18);
    weapon
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(ToOwned::to_owned)
}

fn u8_field(value: &Value, key: &str) -> Option<u8> {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_u64().and_then(|entry| u8::try_from(entry).ok()),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.eq_ignore_ascii_case("melee") {
                Some(1)
            } else if trimmed.eq_ignore_ascii_case("ranged") {
                Some(4)
            } else {
                trimmed.parse::<u8>().ok()
            }
        }
        _ => None,
    }
}

fn i32_field(value: &Value, key: &str) -> Option<i32> {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_i64().and_then(|entry| i32::try_from(entry).ok()),
        Some(Value::String(text)) => text.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn decode_generated_weapon_payload(value: &Value) -> Result<DemoStepTwoWeapon, (StatusCode, String)> {
    let id = string_field(value, "id").unwrap_or_else(|| format!("demo-step-two-weapon-{}", Uuid::new_v4().simple()));
    let name = string_field(value, "name").unwrap_or_else(|| "Ashtrail Field Arm".to_string());
    let description = string_field(value, "description")
        .unwrap_or_else(|| "A combat-ready field weapon balanced for Ashtrail skirmishes.".to_string());
    let rarity = string_field(value, "rarity").unwrap_or_else(|| "specialized".to_string());
    let weapon_type = string_field(value, "weaponType")
        .or_else(|| string_field(value, "type"))
        .unwrap_or_else(|| "melee".to_string());
    let weapon_range = u8_field(value, "weaponRange")
        .or_else(|| u8_field(value, "range"))
        .unwrap_or(1);
    let base_damage = i32_field(value, "baseDamage")
        .or_else(|| i32_field(value, "damage"))
        .unwrap_or(18);

    Ok(normalize_generated_weapon(DemoStepTwoWeapon {
        id,
        name,
        description,
        rarity,
        weapon_type,
        weapon_range,
        base_damage,
    }))
}

fn demo_step_two_run_root(state: &AppState, step_one_job_id: Option<&str>) -> PathBuf {
    let run_id = if state.demo_step_one_use_pregenerated {
        state.demo_step_one_pregenerated_folder.clone()
    } else {
        step_one_job_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("live")
            .to_string()
    };
    state.demo_output_dir.join(run_id).join("step-2")
}

fn demo_step_two_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> PathBuf {
    demo_step_two_run_root(state, step_one_job_id).join(normalize_demo_hero_variant(hero_variant))
}

fn demo_output_asset_url(output_root: &Path, file_name: &str) -> String {
    demo_output::api_asset_url(Path::new("generated/demo-output"), output_root, file_name)
}

fn infer_step_two_voice_asset(output_root: &Path) -> Option<DemoStepTwoAssetRef> {
    for file_name in ["lore.wav", "audio.wav"] {
        if output_root.join(file_name).is_file() {
            return Some(DemoStepTwoAssetRef {
                url: demo_output_asset_url(output_root, file_name),
                mime_type: "audio/wav".to_string(),
            });
        }
    }
    None
}

fn infer_step_two_portrait_file_name(output_root: &Path) -> Option<String> {
    for file_name in [
        "portrait.png",
        "portrait.jpg",
        "portrait.jpeg",
        "portrait.webp",
        "portrait.gif",
    ] {
        if output_root.join(file_name).is_file() {
            return Some(file_name.to_string());
        }
    }

    let entries = fs::read_dir(output_root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = path.file_stem().and_then(|value| value.to_str());
        let file_name = path.file_name().and_then(|value| value.to_str());
        if stem == Some("portrait") {
            return file_name.map(ToOwned::to_owned);
        }
    }

    None
}

fn infer_step_two_portrait_url(output_root: &Path) -> Option<String> {
    infer_step_two_portrait_file_name(output_root)
        .map(|file_name| demo_output_asset_url(output_root, &file_name))
}

fn extract_character_portrait_file_name(url: &str) -> Option<String> {
    let path = url.split('?').next().unwrap_or(url);
    path.strip_prefix("/api/character-portraits/")
        .map(str::to_string)
        .filter(|name| !name.is_empty() && !name.contains("..") && !name.contains('/'))
}

fn sync_demo_step_two_portrait_snapshot(
    state: &AppState,
    output_root: &Path,
    portrait_url: Option<&str>,
) -> Result<Option<String>, (StatusCode, String)> {
    if let Some(url) = infer_step_two_portrait_url(output_root) {
        return Ok(Some(url));
    }

    let Some(source_url) = portrait_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let Some(file_name) = extract_character_portrait_file_name(source_url) else {
        return Ok(Some(source_url.to_string()));
    };

    let source_path = state.character_portraits_dir.join(&file_name);
    if !source_path.is_file() {
        return Ok(Some(source_url.to_string()));
    }

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 portrait directory: {error}"),
        )
    })?;

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("png");
    let target_name = format!("portrait.{extension}");
    fs::copy(&source_path, output_root.join(&target_name)).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to snapshot demo step 2 portrait: {error}"),
        )
    })?;

    Ok(Some(demo_output_asset_url(output_root, &target_name)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCharacterPortraitRecord {
    name: Option<String>,
    portrait_url: Option<String>,
}

fn find_recent_character_portrait_url(
    characters_dir: &Path,
    candidate_names: &[&str],
) -> Option<String> {
    let normalized_names = candidate_names
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .collect::<Vec<_>>();
    if normalized_names.is_empty() {
        return None;
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(characters_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let modified = entry.metadata().ok()?.modified().ok()?;
        let raw = fs::read_to_string(&path).ok()?;
        let record = serde_json::from_str::<StoredCharacterPortraitRecord>(&raw).ok()?;
        let name = record.name.as_deref()?.trim().to_ascii_lowercase();
        if !normalized_names.iter().any(|candidate| candidate == &name) {
            continue;
        }
        let portrait_url = record
            .portrait_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())?
            .to_string();
        candidates.push((modified, portrait_url));
    }

    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    candidates.into_iter().next().map(|(_, url)| url)
}

fn repair_loaded_demo_step_two_artifact(
    state: &AppState,
    output_root: &Path,
    artifact: &mut PersistedDemoStepTwoArtifact,
) {
    if let Some(url) = infer_step_two_portrait_url(output_root) {
        artifact.portrait_url = Some(url);
    } else {
        let recovered = sync_demo_step_two_portrait_snapshot(
            state,
            output_root,
            artifact.portrait_url.as_deref(),
        )
        .ok()
        .flatten()
        .or_else(|| {
            let fallback = find_recent_character_portrait_url(
                &state.characters_dir,
                &[artifact.hero_name.as_str(), artifact.draft.name.as_str()],
            )?;
            sync_demo_step_two_portrait_snapshot(state, output_root, Some(&fallback))
                .ok()
                .flatten()
                .or(Some(fallback))
        });
        if let Some(url) = recovered {
            artifact.portrait_url = Some(url);
        }
    }

    if let Some(voice) = infer_step_two_voice_asset(output_root) {
        artifact.voice_asset = Some(voice);
    }
}

pub fn load_persisted_demo_step_two_artifact(
    state: &AppState,
    query: &DemoStepTwoArtifactQuery,
) -> Result<PersistedDemoStepTwoArtifact, (StatusCode, String)> {
    let output_root = demo_step_two_output_root(
        state,
        query.step_one_job_id.as_deref(),
        query.hero.as_deref(),
    );
    let envelope = demo_output::load_demo_artifact::<PersistedDemoStepTwoArtifact>(&output_root)
        .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    let mut artifact = envelope.artifact;
    repair_loaded_demo_step_two_artifact(state, &output_root, &mut artifact);
    Ok(artifact)
}

pub fn persist_demo_step_two_artifact_for_demo(
    state: &AppState,
    payload: &PersistDemoStepTwoArtifactRequest,
) -> Result<PersistedDemoStepTwoArtifact, (StatusCode, String)> {
    let output_root = demo_step_two_output_root(
        state,
        payload.step_one_job_id.as_deref(),
        Some(payload.hero_variant.as_str()),
    );
    let portrait_url =
        sync_demo_step_two_portrait_snapshot(state, &output_root, payload.portrait_url.as_deref())?;
    let artifact = PersistedDemoStepTwoArtifact {
        hero_variant: normalize_demo_hero_variant(Some(payload.hero_variant.as_str())).to_string(),
        hero_name: payload.hero_name.trim().to_string(),
        world_id: payload.world_id.clone(),
        draft: payload.draft.clone(),
        lore_text: payload.lore_text.trim().to_string(),
        portrait_url: portrait_url.or_else(|| payload.portrait_url.clone()),
        world_context: payload.world_context.clone(),
        weapon_artifact: payload.weapon_artifact.clone(),
        voice_asset: infer_step_two_voice_asset(&output_root)
            .or_else(|| payload.voice_asset.clone()),
        lore_illustrations: payload.lore_illustrations.clone(),
        lore_insights: payload.lore_insights.clone(),
    };
    let run_id = output_root
        .parent()
        .and_then(|value| value.parent())
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("live")
        .to_string();
    let envelope = demo_output::DemoStoredArtifactEnvelope {
        envelope_type: "demo_step_artifact".to_string(),
        step: 2,
        phase: None,
        run_id,
        source: if state.demo_step_one_use_pregenerated {
            "pregenerated".to_string()
        } else {
            "live".to_string()
        },
        created_at: demo_output::now_created_at(),
        artifact: artifact.clone(),
        transcript: None,
        context: None,
    };
    demo_output::persist_demo_artifact(&output_root, &envelope)
        .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;
    Ok(artifact)
}

pub fn demo_step_two_weapon_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> PathBuf {
    demo_step_two_output_root(state, step_one_job_id, hero_variant)
}

pub fn demo_step_two_voice_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> PathBuf {
    demo_step_two_output_root(state, step_one_job_id, hero_variant)
}

pub fn demo_step_two_lore_illustration_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> PathBuf {
    demo_step_two_output_root(state, step_one_job_id, hero_variant)
}

pub fn demo_step_two_lore_insight_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> PathBuf {
    demo_step_two_output_root(state, step_one_job_id, hero_variant)
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

pub async fn run_demo_step_two_weapon(
    request: &DemoStepTwoWeaponJobRequest,
    output_root: &Path,
) -> Result<DemoStepTwoWeaponGenerationResult, (StatusCode, String)> {
    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 weapon directory: {error}"),
        )
    })?;

    let prompt = format!(
        "Return strict JSON only for one Ashtrail weapon package.\n\
The output must be a single JSON object with exactly these keys: weapon, loreText.\n\
weapon must contain: id, name, description, rarity, weaponType, weaponRange, baseDamage.\n\
loreText must be one rich paragraph describing the weapon's origin, reputation, and why it belongs to this hero.\n\
Design the weapon for hero: {hero_name}.\n\
Occupation: {occupation_name}.\n\
World title: {world_title}.\n\
World lore: {world_lore}.\n\
Character lore: {character_lore}.\n\
No markdown. No commentary outside the JSON.",
        hero_name = request.hero_name.trim(),
        occupation_name = request.occupation_name.trim(),
        world_title = request.world_title.trim(),
        world_lore = request.world_lore.trim(),
        character_lore = request.character_lore.trim(),
    );

    let raw = gemini::generate_text_with_options(&prompt, 0.65).await?;
    let cleaned = sanitize_json_payload(&raw);
    let raw_json = serde_json::from_str::<Value>(&cleaned).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse generated demo step 2 weapon JSON: {error}"),
        )
    })?;
    let weapon = decode_generated_weapon_payload(raw_json.get("weapon").unwrap_or(&Value::Null))?;
    let lore_text = raw_json
        .get("loreText")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Weapon generation did not return loreText.".to_string(),
            )
        })?
        .to_string();

    let image_prompt = format!(
        "A high-detail concept illustration of a sci-fi fantasy weapon. \
Weapon: {}. Description: {}. Lore cue: {}. \
Render as a clean hero asset on a dark atmospheric background, centered, readable silhouette, cinematic light, no text, no frame.",
        weapon.name, weapon.description, lore_text
    );
    let bytes =
        gemini::generate_image_bytes(&image_prompt, Some(0.7), 1024, 1024, Some("1:1")).await?;
    fs::write(output_root.join("weapon.png"), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write demo step 2 weapon illustration: {error}"),
        )
    })?;
    let image = DemoStepTwoAssetRef {
        url: demo_output_asset_url(output_root, "weapon.png"),
        mime_type: "image/png".to_string(),
    };

    Ok(DemoStepTwoWeaponGenerationResult {
        artifact: DemoStepTwoGeneratedWeaponArtifact {
            weapon,
            lore_text,
            image,
        },
        raw_json,
    })
}

pub async fn run_demo_step_two_voice(
    request: &DemoStepTwoVoiceJobRequest,
    output_root: &Path,
) -> Result<DemoStepTwoVoiceGenerationResult, (StatusCode, String)> {
    if request.lore_text.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Demo step 2 voice generation requires lore text.".to_string(),
        ));
    }

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 voice directory: {error}"),
        )
    })?;

    let voice = generate_lore_voice(output_root, request.lore_text.trim()).await?;
    Ok(DemoStepTwoVoiceGenerationResult { voice })
}

pub async fn run_demo_step_two_lore_illustrations(
    request: &DemoStepTwoLoreIllustrationsJobRequest,
    output_root: &Path,
) -> Result<DemoStepTwoLoreIllustrationsGenerationResult, (StatusCode, String)> {
    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 lore illustration directory: {error}"),
        )
    })?;

    let paragraphs = request
        .lore_text
        .split('\n')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if paragraphs.is_empty() {
        return Ok(DemoStepTwoLoreIllustrationsGenerationResult {
            illustrations: Vec::new(),
        });
    }

    let selected = paragraphs
        .iter()
        .enumerate()
        .filter(|(_, paragraph)| paragraph.len() > 80)
        .take(2)
        .collect::<Vec<_>>();

    let mut illustrations = Vec::new();
    for (index, paragraph) in selected {
        let prompt = format!(
            "Create a cinematic narrative illustration for the Ashtrail demo. \
Hero: {}. World: {}. World lore: {}. \
Scene excerpt: {}. \
Render a moody, readable, storybook-like sci-fi fantasy scene with no text, no frame, and clear focal action.",
            request.hero_name.trim(),
            request.world_title.trim(),
            request.world_lore.trim(),
            paragraph,
        );
        let bytes =
            gemini::generate_image_bytes(&prompt, Some(0.72), 1024, 1024, Some("1:1")).await?;
        let file_name = format!("lore-illustration-{}.png", index + 1);
        fs::write(output_root.join(&file_name), bytes).map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to write demo step 2 lore illustration: {error}"),
            )
        })?;
        illustrations.push(DemoStepTwoLoreIllustrationAsset {
            paragraph_index: index,
            image: DemoStepTwoAssetRef {
                url: demo_output_asset_url(output_root, &file_name),
                mime_type: "image/png".to_string(),
            },
        });
    }

    Ok(DemoStepTwoLoreIllustrationsGenerationResult { illustrations })
}

pub async fn run_demo_step_two_lore_insight(
    request: &DemoStepTwoLoreInsightJobRequest,
    output_root: &Path,
) -> Result<DemoStepTwoLoreInsightGenerationResult, (StatusCode, String)> {
    if request.term.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Lore insight requires a term.".to_string(),
        ));
    }

    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 2 lore insight directory: {error}"),
        )
    })?;

    let prompt = format!(
        "Return strict JSON only for an Ashtrail lore insight panel.\n\
The output must be a single JSON object with exactly these keys: title, explanation.\n\
title must be a short evocative title for the term.\n\
explanation must be 2-3 concise sentences explaining the meaning of the term in-world, in a sober but atmospheric tone.\n\
No markdown. No commentary outside JSON.\n\
Hero: {hero_name}\n\
World: {world_title}\n\
World lore: {world_lore}\n\
Lore text: {lore_text}\n\
Focus term: {term}",
        hero_name = request.hero_name.trim(),
        world_title = request.world_title.trim(),
        world_lore = request.world_lore.trim(),
        lore_text = request.lore_text.trim(),
        term = request.term.trim(),
    );

    let raw = gemini::generate_text_with_options(&prompt, 0.55).await?;
    let cleaned = sanitize_json_payload(&raw);
    let raw_json = serde_json::from_str::<Value>(&cleaned).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse generated demo step 2 lore insight JSON: {error}"),
        )
    })?;
    let title = raw_json
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(request.term.trim())
        .to_string();
    let explanation = raw_json
        .get("explanation")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Lore insight generation did not return explanation.".to_string(),
            )
        })?
        .to_string();

    let image_prompt = format!(
        "Create a cinematic explanatory illustration for an Ashtrail lore insight panel. \
Term: {}. Title: {}. Explanation: {}. World: {}. \
Render a single atmospheric scene or object study with clear visual readability, no text, no border, no frame.",
        request.term.trim(),
        title,
        explanation,
        request.world_title.trim(),
    );
    let bytes =
        gemini::generate_image_bytes(&image_prompt, Some(0.68), 1024, 1024, Some("1:1")).await?;
    let slug = request
        .term
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let file_name = format!(
        "insight-{}.png",
        if slug.is_empty() {
            "term"
        } else {
            slug.as_str()
        }
    );
    fs::write(output_root.join(&file_name), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write demo step 2 lore insight illustration: {error}"),
        )
    })?;
    let image = DemoStepTwoAssetRef {
        url: demo_output_asset_url(output_root, &file_name),
        mime_type: "image/png".to_string(),
    };

    Ok(DemoStepTwoLoreInsightGenerationResult {
        artifact: DemoStepTwoLoreInsightArtifact {
            term: request.term.trim().to_string(),
            title,
            explanation,
            image,
        },
        raw_json,
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
        url: demo_output_asset_url(output_root, "portrait.png"),
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
        url: demo_output_asset_url(output_root, "lore.wav"),
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
    use super::{demo_output_asset_url, infer_step_two_voice_asset};
    use std::path::Path;

    #[test]
    fn demo_step_two_asset_urls_use_demo_output_route() {
        assert_eq!(
            demo_output_asset_url(
                Path::new("generated/demo-output/job-1234/step-2/john"),
                "portrait.png",
            ),
            "/api/demo-output/job-1234/step-2/john/portrait.png"
        );
        assert_eq!(
            demo_output_asset_url(
                Path::new("generated/demo-output/job-1234/step-2/john"),
                "lore.wav",
            ),
            "/api/demo-output/job-1234/step-2/john/lore.wav"
        );
    }

    #[test]
    fn infer_step_two_voice_asset_accepts_audio_wav_override() {
        let unique = format!(
            "ashtrail-step-two-audio-override-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&dir).expect("temp dir");
        std::fs::write(dir.join("audio.wav"), b"wav").expect("audio");

        let voice = infer_step_two_voice_asset(&dir).expect("voice");
        assert!(voice.url.ends_with("/audio.wav"));
    }
}
