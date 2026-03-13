use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex},
};
use tracing::warn;
use uuid::Uuid;
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};

use crate::combat_engine::{
    rules::load_rules_from_file,
    types::{BaseStats, GridPos, Skill, TacticalEntity},
};
use crate::{gemini, AppState, JobRecord, JobStatus};

const ECOLOGY_STATS_VERSION: &str = "v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EcologyBundle {
    pub world_id: String,
    pub updated_at: String,
    #[serde(default)]
    pub baselines: Vec<EcologyBaseline>,
    #[serde(default)]
    pub flora: Vec<FloraEntry>,
    #[serde(default)]
    pub fauna: Vec<FaunaEntry>,
    #[serde(default)]
    pub biomes: Vec<BiomeEntry>,
    #[serde(default)]
    pub archetypes: worldgen_core::BiomeRegistry,
    #[serde(default)]
    pub biome_model_settings: worldgen_core::BiomeModelSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeEntry {
    pub id: String,
    pub archetype_id: String,
    pub status: EntryStatus,
    pub name: String,
    pub biome_type: String,
    pub description: String,
    #[serde(default)]
    pub typical_flora_ids: Vec<String>,
    #[serde(default)]
    pub typical_fauna_ids: Vec<String>,
    #[serde(default)]
    pub province_ids: Vec<u32>,
    #[serde(default)]
    pub province_count: u32,
    #[serde(default)]
    pub pixel_share: f32,
    #[serde(default)]
    pub avg_confidence: f32,
    #[serde(default)]
    pub top_candidate_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectionalSpriteBinding {
    pub batch_id: String,
    pub sprite_id: String,
    pub actor_type: String,
    pub preview_url: String,
    pub directions: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EcologyBaseline {
    pub scope: BaselineScope,
    pub entity_id: BaselineEntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_entity_id: Option<BaselineEntityId>,
    pub status: EcologyStatus,
    pub summary: String,
    #[serde(default)]
    pub climate_directives: Vec<String>,
    #[serde(default)]
    pub flora_directives: Vec<String>,
    #[serde(default)]
    pub fauna_directives: Vec<String>,
    #[serde(default)]
    pub agriculture_directives: Vec<String>,
    #[serde(default)]
    pub consistency_rules: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssetImageRef {
    pub batch_id: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum EcologyStatSource {
    #[default]
    Backfilled,
    Generated,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FaunaSizeClass {
    #[default]
    Medium,
    Tiny,
    Small,
    Large,
    Huge,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FaunaLocomotion {
    #[default]
    Walker,
    Runner,
    Climber,
    Burrower,
    Swimmer,
    Flier,
    Slitherer,
    Amphibious,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FaunaArmorClass {
    #[default]
    Soft,
    Furred,
    Scaled,
    Shelled,
    Plated,
    Rocky,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FaunaNaturalWeapon {
    #[default]
    None,
    Bite,
    Claw,
    Horn,
    Hoof,
    Tail,
    Beak,
    Venom,
    Constrict,
    Spines,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FaunaTemperament {
    #[default]
    Docile,
    Skittish,
    Territorial,
    Aggressive,
    Apex,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ActivityCycle {
    #[default]
    Any,
    Diurnal,
    Nocturnal,
    Crepuscular,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FloraSizeClass {
    #[default]
    Medium,
    Tiny,
    Small,
    Large,
    Massive,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FaunaCombatProfile {
    pub level: i32,
    pub strength: i32,
    pub agility: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub endurance: i32,
    pub charisma: i32,
    pub crit_chance: f64,
    pub resistance: f64,
    pub social_bonus: f64,
    pub base_evasion: i32,
    pub base_defense: i32,
    pub base_hp_bonus: i32,
    pub base_ap_bonus: i32,
    pub base_mp_bonus: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FaunaBodyProfile {
    pub size_class: FaunaSizeClass,
    pub height_meters: f64,
    pub length_meters: f64,
    pub weight_kg: f64,
    pub locomotion: FaunaLocomotion,
    pub natural_weapon: FaunaNaturalWeapon,
    pub armor_class: FaunaArmorClass,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FaunaBehaviorProfile {
    pub temperament: FaunaTemperament,
    pub activity_cycle: ActivityCycle,
    pub pack_size_min: i32,
    pub pack_size_max: i32,
    pub perception: i32,
    pub stealth: i32,
    pub trainability: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FloraBodyProfile {
    pub size_class: FloraSizeClass,
    pub height_meters: f64,
    pub spread_meters: f64,
    pub root_depth_meters: f64,
    pub biomass_kg: f64,
    pub lifespan_years: f64,
    pub growth_rate: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FloraResourceProfile {
    pub rarity: i32,
    pub yield_per_harvest: i32,
    pub regrowth_days: i32,
    pub harvest_difficulty: i32,
    pub nutrition_value: i32,
    pub medicinal_value: i32,
    pub fuel_value: i32,
    pub structural_value: i32,
    pub concealment_value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FloraHazardProfile {
    pub toxicity: i32,
    pub irritation: i32,
    pub thorniness: i32,
    pub flammability: i32,
    pub resilience: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FloraEntry {
    pub id: String,
    pub status: EntryStatus,
    pub name: String,
    pub category: FloraCategory,
    pub description: String,
    #[serde(default)]
    pub ecological_roles: Vec<String>,
    #[serde(default)]
    pub adaptations: Vec<String>,
    pub edibility: FloraEdibility,
    pub agriculture_value: i32,
    #[serde(default)]
    pub biome_ids: Vec<String>,
    #[serde(default)]
    pub vegetation_asset_batch_ids: Vec<String>,
    #[serde(default)]
    pub illustration_asset_batch_ids: Vec<String>,
    #[serde(default)]
    pub illustration_assets: Vec<AssetImageRef>,
    #[serde(default)]
    pub body_profile: FloraBodyProfile,
    #[serde(default)]
    pub resource_profile: FloraResourceProfile,
    #[serde(default)]
    pub hazard_profile: FloraHazardProfile,
    #[serde(default = "default_stats_version")]
    pub stats_version: String,
    #[serde(default)]
    pub stats_source: EcologyStatSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaunaEntry {
    pub id: String,
    pub status: EntryStatus,
    pub name: String,
    pub category: FaunaCategory,
    pub description: String,
    #[serde(default)]
    pub ecological_roles: Vec<String>,
    #[serde(default)]
    pub adaptations: Vec<String>,
    pub domestication_potential: i32,
    pub danger_level: i32,
    #[serde(default)]
    pub biome_ids: Vec<String>,
    pub earth_analog: String,
    pub ancestral_stock: String,
    #[serde(default)]
    pub evolutionary_pressures: Vec<String>,
    pub mutation_summary: String,
    pub divergence_summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family_name: Option<String>,
    #[serde(default)]
    pub illustration_asset_batch_ids: Vec<String>,
    #[serde(default)]
    pub illustration_assets: Vec<AssetImageRef>,
    #[serde(default)]
    pub combat_profile: FaunaCombatProfile,
    #[serde(default)]
    pub body_profile: FaunaBodyProfile,
    #[serde(default)]
    pub behavior_profile: FaunaBehaviorProfile,
    #[serde(default)]
    pub skill_ids: Vec<String>,
    #[serde(default = "default_stats_version")]
    pub stats_version: String,
    #[serde(default)]
    pub stats_source: EcologyStatSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exploration_sprite: Option<DirectionalSpriteBinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EcologyStatus {
    Missing,
    Draft,
    Approved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    Draft,
    Approved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BaselineScope {
    World,
    Kingdom,
    Duchy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum BaselineEntityId {
    World(String),
    Numeric(u32),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FloraCategory {
    Tree,
    Shrub,
    Grass,
    Crop,
    Fungus,
    Aquatic,
    AlienOther,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FloraEdibility {
    None,
    Limited,
    Common,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FaunaCategory {
    Herbivore,
    Predator,
    Omnivore,
    Scavenger,
    Avian,
    Aquatic,
    BeastOfBurden,
    Companion,
    AlienOther,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaselineDraft {
    summary: String,
    #[serde(default)]
    climate_directives: Vec<String>,
    #[serde(default)]
    flora_directives: Vec<String>,
    #[serde(default)]
    fauna_directives: Vec<String>,
    #[serde(default)]
    agriculture_directives: Vec<String>,
    #[serde(default)]
    consistency_rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FloraDraft {
    name: String,
    category: FloraCategory,
    description: String,
    #[serde(default)]
    ecological_roles: Vec<String>,
    #[serde(default)]
    adaptations: Vec<String>,
    edibility: FloraEdibility,
    agriculture_value: i32,
    #[serde(default)]
    body_profile: Option<FloraBodyProfile>,
    #[serde(default)]
    resource_profile: Option<FloraResourceProfile>,
    #[serde(default)]
    hazard_profile: Option<FloraHazardProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaunaDraft {
    name: String,
    category: FaunaCategory,
    description: String,
    #[serde(default)]
    ecological_roles: Vec<String>,
    #[serde(default)]
    adaptations: Vec<String>,
    domestication_potential: i32,
    danger_level: i32,
    earth_analog: String,
    ancestral_stock: String,
    #[serde(default)]
    evolutionary_pressures: Vec<String>,
    mutation_summary: String,
    divergence_summary: String,
    #[serde(default)]
    combat_profile: Option<FaunaCombatProfile>,
    #[serde(default)]
    body_profile: Option<FaunaBodyProfile>,
    #[serde(default)]
    behavior_profile: Option<FaunaBehaviorProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcologyJobAccepted {
    job_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkEcologyGenerationRequest {
    pub prompt: String,
    pub count: u32,
    #[serde(default)]
    pub biome_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkFloraGenerationResponse {
    pub entries: Vec<FloraEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkFaunaGenerationResponse {
    pub entries: Vec<FaunaEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshDerivedStatsResponse {
    pub updated_flora_count: usize,
    pub updated_fauna_count: usize,
    pub assigned_skill_count: usize,
    pub stats_version: String,
}

#[derive(Debug, Clone)]
struct DerivedFloraStats {
    body_profile: FloraBodyProfile,
    resource_profile: FloraResourceProfile,
    hazard_profile: FloraHazardProfile,
}

#[derive(Debug, Clone)]
struct DerivedFaunaStats {
    combat_profile: FaunaCombatProfile,
    body_profile: FaunaBodyProfile,
    behavior_profile: FaunaBehaviorProfile,
    skill_ids: Vec<String>,
}

fn default_stats_version() -> String {
    ECOLOGY_STATS_VERSION.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FloraBatchDraftResponse {
    #[serde(default)]
    entries: Vec<FloraDraft>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaunaBatchDraftResponse {
    #[serde(default)]
    entries: Vec<FaunaDraft>,
}

pub async fn get_ecology_data(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut bundle = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    if let Ok(hierarchy) = load_hierarchy(&state.planets_dir, &world_id) {
        let report = load_biome_report(&state.planets_dir, &world_id);
        sync_biomes_with_hierarchy(&hierarchy, &mut bundle, report.as_ref());
    }

    Ok(Json(bundle))
}

pub async fn save_ecology_data(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(mut bundle): Json<EcologyBundle>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let existing = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    bundle.world_id = world_id.clone();
    normalize_bundle_for_save(&existing, &mut bundle);
    if let Ok(hierarchy) = load_hierarchy(&state.planets_dir, &world_id) {
        let report = load_biome_report(&state.planets_dir, &world_id);
        sync_biomes_with_hierarchy(&hierarchy, &mut bundle, report.as_ref());
    }
    validate_bundle_references(&bundle).map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    save_ecology_bundle(&state.planets_dir, &world_id, &bundle)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    Ok(Json(bundle))
}

pub async fn sync_biomes_handler(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut bundle = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let hierarchy = load_hierarchy(&state.planets_dir, &world_id).map_err(|err| {
        (
            StatusCode::NOT_FOUND,
            format!("World hierarchy not found: {}", err),
        )
    })?;

    let report = load_biome_report(&state.planets_dir, &world_id);
    sync_biomes_with_hierarchy(&hierarchy, &mut bundle, report.as_ref());

    save_ecology_bundle(&state.planets_dir, &world_id, &bundle)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(bundle))
}

pub async fn generate_world_baseline(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::WorldBaseline).await
}

pub async fn generate_kingdom_baseline(
    State(state): State<AppState>,
    Path((world_id, kingdom_id)): Path<(String, u32)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(
        state,
        world_id,
        EcologyJobKind::KingdomBaseline { kingdom_id },
    )
    .await
}

pub async fn generate_duchy_baseline(
    State(state): State<AppState>,
    Path((world_id, duchy_id)): Path<(String, u32)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::DuchyBaseline { duchy_id }).await
}

pub async fn generate_biome_description(
    State(state): State<AppState>,
    Path((world_id, biome_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::Biome { biome_id }).await
}

pub async fn generate_flora_batch(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(request): Json<BulkEcologyGenerationRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let entries = generate_flora_batch_impl(&state.planets_dir, &world_id, request)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    Ok(Json(BulkFloraGenerationResponse { entries }))
}

pub async fn generate_fauna_batch(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(request): Json<BulkEcologyGenerationRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let entries = generate_fauna_batch_impl(&state.planets_dir, &world_id, request)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    Ok(Json(BulkFaunaGenerationResponse { entries }))
}

pub async fn refresh_derived_stats(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut bundle = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let report = refresh_bundle_derived_stats(&mut bundle);
    validate_bundle_references(&bundle).map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    save_ecology_bundle(&state.planets_dir, &world_id, &bundle)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    Ok(Json(report))
}

#[derive(Debug, Clone)]
enum EcologyJobKind {
    WorldBaseline,
    KingdomBaseline { kingdom_id: u32 },
    DuchyBaseline { duchy_id: u32 },
    Biome { biome_id: String },
}

async fn spawn_ecology_job(
    state: AppState,
    world_id: String,
    job_kind: EcologyJobKind,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued ecology generation".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        run_ecology_job(spawned_job_id, jobs, planets_dir, world_id, job_kind).await;
    });

    Ok((StatusCode::ACCEPTED, Json(EcologyJobAccepted { job_id })))
}

async fn run_ecology_job(
    job_id: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: PathBuf,
    world_id: String,
    job_kind: EcologyJobKind,
) {
    update_job(
        &jobs,
        &job_id,
        JobStatus::Running,
        5.0,
        "Loading ecology bundle",
        None,
    );
    let result = match job_kind {
        EcologyJobKind::WorldBaseline => {
            update_job(
                &jobs,
                &job_id,
                JobStatus::Running,
                20.0,
                "Generating world baseline",
                None,
            );
            generate_world_baseline_impl(&planets_dir, &world_id).await
        }
        EcologyJobKind::KingdomBaseline { kingdom_id } => {
            update_job(
                &jobs,
                &job_id,
                JobStatus::Running,
                20.0,
                &format!("Generating kingdom baseline {}", kingdom_id),
                None,
            );
            generate_kingdom_baseline_impl(&planets_dir, &world_id, kingdom_id).await
        }
        EcologyJobKind::DuchyBaseline { duchy_id } => {
            update_job(
                &jobs,
                &job_id,
                JobStatus::Running,
                20.0,
                &format!("Generating duchy baseline {}", duchy_id),
                None,
            );
            generate_duchy_baseline_impl(&planets_dir, &world_id, duchy_id).await
        }
        EcologyJobKind::Biome { biome_id } => {
            update_job(
                &jobs,
                &job_id,
                JobStatus::Running,
                20.0,
                &format!("Generating biome dossier {}", biome_id),
                None,
            );
            generate_biome_description_impl(&planets_dir, &world_id, &biome_id).await
        }
    };

    match result {
        Ok(()) => update_job(
            &jobs,
            &job_id,
            JobStatus::Completed,
            100.0,
            "Completed",
            None,
        ),
        Err(err) => update_job(&jobs, &job_id, JobStatus::Failed, 95.0, "Failed", Some(err)),
    }
}

fn update_job(
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    job_id: &str,
    status: JobStatus,
    progress: f32,
    stage: &str,
    error_message: Option<String>,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = status;
            job.progress = progress;
            job.current_stage = stage.to_string();
            job.error = error_message;
        }
    }
}

async fn generate_world_baseline_impl(planets_dir: &FsPath, world_id: &str) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let prompt = build_world_baseline_prompt(&hierarchy);
    let draft: BaselineDraft = generate_structured_text(
        "world baseline",
        &prompt,
        "{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}",
    )
    .await?;
    let baseline = EcologyBaseline {
        scope: BaselineScope::World,
        entity_id: BaselineEntityId::World("world".to_string()),
        parent_entity_id: None,
        status: EcologyStatus::Draft,
        summary: draft.summary,
        climate_directives: draft.climate_directives,
        flora_directives: draft.flora_directives,
        fauna_directives: draft.fauna_directives,
        agriculture_directives: draft.agriculture_directives,
        consistency_rules: draft.consistency_rules,
        generated_at: Some(Utc::now().to_rfc3339()),
        approved_at: None,
    };
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_kingdom_baseline_impl(
    planets_dir: &FsPath,
    world_id: &str,
    kingdom_id: u32,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let world_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::World,
        &BaselineEntityId::World("world".to_string()),
    )?
    .clone();
    if let Some(existing) = find_baseline_mut(
        &mut bundle.baselines,
        BaselineScope::Kingdom,
        &BaselineEntityId::Numeric(kingdom_id),
    ) {
        if existing.status == EcologyStatus::Approved {
            return Err(
                "Approved kingdom baseline cannot be overwritten automatically.".to_string(),
            );
        }
    }
    let kingdom = hierarchy
        .kingdoms
        .iter()
        .find(|entry| entry.id == kingdom_id)
        .ok_or_else(|| format!("Kingdom {} not found", kingdom_id))?;
    let prompt = build_kingdom_baseline_prompt(&hierarchy, kingdom, &world_baseline);
    let draft: BaselineDraft = generate_structured_text(
        "kingdom baseline",
        &prompt,
        "{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}",
    )
    .await?;
    let baseline = EcologyBaseline {
        scope: BaselineScope::Kingdom,
        entity_id: BaselineEntityId::Numeric(kingdom_id),
        parent_entity_id: Some(BaselineEntityId::World("world".to_string())),
        status: EcologyStatus::Draft,
        summary: draft.summary,
        climate_directives: draft.climate_directives,
        flora_directives: draft.flora_directives,
        fauna_directives: draft.fauna_directives,
        agriculture_directives: draft.agriculture_directives,
        consistency_rules: draft.consistency_rules,
        generated_at: Some(Utc::now().to_rfc3339()),
        approved_at: None,
    };
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_duchy_baseline_impl(
    planets_dir: &FsPath,
    world_id: &str,
    duchy_id: u32,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let duchy = hierarchy
        .duchies
        .iter()
        .find(|entry| entry.id == duchy_id)
        .ok_or_else(|| format!("Duchy {} not found", duchy_id))?;
    let kingdom_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::Kingdom,
        &BaselineEntityId::Numeric(duchy.kingdom_id),
    )?
    .clone();
    if let Some(existing) = find_baseline_mut(
        &mut bundle.baselines,
        BaselineScope::Duchy,
        &BaselineEntityId::Numeric(duchy_id),
    ) {
        if existing.status == EcologyStatus::Approved {
            return Err("Approved duchy baseline cannot be overwritten automatically.".to_string());
        }
    }
    let prompt = build_duchy_baseline_prompt(&hierarchy, duchy, &kingdom_baseline);
    let draft: BaselineDraft = generate_structured_text(
        "duchy baseline",
        &prompt,
        "{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}",
    )
    .await?;
    let baseline = EcologyBaseline {
        scope: BaselineScope::Duchy,
        entity_id: BaselineEntityId::Numeric(duchy_id),
        parent_entity_id: Some(BaselineEntityId::Numeric(duchy.kingdom_id)),
        status: EcologyStatus::Draft,
        summary: draft.summary,
        climate_directives: draft.climate_directives,
        flora_directives: draft.flora_directives,
        fauna_directives: draft.fauna_directives,
        agriculture_directives: draft.agriculture_directives,
        consistency_rules: draft.consistency_rules,
        generated_at: Some(Utc::now().to_rfc3339()),
        approved_at: None,
    };
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_biome_description_impl(
    planets_dir: &FsPath,
    world_id: &str,
    biome_id: &str,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;

    let report = load_biome_report(planets_dir, world_id);
    sync_biomes_with_hierarchy(&hierarchy, &mut bundle, report.as_ref());

    let biome = bundle
        .biomes
        .iter()
        .find(|b| b.id == biome_id)
        .ok_or_else(|| format!("Biome {} not found", biome_id))?
        .clone();

    let world_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::World,
        &BaselineEntityId::World("world".to_string()),
    )?;

    let prompt = build_biome_prompt(&biome, world_baseline, &bundle);
    let draft: BiomeDraft = generate_structured_text(
        "biome dossier",
        &prompt,
        "{\"name\":\"...\",\"description\":\"...\",\"typicalFloraIds\":[\"...\"],\"typicalFaunaIds\":[\"...\"]}",
    )
    .await?;

    if let Some(target) = bundle.biomes.iter_mut().find(|b| b.id == biome_id) {
        target.name = draft.name;
        target.description = draft.description;
        target.typical_flora_ids = draft.typical_flora_ids;
        target.typical_fauna_ids = draft.typical_fauna_ids;
        target.status = EntryStatus::Draft;
    }

    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_flora_batch_impl(
    planets_dir: &FsPath,
    world_id: &str,
    request: BulkEcologyGenerationRequest,
) -> Result<Vec<FloraEntry>, String> {
    let prompt_text = request.prompt.trim();
    if prompt_text.is_empty() {
        return Err("Prompt is required for bulk flora generation".to_string());
    }
    let requested_count = request.count.clamp(1, 12) as usize;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let hierarchy = load_hierarchy(planets_dir, world_id).ok();
    if let Some(hierarchy) = hierarchy.as_ref() {
        let report = load_biome_report(planets_dir, world_id);
        sync_biomes_with_hierarchy(hierarchy, &mut bundle, report.as_ref());
    }

    let biome_ids = resolve_requested_biome_ids(&bundle, &request.biome_ids);
    let generation_prompt =
        build_flora_batch_prompt(&bundle, prompt_text, requested_count, &biome_ids);
    let draft_response: FloraBatchDraftResponse = generate_structured_text(
        "flora batch",
        &generation_prompt,
        "{\"entries\":[{\"name\":\"...\",\"category\":\"tree\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"edibility\":\"none\",\"agricultureValue\":0,\"bodyProfile\":{\"sizeClass\":\"medium\",\"heightMeters\":1,\"spreadMeters\":1,\"rootDepthMeters\":1,\"biomassKg\":1,\"lifespanYears\":1,\"growthRate\":50},\"resourceProfile\":{\"rarity\":0,\"yieldPerHarvest\":0,\"regrowthDays\":1,\"harvestDifficulty\":0,\"nutritionValue\":0,\"medicinalValue\":0,\"fuelValue\":0,\"structuralValue\":0,\"concealmentValue\":0},\"hazardProfile\":{\"toxicity\":0,\"irritation\":0,\"thorniness\":0,\"flammability\":0,\"resilience\":0}}]}",
    )
    .await?;

    let mut created_entries = Vec::new();
    for draft in draft_response.entries.into_iter().take(requested_count) {
        let draft = sanitize_flora_draft(draft);
        if draft.name.is_empty() || draft.description.is_empty() {
            continue;
        }
        let entry = flora_entry_from_draft(draft, &biome_ids);
        created_entries.push(entry);
    }
    if created_entries.is_empty() {
        return Err("Bulk flora generation returned no usable entries".to_string());
    }

    let mut next_flora = created_entries.clone();
    next_flora.extend(bundle.flora);
    bundle.flora = next_flora;
    save_ecology_bundle(planets_dir, world_id, &bundle)?;
    Ok(created_entries)
}

async fn generate_fauna_batch_impl(
    planets_dir: &FsPath,
    world_id: &str,
    request: BulkEcologyGenerationRequest,
) -> Result<Vec<FaunaEntry>, String> {
    let prompt_text = request.prompt.trim();
    if prompt_text.is_empty() {
        return Err("Prompt is required for bulk fauna generation".to_string());
    }
    let requested_count = request.count.clamp(1, 12) as usize;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let hierarchy = load_hierarchy(planets_dir, world_id).ok();
    if let Some(hierarchy) = hierarchy.as_ref() {
        let report = load_biome_report(planets_dir, world_id);
        sync_biomes_with_hierarchy(hierarchy, &mut bundle, report.as_ref());
    }

    let biome_ids = resolve_requested_biome_ids(&bundle, &request.biome_ids);
    let generation_prompt =
        build_fauna_batch_prompt(&bundle, prompt_text, requested_count, &biome_ids);
    let draft_response: FaunaBatchDraftResponse = generate_structured_text(
        "fauna batch",
        &generation_prompt,
        "{\"entries\":[{\"name\":\"...\",\"category\":\"herbivore\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"domesticationPotential\":0,\"dangerLevel\":0,\"earthAnalog\":\"...\",\"ancestralStock\":\"...\",\"evolutionaryPressures\":[\"...\"],\"mutationSummary\":\"...\",\"divergenceSummary\":\"...\",\"combatProfile\":{\"level\":1,\"strength\":10,\"agility\":10,\"intelligence\":5,\"wisdom\":5,\"endurance\":10,\"charisma\":5,\"critChance\":0.1,\"resistance\":0.1,\"socialBonus\":0.0,\"baseEvasion\":5,\"baseDefense\":2,\"baseHpBonus\":4,\"baseApBonus\":0,\"baseMpBonus\":0},\"bodyProfile\":{\"sizeClass\":\"medium\",\"heightMeters\":1,\"lengthMeters\":1,\"weightKg\":1,\"locomotion\":\"walker\",\"naturalWeapon\":\"bite\",\"armorClass\":\"furred\"},\"behaviorProfile\":{\"temperament\":\"docile\",\"activityCycle\":\"diurnal\",\"packSizeMin\":1,\"packSizeMax\":4,\"perception\":50,\"stealth\":20,\"trainability\":20}}]}",
    )
    .await?;

    let mut created_entries = Vec::new();
    for draft in draft_response.entries.into_iter().take(requested_count) {
        let draft = sanitize_fauna_draft(draft);
        if draft.name.is_empty() || draft.description.is_empty() {
            continue;
        }
        let entry = fauna_entry_from_draft(draft, &biome_ids);
        created_entries.push(entry);
    }
    if created_entries.is_empty() {
        return Err("Bulk fauna generation returned no usable entries".to_string());
    }

    let mut next_fauna = created_entries.clone();
    next_fauna.extend(bundle.fauna);
    bundle.fauna = next_fauna;
    save_ecology_bundle(planets_dir, world_id, &bundle)?;
    Ok(created_entries)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BiomeDraft {
    name: String,
    description: String,
    #[serde(default)]
    typical_flora_ids: Vec<String>,
    #[serde(default)]
    typical_fauna_ids: Vec<String>,
}

fn build_biome_prompt(
    biome: &BiomeEntry,
    world_baseline: &EcologyBaseline,
    bundle: &EcologyBundle,
) -> String {
    let approved_flora = bundle
        .flora
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| format!("{}: {} [{:?}]", entry.id, entry.name, entry.category))
        .collect::<Vec<_>>()
        .join("\n");
    let approved_fauna = bundle
        .fauna
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| format!("{}: {} [{:?}]", entry.id, entry.name, entry.category))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "You are defining a canonical biome description for a worldbuilding project.\n\
        Return ONLY strict JSON with this shape:\n\
        {{\"name\":\"...\",\"description\":\"...\",\"typicalFloraIds\":[\"...\"],\"typicalFaunaIds\":[\"...\"]}}\n\n\
        Biome Type: {}\n\
        World Baseline: {}\n\n\
        Approved Flora:\n{}\n\n\
        Approved Fauna:\n{}\n\n\
        Rules:\n\
        - The description should be evocative and follow the world baseline's tone.\n\
        - Link to existing approved flora/fauna if they fit this biome type.\n",
        biome.biome_type,
        world_baseline.summary,
        approved_flora,
        approved_fauna
    )
}

fn resolve_requested_biome_ids(bundle: &EcologyBundle, requested_ids: &[String]) -> Vec<String> {
    let valid_ids: HashSet<&str> = bundle
        .biomes
        .iter()
        .map(|entry| entry.id.as_str())
        .collect();
    dedupe_ids(
        requested_ids
            .iter()
            .filter(|id| valid_ids.contains(id.as_str()))
            .cloned()
            .collect(),
    )
}

fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    value.clamp(min, max)
}

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.clamp(min, max)
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn combined_flora_text(entry: &FloraEntry) -> String {
    format!(
        "{} {} {} {} {}",
        entry.name,
        entry.description,
        entry.ecological_roles.join(" "),
        entry.adaptations.join(" "),
        entry.biome_ids.join(" ")
    )
    .to_lowercase()
}

fn combined_fauna_text(entry: &FaunaEntry) -> String {
    format!(
        "{} {} {} {} {} {} {} {}",
        entry.name,
        entry.description,
        entry.ecological_roles.join(" "),
        entry.adaptations.join(" "),
        entry.earth_analog,
        entry.ancestral_stock,
        entry.evolutionary_pressures.join(" "),
        entry.biome_ids.join(" ")
    )
    .to_lowercase()
}

fn fauna_size_rank(size_class: &FaunaSizeClass) -> i32 {
    match size_class {
        FaunaSizeClass::Tiny => 0,
        FaunaSizeClass::Small => 1,
        FaunaSizeClass::Medium => 2,
        FaunaSizeClass::Large => 3,
        FaunaSizeClass::Huge => 4,
    }
}

fn flora_size_rank(size_class: &FloraSizeClass) -> i32 {
    match size_class {
        FloraSizeClass::Tiny => 0,
        FloraSizeClass::Small => 1,
        FloraSizeClass::Medium => 2,
        FloraSizeClass::Large => 3,
        FloraSizeClass::Massive => 4,
    }
}

fn flora_profiles_need_backfill(entry: &FloraEntry) -> bool {
    entry.body_profile.height_meters <= 0.0
        || entry.body_profile.spread_meters <= 0.0
        || entry.body_profile.root_depth_meters <= 0.0
        || entry.body_profile.biomass_kg <= 0.0
        || entry.body_profile.lifespan_years <= 0.0
        || entry.resource_profile.regrowth_days <= 0
        || entry.stats_version.trim().is_empty()
}

fn fauna_profiles_need_backfill(entry: &FaunaEntry) -> bool {
    entry.combat_profile.level <= 0
        || entry.body_profile.height_meters <= 0.0
        || entry.body_profile.length_meters <= 0.0
        || entry.body_profile.weight_kg <= 0.0
        || entry.behavior_profile.pack_size_max <= 0
        || entry.skill_ids.is_empty()
        || entry.stats_version.trim().is_empty()
}

fn infer_flora_size_class(category: &FloraCategory, text: &str) -> FloraSizeClass {
    if contains_any(
        text,
        &[
            "colossal",
            "massive",
            "towering",
            "world-tree",
            "ancient grove",
        ],
    ) {
        FloraSizeClass::Massive
    } else if contains_any(text, &["tall", "canopy", "broad", "dense stand", "giant"]) {
        FloraSizeClass::Large
    } else {
        match category {
            FloraCategory::Grass | FloraCategory::Fungus => FloraSizeClass::Small,
            FloraCategory::Aquatic => FloraSizeClass::Medium,
            FloraCategory::Shrub | FloraCategory::Crop => FloraSizeClass::Medium,
            FloraCategory::Tree => FloraSizeClass::Large,
            FloraCategory::AlienOther => FloraSizeClass::Medium,
        }
    }
}

fn derive_flora_stats(entry: &FloraEntry) -> DerivedFloraStats {
    let text = combined_flora_text(entry);
    let size_class = infer_flora_size_class(&entry.category, &text);
    let (mut height, mut spread, mut root_depth, mut biomass, mut lifespan, mut growth_rate) =
        match entry.category {
            FloraCategory::Tree => (14.0, 8.0, 3.5, 1800.0, 140.0, 42),
            FloraCategory::Shrub => (2.4, 2.8, 1.1, 80.0, 18.0, 56),
            FloraCategory::Grass => (0.8, 0.4, 0.5, 6.0, 2.0, 78),
            FloraCategory::Crop => (1.6, 0.8, 0.9, 12.0, 1.0, 88),
            FloraCategory::Fungus => (0.5, 0.9, 0.4, 4.0, 3.0, 72),
            FloraCategory::Aquatic => (1.4, 1.8, 0.6, 16.0, 6.0, 74),
            FloraCategory::AlienOther => (2.2, 1.6, 1.4, 42.0, 24.0, 58),
        };

    match size_class {
        FloraSizeClass::Tiny => {
            height *= 0.45;
            spread *= 0.55;
            root_depth *= 0.55;
            biomass *= 0.2;
            lifespan *= 0.6;
            growth_rate += 12;
        }
        FloraSizeClass::Small => {
            height *= 0.7;
            spread *= 0.75;
            root_depth *= 0.75;
            biomass *= 0.45;
            lifespan *= 0.8;
            growth_rate += 6;
        }
        FloraSizeClass::Medium => {}
        FloraSizeClass::Large => {
            height *= 1.35;
            spread *= 1.25;
            root_depth *= 1.2;
            biomass *= 1.9;
            lifespan *= 1.45;
            growth_rate -= 8;
        }
        FloraSizeClass::Massive => {
            height *= 2.1;
            spread *= 1.9;
            root_depth *= 1.7;
            biomass *= 4.5;
            lifespan *= 2.4;
            growth_rate -= 14;
        }
    }

    if contains_any(
        &text,
        &["fast-growing", "rapid", "seasonal bloom", "regenerates"],
    ) {
        growth_rate += 12;
    }
    if contains_any(&text, &["slow-growing", "ancient", "old-growth"]) {
        growth_rate -= 12;
        lifespan *= 1.2;
    }

    let rarity = clamp_i32(
        22 + flora_size_rank(&size_class) * 8
            + if contains_any(&text, &["rare", "sacred", "endemic", "mythic"]) {
                25
            } else {
                0
            },
        0,
        100,
    );
    let yield_per_harvest = clamp_i32(
        18 + entry.agriculture_value / 2
            + match entry.category {
                FloraCategory::Crop => 20,
                FloraCategory::Grass => 10,
                FloraCategory::Tree => 6,
                FloraCategory::Aquatic => 8,
                _ => 0,
            },
        0,
        100,
    );
    let regrowth_days = clamp_i32(
        match entry.category {
            FloraCategory::Grass => 12,
            FloraCategory::Crop => 24,
            FloraCategory::Fungus => 18,
            FloraCategory::Aquatic => 16,
            FloraCategory::Shrub => 40,
            FloraCategory::Tree => 90,
            FloraCategory::AlienOther => 36,
        } - entry.agriculture_value / 8
            + if contains_any(&text, &["slow-growing", "rare"]) {
                15
            } else {
                0
            },
        1,
        3650,
    );
    let harvest_difficulty = clamp_i32(
        18 + flora_size_rank(&size_class) * 12
            + if contains_any(&text, &["thorn", "spine", "toxic", "razor"]) {
                22
            } else {
                0
            },
        0,
        100,
    );
    let nutrition_value = clamp_i32(
        match entry.edibility {
            FloraEdibility::None => 0,
            FloraEdibility::Limited => 30,
            FloraEdibility::Common => 62,
        } + entry.agriculture_value / 4,
        0,
        100,
    );
    let medicinal_value = clamp_i32(
        if contains_any(
            &text,
            &["medicinal", "healing", "restorative", "resin", "tonic"],
        ) {
            65
        } else if matches!(entry.category, FloraCategory::Fungus) {
            48
        } else {
            18
        },
        0,
        100,
    );
    let fuel_value = clamp_i32(
        match entry.category {
            FloraCategory::Tree => 68,
            FloraCategory::Shrub => 44,
            FloraCategory::Grass => 26,
            FloraCategory::Crop => 18,
            FloraCategory::Fungus => 8,
            FloraCategory::Aquatic => 4,
            FloraCategory::AlienOther => 28,
        } + if contains_any(&text, &["oily", "resinous", "dry"]) {
            14
        } else {
            0
        },
        0,
        100,
    );
    let structural_value = clamp_i32(
        match entry.category {
            FloraCategory::Tree => 76,
            FloraCategory::Shrub => 34,
            FloraCategory::Grass => 12,
            FloraCategory::Crop => 10,
            FloraCategory::Fungus => 6,
            FloraCategory::Aquatic => 4,
            FloraCategory::AlienOther => 24,
        } + flora_size_rank(&size_class) * 6,
        0,
        100,
    );
    let concealment_value = clamp_i32(
        10 + flora_size_rank(&size_class) * 18
            + if contains_any(
                &text,
                &["dense", "thicket", "canopy", "broadleaf", "matted"],
            ) {
                16
            } else {
                0
            },
        0,
        100,
    );
    let toxicity = clamp_i32(
        if contains_any(
            &text,
            &["toxic", "poison", "venom", "caustic", "hallucinogenic"],
        ) {
            72
        } else {
            8
        },
        0,
        100,
    );
    let irritation = clamp_i32(
        if contains_any(&text, &["irritant", "itch", "rash", "sap", "spore"]) {
            58
        } else {
            10
        },
        0,
        100,
    );
    let thorniness = clamp_i32(
        if contains_any(&text, &["thorn", "barb", "spike", "needle"]) {
            70
        } else {
            6
        },
        0,
        100,
    );
    let flammability = clamp_i32(
        match entry.category {
            FloraCategory::Aquatic => 6,
            FloraCategory::Fungus => 16,
            FloraCategory::Tree => 36,
            FloraCategory::Grass => 64,
            FloraCategory::Crop => 46,
            FloraCategory::Shrub => 40,
            FloraCategory::AlienOther => 28,
        } + if contains_any(&text, &["dry", "resin", "oil", "kindling"]) {
            18
        } else {
            0
        },
        0,
        100,
    );
    let resilience = clamp_i32(
        28 + match entry.category {
            FloraCategory::Tree => 26,
            FloraCategory::Shrub => 18,
            FloraCategory::Grass => 10,
            FloraCategory::Crop => 4,
            FloraCategory::Fungus => 8,
            FloraCategory::Aquatic => 12,
            FloraCategory::AlienOther => 16,
        } + if contains_any(&text, &["hardy", "resilient", "salt-tolerant", "drought"]) {
            18
        } else {
            0
        },
        0,
        100,
    );

    DerivedFloraStats {
        body_profile: FloraBodyProfile {
            size_class,
            height_meters: clamp_f64(height, 0.1, 200.0),
            spread_meters: clamp_f64(spread, 0.1, 200.0),
            root_depth_meters: clamp_f64(root_depth, 0.05, 60.0),
            biomass_kg: clamp_f64(biomass, 0.1, 500000.0),
            lifespan_years: clamp_f64(lifespan, 0.5, 5000.0),
            growth_rate: clamp_i32(growth_rate, 0, 100),
        },
        resource_profile: FloraResourceProfile {
            rarity,
            yield_per_harvest,
            regrowth_days,
            harvest_difficulty,
            nutrition_value,
            medicinal_value,
            fuel_value,
            structural_value,
            concealment_value,
        },
        hazard_profile: FloraHazardProfile {
            toxicity,
            irritation,
            thorniness,
            flammability,
            resilience,
        },
    }
}

fn infer_fauna_size_class(category: &FaunaCategory, text: &str) -> FaunaSizeClass {
    if contains_any(
        text,
        &[
            "colossal",
            "mammoth",
            "leviathan",
            "titan",
            "gigantic",
            "towering",
        ],
    ) {
        FaunaSizeClass::Huge
    } else if contains_any(
        text,
        &["large", "bear", "horse", "ox", "camel", "crocodile", "bull"],
    ) {
        FaunaSizeClass::Large
    } else if contains_any(text, &["tiny", "small", "rodent", "fox", "lizard", "cat"]) {
        FaunaSizeClass::Small
    } else {
        match category {
            FaunaCategory::Avian => FaunaSizeClass::Small,
            FaunaCategory::BeastOfBurden => FaunaSizeClass::Large,
            _ => FaunaSizeClass::Medium,
        }
    }
}

fn infer_fauna_locomotion(category: &FaunaCategory, text: &str) -> FaunaLocomotion {
    if contains_any(text, &["burrow", "tunnel"]) {
        FaunaLocomotion::Burrower
    } else if contains_any(text, &["swim", "reef", "river", "sea", "ocean", "aquatic"]) {
        FaunaLocomotion::Swimmer
    } else if contains_any(text, &["amphib", "marsh", "bog"]) {
        FaunaLocomotion::Amphibious
    } else if contains_any(text, &["wing", "glide", "soar", "fly"])
        || matches!(category, FaunaCategory::Avian)
    {
        FaunaLocomotion::Flier
    } else if contains_any(text, &["slither", "coil", "serpent"]) {
        FaunaLocomotion::Slitherer
    } else if contains_any(text, &["climb", "arboreal", "perch"]) {
        FaunaLocomotion::Climber
    } else if matches!(category, FaunaCategory::Predator)
        || contains_any(text, &["swift", "runner", "fleet"])
    {
        FaunaLocomotion::Runner
    } else {
        FaunaLocomotion::Walker
    }
}

fn infer_fauna_weapon(
    category: &FaunaCategory,
    text: &str,
    size_class: &FaunaSizeClass,
) -> FaunaNaturalWeapon {
    if contains_any(text, &["venom", "poison", "toxin", "stinger"]) {
        FaunaNaturalWeapon::Venom
    } else if contains_any(text, &["constrict", "coil", "squeeze"]) {
        FaunaNaturalWeapon::Constrict
    } else if contains_any(text, &["horn", "antler", "tusk"]) {
        FaunaNaturalWeapon::Horn
    } else if contains_any(text, &["hoof", "trample"]) {
        FaunaNaturalWeapon::Hoof
    } else if contains_any(text, &["claw", "talon", "rake"]) {
        FaunaNaturalWeapon::Claw
    } else if contains_any(text, &["beak", "peck"]) || matches!(category, FaunaCategory::Avian) {
        FaunaNaturalWeapon::Beak
    } else if contains_any(text, &["tail", "slam"]) {
        FaunaNaturalWeapon::Tail
    } else if contains_any(text, &["spine", "quill"]) {
        FaunaNaturalWeapon::Spines
    } else if contains_any(text, &["bite", "fang", "jaw"])
        || matches!(
            category,
            FaunaCategory::Predator | FaunaCategory::Omnivore | FaunaCategory::Scavenger
        )
    {
        FaunaNaturalWeapon::Bite
    } else if matches!(
        category,
        FaunaCategory::Herbivore | FaunaCategory::BeastOfBurden
    ) && fauna_size_rank(size_class) >= 3
    {
        FaunaNaturalWeapon::Hoof
    } else {
        FaunaNaturalWeapon::None
    }
}

fn infer_fauna_armor(category: &FaunaCategory, text: &str) -> FaunaArmorClass {
    if contains_any(text, &["shell", "carapace"]) {
        FaunaArmorClass::Shelled
    } else if contains_any(text, &["plated", "armored", "armor"]) {
        FaunaArmorClass::Plated
    } else if contains_any(text, &["scale", "scaled"]) {
        FaunaArmorClass::Scaled
    } else if contains_any(text, &["stone", "rock"]) {
        FaunaArmorClass::Rocky
    } else if contains_any(text, &["fur", "wool", "hide", "mane"])
        || matches!(
            category,
            FaunaCategory::Herbivore | FaunaCategory::BeastOfBurden | FaunaCategory::Predator
        )
    {
        FaunaArmorClass::Furred
    } else {
        FaunaArmorClass::Soft
    }
}

fn assign_fauna_skill_ids_from_profiles(entry: &FaunaEntry) -> Vec<String> {
    let mut skills = Vec::new();
    match entry.body_profile.natural_weapon {
        FaunaNaturalWeapon::Bite => skills.push("animal-bite".to_string()),
        FaunaNaturalWeapon::Claw => skills.push("animal-claw-rake".to_string()),
        FaunaNaturalWeapon::Horn => skills.push("animal-gore".to_string()),
        FaunaNaturalWeapon::Hoof => skills.push("animal-trample".to_string()),
        FaunaNaturalWeapon::Tail => skills.push("animal-tail-slam".to_string()),
        FaunaNaturalWeapon::Beak => skills.push("animal-peck".to_string()),
        FaunaNaturalWeapon::Venom => skills.push("animal-venom-strike".to_string()),
        FaunaNaturalWeapon::Constrict => skills.push("animal-constrict".to_string()),
        FaunaNaturalWeapon::Spines => skills.push("animal-tail-slam".to_string()),
        FaunaNaturalWeapon::None => {}
    }
    if matches!(entry.category, FaunaCategory::Predator)
        && entry.combat_profile.agility >= 13
        && fauna_size_rank(&entry.body_profile.size_class) >= 1
    {
        skills.push("animal-pounce".to_string());
    }
    if matches!(entry.body_profile.locomotion, FaunaLocomotion::Flier)
        || matches!(entry.category, FaunaCategory::Avian)
    {
        skills.push("animal-screech".to_string());
    }
    if matches!(entry.body_profile.locomotion, FaunaLocomotion::Burrower) {
        skills.push("animal-burrow-dash".to_string());
    }
    if matches!(
        entry.body_profile.locomotion,
        FaunaLocomotion::Swimmer | FaunaLocomotion::Amphibious
    ) || matches!(entry.category, FaunaCategory::Aquatic)
    {
        skills.push("animal-water-lunge".to_string());
    }
    if entry.behavior_profile.stealth >= 70 {
        skills.push("animal-camouflage".to_string());
    }
    if entry.behavior_profile.pack_size_max >= 4 {
        skills.push("animal-pack-howl".to_string());
    }
    let fallback = match entry.category {
        FaunaCategory::Avian => "animal-peck",
        FaunaCategory::Aquatic => "animal-water-lunge",
        FaunaCategory::BeastOfBurden | FaunaCategory::Herbivore => "animal-trample",
        _ => "animal-bite",
    };
    if skills.is_empty() {
        skills.push(fallback.to_string());
    }
    skills = dedupe_preserve_order(&skills);
    if skills.len() > 4 {
        skills.truncate(4);
    }
    skills
}

fn derive_fauna_stats(entry: &FaunaEntry) -> DerivedFaunaStats {
    let text = combined_fauna_text(entry);
    let size_class = infer_fauna_size_class(&entry.category, &text);
    let locomotion = infer_fauna_locomotion(&entry.category, &text);
    let natural_weapon = infer_fauna_weapon(&entry.category, &text, &size_class);
    let armor_class = infer_fauna_armor(&entry.category, &text);
    let danger = entry.danger_level;
    let domestication = entry.domestication_potential;
    let size_rank = fauna_size_rank(&size_class);

    let (mut strength, mut agility, mut intelligence, mut wisdom, mut endurance, mut charisma) =
        match entry.category {
            FaunaCategory::Herbivore => (11, 8, 5, 6, 13, 6),
            FaunaCategory::Predator => (13, 13, 5, 8, 10, 4),
            FaunaCategory::Omnivore => (10, 10, 7, 7, 10, 6),
            FaunaCategory::Scavenger => (8, 11, 6, 9, 9, 4),
            FaunaCategory::Avian => (8, 14, 6, 8, 8, 5),
            FaunaCategory::Aquatic => (12, 10, 5, 8, 11, 4),
            FaunaCategory::BeastOfBurden => (14, 7, 4, 6, 14, 6),
            FaunaCategory::Companion => (8, 10, 7, 8, 9, 10),
            FaunaCategory::AlienOther => (10, 10, 8, 8, 10, 6),
        };

    strength += size_rank;
    endurance += size_rank;
    agility += match locomotion {
        FaunaLocomotion::Runner | FaunaLocomotion::Flier => 2,
        FaunaLocomotion::Climber | FaunaLocomotion::Burrower | FaunaLocomotion::Swimmer => 1,
        FaunaLocomotion::Walker | FaunaLocomotion::Slitherer | FaunaLocomotion::Amphibious => 0,
    };
    strength += danger / 20;
    agility += danger / 25;
    endurance += danger / 30;
    charisma += domestication / 25 - 1;
    if matches!(
        natural_weapon,
        FaunaNaturalWeapon::Claw | FaunaNaturalWeapon::Horn | FaunaNaturalWeapon::Bite
    ) {
        strength += 1;
    }
    if matches!(
        armor_class,
        FaunaArmorClass::Scaled
            | FaunaArmorClass::Shelled
            | FaunaArmorClass::Plated
            | FaunaArmorClass::Rocky
    ) {
        endurance += 2;
    }
    if contains_any(&text, &["cunning", "clever", "tool", "social"]) {
        intelligence += 2;
        wisdom += 1;
    }

    let temperament = if danger >= 85 {
        FaunaTemperament::Apex
    } else if danger >= 65 {
        FaunaTemperament::Aggressive
    } else if danger >= 45 {
        FaunaTemperament::Territorial
    } else if danger >= 20 {
        FaunaTemperament::Skittish
    } else {
        FaunaTemperament::Docile
    };
    let activity_cycle = if contains_any(&text, &["nocturnal", "night"]) {
        ActivityCycle::Nocturnal
    } else if contains_any(&text, &["crepuscular", "dawn", "dusk"]) {
        ActivityCycle::Crepuscular
    } else if matches!(entry.category, FaunaCategory::Companion) {
        ActivityCycle::Any
    } else {
        ActivityCycle::Diurnal
    };
    let (pack_size_min, pack_size_max) = if contains_any(&text, &["solitary", "lone"]) {
        (1, 1)
    } else if contains_any(&text, &["swarm"]) {
        (12, 40)
    } else if contains_any(&text, &["flock"]) {
        (6, 24)
    } else if contains_any(&text, &["herd"]) {
        (4, 16)
    } else if contains_any(&text, &["pack"]) {
        (3, 8)
    } else if matches!(entry.category, FaunaCategory::Companion) {
        (1, 3)
    } else {
        (1, 4)
    };
    let perception = clamp_i32(
        32 + danger / 2
            + if contains_any(
                &text,
                &["keen", "alert", "tracking", "scent", "echolocation"],
            ) {
                18
            } else {
                0
            },
        0,
        100,
    );
    let stealth = clamp_i32(
        18 + if matches!(
            locomotion,
            FaunaLocomotion::Flier | FaunaLocomotion::Runner | FaunaLocomotion::Slitherer
        ) {
            12
        } else {
            0
        } + if contains_any(&text, &["camouflage", "ambush", "shadow", "silent"]) {
            28
        } else {
            0
        },
        0,
        100,
    );
    let trainability = clamp_i32(domestication, 0, 100);

    let (height, length, weight) = match size_class {
        FaunaSizeClass::Tiny => (0.25, 0.35, 1.8),
        FaunaSizeClass::Small => (0.7, 0.9, 18.0),
        FaunaSizeClass::Medium => (1.2, 1.8, 90.0),
        FaunaSizeClass::Large => (1.9, 2.9, 340.0),
        FaunaSizeClass::Huge => (3.6, 6.0, 1800.0),
    };
    let crit_chance = clamp_f64(
        0.04 + danger as f64 * 0.0024 + agility as f64 * 0.004,
        0.0,
        0.35,
    );
    let resistance = clamp_f64(
        0.02 + wisdom as f64 * 0.018 + size_rank as f64 * 0.03,
        0.0,
        0.5,
    );
    let social_bonus = clamp_f64(
        (charisma as f64 - 8.0) * 0.025 + domestication as f64 / 250.0 - danger as f64 / 500.0,
        -0.25,
        0.35,
    );
    let base_evasion = clamp_i32(
        agility / 2
            + match locomotion {
                FaunaLocomotion::Flier => 4,
                FaunaLocomotion::Runner => 3,
                FaunaLocomotion::Climber | FaunaLocomotion::Slitherer => 2,
                FaunaLocomotion::Burrower
                | FaunaLocomotion::Swimmer
                | FaunaLocomotion::Amphibious => 1,
                FaunaLocomotion::Walker => 0,
            },
        0,
        40,
    );
    let base_defense = clamp_i32(
        size_rank * 2
            + match armor_class {
                FaunaArmorClass::Soft => 0,
                FaunaArmorClass::Furred => 1,
                FaunaArmorClass::Scaled => 3,
                FaunaArmorClass::Shelled => 4,
                FaunaArmorClass::Plated => 5,
                FaunaArmorClass::Rocky => 5,
            },
        0,
        20,
    );
    let base_hp_bonus = clamp_i32(size_rank * 4 + danger / 10, 0, 32);
    let base_ap_bonus = clamp_i32(
        if agility >= 14 { 1 } else { 0 }
            + if matches!(
                entry.category,
                FaunaCategory::Predator | FaunaCategory::Avian
            ) {
                1
            } else {
                0
            },
        0,
        4,
    );
    let base_mp_bonus = clamp_i32(
        match locomotion {
            FaunaLocomotion::Runner | FaunaLocomotion::Flier => 2,
            FaunaLocomotion::Climber | FaunaLocomotion::Swimmer | FaunaLocomotion::Burrower => 1,
            _ => 0,
        },
        0,
        4,
    );

    let mut derived = DerivedFaunaStats {
        combat_profile: FaunaCombatProfile {
            level: clamp_i32(1 + danger / 18 + size_rank / 2, 1, 20),
            strength: clamp_i32(strength, 1, 20),
            agility: clamp_i32(agility, 1, 20),
            intelligence: clamp_i32(intelligence, 1, 20),
            wisdom: clamp_i32(wisdom, 1, 20),
            endurance: clamp_i32(endurance, 1, 20),
            charisma: clamp_i32(charisma, 1, 20),
            crit_chance,
            resistance,
            social_bonus,
            base_evasion,
            base_defense,
            base_hp_bonus,
            base_ap_bonus,
            base_mp_bonus,
        },
        body_profile: FaunaBodyProfile {
            size_class,
            height_meters: clamp_f64(height, 0.1, 20.0),
            length_meters: clamp_f64(length, 0.1, 40.0),
            weight_kg: clamp_f64(weight, 0.1, 100000.0),
            locomotion,
            natural_weapon,
            armor_class,
        },
        behavior_profile: FaunaBehaviorProfile {
            temperament,
            activity_cycle,
            pack_size_min,
            pack_size_max,
            perception,
            stealth,
            trainability,
        },
        skill_ids: Vec::new(),
    };
    let temp_entry = FaunaEntry {
        id: entry.id.clone(),
        status: entry.status.clone(),
        name: entry.name.clone(),
        category: entry.category.clone(),
        description: entry.description.clone(),
        ecological_roles: entry.ecological_roles.clone(),
        adaptations: entry.adaptations.clone(),
        domestication_potential: entry.domestication_potential,
        danger_level: entry.danger_level,
        biome_ids: entry.biome_ids.clone(),
        earth_analog: entry.earth_analog.clone(),
        ancestral_stock: entry.ancestral_stock.clone(),
        evolutionary_pressures: entry.evolutionary_pressures.clone(),
        mutation_summary: entry.mutation_summary.clone(),
        divergence_summary: entry.divergence_summary.clone(),
        family_id: entry.family_id.clone(),
        family_name: entry.family_name.clone(),
        illustration_asset_batch_ids: entry.illustration_asset_batch_ids.clone(),
        illustration_assets: entry.illustration_assets.clone(),
        combat_profile: derived.combat_profile.clone(),
        body_profile: derived.body_profile.clone(),
        behavior_profile: derived.behavior_profile.clone(),
        skill_ids: Vec::new(),
        stats_version: default_stats_version(),
        stats_source: EcologyStatSource::Backfilled,
        exploration_sprite: entry.exploration_sprite.clone(),
        approved_at: entry.approved_at.clone(),
    };
    derived.skill_ids = assign_fauna_skill_ids_from_profiles(&temp_entry);
    derived
}

fn sanitize_flora_profiles(entry: &mut FloraEntry) {
    entry.body_profile.height_meters = clamp_f64(entry.body_profile.height_meters, 0.1, 200.0);
    entry.body_profile.spread_meters = clamp_f64(entry.body_profile.spread_meters, 0.1, 200.0);
    entry.body_profile.root_depth_meters =
        clamp_f64(entry.body_profile.root_depth_meters, 0.05, 60.0);
    entry.body_profile.biomass_kg = clamp_f64(entry.body_profile.biomass_kg, 0.1, 500000.0);
    entry.body_profile.lifespan_years = clamp_f64(entry.body_profile.lifespan_years, 0.5, 5000.0);
    entry.body_profile.growth_rate = clamp_i32(entry.body_profile.growth_rate, 0, 100);
    entry.resource_profile.rarity = clamp_i32(entry.resource_profile.rarity, 0, 100);
    entry.resource_profile.yield_per_harvest =
        clamp_i32(entry.resource_profile.yield_per_harvest, 0, 100);
    entry.resource_profile.regrowth_days = clamp_i32(entry.resource_profile.regrowth_days, 1, 3650);
    entry.resource_profile.harvest_difficulty =
        clamp_i32(entry.resource_profile.harvest_difficulty, 0, 100);
    entry.resource_profile.nutrition_value =
        clamp_i32(entry.resource_profile.nutrition_value, 0, 100);
    entry.resource_profile.medicinal_value =
        clamp_i32(entry.resource_profile.medicinal_value, 0, 100);
    entry.resource_profile.fuel_value = clamp_i32(entry.resource_profile.fuel_value, 0, 100);
    entry.resource_profile.structural_value =
        clamp_i32(entry.resource_profile.structural_value, 0, 100);
    entry.resource_profile.concealment_value =
        clamp_i32(entry.resource_profile.concealment_value, 0, 100);
    entry.hazard_profile.toxicity = clamp_i32(entry.hazard_profile.toxicity, 0, 100);
    entry.hazard_profile.irritation = clamp_i32(entry.hazard_profile.irritation, 0, 100);
    entry.hazard_profile.thorniness = clamp_i32(entry.hazard_profile.thorniness, 0, 100);
    entry.hazard_profile.flammability = clamp_i32(entry.hazard_profile.flammability, 0, 100);
    entry.hazard_profile.resilience = clamp_i32(entry.hazard_profile.resilience, 0, 100);
}

fn sanitize_fauna_profiles(entry: &mut FaunaEntry) {
    entry.combat_profile.level = clamp_i32(entry.combat_profile.level, 1, 20);
    entry.combat_profile.strength = clamp_i32(entry.combat_profile.strength, 1, 20);
    entry.combat_profile.agility = clamp_i32(entry.combat_profile.agility, 1, 20);
    entry.combat_profile.intelligence = clamp_i32(entry.combat_profile.intelligence, 1, 20);
    entry.combat_profile.wisdom = clamp_i32(entry.combat_profile.wisdom, 1, 20);
    entry.combat_profile.endurance = clamp_i32(entry.combat_profile.endurance, 1, 20);
    entry.combat_profile.charisma = clamp_i32(entry.combat_profile.charisma, 1, 20);
    entry.combat_profile.crit_chance = clamp_f64(entry.combat_profile.crit_chance, 0.0, 0.35);
    entry.combat_profile.resistance = clamp_f64(entry.combat_profile.resistance, 0.0, 0.5);
    entry.combat_profile.social_bonus = clamp_f64(entry.combat_profile.social_bonus, -0.25, 0.35);
    entry.combat_profile.base_evasion = clamp_i32(entry.combat_profile.base_evasion, 0, 40);
    entry.combat_profile.base_defense = clamp_i32(entry.combat_profile.base_defense, 0, 20);
    entry.combat_profile.base_hp_bonus = clamp_i32(entry.combat_profile.base_hp_bonus, 0, 32);
    entry.combat_profile.base_ap_bonus = clamp_i32(entry.combat_profile.base_ap_bonus, 0, 4);
    entry.combat_profile.base_mp_bonus = clamp_i32(entry.combat_profile.base_mp_bonus, 0, 4);
    entry.body_profile.height_meters = clamp_f64(entry.body_profile.height_meters, 0.1, 20.0);
    entry.body_profile.length_meters = clamp_f64(entry.body_profile.length_meters, 0.1, 40.0);
    entry.body_profile.weight_kg = clamp_f64(entry.body_profile.weight_kg, 0.1, 100000.0);
    entry.behavior_profile.pack_size_min = clamp_i32(entry.behavior_profile.pack_size_min, 1, 500);
    entry.behavior_profile.pack_size_max = clamp_i32(
        entry.behavior_profile.pack_size_max,
        entry.behavior_profile.pack_size_min,
        500,
    );
    entry.behavior_profile.perception = clamp_i32(entry.behavior_profile.perception, 0, 100);
    entry.behavior_profile.stealth = clamp_i32(entry.behavior_profile.stealth, 0, 100);
    entry.behavior_profile.trainability = clamp_i32(entry.behavior_profile.trainability, 0, 100);
    entry.skill_ids = dedupe_preserve_order(&entry.skill_ids);
}

fn apply_derived_flora_stats(
    entry: &mut FloraEntry,
    derived: DerivedFloraStats,
    source: EcologyStatSource,
) {
    entry.body_profile = derived.body_profile;
    entry.resource_profile = derived.resource_profile;
    entry.hazard_profile = derived.hazard_profile;
    entry.stats_version = default_stats_version();
    entry.stats_source = source;
    sanitize_flora_profiles(entry);
}

fn apply_derived_fauna_stats(
    entry: &mut FaunaEntry,
    derived: DerivedFaunaStats,
    source: EcologyStatSource,
) {
    entry.combat_profile = derived.combat_profile;
    entry.body_profile = derived.body_profile;
    entry.behavior_profile = derived.behavior_profile;
    entry.skill_ids = derived.skill_ids;
    entry.stats_version = default_stats_version();
    entry.stats_source = source;
    sanitize_fauna_profiles(entry);
}

fn refresh_bundle_derived_stats(bundle: &mut EcologyBundle) -> RefreshDerivedStatsResponse {
    let mut updated_flora_count = 0usize;
    let mut updated_fauna_count = 0usize;
    let mut assigned_skill_count = 0usize;

    for flora in &mut bundle.flora {
        if flora.stats_source == EcologyStatSource::Manual {
            sanitize_flora_profiles(flora);
            continue;
        }
        let derived = derive_flora_stats(flora);
        let source = if flora.stats_source == EcologyStatSource::Generated {
            EcologyStatSource::Generated
        } else {
            EcologyStatSource::Backfilled
        };
        apply_derived_flora_stats(flora, derived, source);
        updated_flora_count += 1;
    }
    for fauna in &mut bundle.fauna {
        if fauna.stats_source == EcologyStatSource::Manual {
            sanitize_fauna_profiles(fauna);
            assigned_skill_count += fauna.skill_ids.len();
            continue;
        }
        let derived = derive_fauna_stats(fauna);
        let source = if fauna.stats_source == EcologyStatSource::Generated {
            EcologyStatSource::Generated
        } else {
            EcologyStatSource::Backfilled
        };
        assigned_skill_count += derived.skill_ids.len();
        apply_derived_fauna_stats(fauna, derived, source);
        updated_fauna_count += 1;
    }

    RefreshDerivedStatsResponse {
        updated_flora_count,
        updated_fauna_count,
        assigned_skill_count,
        stats_version: default_stats_version(),
    }
}

fn sanitize_flora_draft(mut draft: FloraDraft) -> FloraDraft {
    draft.name = draft.name.trim().to_string();
    draft.description = draft.description.trim().to_string();
    draft.agriculture_value = draft.agriculture_value.clamp(0, 100);
    draft.ecological_roles = dedupe_ids(
        draft
            .ecological_roles
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
    );
    draft.adaptations = dedupe_ids(
        draft
            .adaptations
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
    );
    if let Some(mut profile) = draft.body_profile.take() {
        profile.height_meters = clamp_f64(profile.height_meters, 0.1, 200.0);
        profile.spread_meters = clamp_f64(profile.spread_meters, 0.1, 200.0);
        profile.root_depth_meters = clamp_f64(profile.root_depth_meters, 0.05, 60.0);
        profile.biomass_kg = clamp_f64(profile.biomass_kg, 0.1, 500000.0);
        profile.lifespan_years = clamp_f64(profile.lifespan_years, 0.5, 5000.0);
        profile.growth_rate = clamp_i32(profile.growth_rate, 0, 100);
        draft.body_profile = Some(profile);
    }
    if let Some(mut profile) = draft.resource_profile.take() {
        profile.rarity = clamp_i32(profile.rarity, 0, 100);
        profile.yield_per_harvest = clamp_i32(profile.yield_per_harvest, 0, 100);
        profile.regrowth_days = clamp_i32(profile.regrowth_days, 1, 3650);
        profile.harvest_difficulty = clamp_i32(profile.harvest_difficulty, 0, 100);
        profile.nutrition_value = clamp_i32(profile.nutrition_value, 0, 100);
        profile.medicinal_value = clamp_i32(profile.medicinal_value, 0, 100);
        profile.fuel_value = clamp_i32(profile.fuel_value, 0, 100);
        profile.structural_value = clamp_i32(profile.structural_value, 0, 100);
        profile.concealment_value = clamp_i32(profile.concealment_value, 0, 100);
        draft.resource_profile = Some(profile);
    }
    if let Some(mut profile) = draft.hazard_profile.take() {
        profile.toxicity = clamp_i32(profile.toxicity, 0, 100);
        profile.irritation = clamp_i32(profile.irritation, 0, 100);
        profile.thorniness = clamp_i32(profile.thorniness, 0, 100);
        profile.flammability = clamp_i32(profile.flammability, 0, 100);
        profile.resilience = clamp_i32(profile.resilience, 0, 100);
        draft.hazard_profile = Some(profile);
    }
    draft
}

fn sanitize_fauna_draft(mut draft: FaunaDraft) -> FaunaDraft {
    draft.name = draft.name.trim().to_string();
    draft.description = draft.description.trim().to_string();
    draft.earth_analog = draft.earth_analog.trim().to_string();
    draft.ancestral_stock = draft.ancestral_stock.trim().to_string();
    draft.mutation_summary = draft.mutation_summary.trim().to_string();
    draft.divergence_summary = draft.divergence_summary.trim().to_string();
    draft.domestication_potential = draft.domestication_potential.clamp(0, 100);
    draft.danger_level = draft.danger_level.clamp(0, 100);
    draft.ecological_roles = dedupe_ids(
        draft
            .ecological_roles
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
    );
    draft.adaptations = dedupe_ids(
        draft
            .adaptations
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
    );
    draft.evolutionary_pressures = dedupe_ids(
        draft
            .evolutionary_pressures
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
    );
    if let Some(mut profile) = draft.combat_profile.take() {
        profile.level = clamp_i32(profile.level, 1, 20);
        profile.strength = clamp_i32(profile.strength, 1, 20);
        profile.agility = clamp_i32(profile.agility, 1, 20);
        profile.intelligence = clamp_i32(profile.intelligence, 1, 20);
        profile.wisdom = clamp_i32(profile.wisdom, 1, 20);
        profile.endurance = clamp_i32(profile.endurance, 1, 20);
        profile.charisma = clamp_i32(profile.charisma, 1, 20);
        profile.crit_chance = clamp_f64(profile.crit_chance, 0.0, 0.35);
        profile.resistance = clamp_f64(profile.resistance, 0.0, 0.5);
        profile.social_bonus = clamp_f64(profile.social_bonus, -0.25, 0.35);
        profile.base_evasion = clamp_i32(profile.base_evasion, 0, 40);
        profile.base_defense = clamp_i32(profile.base_defense, 0, 20);
        profile.base_hp_bonus = clamp_i32(profile.base_hp_bonus, 0, 32);
        profile.base_ap_bonus = clamp_i32(profile.base_ap_bonus, 0, 4);
        profile.base_mp_bonus = clamp_i32(profile.base_mp_bonus, 0, 4);
        draft.combat_profile = Some(profile);
    }
    if let Some(mut profile) = draft.body_profile.take() {
        profile.height_meters = clamp_f64(profile.height_meters, 0.1, 20.0);
        profile.length_meters = clamp_f64(profile.length_meters, 0.1, 40.0);
        profile.weight_kg = clamp_f64(profile.weight_kg, 0.1, 100000.0);
        draft.body_profile = Some(profile);
    }
    if let Some(mut profile) = draft.behavior_profile.take() {
        profile.pack_size_min = clamp_i32(profile.pack_size_min, 1, 500);
        profile.pack_size_max = clamp_i32(profile.pack_size_max, profile.pack_size_min, 500);
        profile.perception = clamp_i32(profile.perception, 0, 100);
        profile.stealth = clamp_i32(profile.stealth, 0, 100);
        profile.trainability = clamp_i32(profile.trainability, 0, 100);
        draft.behavior_profile = Some(profile);
    }
    draft
}

fn flora_entry_from_draft(draft: FloraDraft, biome_ids: &[String]) -> FloraEntry {
    let mut entry = FloraEntry {
        id: format!("flora-{}", Uuid::new_v4()),
        status: EntryStatus::Draft,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        ecological_roles: draft.ecological_roles,
        adaptations: draft.adaptations,
        edibility: draft.edibility,
        agriculture_value: draft.agriculture_value,
        biome_ids: biome_ids.to_vec(),
        vegetation_asset_batch_ids: Vec::new(),
        illustration_asset_batch_ids: Vec::new(),
        illustration_assets: Vec::new(),
        body_profile: draft.body_profile.unwrap_or_default(),
        resource_profile: draft.resource_profile.unwrap_or_default(),
        hazard_profile: draft.hazard_profile.unwrap_or_default(),
        stats_version: default_stats_version(),
        stats_source: EcologyStatSource::Generated,
        approved_at: None,
    };
    let fallback = derive_flora_stats(&entry);
    if flora_profiles_need_backfill(&entry) {
        apply_derived_flora_stats(&mut entry, fallback, EcologyStatSource::Generated);
    } else {
        sanitize_flora_profiles(&mut entry);
    }
    entry
}

fn fauna_entry_from_draft(draft: FaunaDraft, biome_ids: &[String]) -> FaunaEntry {
    let mut entry = FaunaEntry {
        id: format!("fauna-{}", Uuid::new_v4()),
        status: EntryStatus::Draft,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        ecological_roles: draft.ecological_roles,
        adaptations: draft.adaptations,
        domestication_potential: draft.domestication_potential,
        danger_level: draft.danger_level,
        biome_ids: biome_ids.to_vec(),
        earth_analog: draft.earth_analog,
        ancestral_stock: draft.ancestral_stock,
        evolutionary_pressures: draft.evolutionary_pressures,
        mutation_summary: draft.mutation_summary,
        divergence_summary: draft.divergence_summary,
        family_id: None,
        family_name: None,
        illustration_asset_batch_ids: Vec::new(),
        illustration_assets: Vec::new(),
        combat_profile: draft.combat_profile.unwrap_or_default(),
        body_profile: draft.body_profile.unwrap_or_default(),
        behavior_profile: draft.behavior_profile.unwrap_or_default(),
        skill_ids: Vec::new(),
        stats_version: default_stats_version(),
        stats_source: EcologyStatSource::Generated,
        exploration_sprite: None,
        approved_at: None,
    };
    let fallback = derive_fauna_stats(&entry);
    if fauna_profiles_need_backfill(&entry) {
        apply_derived_fauna_stats(&mut entry, fallback, EcologyStatSource::Generated);
    } else {
        entry.skill_ids = assign_fauna_skill_ids_from_profiles(&entry);
        sanitize_fauna_profiles(&mut entry);
    }
    entry
}

fn build_flora_batch_prompt(
    bundle: &EcologyBundle,
    user_prompt: &str,
    count: usize,
    biome_ids: &[String],
) -> String {
    let world_baseline = bundle
        .baselines
        .iter()
        .find(|entry| entry.scope == BaselineScope::World)
        .map(|entry| entry.summary.as_str())
        .unwrap_or("No world baseline approved yet.");
    let biome_block = if bundle.biomes.is_empty() {
        "No biome coverage entries exist yet.".to_string()
    } else {
        bundle
            .biomes
            .iter()
            .map(|entry| format!("- {}: {}", entry.id, entry.name))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let existing_names = bundle
        .flora
        .iter()
        .map(|entry| entry.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let biome_anchor_text = if biome_ids.is_empty() {
        "No specific biome ids were selected.".to_string()
    } else {
        format!(
            "Target biome ids for these entries: {}",
            biome_ids.join(", ")
        )
    };

    format!(
        "You are generating canonical flora entries for a science-minded fantasy worldbuilding archive.\n\
Return ONLY strict JSON matching this schema:\n\
{{\"entries\":[{{\"name\":\"...\",\"category\":\"tree\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"edibility\":\"none\",\"agricultureValue\":0,\"bodyProfile\":{{\"sizeClass\":\"medium\",\"heightMeters\":1,\"spreadMeters\":1,\"rootDepthMeters\":1,\"biomassKg\":1,\"lifespanYears\":1,\"growthRate\":50}},\"resourceProfile\":{{\"rarity\":0,\"yieldPerHarvest\":0,\"regrowthDays\":1,\"harvestDifficulty\":0,\"nutritionValue\":0,\"medicinalValue\":0,\"fuelValue\":0,\"structuralValue\":0,\"concealmentValue\":0}},\"hazardProfile\":{{\"toxicity\":0,\"irritation\":0,\"thorniness\":0,\"flammability\":0,\"resilience\":0}}}}]}}\n\
Generate exactly {} flora entries.\n\
User creative direction:\n{}\n\
World baseline summary:\n{}\n\
{}\n\
Available biome entries:\n{}\n\
Existing flora names to avoid:\n{}\n\
Rules:\n\
- Use only these flora categories: tree, shrub, grass, crop, fungus, aquatic, alien_other.\n\
- Use only these edibility values: none, limited, common.\n\
- agricultureValue must be an integer from 0 to 100.\n\
- bodyProfile, resourceProfile, and hazardProfile are required for every entry.\n\
- Keep entries distinct from each other.\n\
- Do not include markdown or commentary.\n",
        count,
        user_prompt,
        world_baseline,
        biome_anchor_text,
        biome_block,
        if existing_names.is_empty() { "None".to_string() } else { existing_names }
    )
}

fn build_fauna_batch_prompt(
    bundle: &EcologyBundle,
    user_prompt: &str,
    count: usize,
    biome_ids: &[String],
) -> String {
    let world_baseline = bundle
        .baselines
        .iter()
        .find(|entry| entry.scope == BaselineScope::World)
        .map(|entry| entry.summary.as_str())
        .unwrap_or("No world baseline approved yet.");
    let biome_block = if bundle.biomes.is_empty() {
        "No biome coverage entries exist yet.".to_string()
    } else {
        bundle
            .biomes
            .iter()
            .map(|entry| format!("- {}: {}", entry.id, entry.name))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let existing_names = bundle
        .fauna
        .iter()
        .map(|entry| entry.name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let biome_anchor_text = if biome_ids.is_empty() {
        "No specific biome ids were selected.".to_string()
    } else {
        format!(
            "Target biome ids for these entries: {}",
            biome_ids.join(", ")
        )
    };

    format!(
        "You are generating canonical fauna entries for a science-minded fantasy worldbuilding archive.\n\
Return ONLY strict JSON matching this schema:\n\
{{\"entries\":[{{\"name\":\"...\",\"category\":\"herbivore\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"domesticationPotential\":0,\"dangerLevel\":0,\"earthAnalog\":\"...\",\"ancestralStock\":\"...\",\"evolutionaryPressures\":[\"...\"],\"mutationSummary\":\"...\",\"divergenceSummary\":\"...\",\"combatProfile\":{{\"level\":1,\"strength\":10,\"agility\":10,\"intelligence\":5,\"wisdom\":5,\"endurance\":10,\"charisma\":5,\"critChance\":0.1,\"resistance\":0.1,\"socialBonus\":0.0,\"baseEvasion\":5,\"baseDefense\":2,\"baseHpBonus\":4,\"baseApBonus\":0,\"baseMpBonus\":0}},\"bodyProfile\":{{\"sizeClass\":\"medium\",\"heightMeters\":1,\"lengthMeters\":1,\"weightKg\":1,\"locomotion\":\"walker\",\"naturalWeapon\":\"bite\",\"armorClass\":\"furred\"}},\"behaviorProfile\":{{\"temperament\":\"docile\",\"activityCycle\":\"diurnal\",\"packSizeMin\":1,\"packSizeMax\":4,\"perception\":50,\"stealth\":20,\"trainability\":20}}}}]}}\n\
Generate exactly {} fauna entries.\n\
User creative direction:\n{}\n\
World baseline summary:\n{}\n\
{}\n\
Available biome entries:\n{}\n\
Existing fauna names to avoid:\n{}\n\
Rules:\n\
- Use only these fauna categories: herbivore, predator, omnivore, scavenger, avian, aquatic, beast_of_burden, companion, alien_other.\n\
- domesticationPotential and dangerLevel must be integers from 0 to 100.\n\
- combatProfile, bodyProfile, and behaviorProfile are required for every entry.\n\
- Keep entries distinct from each other.\n\
- earthAnalog should be short and concrete.\n\
- Do not invent custom skill definitions. The server assigns canonical animal skill ids.\n\
- Do not include markdown or commentary.\n",
        count,
        user_prompt,
        world_baseline,
        biome_anchor_text,
        biome_block,
        if existing_names.is_empty() { "None".to_string() } else { existing_names }
    )
}

fn sync_biomes_with_hierarchy(
    hierarchy: &HierarchyData,
    bundle: &mut EcologyBundle,
    report: Option<&worldgen_core::BiomeReport>,
) {
    let mut province_ids_by_biome: HashMap<String, Vec<u32>> = HashMap::new();
    for province in &hierarchy.provinces {
        let biome_id = province
            .biome_primary_id
            .clone()
            .or_else(|| biome_id_from_index(&bundle.archetypes, province.biome_primary).ok());
        if let Some(biome_id) = biome_id {
            province_ids_by_biome
                .entry(biome_id)
                .or_default()
                .push(province.id);
        }
    }

    let existing_by_id = bundle
        .biomes
        .iter()
        .cloned()
        .map(|entry| (entry.id.clone(), entry))
        .collect::<HashMap<_, _>>();
    let report_by_id = report
        .map(|report| {
            report
                .active_biomes
                .iter()
                .cloned()
                .map(|entry| (entry.biome_id.clone(), entry))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    let mut next = Vec::new();
    for (biome_id, mut province_ids) in province_ids_by_biome {
        province_ids.sort_unstable();
        province_ids.dedup();

        let Some(archetype) = bundle.archetypes.get_by_id(&biome_id) else {
            continue;
        };

        let existing = existing_by_id.get(&biome_id);
        next.push(BiomeEntry {
            id: biome_id.clone(),
            archetype_id: biome_id.clone(),
            status: existing
                .map(|entry| entry.status.clone())
                .unwrap_or(EntryStatus::Draft),
            name: existing
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| archetype.name.clone()),
            biome_type: biome_id.clone(),
            description: existing
                .map(|entry| entry.description.clone())
                .unwrap_or_else(|| "Calibrated biome coverage entry.".to_string()),
            typical_flora_ids: existing
                .map(|entry| entry.typical_flora_ids.clone())
                .unwrap_or_default(),
            typical_fauna_ids: existing
                .map(|entry| entry.typical_fauna_ids.clone())
                .unwrap_or_default(),
            province_count: province_ids.len() as u32,
            province_ids,
            pixel_share: report_by_id
                .get(&biome_id)
                .map(|entry| entry.pixel_share)
                .or_else(|| existing.map(|entry| entry.pixel_share))
                .unwrap_or(0.0),
            avg_confidence: report_by_id
                .get(&biome_id)
                .map(|entry| entry.avg_confidence)
                .or_else(|| existing.map(|entry| entry.avg_confidence))
                .unwrap_or(0.0),
            top_candidate_ids: report_by_id
                .get(&biome_id)
                .map(|entry| entry.top_candidate_ids.clone())
                .or_else(|| existing.map(|entry| entry.top_candidate_ids.clone()))
                .unwrap_or_default(),
            approved_at: existing.and_then(|entry| entry.approved_at.clone()),
        });
    }

    next.sort_by(|left, right| left.id.cmp(&right.id));
    bundle.biomes = next;
}

pub(crate) fn load_ecology_bundle(
    planets_dir: &FsPath,
    world_id: &str,
) -> Result<EcologyBundle, String> {
    let ecology_dir = ecology_dir(planets_dir, world_id);
    if !ecology_dir.exists() {
        return Ok(empty_bundle(world_id));
    }

    let bundle_path = ecology_dir.join("bundle.json");
    if bundle_path.exists() {
        let raw = fs::read_to_string(&bundle_path)
            .map_err(|e| format!("Failed to read bundle.json: {}", e))?;
        let mut bundle: EcologyBundle = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse bundle.json: {}", e))?;
        bundle.world_id = world_id.to_string();

        if bundle.archetypes.archetypes.is_empty() {
            bundle.archetypes = worldgen_core::BiomeRegistry::default_registry();
        }
        migrate_bundle_biome_ids(&mut bundle)?;
        normalize_loaded_bundle(&mut bundle);

        return Ok(bundle);
    }

    let mut bundle = empty_bundle(world_id);
    bundle.baselines = read_optional_json(ecology_dir.join("baselines.json"))?;
    bundle.flora = read_optional_json(ecology_dir.join("flora.json"))?;
    bundle.fauna = read_optional_json(ecology_dir.join("fauna.json"))?;
    bundle.biomes = read_optional_json(ecology_dir.join("biomes.json"))?;
    migrate_bundle_biome_ids(&mut bundle)?;
    normalize_loaded_bundle(&mut bundle);
    Ok(bundle)
}

fn save_ecology_bundle(
    planets_dir: &FsPath,
    world_id: &str,
    bundle: &EcologyBundle,
) -> Result<(), String> {
    let ecology_dir = ecology_dir(planets_dir, world_id);
    fs::create_dir_all(&ecology_dir).map_err(|e| format!("Failed to create ecology dir: {}", e))?;
    let mut normalized = bundle.clone();
    normalized.world_id = world_id.to_string();
    normalized.updated_at = Utc::now().to_rfc3339();
    migrate_bundle_biome_ids(&mut normalized)?;
    normalize_loaded_bundle(&mut normalized);

    write_json_file(ecology_dir.join("bundle.json"), &normalized)?;
    write_json_file(ecology_dir.join("baselines.json"), &normalized.baselines)?;
    write_json_file(ecology_dir.join("flora.json"), &normalized.flora)?;
    write_json_file(ecology_dir.join("fauna.json"), &normalized.fauna)?;
    write_json_file(ecology_dir.join("biomes.json"), &normalized.biomes)?;
    Ok(())
}

fn ecology_dir(planets_dir: &FsPath, world_id: &str) -> PathBuf {
    planets_dir.join(world_id).join("ecology")
}

pub(crate) fn empty_bundle(world_id: &str) -> EcologyBundle {
    EcologyBundle {
        world_id: world_id.to_string(),
        updated_at: Utc::now().to_rfc3339(),
        baselines: Vec::new(),
        flora: Vec::new(),
        fauna: Vec::new(),
        biomes: Vec::new(),
        archetypes: worldgen_core::BiomeRegistry::default_registry(),
        biome_model_settings: worldgen_core::BiomeModelSettings::default(),
    }
}

fn read_optional_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn write_json_file<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {}", path.display(), e))?;
    fs::write(&path, payload).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

struct HierarchyData {
    provinces: Vec<ProvinceRecord>,
    duchies: Vec<DuchyRecord>,
    kingdoms: Vec<KingdomRecord>,
}

fn load_hierarchy(planets_dir: &FsPath, world_id: &str) -> Result<HierarchyData, String> {
    let worldgen_dir = planets_dir.join(world_id).join("worldgen");
    let provinces: Vec<ProvinceRecord> = read_typed_json(worldgen_dir.join("provinces.json"))?;
    let duchies: Vec<DuchyRecord> = read_typed_json(worldgen_dir.join("duchies.json"))?;
    let kingdoms: Vec<KingdomRecord> = read_typed_json(worldgen_dir.join("kingdoms.json"))?;
    let regions_path = planets_dir.join(world_id).join("worldgen");
    let _ = regions_path;
    Ok(HierarchyData {
        provinces,
        duchies,
        kingdoms,
    })
}

fn load_biome_report(planets_dir: &FsPath, world_id: &str) -> Option<worldgen_core::BiomeReport> {
    read_typed_json::<worldgen_core::BiomeReport>(
        planets_dir
            .join(world_id)
            .join("worldgen")
            .join("biome_report.json"),
    )
    .ok()
}

fn biome_id_from_index(
    registry: &worldgen_core::BiomeRegistry,
    biome_index: u8,
) -> Result<String, String> {
    registry
        .archetypes
        .get(biome_index as usize)
        .map(|entry| entry.id.clone())
        .ok_or_else(|| {
            format!(
                "Biome index {} is out of range for current registry",
                biome_index
            )
        })
}

fn migrate_legacy_biome_id(
    registry: &worldgen_core::BiomeRegistry,
    raw_id: &str,
) -> Result<String, String> {
    if let Some(index) = raw_id
        .strip_prefix("biome-")
        .and_then(|value| value.parse::<usize>().ok())
    {
        return registry
            .archetypes
            .get(index)
            .map(|entry| entry.id.clone())
            .ok_or_else(|| format!("Invalid legacy biome index {}", index));
    }
    Ok(raw_id.to_string())
}

fn read_typed_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<T, String> {
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn build_world_baseline_prompt(hierarchy: &HierarchyData) -> String {
    let kingdom_summaries = hierarchy
        .kingdoms
        .iter()
        .map(|kingdom| {
            format!(
                "- stable kingdom id {} => {} ({} duchies)",
                kingdom.id,
                kingdom.name,
                kingdom.duchy_ids.len()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are building a canonical world ecology baseline for a science-minded fantasy worldbuilding tool.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Goal: define climate, flora, fauna and agriculture constraints that all child kingdoms must remain consistent with.\n\
Important: kingdom display names may be one-based labels while stable IDs are zero-based internal identifiers. Treat each listed stable ID and display name as the same kingdom. Do not renumber or rename kingdoms in the response.\n\
Kingdom overview:\n{}\n",
        kingdom_summaries
    )
}

fn build_kingdom_baseline_prompt(
    hierarchy: &HierarchyData,
    kingdom: &KingdomRecord,
    world_baseline: &EcologyBaseline,
) -> String {
    let duchies = hierarchy
        .duchies
        .iter()
        .filter(|duchy| duchy.kingdom_id == kingdom.id)
        .map(|duchy| {
            format!(
                "- stable duchy id {} => {} ({} provinces)",
                duchy.id,
                duchy.name,
                duchy.province_ids.len()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are refining a kingdom ecology baseline.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Parent world baseline summary: {}\n\
Parent climate directives: {:?}\n\
Target kingdom stable ID: {}.\n\
Target kingdom display name: {}.\n\
Important: the stable ID and the display name refer to the same kingdom. Display names may be one-based labels. Do not renumber the kingdom or describe a different kingdom.\n\
When referring to the target kingdom in prose, use \"Kingdom {}\" on first mention and optionally append the display name in parentheses, for example \"Kingdom {} ({})\". After that, prefer \"Kingdom {}\" over the display-name-only form.\n\
Duchies:\n{}\n",
        world_baseline.summary,
        world_baseline.climate_directives,
        kingdom.id,
        kingdom.name,
        kingdom.id,
        kingdom.id,
        kingdom.name,
        kingdom.id,
        duchies
    )
}

fn build_duchy_baseline_prompt(
    hierarchy: &HierarchyData,
    duchy: &DuchyRecord,
    kingdom_baseline: &EcologyBaseline,
) -> String {
    let provinces = duchy
        .province_ids
        .iter()
        .filter_map(|province_id| {
            hierarchy
                .provinces
                .iter()
                .find(|province| province.id == *province_id)
        })
        .map(|province| {
            format!(
                "- {} (area {}, biomePrimary {})",
                province.name, province.area, province.biome_primary
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are refining a duchy ecology baseline.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Parent kingdom baseline summary: {}\n\
Parent fauna directives: {:?}\n\
Target duchy stable ID: {}.\n\
Target duchy display name: {}.\n\
Parent kingdom stable ID: {}.\n\
Important: stable IDs and display names refer to the same entities. Display names may be one-based labels. Do not renumber the duchy or kingdom in the response.\n\
When referring to the target duchy in prose, use \"Duchy {}\" on first mention and optionally append the display name in parentheses, for example \"Duchy {} ({})\". After that, prefer \"Duchy {}\" over the display-name-only form.\n\
Provinces:\n{}\n",
        kingdom_baseline.summary,
        kingdom_baseline.fauna_directives,
        duchy.id,
        duchy.name,
        duchy.kingdom_id,
        duchy.id,
        duchy.id,
        duchy.name,
        duchy.id,
        provinces
    )
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
        .map_err(|e| format!("Failed to parse model JSON payload: {}", e))
}

fn model_response_excerpt(raw: &str) -> String {
    const LIMIT: usize = 400;
    let compact = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() <= LIMIT {
        compact
    } else {
        format!("{}...", &compact[..LIMIT])
    }
}

async fn generate_structured_text<T: for<'de> Deserialize<'de>>(
    label: &str,
    prompt: &str,
    schema_hint: &str,
) -> Result<T, String> {
    let raw = gemini::generate_text(prompt)
        .await
        .map_err(|(_, err)| err)?;
    parse_or_repair_structured_text(label, schema_hint, &raw).await
}

async fn parse_or_repair_structured_text<T: for<'de> Deserialize<'de>>(
    label: &str,
    schema_hint: &str,
    raw: &str,
) -> Result<T, String> {
    match parse_json_payload(raw) {
        Ok(parsed) => Ok(parsed),
        Err(parse_err) => {
            warn!(
                "Failed to parse {} Gemini response as strict JSON: {}. Raw excerpt: {}",
                label,
                parse_err,
                model_response_excerpt(raw)
            );
            let repair_prompt = format!(
                "Rewrite the following content as STRICT JSON ONLY.\n\
Do not add markdown fences, commentary, or explanations.\n\
Required schema:\n{}\n\
Content to repair:\n{}\n",
                schema_hint, raw
            );
            let repaired = gemini::generate_text(&repair_prompt)
                .await
                .map_err(|(_, err)| {
                    format!(
                        "Failed to parse {} response and repair attempt failed: {}. Original parse error: {}",
                        label, err, parse_err
                    )
                })?;
            parse_json_payload(&repaired).map_err(|repair_err| {
                format!(
                    "Failed to parse {} response. Original parse error: {}. Repair parse error: {}. Raw excerpt: {}",
                    label,
                    parse_err,
                    repair_err,
                    model_response_excerpt(raw)
                )
            })
        }
    }
}

fn get_approved_baseline<'a>(
    baselines: &'a [EcologyBaseline],
    scope: BaselineScope,
    entity_id: &BaselineEntityId,
) -> Result<&'a EcologyBaseline, String> {
    baselines
        .iter()
        .find(|entry| {
            entry.scope == scope
                && &entry.entity_id == entity_id
                && entry.status == EcologyStatus::Approved
        })
        .ok_or_else(|| match scope {
            BaselineScope::World => "Approved world baseline required".to_string(),
            BaselineScope::Kingdom => "Approved kingdom baseline required".to_string(),
            BaselineScope::Duchy => "Approved duchy baseline required".to_string(),
        })
}

fn find_baseline_mut<'a>(
    baselines: &'a mut [EcologyBaseline],
    scope: BaselineScope,
    entity_id: &BaselineEntityId,
) -> Option<&'a mut EcologyBaseline> {
    baselines
        .iter_mut()
        .find(|entry| entry.scope == scope && &entry.entity_id == entity_id)
}

fn upsert_world_baseline(baselines: &mut Vec<EcologyBaseline>, baseline: EcologyBaseline) {
    if let Some(index) = baselines
        .iter()
        .position(|entry| entry.scope == baseline.scope && entry.entity_id == baseline.entity_id)
    {
        baselines[index] = baseline;
    } else {
        baselines.push(baseline);
    }
}

fn dedupe_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| seen.insert(id.clone()))
        .collect()
}

fn validate_bundle_references(bundle: &EcologyBundle) -> Result<(), String> {
    let skill_ids = load_skill_registry()?
        .into_keys()
        .collect::<HashSet<String>>();

    for flora in &bundle.flora {
        for biome_id in &flora.biome_ids {
            if !bundle.biomes.iter().any(|entry| &entry.id == biome_id) {
                return Err(format!(
                    "Flora {} references missing biome {}",
                    flora.id, biome_id
                ));
            }
        }
        if flora.stats_version.trim().is_empty() {
            return Err(format!("Flora {} is missing statsVersion", flora.id));
        }
        if flora_profiles_need_backfill(flora) {
            return Err(format!(
                "Flora {} is missing required stat profiles",
                flora.id
            ));
        }
    }
    for fauna in &bundle.fauna {
        for biome_id in &fauna.biome_ids {
            if !bundle.biomes.iter().any(|entry| &entry.id == biome_id) {
                return Err(format!(
                    "Fauna {} references missing biome {}",
                    fauna.id, biome_id
                ));
            }
        }
        if fauna.stats_version.trim().is_empty() {
            return Err(format!("Fauna {} is missing statsVersion", fauna.id));
        }
        if fauna_profiles_need_backfill(fauna) {
            return Err(format!(
                "Fauna {} is missing required stat profiles",
                fauna.id
            ));
        }
        for skill_id in &fauna.skill_ids {
            if !skill_ids.contains(skill_id) {
                return Err(format!(
                    "Fauna {} references unknown skill {}",
                    fauna.id, skill_id
                ));
            }
        }
    }
    Ok(())
}

fn normalize_bundle_for_save(existing: &EcologyBundle, incoming: &mut EcologyBundle) {
    let _ = migrate_bundle_biome_ids(incoming);
    normalize_loaded_bundle(incoming);
    incoming.updated_at = Utc::now().to_rfc3339();
    normalize_baselines_for_save(&existing.baselines, &mut incoming.baselines);
    normalize_entry_status_for_save(&existing.flora, &mut incoming.flora);
    normalize_entry_status_for_save(&existing.fauna, &mut incoming.fauna);
    normalize_entry_status_for_save(&existing.biomes, &mut incoming.biomes);
}

fn normalize_loaded_bundle(bundle: &mut EcologyBundle) {
    if bundle.archetypes.archetypes.is_empty() {
        bundle.archetypes = worldgen_core::BiomeRegistry::default_registry();
    }

    backfill_biome_ids_from_reverse_links(bundle);
    derive_biome_reverse_links(bundle);

    for flora in &mut bundle.flora {
        sort_and_dedupe_strings(&mut flora.biome_ids);
        sort_and_dedupe_strings(&mut flora.vegetation_asset_batch_ids);
        sort_and_dedupe_strings(&mut flora.illustration_asset_batch_ids);
        sort_and_dedupe_asset_refs(&mut flora.illustration_assets);
        if flora_profiles_need_backfill(flora) {
            let derived = derive_flora_stats(flora);
            apply_derived_flora_stats(flora, derived, EcologyStatSource::Backfilled);
        } else {
            if flora.stats_version.trim().is_empty() {
                flora.stats_version = default_stats_version();
            }
            sanitize_flora_profiles(flora);
        }
    }
    for fauna in &mut bundle.fauna {
        sort_and_dedupe_strings(&mut fauna.biome_ids);
        sort_and_dedupe_strings(&mut fauna.illustration_asset_batch_ids);
        sort_and_dedupe_asset_refs(&mut fauna.illustration_assets);
        if fauna_profiles_need_backfill(fauna) {
            let derived = derive_fauna_stats(fauna);
            apply_derived_fauna_stats(fauna, derived, EcologyStatSource::Backfilled);
        } else {
            if fauna.skill_ids.is_empty() {
                fauna.skill_ids = assign_fauna_skill_ids_from_profiles(fauna);
            }
            if fauna.stats_version.trim().is_empty() {
                fauna.stats_version = default_stats_version();
            }
            sanitize_fauna_profiles(fauna);
        }
    }
    for biome in &mut bundle.biomes {
        biome.archetype_id = biome.id.clone();
        if biome.name.trim().is_empty() {
            if let Some(archetype) = bundle.archetypes.get_by_id(&biome.id) {
                biome.name = archetype.name.clone();
            }
        }
        if biome.biome_type.trim().is_empty() {
            biome.biome_type = biome.id.clone();
        }
        biome.province_count = biome.province_ids.len() as u32;
        biome.province_ids.sort_unstable();
        biome.province_ids.dedup();
        sort_and_dedupe_strings(&mut biome.top_candidate_ids);
    }
}

fn migrate_bundle_biome_ids(bundle: &mut EcologyBundle) -> Result<(), String> {
    for flora in &mut bundle.flora {
        for biome_id in &mut flora.biome_ids {
            *biome_id = migrate_legacy_biome_id(&bundle.archetypes, biome_id)?;
        }
    }
    for fauna in &mut bundle.fauna {
        for biome_id in &mut fauna.biome_ids {
            *biome_id = migrate_legacy_biome_id(&bundle.archetypes, biome_id)?;
        }
    }
    for biome in &mut bundle.biomes {
        biome.id = migrate_legacy_biome_id(&bundle.archetypes, &biome.id)?;
        biome.archetype_id = biome.id.clone();
        if biome.biome_type.parse::<usize>().is_ok() || biome.biome_type.starts_with("biome-") {
            biome.biome_type = biome.id.clone();
        }
    }
    Ok(())
}

fn backfill_biome_ids_from_reverse_links(bundle: &mut EcologyBundle) {
    if bundle.flora.iter().all(|entry| entry.biome_ids.is_empty())
        && bundle.fauna.iter().all(|entry| entry.biome_ids.is_empty())
    {
        let flora_index: HashMap<String, usize> = bundle
            .flora
            .iter()
            .enumerate()
            .map(|(idx, entry)| (entry.id.clone(), idx))
            .collect();
        let fauna_index: HashMap<String, usize> = bundle
            .fauna
            .iter()
            .enumerate()
            .map(|(idx, entry)| (entry.id.clone(), idx))
            .collect();

        let biome_links = bundle
            .biomes
            .iter()
            .map(|biome| {
                (
                    biome.id.clone(),
                    biome.typical_flora_ids.clone(),
                    biome.typical_fauna_ids.clone(),
                )
            })
            .collect::<Vec<_>>();

        for (biome_id, flora_ids, fauna_ids) in biome_links {
            for flora_id in &flora_ids {
                if let Some(index) = flora_index.get(flora_id) {
                    bundle.flora[*index].biome_ids.push(biome_id.clone());
                }
            }
            for fauna_id in &fauna_ids {
                if let Some(index) = fauna_index.get(fauna_id) {
                    bundle.fauna[*index].biome_ids.push(biome_id.clone());
                }
            }
        }
    }
}

fn derive_biome_reverse_links(bundle: &mut EcologyBundle) {
    let mut flora_by_biome: HashMap<&str, Vec<String>> = HashMap::new();
    let mut fauna_by_biome: HashMap<&str, Vec<String>> = HashMap::new();

    for flora in &bundle.flora {
        for biome_id in &flora.biome_ids {
            flora_by_biome
                .entry(biome_id.as_str())
                .or_default()
                .push(flora.id.clone());
        }
    }

    for fauna in &bundle.fauna {
        for biome_id in &fauna.biome_ids {
            fauna_by_biome
                .entry(biome_id.as_str())
                .or_default()
                .push(fauna.id.clone());
        }
    }

    for biome in &mut bundle.biomes {
        biome.typical_flora_ids = flora_by_biome.remove(biome.id.as_str()).unwrap_or_default();
        biome.typical_fauna_ids = fauna_by_biome.remove(biome.id.as_str()).unwrap_or_default();
        sort_and_dedupe_strings(&mut biome.typical_flora_ids);
        sort_and_dedupe_strings(&mut biome.typical_fauna_ids);
    }
}

fn sort_and_dedupe_strings(values: &mut Vec<String>) {
    values.sort();
    values.dedup();
}

fn dedupe_preserve_order(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value.clone());
        }
    }
    deduped
}

fn sort_and_dedupe_asset_refs(values: &mut Vec<AssetImageRef>) {
    values.sort_by(|left, right| {
        left.batch_id
            .cmp(&right.batch_id)
            .then(left.filename.cmp(&right.filename))
    });
    values
        .dedup_by(|left, right| left.batch_id == right.batch_id && left.filename == right.filename);
}

fn load_skill_registry() -> Result<HashMap<String, Skill>, String> {
    let current_dir =
        std::env::current_dir().map_err(|err| format!("Failed to read current dir: {}", err))?;
    let candidate_paths = [
        current_dir.join("../../packages/core/src/data/skills.json"),
        current_dir.join("../../../packages/core/src/data/skills.json"),
        current_dir.join("packages/core/src/data/skills.json"),
    ];
    let path = candidate_paths
        .iter()
        .find(|path| path.exists())
        .cloned()
        .ok_or_else(|| "Failed to locate skills.json".to_string())?;
    let raw =
        fs::read_to_string(&path).map_err(|err| format!("Failed to read skills.json: {}", err))?;
    let skills: Vec<Skill> = serde_json::from_str(&raw)
        .map_err(|err| format!("Failed to parse skills.json: {}", err))?;
    Ok(skills
        .into_iter()
        .map(|skill| (skill.id.clone(), skill))
        .collect())
}

pub fn fauna_to_tactical_entity(
    entry: &FaunaEntry,
    position: GridPos,
    is_player: bool,
) -> Result<TacticalEntity, String> {
    let skill_registry = load_skill_registry()?;
    let rules = load_rules_from_file();
    let base_stats = BaseStats {
        strength: entry.combat_profile.strength,
        agility: entry.combat_profile.agility,
        intelligence: entry.combat_profile.intelligence,
        wisdom: entry.combat_profile.wisdom,
        endurance: entry.combat_profile.endurance,
        charisma: entry.combat_profile.charisma,
        evasion: entry.combat_profile.base_evasion,
        defense: entry.combat_profile.base_defense,
    };
    let agi_scale = 2.5_f64;
    let endu_scale = 3.5_f64;
    let derived_defense = (agi_scale * ((base_stats.agility.max(0) as f64) + 1.0).ln()
        + endu_scale * ((base_stats.endurance.max(0) as f64) + 1.0).ln())
        as i32
        + base_stats.defense;
    let max_hp = 1.max(
        entry.combat_profile.endurance * rules.core.hp_per_endurance
            + rules.core.hp_base
            + entry.combat_profile.base_hp_bonus,
    );
    let max_ap = 1.max(
        rules.core.ap_base
            + entry.combat_profile.agility / rules.core.ap_agility_divisor
            + entry.combat_profile.base_ap_bonus,
    );
    let max_mp = 1.max(rules.core.mp_base + entry.combat_profile.base_mp_bonus);
    let mut skills = Vec::new();
    for skill_id in &entry.skill_ids {
        let Some(skill) = skill_registry.get(skill_id) else {
            return Err(format!(
                "Fauna {} references unknown skill {}",
                entry.id, skill_id
            ));
        };
        skills.push(skill.clone());
    }
    Ok(TacticalEntity {
        id: entry.id.clone(),
        is_player,
        name: entry.name.clone(),
        hp: max_hp,
        max_hp,
        strength: entry.combat_profile.strength,
        agility: entry.combat_profile.agility,
        intelligence: entry.combat_profile.intelligence,
        wisdom: entry.combat_profile.wisdom,
        endurance: entry.combat_profile.endurance,
        charisma: entry.combat_profile.charisma,
        crit_chance: entry.combat_profile.crit_chance,
        resistance: entry.combat_profile.resistance,
        social_bonus: entry.combat_profile.social_bonus,
        evasion: base_stats.evasion.max(0),
        defense: derived_defense.max(0),
        traits: Vec::new(),
        skills,
        occupation: None,
        progression: None,
        skill_cooldowns: HashMap::new(),
        ap: max_ap,
        max_ap,
        mp: max_mp,
        max_mp,
        level: entry.combat_profile.level,
        grid_pos: position,
        equipped: None,
        active_effects: None,
        base_stats,
    })
}

fn normalize_baselines_for_save(existing: &[EcologyBaseline], incoming: &mut [EcologyBaseline]) {
    for entry in incoming {
        if entry.status == EcologyStatus::Approved && entry.approved_at.is_none() {
            entry.approved_at = Some(Utc::now().to_rfc3339());
        }
        if let Some(previous) = existing.iter().find(|candidate| {
            candidate.scope == entry.scope && candidate.entity_id == entry.entity_id
        }) {
            if previous.status == EcologyStatus::Approved && previous != entry {
                entry.status = EcologyStatus::Draft;
                entry.approved_at = None;
            }
        }
    }
}

trait IdentifiedEntry {
    fn id(&self) -> &str;
    fn status(&self) -> &EntryStatus;
    fn status_mut(&mut self) -> &mut EntryStatus;
    fn approved_at_mut(&mut self) -> &mut Option<String>;
}

impl IdentifiedEntry for FloraEntry {
    fn id(&self) -> &str {
        &self.id
    }
    fn status(&self) -> &EntryStatus {
        &self.status
    }
    fn status_mut(&mut self) -> &mut EntryStatus {
        &mut self.status
    }
    fn approved_at_mut(&mut self) -> &mut Option<String> {
        &mut self.approved_at
    }
}

impl IdentifiedEntry for FaunaEntry {
    fn id(&self) -> &str {
        &self.id
    }
    fn status(&self) -> &EntryStatus {
        &self.status
    }
    fn status_mut(&mut self) -> &mut EntryStatus {
        &mut self.status
    }
    fn approved_at_mut(&mut self) -> &mut Option<String> {
        &mut self.approved_at
    }
}

impl IdentifiedEntry for BiomeEntry {
    fn id(&self) -> &str {
        &self.id
    }
    fn status(&self) -> &EntryStatus {
        &self.status
    }
    fn status_mut(&mut self) -> &mut EntryStatus {
        &mut self.status
    }
    fn approved_at_mut(&mut self) -> &mut Option<String> {
        &mut self.approved_at
    }
}

fn normalize_entry_status_for_save<T>(existing: &[T], incoming: &mut [T])
where
    T: IdentifiedEntry + PartialEq,
{
    for entry in incoming {
        if *entry.status() == EntryStatus::Approved && entry.approved_at_mut().is_none() {
            *entry.approved_at_mut() = Some(Utc::now().to_rfc3339());
        }
        if let Some(previous) = existing
            .iter()
            .find(|candidate| candidate.id() == entry.id())
        {
            if *previous.status() == EntryStatus::Approved && previous != entry {
                *entry.status_mut() = EntryStatus::Draft;
                *entry.approved_at_mut() = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worldgen_pipeline;
    use image::{Rgb, RgbImage};

    fn test_bundle(world_id: &str) -> EcologyBundle {
        EcologyBundle {
            world_id: world_id.to_string(),
            updated_at: Utc::now().to_rfc3339(),
            baselines: Vec::new(),
            flora: Vec::new(),
            fauna: Vec::new(),
            biomes: Vec::new(),
            archetypes: worldgen_core::BiomeRegistry::default_registry(),
            biome_model_settings: worldgen_core::BiomeModelSettings::default(),
        }
    }

    fn temp_world_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("ashtrail-ecology-{}-{}", label, Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn approved_baseline(
        scope: BaselineScope,
        entity_id: BaselineEntityId,
        parent: Option<BaselineEntityId>,
    ) -> EcologyBaseline {
        EcologyBaseline {
            scope,
            entity_id,
            parent_entity_id: parent,
            status: EcologyStatus::Approved,
            summary: "approved".to_string(),
            climate_directives: vec!["stable".to_string()],
            flora_directives: vec!["reuse".to_string()],
            fauna_directives: vec!["reuse".to_string()],
            agriculture_directives: vec!["fertile".to_string()],
            consistency_rules: vec!["keep coherent".to_string()],
            generated_at: Some(Utc::now().to_rfc3339()),
            approved_at: Some(Utc::now().to_rfc3339()),
        }
    }

    fn test_flora_entry(id: &str, name: &str, category: FloraCategory) -> FloraEntry {
        let mut entry = FloraEntry {
            id: id.to_string(),
            status: EntryStatus::Draft,
            name: name.to_string(),
            category,
            description: String::new(),
            ecological_roles: Vec::new(),
            adaptations: Vec::new(),
            edibility: FloraEdibility::None,
            agriculture_value: 10,
            biome_ids: Vec::new(),
            vegetation_asset_batch_ids: Vec::new(),
            illustration_asset_batch_ids: Vec::new(),
            illustration_assets: Vec::new(),
            body_profile: FloraBodyProfile::default(),
            resource_profile: FloraResourceProfile::default(),
            hazard_profile: FloraHazardProfile::default(),
            stats_version: String::new(),
            stats_source: EcologyStatSource::Backfilled,
            approved_at: None,
        };
        let derived = derive_flora_stats(&entry);
        apply_derived_flora_stats(&mut entry, derived, EcologyStatSource::Backfilled);
        entry
    }

    fn test_fauna_entry(id: &str, name: &str, category: FaunaCategory) -> FaunaEntry {
        let mut entry = FaunaEntry {
            id: id.to_string(),
            status: EntryStatus::Draft,
            name: name.to_string(),
            category,
            description: String::new(),
            ecological_roles: Vec::new(),
            adaptations: Vec::new(),
            domestication_potential: 25,
            danger_level: 25,
            biome_ids: Vec::new(),
            earth_analog: String::new(),
            ancestral_stock: String::new(),
            evolutionary_pressures: Vec::new(),
            mutation_summary: String::new(),
            divergence_summary: String::new(),
            family_id: None,
            family_name: None,
            illustration_asset_batch_ids: Vec::new(),
            illustration_assets: Vec::new(),
            combat_profile: FaunaCombatProfile::default(),
            body_profile: FaunaBodyProfile::default(),
            behavior_profile: FaunaBehaviorProfile::default(),
            skill_ids: Vec::new(),
            stats_version: String::new(),
            stats_source: EcologyStatSource::Backfilled,
            exploration_sprite: None,
            approved_at: None,
        };
        let derived = derive_fauna_stats(&entry);
        apply_derived_fauna_stats(&mut entry, derived, EcologyStatSource::Backfilled);
        entry
    }

    #[test]
    fn bundle_round_trip_writes_split_files() {
        let planets_dir = temp_world_dir("bundle");
        let mut bundle = test_bundle("world-1");
        bundle.baselines = vec![approved_baseline(
            BaselineScope::World,
            BaselineEntityId::World("world".to_string()),
            None,
        )];
        save_ecology_bundle(&planets_dir, "world-1", &bundle).expect("save bundle");
        let loaded = load_ecology_bundle(&planets_dir, "world-1").expect("load bundle");
        assert_eq!(loaded.world_id, "world-1");
        assert_eq!(loaded.baselines.len(), 1);
        assert!(planets_dir
            .join("world-1")
            .join("ecology")
            .join("flora.json")
            .exists());
    }

    #[test]
    fn migrate_bundle_biome_ids_maps_legacy_biome_refs_to_archetype_ids() {
        let mut bundle = test_bundle("world");
        let expected_id = bundle.archetypes.archetypes[2].id.clone();
        let mut legacy_flora = test_flora_entry("flora-1", "Legacy Flora", FloraCategory::Tree);
        legacy_flora.biome_ids = vec!["biome-2".to_string()];
        bundle.flora.push(legacy_flora);
        let mut legacy_fauna =
            test_fauna_entry("fauna-1", "Legacy Fauna", FaunaCategory::Herbivore);
        legacy_fauna.biome_ids = vec!["biome-2".to_string()];
        bundle.fauna.push(legacy_fauna);
        bundle.biomes.push(BiomeEntry {
            id: "biome-2".to_string(),
            archetype_id: "biome-2".to_string(),
            status: EntryStatus::Draft,
            name: "Legacy Biome".to_string(),
            biome_type: "2".to_string(),
            description: String::new(),
            typical_flora_ids: Vec::new(),
            typical_fauna_ids: Vec::new(),
            province_ids: vec![1],
            province_count: 1,
            pixel_share: 0.0,
            avg_confidence: 0.0,
            top_candidate_ids: Vec::new(),
            approved_at: None,
        });

        migrate_bundle_biome_ids(&mut bundle).expect("legacy biome ids should migrate");

        assert_eq!(bundle.flora[0].biome_ids, vec![expected_id.clone()]);
        assert_eq!(bundle.fauna[0].biome_ids, vec![expected_id.clone()]);
        assert_eq!(bundle.biomes[0].id, expected_id);
        assert_eq!(bundle.biomes[0].archetype_id, bundle.biomes[0].id);
        assert_eq!(bundle.biomes[0].biome_type, bundle.biomes[0].id);
    }

    #[test]
    fn sync_biomes_with_hierarchy_uses_canonical_ids_and_report_metrics() {
        let mut bundle = test_bundle("world");
        let ocean_id = bundle.archetypes.archetypes[2].id.clone();
        let desert_id = bundle.archetypes.archetypes[9].id.clone();
        let hierarchy = HierarchyData {
            provinces: vec![
                ProvinceRecord {
                    id: 10,
                    seed_x: 0,
                    seed_y: 0,
                    area: 12,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 2,
                    biome_primary_id: Some(ocean_id.clone()),
                    biome_confidence: Some(0.82),
                    biome_candidate_ids: vec![ocean_id.clone(), desert_id.clone()],
                    name: "Alpha".to_string(),
                    wealth: None,
                    development: None,
                    population: None,
                },
                ProvinceRecord {
                    id: 11,
                    seed_x: 1,
                    seed_y: 0,
                    area: 8,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 9,
                    biome_primary_id: Some(desert_id.clone()),
                    biome_confidence: Some(0.61),
                    biome_candidate_ids: vec![desert_id.clone(), ocean_id.clone()],
                    name: "Beta".to_string(),
                    wealth: None,
                    development: None,
                    population: None,
                },
            ],
            duchies: Vec::new(),
            kingdoms: Vec::new(),
        };
        let report = worldgen_core::BiomeReport {
            width: 2,
            height: 1,
            analysis_version: "test-v1".to_string(),
            source_image_hash: None,
            vision_available: false,
            vision_model_id: None,
            confidence_floor: 0.35,
            average_confidence: 0.72,
            low_confidence_pixel_count: 0,
            active_biomes: vec![
                worldgen_core::BiomeCoverageSummary {
                    biome_id: ocean_id.clone(),
                    name: "Ocean".to_string(),
                    hex_color: "#336699".to_string(),
                    pixel_count: 120,
                    pixel_share: 0.6,
                    avg_confidence: 0.82,
                    province_count: 1,
                    top_candidate_ids: vec![desert_id.clone()],
                },
                worldgen_core::BiomeCoverageSummary {
                    biome_id: desert_id.clone(),
                    name: "Desert".to_string(),
                    hex_color: "#c8a25f".to_string(),
                    pixel_count: 80,
                    pixel_share: 0.4,
                    avg_confidence: 0.61,
                    province_count: 1,
                    top_candidate_ids: vec![ocean_id.clone()],
                },
            ],
            province_summaries: Vec::new(),
        };

        sync_biomes_with_hierarchy(&hierarchy, &mut bundle, Some(&report));

        assert_eq!(bundle.biomes.len(), 2);
        assert_eq!(bundle.biomes[0].id, desert_id);
        assert_eq!(bundle.biomes[0].archetype_id, bundle.biomes[0].id);
        assert_eq!(bundle.biomes[0].province_ids, vec![11]);
        assert_eq!(bundle.biomes[0].province_count, 1);
        assert_eq!(bundle.biomes[0].pixel_share, 0.4);
        assert_eq!(bundle.biomes[0].avg_confidence, 0.61);
        assert_eq!(bundle.biomes[0].top_candidate_ids, vec![ocean_id.clone()]);

        assert_eq!(bundle.biomes[1].id, ocean_id);
        assert_eq!(bundle.biomes[1].province_ids, vec![10]);
        assert_eq!(bundle.biomes[1].province_count, 1);
        assert_eq!(bundle.biomes[1].pixel_share, 0.6);
        assert_eq!(bundle.biomes[1].avg_confidence, 0.82);
        assert_eq!(
            bundle.biomes[1].top_candidate_ids,
            vec![bundle.biomes[0].id.clone()]
        );
    }

    #[test]
    fn auto_cache_isolated_province_creates_png() {
        let planets_dir = temp_world_dir("isolate-planets");
        let isolated_root = temp_world_dir("isolate-assets");
        let world_dir = planets_dir.join("world-a");
        let worldgen_dir = world_dir.join("worldgen");
        let textures_dir = world_dir.join("textures");
        fs::create_dir_all(&worldgen_dir).expect("create worldgen dir");
        fs::create_dir_all(&textures_dir).expect("create textures dir");

        let mut base = RgbImage::new(2, 2);
        base.put_pixel(0, 0, Rgb([255, 0, 0]));
        base.put_pixel(1, 0, Rgb([0, 255, 0]));
        base.put_pixel(0, 1, Rgb([0, 0, 255]));
        base.put_pixel(1, 1, Rgb([255, 255, 0]));
        base.save(textures_dir.join("base.jpg")).expect("save base");

        let province_img = image::RgbImage::from_fn(2, 2, |x, _y| {
            if x == 0 {
                image::Rgb([1, 0, 0])
            } else {
                image::Rgb([2, 0, 0])
            }
        });
        province_img
            .save(worldgen_dir.join("province_id.png"))
            .expect("save province ids");

        fs::write(
            worldgen_dir.join("provinces.json"),
            serde_json::to_string_pretty(&vec![
                ProvinceRecord {
                    id: 1,
                    seed_x: 0,
                    seed_y: 0,
                    area: 2,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 3,
                    biome_primary_id: None,
                    biome_confidence: None,
                    biome_candidate_ids: Vec::new(),
                    name: "P1".to_string(),
                    population: None,
                    wealth: None,
                    development: None,
                },
                ProvinceRecord {
                    id: 2,
                    seed_x: 1,
                    seed_y: 0,
                    area: 2,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 3,
                    biome_primary_id: None,
                    biome_confidence: None,
                    biome_candidate_ids: Vec::new(),
                    name: "P2".to_string(),
                    population: None,
                    wealth: None,
                    development: None,
                },
            ])
            .unwrap(),
        )
        .expect("save provinces");
        fs::write(
            worldgen_dir.join("duchies.json"),
            serde_json::to_string_pretty(&vec![DuchyRecord {
                id: 1,
                province_ids: vec![1, 2],
                kingdom_id: 1,
                name: "D1".to_string(),
            }])
            .unwrap(),
        )
        .expect("save duchies");
        fs::write(
            worldgen_dir.join("kingdoms.json"),
            serde_json::to_string_pretty(&vec![KingdomRecord {
                id: 1,
                duchy_ids: vec![1],
                name: "K1".to_string(),
            }])
            .unwrap(),
        )
        .expect("save kingdoms");

        let filename = worldgen_pipeline::ensure_isolated_province_asset(
            &planets_dir,
            &isolated_root,
            "world-a",
            1,
        )
        .expect("ensure isolated province");
        assert_eq!(filename, "province_1.png");
        assert!(isolated_root
            .join("world-a")
            .join("province_1.png")
            .exists());
    }

    #[test]
    fn normalize_loaded_bundle_backfills_missing_ecology_stats() {
        let mut bundle = test_bundle("world");
        bundle.flora.push(FloraEntry {
            stats_version: String::new(),
            ..test_flora_entry("flora-stats", "Salt Reed", FloraCategory::Grass)
        });
        bundle.flora[0].body_profile = FloraBodyProfile::default();
        bundle.flora[0].resource_profile = FloraResourceProfile::default();
        bundle.flora[0].hazard_profile = FloraHazardProfile::default();
        bundle.fauna.push(FaunaEntry {
            stats_version: String::new(),
            skill_ids: Vec::new(),
            ..test_fauna_entry("fauna-stats", "Mire Stalker", FaunaCategory::Predator)
        });
        bundle.fauna[0].combat_profile = FaunaCombatProfile::default();
        bundle.fauna[0].body_profile = FaunaBodyProfile::default();
        bundle.fauna[0].behavior_profile = FaunaBehaviorProfile::default();

        normalize_loaded_bundle(&mut bundle);

        assert_eq!(bundle.flora[0].stats_version, ECOLOGY_STATS_VERSION);
        assert!(bundle.flora[0].body_profile.height_meters > 0.0);
        assert!(bundle.fauna[0].combat_profile.level >= 1);
        assert!(!bundle.fauna[0].skill_ids.is_empty());
    }

    #[test]
    fn fauna_skill_assignment_tracks_profile_traits() {
        let mut fauna = test_fauna_entry("fauna-skills", "Burrow Fang", FaunaCategory::Predator);
        fauna.combat_profile.agility = 10;
        fauna.body_profile.locomotion = FaunaLocomotion::Burrower;
        fauna.body_profile.natural_weapon = FaunaNaturalWeapon::Venom;
        fauna.behavior_profile.stealth = 82;
        fauna.behavior_profile.pack_size_max = 6;

        let skills = assign_fauna_skill_ids_from_profiles(&fauna);

        assert!(skills.contains(&"animal-venom-strike".to_string()));
        assert!(skills.contains(&"animal-burrow-dash".to_string()));
        assert!(skills.contains(&"animal-camouflage".to_string()));
        assert!(skills.contains(&"animal-pack-howl".to_string()));
    }

    #[test]
    fn validation_rejects_unknown_fauna_skill_ids() {
        let mut bundle = test_bundle("world");
        let mut fauna = test_fauna_entry("fauna-bad-skill", "Odd Beast", FaunaCategory::Omnivore);
        fauna.skill_ids = vec!["not-a-real-skill".to_string()];
        bundle.fauna.push(fauna);

        let err = validate_bundle_references(&bundle).expect_err("unknown skill should fail");
        assert!(err.contains("unknown skill"));
    }

    #[test]
    fn fauna_to_tactical_entity_produces_combat_ready_actor() {
        let mut fauna = test_fauna_entry("fauna-combat", "Sky Raptor", FaunaCategory::Avian);
        fauna.skill_ids = vec!["animal-peck".to_string(), "animal-screech".to_string()];

        let entity = fauna_to_tactical_entity(&fauna, GridPos { row: 2, col: 3 }, false)
            .expect("fauna entity should build");

        assert_eq!(entity.id, "fauna-combat");
        assert_eq!(entity.grid_pos.row, 2);
        assert_eq!(entity.grid_pos.col, 3);
        assert_eq!(entity.skills.len(), 2);
        assert!(entity.max_hp > 0);
        assert!(entity.max_ap > 0);
        assert!(entity.max_mp > 0);
    }
}
