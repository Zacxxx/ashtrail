mod ai_characters;
mod ai_events;
mod ai_quests;
mod asset_packs;
mod cell_analyzer;
mod cms;
mod combat_engine;
mod ecology;
mod exploration_jobs;
mod gemini;
mod generator;
mod hierarchy;
mod jobs;
mod locations;
mod quest_ai;
mod worldgen_pipeline;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use base64::Engine as _;
use generator::{
    generate_hybrid_with_progress_and_cancel, generate_world_with_progress_and_cancel,
    load_cached_response, request_cache_key, save_cached_response, GenerateTerrainRequest,
    GenerateTerrainResponse,
};
use hierarchy::{generate_full_planet_hierarchy, HierarchyGenerateRequest, PlanetManifest};
use jobs::{now_ms, JobOutputRef, JobRecord, JobStatus};
use serde::Deserialize;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    net::SocketAddr,
    path::PathBuf,
    sync::atomic::AtomicUsize,
    sync::{Arc, Mutex},
};
use tokio::sync::Semaphore;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::{error, info, warn};
use uuid::Uuid;
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};
use worldgen_core::graph::ProvinceAdjacency;

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    quest_runtime: quest_ai::QuestRuntime,
    exploration_runtime: exploration_jobs::ExplorationGenerationRuntime,
    planets_dir: PathBuf,
    planet_root: PathBuf,
    icons_dir: PathBuf,
    icons_export_dir: PathBuf,
    textures_dir: PathBuf,
    textures_export_dir: PathBuf,
    sprites_dir: PathBuf,
    isolated_dir: PathBuf,
    packs_dir: PathBuf,
    refine_limiter: RefineLimiter,
    supabase: Option<SupabaseStorageConfig>,
}

#[derive(Clone)]
struct RefineLimiter {
    semaphore: Arc<Semaphore>,
    max_concurrent: usize,
    max_queue: usize,
    outstanding: Arc<AtomicUsize>,
}

#[derive(Clone)]
struct SupabaseStorageConfig {
    url: String,
    service_role_key: String,
    bucket: String,
    prefix: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartJobResponse {
    job_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobStatusResponse {
    job_id: String,
    status: JobStatus,
    progress: f32,
    current_stage: String,
    result: Option<serde_json::Value>,
    error: Option<String>,
    kind: String,
    title: String,
    tool: String,
    world_id: Option<String>,
    run_id: Option<String>,
    parent_job_id: Option<String>,
    metadata: Option<serde_json::Value>,
    output_refs: Vec<JobOutputRef>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobSummaryResponse {
    jobs: Vec<JobListItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HumanityReadinessResponse {
    ready: bool,
    blockers: Vec<String>,
    main_lore_chars: usize,
    min_main_lore_chars: usize,
    has_main_lore: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HumanityAdoptionRequest {
    #[serde(default = "locations::default_scope_mode")]
    scope_mode: locations::LocationGenerationScopeMode,
    #[serde(default)]
    scope_targets: Vec<locations::LocationScopeTarget>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobListItem {
    job_id: String,
    kind: String,
    title: String,
    tool: String,
    status: JobStatus,
    progress: f32,
    current_stage: String,
    world_id: Option<String>,
    run_id: Option<String>,
    parent_job_id: Option<String>,
    metadata: Option<serde_json::Value>,
    output_refs: Vec<JobOutputRef>,
    error: Option<String>,
    created_at: u64,
    updated_at: u64,
}

pub(crate) fn make_job_record(
    kind: &str,
    title: &str,
    tool: &str,
    stage: &str,
    world_id: Option<String>,
    run_id: Option<String>,
) -> JobRecord {
    let mut job = JobRecord::new(kind, title, tool);
    job.world_id = world_id;
    job.run_id = run_id;
    job.current_stage = stage.to_string();
    job
}

pub(crate) fn parse_tracked_job_meta(headers: &HeaderMap) -> Option<TrackedJobMeta> {
    let encoded = headers.get("x-ashtrail-job-meta")?.to_str().ok()?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .ok()?;
    serde_json::from_slice::<TrackedJobMeta>(&decoded).ok()
}

pub(crate) fn build_text_output_ref(label: &str, text: &str) -> JobOutputRef {
    JobOutputRef {
        id: "text-output".to_string(),
        label: label.to_string(),
        kind: "text".to_string(),
        href: None,
        route: None,
        preview_text: Some(text.chars().take(220).collect()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratePlanetResponse {
    manifest: PlanetManifest,
    run_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanetPreviewRequest {
    config: geo_core::SimulationConfig,
    cols: Option<u32>,
    rows: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanetHybridRequest {
    config: geo_core::SimulationConfig,
    prompt: String,
    cols: Option<u32>,
    rows: Option<u32>,
    temperature: Option<f32>,
    generate_cells: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTextRequest {
    prompt: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackedJobMeta {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    restore: Option<serde_json::Value>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanetImageEditRequest {
    prompt: String,
    base64_image: String,
    temperature: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoreQueryRequest {
    lon: f32,
    lat: f32,
    biome: String,
    temperature: f32,
    elevation: f32,
    resources: Vec<String>,
    world_context: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoreQueryResponse {
    raw_json: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IconBatchRequest {
    prompts: Vec<String>,
    style_prompt: Option<String>,
    base64_image: Option<String>,
    batch_name: Option<String>,
    temperature: Option<f32>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BuildingMetadata {
    is_natural: bool,
    is_passable: bool,
    is_hidden: bool,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerrainMetadata {
    is_natural: bool,
    move_efficiency: f32,
    fertility: f32,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EcologyLink {
    kind: String,
    id: String,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameAssetGrouping {
    #[serde(rename = "type")]
    group_type: String, // "biome" or "structure"
    name: String,
    description: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameAssetInfo {
    #[serde(rename = "type")]
    asset_type: String, // "building" or "terrain" or "vegetation"
    metadata: serde_json::Value,
    grouping: Option<GameAssetGrouping>,
    #[serde(default)]
    ecology_link: Option<EcologyLink>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpriteLinkTarget {
    kind: String,
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpriteBatchRequest {
    prompts: Vec<String>,
    style_prompt: Option<String>,
    base64_image: Option<String>,
    batch_name: Option<String>,
    temperature: Option<f32>,
    sprite_type: String,
    mode: String,
    include_illustration: Option<bool>,
    target: Option<SpriteLinkTarget>,
    world_id: Option<String>,
    source_entity_type: Option<String>,
    source_entity_id: Option<String>,
    #[serde(default)]
    biome_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DirectionalSpriteFrame {
    direction: String,
    url: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeneratedSpriteSet {
    sprite_id: String,
    prompt: String,
    style_prompt: String,
    item_prompt: String,
    actor_type: String,
    mode: String,
    preview_url: String,
    #[serde(default)]
    directions: Vec<DirectionalSpriteFrame>,
    illustration_url: Option<String>,
    target: Option<SpriteLinkTarget>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpriteBatchManifest {
    batch_id: String,
    #[serde(default)]
    batch_name: String,
    created_at: String,
    sprite_type: String,
    mode: String,
    #[serde(default)]
    includes_illustration: bool,
    target: Option<SpriteLinkTarget>,
    world_id: Option<String>,
    source_entity_type: Option<String>,
    source_entity_id: Option<String>,
    #[serde(default)]
    biome_ids: Vec<String>,
    sprites: Vec<GeneratedSpriteSet>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SpriteBatchSummary {
    batch_id: String,
    batch_name: String,
    created_at: String,
    sprite_type: String,
    mode: String,
    #[serde(default)]
    includes_illustration: bool,
    sprite_count: usize,
    target: Option<SpriteLinkTarget>,
    thumbnail_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextureBatchRequest {
    prompts: Vec<String>,
    style_prompt: Option<String>,
    base64_image: Option<String>,
    batch_name: Option<String>,
    temperature: Option<f32>,
    category: String, // "battle_assets", "character", "item", "world_assets", "game_assets"
    sub_category: Option<String>, // "ground", "obstacle"
    game_asset: Option<GameAssetInfo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameBatchRequest {
    new_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegenerateIconRequest {
    item_prompt: String,
    style_prompt: String,
    base64_image: Option<String>,
    temperature: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegenerateTextureRequest {
    item_prompt: String,
    style_prompt: String,
    base64_image: Option<String>,
    temperature: Option<f32>,
    category: String,
    sub_category: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchManifest {
    batch_id: String,
    #[serde(default)]
    batch_name: String,
    created_at: String,
    icons: Vec<BatchIcon>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchIcon {
    filename: String,
    prompt: String,
    #[serde(default)]
    style_prompt: String,
    #[serde(default)]
    item_prompt: String,
    url: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TextureBatchManifest {
    batch_id: String,
    #[serde(default)]
    batch_name: String,
    created_at: String,
    category: String,
    sub_category: Option<String>,
    #[serde(default)]
    game_asset: Option<GameAssetInfo>,
    textures: Vec<BatchTexture>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchTexture {
    filename: String,
    prompt: String,
    #[serde(default)]
    style_prompt: String,
    #[serde(default)]
    item_prompt: String,
    url: String,
    #[serde(default)]
    metadata: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchSummary {
    batch_id: String,
    batch_name: String,
    icon_count: usize,
    created_at: String,
    thumbnail_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TextureBatchSummary {
    batch_id: String,
    batch_name: String,
    texture_count: usize,
    created_at: String,
    category: String,
    sub_category: Option<String>,
    #[serde(default)]
    game_asset: Option<GameAssetInfo>,
    thumbnail_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseBrowseQuery {
    prefix: Option<String>,
    images_only: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseObjectInfo {
    path: String,
    name: String,
    size_bytes: Option<u64>,
    updated_at: Option<String>,
    public_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseBrowseResponse {
    prefix: String,
    objects: Vec<SupabaseObjectInfo>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SupabaseSyncRequest {
    direction: Option<String>,
    images_only: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseSyncResponse {
    direction: String,
    uploaded: usize,
    downloaded: usize,
    skipped: usize,
    failed: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HierarchyReassignRequest {
    entity_type: String,
    entity_id: u32,
    target_id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HierarchyReassignResponse {
    success: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HierarchyRenameRequest {
    entity_type: String,
    entity_id: u32,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HierarchyRenameResponse {
    success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContinentRecord {
    id: u32,
    kingdom_ids: Vec<u32>,
    duchy_ids: Vec<u32>,
    province_ids: Vec<u32>,
    name: String,
}

#[derive(Clone)]
struct RemoteObject {
    path: String,
    updated_at: Option<String>,
    size_bytes: Option<u64>,
}

/// List saved planet cache entries.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedEntry {
    cache_key: String,
    file_name: String,
    size_bytes: u64,
    modified: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_thread_names(true)
        .compact()
        .init();

    for path in &[
        "../../../.env.local",
        "../../../.env",
        "../../.env.local",
        "../../.env",
        "../.env.local",
        "../.env",
        ".env.local",
        ".env",
    ] {
        dotenv::from_path(path).ok();
    }
    dotenv::dotenv().ok();

    // Single source of truth for all planets
    let planets_dir = PathBuf::from("generated/planets");
    std::fs::create_dir_all(&planets_dir).expect("failed to create planets directory");

    let icons_dir = PathBuf::from("../../game-assets/assets/Icons");
    std::fs::create_dir_all(&icons_dir)
        .expect("failed to create game-assets/assets/Icons directory");

    let icons_export_dir = PathBuf::from("../../game-assets/assets/Icons");
    std::fs::create_dir_all(&icons_export_dir)
        .expect("failed to create game-assets/assets/Icons directory");

    let textures_dir = PathBuf::from("../../game-assets/assets/Textures");
    std::fs::create_dir_all(&textures_dir)
        .expect("failed to create game-assets/assets/Textures directory");

    let textures_export_dir = PathBuf::from("../../game-assets/assets/Textures");
    std::fs::create_dir_all(&textures_export_dir)
        .expect("failed to create game-assets/assets/Textures directory");

    let sprites_dir = PathBuf::from("../../game-assets/assets/Sprites");
    std::fs::create_dir_all(&sprites_dir)
        .expect("failed to create game-assets/assets/Sprites directory");

    let isolated_dir = PathBuf::from("../../game-assets/assets/IsolatedRegions");
    std::fs::create_dir_all(&isolated_dir)
        .expect("failed to create game-assets/assets/IsolatedRegions directory");

    let packs_dir = PathBuf::from("../../game-assets/assets/Packs");
    std::fs::create_dir_all(&packs_dir)
        .expect("failed to create game-assets/assets/Packs directory");

    let refine_max_concurrent = std::env::var("WORLDGEN_REFINE_MAX_CONCURRENT")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(1);
    let refine_max_queue = std::env::var("WORLDGEN_REFINE_MAX_QUEUE")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(3);

    let supabase = load_supabase_storage_config();
    if supabase.is_none() {
        warn!("Supabase storage sync disabled (missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_BUCKET)");
    }
    let quest_v2_enabled = std::env::var("QUEST_V2")
        .ok()
        .map(|value| matches!(value.trim(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(true);
    let jobs = Arc::new(Mutex::new(HashMap::new()));

    let state = AppState {
        jobs: jobs.clone(),
        quest_runtime: quest_ai::QuestRuntime::from_env(quest_v2_enabled, jobs.clone()),
        exploration_runtime: exploration_jobs::ExplorationGenerationRuntime::from_env(true, jobs),
        planets_dir,
        planet_root: PathBuf::from("generated/planet"), // For the hierarchical generator
        icons_dir: icons_dir.clone(),
        icons_export_dir,
        textures_dir: textures_dir.clone(),
        textures_export_dir,
        sprites_dir: sprites_dir.clone(),
        isolated_dir: isolated_dir.clone(),
        packs_dir: packs_dir.clone(),
        refine_limiter: RefineLimiter {
            semaphore: Arc::new(Semaphore::new(refine_max_concurrent)),
            max_concurrent: refine_max_concurrent,
            max_queue: refine_max_queue,
            outstanding: Arc::new(AtomicUsize::new(0)),
        },
        supabase,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/terrain/generate", post(start_generate_job))
        .route(
            "/api/terrain/jobs/{job_id}",
            get(get_job_status).delete(cancel_job),
        )
        .route("/api/jobs", get(list_jobs))
        .route("/api/jobs/{job_id}", get(get_job_status).delete(cancel_job))
        .route(
            "/api/exploration/generate-location",
            post(exploration_jobs::start_generate_location_job),
        )
        .route(
            "/api/exploration/generate-block-pack",
            post(exploration_jobs::start_generate_block_pack_job),
        )
        .route(
            "/api/exploration/generate-asset-kit",
            post(exploration_jobs::start_generate_asset_kit_job),
        )
        .route("/api/planet/preview", post(start_preview_job))
        .route("/api/planet/preview/{job_id}", get(get_job_status))
        .route("/api/planet/hybrid", post(start_hybrid_job))
        .route("/api/planet/hybrid/{job_id}", get(get_job_status))
        .route("/api/planet/generate-full", post(generate_full_planet))
        .route("/api/planet/saved", get(list_saved_planets))
        .route("/api/planet/saved/{cache_key}", get(load_saved_planet))
        .route("/api/planet/lore/query", post(query_lore_handler))
        .route("/api/text/generate", post(generate_text_handler))
        .route(
            "/api/events/generate",
            post(ai_events::generate_event_handler),
        )
        .route(
            "/api/events/resolve",
            post(ai_events::resolve_event_handler),
        )
        .route(
            "/api/events/rethink",
            post(ai_events::rethink_event_handler),
        )
        .route(
            "/api/characters/generate",
            post(ai_characters::generate_character_handler),
        )
        .route(
            "/api/ai/character-story",
            post(ai_characters::generate_story_handler),
        )
        .route(
            "/api/quests/generate-run",
            post(ai_quests::generate_quest_run_handler),
        )
        .route(
            "/api/quests/advance",
            post(ai_quests::advance_quest_handler),
        )
        .route(
            "/api/quests/jobs/{job_id}",
            get(ai_quests::get_quest_job).delete(ai_quests::cancel_quest_job),
        )
        .route(
            "/api/gm/enhance-appearance-prompt",
            post(ai_quests::enhance_appearance_prompt_handler),
        )
        .route(
            "/api/gm/generate-character-portrait",
            post(ai_quests::generate_character_portrait_handler),
        )
        .route("/api/planet/ecology", post(start_ecology_job))
        .route("/api/planet/ecology/{job_id}", get(get_job_status))
        .route(
            "/api/planet/ecology-data/{world_id}",
            get(ecology::get_ecology_data).post(ecology::save_ecology_data),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/sync-biomes",
            post(ecology::sync_biomes_handler),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/world",
            post(ecology::generate_world_baseline),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/kingdom/{kingdom_id}",
            post(ecology::generate_kingdom_baseline),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/duchy/{duchy_id}",
            post(ecology::generate_duchy_baseline),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/biome/{biome_id}",
            post(ecology::generate_biome_description),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/flora-batch",
            post(ecology::generate_flora_batch),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/generate/fauna-batch",
            post(ecology::generate_fauna_batch),
        )
        .route(
            "/api/planet/ecology-data/{world_id}/refresh-derived-stats",
            post(ecology::refresh_derived_stats),
        )
        .route("/api/planet/ecology-jobs/{job_id}", get(get_job_status))
        .route("/api/planet/humanity", post(start_humanity_job))
        .route("/api/planet/humanity/{job_id}", get(get_job_status))
        .route(
            "/api/history",
            get(get_history).post(save_history).delete(clear_history),
        )
        .route("/api/history/{id}", delete(delete_history))
        .route(
            "/api/planet/geography/{id}",
            get(get_geography).post(save_geography),
        )
        .route(
            "/api/planet/worldgen-regions/{id}",
            get(get_worldgen_regions),
        )
        .route(
            "/api/planet/lore-snippets/{id}",
            get(get_lore_snippets).post(save_lore_snippets),
        )
        .route(
            "/api/planet/gm-settings/{id}",
            get(get_gm_settings).post(save_gm_settings),
        )
        .route("/api/planet/gm-context/{id}", get(get_gm_context))
        .route(
            "/api/planet/factions/{id}",
            get(get_factions).post(save_factions),
        )
        .route("/api/planet/areas/{id}", get(get_areas))
        .route(
            "/api/planet/locations/{world_id}/{location_id}/exploration-manifest",
            get(exploration_jobs::get_exploration_manifest),
        )
        .route(
            "/api/planet/locations/{world_id}/exploration-manifests",
            get(exploration_jobs::list_exploration_manifests),
        )
        .route(
            "/api/planet/location-generation/{id}",
            get(get_location_generation),
        )
        .route(
            "/api/planet/humanity-readiness/{id}",
            get(get_humanity_readiness),
        )
        .route(
            "/api/planet/locations/{id}/generate",
            post(generate_locations_job),
        )
        .route(
            "/api/planet/locations/{id}/adopt-humanity-managed",
            post(adopt_humanity_managed_locations),
        )
        .route(
            "/api/planet/locations/{id}",
            get(get_locations).post(save_locations),
        )
        .route(
            "/api/planet/characters/{id}",
            get(get_characters).post(save_characters),
        )
        .route(
            "/api/planet/temporality/{id}",
            get(get_temporality).post(save_temporality),
        )
        .route(
            "/api/planet/quests/{world_id}",
            get(ai_quests::list_quest_runs),
        )
        .route(
            "/api/planet/quests/{world_id}/chains",
            get(ai_quests::list_quest_chains),
        )
        .route(
            "/api/planet/quests/{world_id}/chains/{chain_id}",
            get(ai_quests::get_quest_chain),
        )
        .route(
            "/api/planet/quests/{world_id}/glossary",
            get(ai_quests::get_quest_glossary).post(ai_quests::upsert_quest_glossary_entry),
        )
        .route(
            "/api/planet/quests/{world_id}/illustrations/{illustration_id}",
            get(ai_quests::get_quest_illustration),
        )
        .route(
            "/api/planet/quests/{world_id}/illustrations/{illustration_id}/image",
            get(ai_quests::get_quest_illustration_image),
        )
        .route(
            "/api/planet/quests/{world_id}/{run_id}",
            get(ai_quests::get_quest_run)
                .post(ai_quests::save_quest_run)
                .delete(ai_quests::delete_quest_run),
        )
        .route("/api/planet/cells/job", post(start_cells_job))
        .route("/api/planet/cells/job/{job_id}", get(get_job_status))
        .route("/api/planet/cells/{id}", get(get_cells).post(save_cells))
        .route("/api/planet/cell-features/{id}", get(get_cell_features))
        .route("/api/planet/upscale", post(start_upscale_job))
        .route("/api/planet/upscale/{job_id}", get(get_job_status))
        .route("/api/icons/generate-batch", post(generate_icon_batch))
        .route("/api/icons/batches", get(list_icon_batches))
        .route(
            "/api/icons/batches/{batch_id}",
            get(get_icon_batch).delete(delete_icon_batch),
        )
        .route(
            "/api/icons/batches/{batch_id}/rename",
            axum::routing::put(rename_icon_batch),
        )
        .route(
            "/api/icons/batches/{batch_id}/icons/{filename}/regenerate",
            post(regenerate_icon),
        )
        .route("/api/icons/export", post(export_icons_registry))
        .route("/api/textures/generate-batch", post(generate_texture_batch))
        .route("/api/textures/batches", get(list_texture_batches))
        .route(
            "/api/textures/batches/{batch_id}",
            get(get_texture_batch).delete(delete_texture_batch),
        )
        .route(
            "/api/textures/batches/{batch_id}/rename",
            axum::routing::put(rename_texture_batch),
        )
        .route(
            "/api/textures/batches/{batch_id}/textures/{filename}/metadata",
            axum::routing::put(update_texture_metadata),
        )
        .route(
            "/api/textures/batches/{batch_id}/textures/{filename}/regenerate",
            post(regenerate_texture),
        )
        .route("/api/textures/export", post(export_textures_registry))
        .route("/api/sprites/generate-batch", post(generate_sprite_batch))
        .route("/api/sprites/batches", get(list_sprite_batches))
        .route("/api/sprites/batches/{batch_id}", get(get_sprite_batch))
        .route(
            "/api/sprites/batches/{batch_id}/rename",
            axum::routing::put(rename_sprite_batch),
        )
        .route("/api/ai/image-models", get(get_ai_image_models))
        .route("/api/storage/supabase/browse", get(browse_supabase_objects))
        .route("/api/storage/supabase/sync", post(sync_supabase_storage))
        // ── Worldgen Pipeline ──
        .route(
            "/api/worldgen/{planet_id}/status",
            get(worldgen_pipeline::get_pipeline_status),
        )
        .route(
            "/api/worldgen/{planet_id}/biome/report",
            get(worldgen_pipeline::get_biome_report),
        )
        .route(
            "/api/worldgen/{planet_id}/biome/analyze",
            post(worldgen_pipeline::analyze_biome_vision),
        )
        .route(
            "/api/worldgen/{planet_id}/run/{stage_name}",
            post(worldgen_pipeline::run_pipeline_stage),
        )
        .route(
            "/api/worldgen/{planet_id}/job/{job_id}",
            get(worldgen_pipeline::get_worldgen_job_status)
                .delete(worldgen_pipeline::cancel_worldgen_job),
        )
        .route(
            "/api/worldgen/{planet_id}/clear",
            delete(worldgen_pipeline::clear_pipeline),
        )
        .route(
            "/api/worldgen/{planet_id}/hierarchy/reassign",
            post(reassign_worldgen_hierarchy),
        )
        .route(
            "/api/worldgen/{planet_id}/hierarchy/rename",
            post(rename_worldgen_hierarchy),
        )
        .route(
            "/api/worldgen/{planet_id}/hierarchy/init-stats",
            post(init_province_stats),
        )
        .route(
            "/api/worldgen/{planet_id}/isolate/bulk",
            post(worldgen_pipeline::isolate_all_entities),
        )
        .route(
            "/api/worldgen/{planet_id}/isolate/provinces",
            post(worldgen_pipeline::isolate_all_provinces),
        )
        .route(
            "/api/worldgen/{planet_id}/isolate",
            post(worldgen_pipeline::isolate_region),
        )
        .route(
            "/api/worldgen/{planet_id}/isolated",
            get(worldgen_pipeline::list_isolated_regions),
        )
        .route(
            "/api/worldgen/{planet_id}/isolated/{filename}",
            delete(worldgen_pipeline::delete_isolated_region),
        )
        .route(
            "/api/worldgen/isolated/all",
            get(worldgen_pipeline::list_all_isolated_regions),
        )
        .route(
            "/api/worldgen/{planet_id}/upscaled/province",
            post(worldgen_pipeline::start_upscaled_province_refine),
        )
        .route(
            "/api/worldgen/{planet_id}/upscaled",
            get(worldgen_pipeline::list_upscaled_regions),
        )
        .route(
            "/api/worldgen/upscaled/all",
            get(worldgen_pipeline::list_all_upscaled_regions),
        )
        .route(
            "/api/worldgen/{planet_id}/upscaled/{artifact_id}",
            delete(worldgen_pipeline::delete_upscaled_region),
        )
        .route(
            "/api/worldgen/{planet_id}/upscaled/{artifact_id}/apply",
            post(worldgen_pipeline::apply_upscaled_region),
        )
        // Static file serving for all planet textures
        .route(
            "/api/data/traits",
            get(cms::get_traits).post(cms::save_traits),
        )
        .route("/api/data/traits/{id}", delete(cms::delete_trait))
        .route(
            "/api/data/occupations",
            get(cms::get_occupations).post(cms::save_occupations),
        )
        .route("/api/data/occupations/{id}", delete(cms::delete_occupation))
        .route("/api/data/items", get(cms::get_items).post(cms::save_items))
        .route("/api/data/items/{id}", delete(cms::delete_item))
        .route(
            "/api/data/talent-trees",
            get(cms::get_talent_trees).post(cms::save_talent_tree),
        )
        .route(
            "/api/data/talent-trees/{occupation_id}",
            delete(cms::delete_talent_tree),
        )
        .route(
            "/api/data/characters",
            get(cms::get_characters).post(cms::save_character),
        )
        .route(
            "/api/data/skills",
            get(cms::get_skills).post(cms::save_skill),
        )
        .route("/api/data/skills/{id}", delete(cms::delete_skill))
        .route(
            "/api/data/game-rules",
            get(cms::get_game_rules).post(cms::save_game_rules),
        )
        .route(
            "/api/settings/world/{id}",
            get(cms::get_world_settings).post(cms::save_world_settings),
        )
        // ── Combat Engine WebSocket ──
        .route("/api/combat/ws", get(combat_engine::session::ws_handler))
        .merge(asset_packs::router())
        .nest_service("/api/planets", ServeDir::new("generated/planets"))
        .nest_service("/api/icons", ServeDir::new(icons_dir.clone()))
        .nest_service("/api/textures", ServeDir::new(textures_dir.clone()))
        .nest_service("/api/sprites", ServeDir::new(sprites_dir.clone()))
        .nest_service("/api/isolated-assets", ServeDir::new(isolated_dir.clone()))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_origin(Any)
                .allow_headers(Any),
        );

    let addr: SocketAddr = "127.0.0.1:8787".parse().expect("valid socket address");
    info!(%addr, "dev-tools backend listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind listener");

    axum::serve(listener, app).await.expect("server failed");
}

async fn health() -> &'static str {
    "ok"
}

async fn get_ai_image_models() -> impl IntoResponse {
    (StatusCode::OK, Json(gemini::image_model_catalog())).into_response()
}

async fn start_generate_job(
    State(state): State<AppState>,
    Json(request): Json<GenerateTerrainRequest>,
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
            make_job_record(
                "worldgen.terrain.generate",
                "Generate Terrain",
                "worldgen",
                "Queued",
                None,
                None,
            ),
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    let request_key = request_cache_key(&request).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("cache key error: {e}"),
        )
    })?;

    tokio::task::spawn_blocking(move || {
        info!(
            job_id = %spawned_job_id,
            cols = request.cols,
            rows = request.rows,
            cache_key = %request_key,
            "terrain job started"
        );

        match load_cached_response(&planets_dir, &request_key) {
            Ok(Some(cached)) => {
                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&spawned_job_id) {
                        job.status = JobStatus::Completed;
                        job.progress = 100.0;
                        job.current_stage = "Completed (cache hit)".to_string();
                        job.result = serde_json::to_value(cached).ok();
                        job.error = None;
                    }
                }
                info!(job_id = %spawned_job_id, cache_key = %request_key, "terrain job cache hit");
                return;
            }
            Ok(None) => {
                info!(job_id = %spawned_job_id, cache_key = %request_key, "terrain job cache miss");
            }
            Err(err) => {
                error!(job_id = %spawned_job_id, error = %err, "failed to read terrain cache");
            }
        }

        run_generation_job(&spawned_job_id, request, &request_key, &jobs, &planets_dir);
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

/// Planet preview job — uses the same job-based approach with progress tracking.
async fn start_preview_job(
    State(state): State<AppState>,
    Json(request): Json<PlanetPreviewRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let cols = request.cols.unwrap_or(2048).clamp(128, 4096);
    let rows = request.rows.unwrap_or(1024).clamp(64, 2048);

    info!(
        job_id = %job_id,
        cols,
        rows,
        seed = request.config.world.seed,
        ocean_coverage = format!("{:.0}%", request.config.world.ocean_coverage * 100.0),
        "planet preview job starting"
    );

    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.preview.generate",
                "Generate Planet Preview",
                "worldgen",
                "Queued",
                None,
                None,
            ),
        );
    }

    let terrain_request = GenerateTerrainRequest {
        config: request.config,
        cols,
        rows,
        km_per_cell: 100.0,
        octaves: 2,
    };

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    let request_key = request_cache_key(&terrain_request).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("cache key error: {e}"),
        )
    })?;

    tokio::task::spawn_blocking(move || {
        match load_cached_response(&planets_dir, &request_key) {
            Ok(Some(cached)) => {
                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&spawned_job_id) {
                        job.status = JobStatus::Completed;
                        job.progress = 100.0;
                        job.current_stage = "Completed (cache hit)".to_string();
                        job.result = serde_json::to_value(cached).ok();
                        job.error = None;
                    }
                }
                info!(job_id = %spawned_job_id, cache_key = %request_key, "planet preview cache hit");
                return;
            }
            Ok(None) => {
                info!(job_id = %spawned_job_id, cache_key = %request_key, "planet preview cache miss — generating");
            }
            Err(err) => {
                warn!(job_id = %spawned_job_id, error = %err, "planet preview cache read error");
            }
        }

        run_generation_job(
            &spawned_job_id,
            terrain_request,
            &request_key,
            &jobs,
            &planets_dir,
        );
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

/// Shared generation runner with detailed logging and progress.
fn run_generation_job(
    job_id: &str,
    request: GenerateTerrainRequest,
    request_key: &str,
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: &std::path::Path,
) {
    let start = std::time::Instant::now();

    let mut last_stage = String::new();
    let mut last_bucket: i32 = -1;

    let progress_jobs = jobs.clone();
    let cancel_jobs = jobs.clone();
    let cancel_job_id = job_id.to_string();
    let log_job_id = job_id.to_string();
    let log_job_id2 = job_id.to_string();

    // Mark as running
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Starting generation".to_string();
        }
    }

    info!(job_id = %log_job_id, cols = request.cols, rows = request.rows, "generation starting");

    let result = generate_world_with_progress_and_cancel(
        request,
        |progress| {
            if let Ok(mut map) = progress_jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = progress.progress;
                    job.current_stage = progress.stage.to_string();
                }
            }

            let bucket = (progress.progress / 5.0).floor() as i32;
            if progress.stage != last_stage || bucket != last_bucket {
                info!(
                    job_id = %log_job_id,
                    progress = format!("{:.1}%", progress.progress),
                    stage = progress.stage,
                    "generation progress"
                );
                last_stage = progress.stage.to_string();
                last_bucket = bucket;
            }
        },
        || {
            if let Ok(map) = cancel_jobs.lock() {
                if let Some(job) = map.get(&cancel_job_id) {
                    return job.cancel_requested;
                }
            }
            true
        },
    );

    let elapsed = start.elapsed();

    match result {
        Ok(response) => {
            let cell_count = response.cell_data.len();

            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.current_stage = "Caching result...".to_string();
                }
            }

            if let Err(err) = save_cached_response(planets_dir, request_key, &response) {
                error!(job_id = %log_job_id2, error = %err, "failed to write cache");
            } else {
                info!(job_id = %log_job_id2, cache_key = %request_key, "result cached");
            }

            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.status = JobStatus::Completed;
                    job.progress = 100.0;
                    job.current_stage = "Completed".to_string();
                    job.result = serde_json::to_value(response).ok();
                    job.error = None;
                }
            }
            info!(
                job_id = %log_job_id2,
                elapsed_ms = elapsed.as_millis(),
                cells = cell_count,
                "generation completed"
            );
        }
        Err(err) => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    if err == "cancelled" || job.cancel_requested {
                        job.status = JobStatus::Cancelled;
                        job.current_stage = "Cancelled".to_string();
                        job.error = None;
                    } else {
                        job.status = JobStatus::Failed;
                        job.current_stage = "Failed".to_string();
                        job.error = Some(err.clone());
                    }
                }
            }
            if err == "cancelled" {
                info!(job_id = %log_job_id2, elapsed_ms = elapsed.as_millis(), "generation cancelled");
            } else {
                error!(job_id = %log_job_id2, error = %err, elapsed_ms = elapsed.as_millis(), "generation failed");
            }
        }
    }
}

/// Start hybrid Gemini + Procedural generation job
async fn start_hybrid_job(
    State(state): State<AppState>,
    Json(request): Json<PlanetHybridRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let cols = request.cols.unwrap_or(2048).clamp(128, 4096);
    let rows = request.rows.unwrap_or(1024).clamp(64, 2048);

    info!(
        job_id = %job_id,
        cols,
        rows,
        prompt = %request.prompt,
        "hybrid planet preview job starting"
    );

    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.hybrid.generate",
                "Generate Hybrid Planet",
                "worldgen",
                "Requesting Gemini Image...",
                Some(job_id.clone()),
                None,
            ),
        );
    }

    let terrain_request = GenerateTerrainRequest {
        config: request.config,
        cols,
        rows,
        km_per_cell: 100.0,
        octaves: 2,
    };

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();

    let request_key = spawned_job_id.clone();
    let generate_cells_opt = request.generate_cells;

    tokio::task::spawn(async move {
        run_hybrid_generation_job(
            spawned_job_id,
            terrain_request,
            request.prompt,
            request.temperature,
            generate_cells_opt,
            request_key,
            jobs,
            planets_dir,
        )
        .await;
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn run_hybrid_generation_job(
    job_id: String,
    request: GenerateTerrainRequest,
    prompt: String,
    temperature: Option<f32>,
    generate_cells: Option<bool>,
    request_key: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: std::path::PathBuf,
) {
    let start = std::time::Instant::now();

    // The unique planet folder for this generated world
    let planet_dir = planets_dir.join(&request_key);
    let planet_textures_dir = planet_dir.join("textures");

    // Create directories
    if let Err(e) = std::fs::create_dir_all(&planet_textures_dir) {
        error!("Failed to create planet directory structure: {}", e);
        if let Ok(mut map) = jobs.lock() {
            if let Some(job) = map.get_mut(&job_id) {
                job.status = JobStatus::Failed;
                job.current_stage = "Failed to create planet folder on disk".to_string();
                job.error = Some(e.to_string());
            }
        }
        return;
    }

    // 1. Fetch AI Image
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Downloading Gemini Map...".to_string();
        }
    }

    let image_bytes =
        match gemini::generate_image_bytes(&prompt, temperature, request.cols, request.rows, None)
            .await
        {
            Ok(b) => b,
            Err((_code, err_msg)) => {
                error!("Failed to fetch Gemini image: {}", err_msg);
                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&job_id) {
                        job.status = JobStatus::Failed;
                        job.current_stage = "Failed to communicate with Gemini".to_string();
                        job.error = Some(err_msg);
                    }
                }
                return;
            }
        };

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.current_stage = "Decoding Map Image...".to_string();
        }
    }

    // Decode image in background thread
    let decode_result = tokio::task::spawn_blocking(move || {
        image::load_from_memory(&image_bytes).map(|img| (img.to_rgba8(), image_bytes))
    })
    .await
    .unwrap();

    let (rgba_image, raw_bytes) = match decode_result {
        Ok((i, b)) => (i, b),
        Err(e) => {
            error!("Failed to decode Gemini JPEG: {}", e);
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&job_id) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Failed to decode image bytes".to_string();
                    job.error = Some(e.to_string());
                }
            }
            return;
        }
    };

    // Save the ORIGINAL Gemini JPEG bytes to disk inside the new planet folder
    let texture_filename = format!("base.jpg");
    let texture_path = planet_textures_dir.join(&texture_filename);
    let texture_url = format!("/api/planets/{}/textures/{}", request_key, texture_filename);

    if let Err(e) = std::fs::write(&texture_path, &raw_bytes) {
        error!(job_id = %job_id, error = %e, "failed to save texture to disk");
    } else {
        info!(job_id = %job_id, path = %texture_path.display(), size_bytes = raw_bytes.len(), "texture saved to disk");
    }

    let image_width = rgba_image.width();
    let image_height = rgba_image.height();
    let pixel_data = rgba_image.into_raw();

    let mut last_stage = String::new();
    let mut last_bucket: i32 = -1;

    let progress_jobs = jobs.clone();
    let cancel_jobs = jobs.clone();
    let cancel_job_id = job_id.clone();
    let log_job_id = job_id.clone();
    let log_job_id2 = job_id.clone();

    // Spawn geometry computation
    let result = tokio::task::spawn_blocking(move || {
        generate_hybrid_with_progress_and_cancel(
            request,
            &pixel_data,
            image_width,
            image_height,
            |progress| {
                if let Ok(mut map) = progress_jobs.lock() {
                    if let Some(job) = map.get_mut(&log_job_id) {
                        job.status = JobStatus::Running;
                        job.progress = progress.progress;
                        job.current_stage = progress.stage.to_string();
                    }
                }

                let bucket = (progress.progress / 5.0).floor() as i32;
                if progress.stage != last_stage || bucket != last_bucket {
                    info!(
                        job_id = %log_job_id,
                        progress = format!("{:.1}%", progress.progress),
                        stage = progress.stage,
                        "hybrid generation progress"
                    );
                    last_stage = progress.stage.to_string();
                    last_bucket = bucket;
                }
            },
            || {
                if let Ok(map) = cancel_jobs.lock() {
                    if let Some(job) = map.get(&cancel_job_id) {
                        return job.cancel_requested;
                    }
                }
                false
            },
            generate_cells.unwrap_or(true),
        )
    })
    .await;

    let elapsed = start.elapsed();

    let task_result = match result {
        Ok(r) => r,
        Err(_) => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Panic in worker thread".to_string();
                    job.error = Some("Thread panic".to_string());
                }
            }
            return;
        }
    };

    match task_result {
        Ok(mut response) => {
            let cell_count = response.cell_data.len();

            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.current_stage = "Saving texture to disk...".to_string();
                }
            }

            // The original Gemini JPEG was already saved to disk before geometry generation.
            // Just override texture_url to point at the static file URL.
            response.texture_url = Some(texture_url.clone());
            let heightmap_url = format!("/planet/{}/worldgen/height16.png", log_job_id2);
            response.heightmap_url = Some(heightmap_url.clone());

            let world_data_path = planet_dir.join("world_data.json");
            match std::fs::File::create(&world_data_path) {
                Ok(file) => {
                    if let Err(err) =
                        serde_json::to_writer(std::io::BufWriter::new(file), &response)
                    {
                        error!(job_id = %log_job_id2, error = %err, "failed to write world_data json");
                    } else {
                        info!(job_id = %log_job_id2, path = %world_data_path.display(), "hybrid result cached");
                    }
                }
                Err(err) => {
                    error!(job_id = %log_job_id2, error = %err, "failed to create world_data json file");
                }
            }

            // CRITICAL: Strip the massive cell_data and cell_colors arrays before
            // storing in the job record. The frontend only needs textureUrl, cols, rows.
            // Keeping 2M+ cells in memory crashes Chrome when serialized to JSON.
            let lightweight_response = GenerateTerrainResponse {
                cols: response.cols,
                rows: response.rows,
                cell_data: Vec::new(),
                cell_colors: Vec::new(),
                texture_url: response.texture_url.clone(),
                heightmap_url: response.heightmap_url.clone(),
            };

            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.status = JobStatus::Completed;
                    job.progress = 100.0;
                    job.current_stage = "Completed".to_string();
                    job.result = serde_json::to_value(lightweight_response).ok();
                    job.error = None;
                }
            }
            info!(
                job_id = %log_job_id2,
                elapsed_ms = elapsed.as_millis(),
                cells = cell_count,
                "hybrid generation completed"
            );
        }
        Err(err) => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    if err == "cancelled" || job.cancel_requested {
                        job.status = JobStatus::Cancelled;
                        job.current_stage = "Cancelled".to_string();
                        job.error = None;
                    } else {
                        job.status = JobStatus::Failed;
                        job.current_stage = "Failed".to_string();
                        job.error = Some(err.clone());
                    }
                }
            }
            if err == "cancelled" {
                info!(job_id = %log_job_id2, elapsed_ms = elapsed.as_millis(), "hybrid cancelled");
            } else {
                error!(job_id = %log_job_id2, error = %err, elapsed_ms = elapsed.as_millis(), "hybrid processing failed");
            }
        }
    }
}

async fn get_job_status(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let jobs = state.jobs.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "job store lock poisoned".to_string(),
        )
    })?;

    let Some(job) = jobs.get(&job_id) else {
        return Err((StatusCode::NOT_FOUND, "job not found".to_string()));
    };

    let response = JobStatusResponse {
        job_id,
        status: job.status.clone(),
        progress: job.progress,
        current_stage: job.current_stage.clone(),
        result: job.result.clone(),
        error: job.error.clone(),
        kind: job.kind.clone(),
        title: job.title.clone(),
        tool: job.tool.clone(),
        world_id: job.world_id.clone(),
        run_id: job.run_id.clone(),
        parent_job_id: job.parent_job_id.clone(),
        metadata: job.metadata.clone(),
        output_refs: job.output_refs.clone(),
        created_at: job.created_at,
        updated_at: job.updated_at,
    };

    Ok(Json(response))
}

async fn list_jobs(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let jobs = state.jobs.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "job store lock poisoned".to_string(),
        )
    })?;

    let mut items = jobs
        .iter()
        .map(|(job_id, job)| JobListItem {
            job_id: job_id.clone(),
            kind: job.kind.clone(),
            title: job.title.clone(),
            tool: job.tool.clone(),
            status: job.status.clone(),
            progress: job.progress,
            current_stage: job.current_stage.clone(),
            world_id: job.world_id.clone(),
            run_id: job.run_id.clone(),
            parent_job_id: job.parent_job_id.clone(),
            metadata: job.metadata.clone(),
            output_refs: job.output_refs.clone(),
            error: job.error.clone(),
            created_at: job.created_at,
            updated_at: job.updated_at,
        })
        .collect::<Vec<_>>();

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(Json(JobSummaryResponse { jobs: items }))
}

async fn cancel_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut jobs = state.jobs.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "job store lock poisoned".to_string(),
        )
    })?;

    let Some(job) = jobs.get_mut(&job_id) else {
        return Err((StatusCode::NOT_FOUND, "job not found".to_string()));
    };

    job.cancel_requested = true;
    if matches!(job.status, JobStatus::Queued | JobStatus::Running) {
        job.current_stage = "Cancellation requested".to_string();
        job.updated_at = now_ms();
    }

    info!(job_id = %job_id, "job cancellation requested");
    Ok(StatusCode::ACCEPTED)
}

async fn generate_full_planet(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HierarchyGenerateRequest>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    info!(
        root_cols = request.root_cols,
        root_rows = request.root_rows,
        max_lod = request.max_lod,
        max_nodes = request.max_nodes,
        "planet hierarchy generation requested"
    );

    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "job store lock poisoned".to_string(),
                )
            })?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("planet.generate-full"),
                meta.title.as_deref().unwrap_or("Generate Hierarchy World"),
                meta.tool.as_deref().unwrap_or("worldgen"),
                "Queued",
                None,
                None,
            );
            if meta.restore.is_some() || meta.metadata.is_some() {
                let mut metadata = serde_json::Map::new();
                if let Some(restore) = meta.restore {
                    metadata.insert("restore".to_string(), restore);
                }
                if let Some(extra) = meta.metadata {
                    metadata.insert("metadata".to_string(), extra);
                }
                job.metadata = Some(serde_json::Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }

        let jobs = state.jobs.clone();
        let planets_dir = state.planets_dir.clone();
        let planet_root = state.planet_root.clone();
        let request_for_task = request.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = 10.0;
                    job.current_stage = "Generating hierarchy world".to_string();
                    job.updated_at = now_ms();
                }
            }

            let manifest_result = tokio::task::spawn_blocking(move || {
                generate_full_planet_hierarchy(request_for_task, &planets_dir, &planet_root)
            })
            .await;

            match manifest_result {
                Ok(Ok(manifest)) => {
                    let run_path = format!("generated/planet/{}/manifest.json", manifest.run_key);
                    if let Ok(mut map) = jobs.lock() {
                        if let Some(job) = map.get_mut(&spawned_job_id) {
                            job.status = JobStatus::Completed;
                            job.progress = 100.0;
                            job.current_stage = "Completed".to_string();
                            job.result = Some(serde_json::json!({
                                "manifest": manifest,
                                "runPath": run_path,
                            }));
                            job.output_refs = vec![
                                JobOutputRef {
                                    id: "worldgen-route".to_string(),
                                    label: "Open Worldgen".to_string(),
                                    kind: "route".to_string(),
                                    href: None,
                                    route: Some(jobs::JobRouteRef {
                                        path: "/worldgen".to_string(),
                                        search: None,
                                    }),
                                    preview_text: None,
                                },
                                build_text_output_ref(
                                    "Generation Summary",
                                    &format!("Run {} • {} nodes", manifest.run_key, manifest.total_nodes),
                                ),
                            ];
                            job.updated_at = now_ms();
                        }
                    }
                }
                Ok(Err(message)) => {
                    if let Ok(mut map) = jobs.lock() {
                        if let Some(job) = map.get_mut(&spawned_job_id) {
                            job.status = JobStatus::Failed;
                            job.progress = 100.0;
                            job.current_stage = "Failed".to_string();
                            job.error = Some(message);
                            job.updated_at = now_ms();
                        }
                    }
                }
                Err(error) => {
                    if let Ok(mut map) = jobs.lock() {
                        if let Some(job) = map.get_mut(&spawned_job_id) {
                            job.status = JobStatus::Failed;
                            job.progress = 100.0;
                            job.current_stage = "Failed".to_string();
                            job.error = Some(format!("planet generation task join error: {error}"));
                            job.updated_at = now_ms();
                        }
                    }
                }
            }
        });

        return Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })).into_response());
    }

    let planets_dir = state.planets_dir.clone();
    let planet_root = state.planet_root.clone();

    let request_for_task = request.clone();
    let manifest = tokio::task::spawn_blocking(move || {
        generate_full_planet_hierarchy(request_for_task, &planets_dir, &planet_root)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("planet generation task join error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let run_path = format!("generated/planet/{}/manifest.json", manifest.run_key);
    info!(run_path = %run_path, total_nodes = manifest.total_nodes, "planet hierarchy generation completed");

    Ok(Json(GeneratePlanetResponse { manifest, run_path }).into_response())
}

/// List saved planet cache files.
async fn list_saved_planets(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let planets_dir = state.planets_dir.clone();
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<SavedEntry>, String> {
        let mut result = Vec::new();
        if !planets_dir.exists() {
            return Ok(result);
        }
        let dir = std::fs::read_dir(&planets_dir)
            .map_err(|e| format!("failed to read cache dir: {e}"))?;
        for entry in dir {
            let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                let metadata =
                    std::fs::metadata(&path).map_err(|e| format!("metadata error: {e}"))?;
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    })
                    .unwrap_or_default();
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let cache_key = file_name.clone();
                result.push(SavedEntry {
                    cache_key,
                    file_name,
                    size_bytes: metadata.len(),
                    modified,
                });
            }
        }
        result.sort_by(|a, b| b.modified.cmp(&a.modified));
        Ok(result)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(entries))
}

/// Load a specific saved planet by cache key.
async fn load_saved_planet(
    State(state): State<AppState>,
    Path(cache_key): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!(cache_key = %cache_key, "loading saved planet");
    let planets_dir = state.planets_dir.clone();
    let response =
        tokio::task::spawn_blocking(move || load_cached_response(&planets_dir, &cache_key))
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("task error: {e}"),
                )
            })?
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    match response {
        Some(data) => {
            info!(cols = data.cols, rows = data.rows, "saved planet loaded");
            Ok(Json(data))
        }
        None => Err((StatusCode::NOT_FOUND, "saved planet not found".to_string())),
    }
}

async fn generate_text_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<GenerateTextRequest>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "job store lock poisoned".to_string(),
                )
            })?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("text.generate"),
                meta.title.as_deref().unwrap_or("Generate Text"),
                meta.tool.as_deref().unwrap_or("text"),
                "Queued",
                None,
                None,
            );
            if meta.restore.is_some() || meta.metadata.is_some() {
                let mut metadata = serde_json::Map::new();
                if let Some(restore) = meta.restore {
                    metadata.insert("restore".to_string(), restore);
                }
                if let Some(extra) = meta.metadata {
                    metadata.insert("metadata".to_string(), extra);
                }
                job.metadata = Some(serde_json::Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }

        let jobs = state.jobs.clone();
        let prompt = request.prompt.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = 15.0;
                    job.current_stage = "Generating text".to_string();
                    job.updated_at = now_ms();
                }
            }

            match gemini::generate_text(&prompt).await {
                Ok(text) => {
                    if let Ok(mut map) = jobs.lock() {
                        if let Some(job) = map.get_mut(&spawned_job_id) {
                            job.status = JobStatus::Completed;
                            job.progress = 100.0;
                            job.current_stage = "Completed".to_string();
                            job.result = Some(serde_json::json!({ "text": text.clone() }));
                            job.output_refs = vec![build_text_output_ref("Generated Text", &text)];
                            job.updated_at = now_ms();
                        }
                    }
                }
                Err((_code, msg)) => {
                    if let Ok(mut map) = jobs.lock() {
                        if let Some(job) = map.get_mut(&spawned_job_id) {
                            job.status = JobStatus::Failed;
                            job.progress = 100.0;
                            job.current_stage = "Failed".to_string();
                            job.error = Some(msg);
                            job.updated_at = now_ms();
                        }
                    }
                }
            }
        });

        return Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })).into_response());
    }

    match gemini::generate_text(&request.prompt).await {
        Ok(text) => Ok((StatusCode::OK, Json(serde_json::json!({ "text": text }))).into_response()),
        Err((code, msg)) => Err((code, msg)),
    }
}

async fn query_lore_handler(
    State(state): State<AppState>,
    Json(payload): Json<LoreQueryRequest>,
) -> impl IntoResponse {
    info!(
        "Handling lore query for coords {}, {}",
        payload.lon, payload.lat
    );

    // Build the prompt for Gemini
    let prompt = format!(
        "You are the game master simulator for a planet called Ashtrail.\n\
        The world context is: {}\n\n\
        The user has clicked on a specific hexagonal region of the map.\n\
        Region Stats:\n\
        - Longitude: {:.2}, Latitude: {:.2}\n\
        - Biome: {}\n\
        - Temperature: {:.1}°C\n\
        - Elevation: {:.0}m\n\
        - Resources: {}\n\n\
        Provide localized lore for this specific hex. Consider the biome, elevation, and resources.\n\
        If there are nearby oceans or extreme temperatures, weave that into how the settlement survives.\n\
        You MUST respond ONLY with a raw JSON object containing exactly these fields:\n\
        {{\n\
            \"regionName\": \"A creative name for this hex\",\n\
            \"population\": \"A descriptive population size (e.g. '12,000 citizens', or 'Uninhabited')\",\n\
            \"resourcesSummary\": \"A short sentence on its economic output\",\n\
            \"lore\": \"1-2 paragraphs of rich atmospheric flavor text describing the culture, history, or dangers of this region.\"\n\
        }}\n\
        Do NOT wrap the response in markdown code blocks. Just return the raw JSON.",
        payload.world_context,
        payload.lon, payload.lat,
        payload.biome,
        payload.temperature,
        payload.elevation,
        payload.resources.join(", ")
    );

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(payload.world_context.as_bytes());
    hasher.update(payload.lon.to_string().as_bytes());
    hasher.update(payload.lat.to_string().as_bytes());
    let hex_hash = format!("{:x}", hasher.finalize());
    let cache_file = state.planets_dir.join(format!("lore_{}.json", hex_hash));

    if cache_file.exists() {
        if let Ok(cached_data) = std::fs::read_to_string(&cache_file) {
            return (
                StatusCode::OK,
                Json(serde_json::json!({ "status": "success", "text": cached_data })),
            )
                .into_response();
        }
    }

    match gemini::generate_text(&prompt).await {
        Ok(text) => {
            let clean_text = text
                .trim()
                .strip_prefix("```json")
                .unwrap_or(&text)
                .strip_prefix("```")
                .unwrap_or(&text)
                .strip_suffix("```")
                .unwrap_or(&text)
                .trim()
                .to_string();

            let _ = std::fs::create_dir_all(&state.planets_dir);
            let _ = std::fs::write(&cache_file, &clean_text);

            (
                StatusCode::OK,
                Json(serde_json::json!({ "status": "success", "text": clean_text })),
            )
                .into_response()
        }
        Err((status, msg)) => (
            status,
            Json(serde_json::json!({ "status": "error", "message": msg })),
        )
            .into_response(),
    }
}

async fn get_history(State(state): State<AppState>) -> impl IntoResponse {
    let mut history: Vec<serde_json::Value> = Vec::new();
    let planets_dir = state.planets_dir.clone();

    if let Ok(entries) = std::fs::read_dir(&planets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let metadata_file = path.join("metadata.json");
                if let Ok(data) = std::fs::read_to_string(&metadata_file) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                        history.push(json);
                    }
                }
            }
        }
    }

    // Sort by timestamp descending
    history.sort_by(|a, b| {
        let t_a = a.get("timestamp").and_then(|t| t.as_u64()).unwrap_or(0);
        let t_b = b.get("timestamp").and_then(|t| t.as_u64()).unwrap_or(0);
        t_b.cmp(&t_a)
    });

    (StatusCode::OK, Json(serde_json::json!(history))).into_response()
}

async fn save_history(
    State(state): State<AppState>,
    Json(item): Json<serde_json::Value>,
) -> impl IntoResponse {
    let id = match item.get("id").and_then(|i| i.as_str()) {
        Some(i) => i.to_string(),
        None => return (StatusCode::BAD_REQUEST, "Missing history id".to_string()).into_response(),
    };

    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let metadata_file = planet_dir.join("metadata.json");
    match std::fs::write(
        &metadata_file,
        serde_json::to_string_pretty(&item).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete_history(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if planet_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&planet_dir) {
            error!(id = %id, error = %e, "Failed to delete planet directory");
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }
    StatusCode::OK.into_response()
}

async fn clear_history(State(state): State<AppState>) -> impl IntoResponse {
    let planets_dir = state.planets_dir.clone();
    if planets_dir.exists() {
        // Only delete the contents, keep the main dir
        if let Ok(entries) = std::fs::read_dir(&planets_dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
    StatusCode::OK.into_response()
}

async fn get_geography(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("geography.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    (StatusCode::OK, Json(serde_json::json!([]))).into_response()
}

async fn save_geography(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(regions): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("geography.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&regions).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// Returns a merged flat list of all worldgen hierarchy entities (continents, kingdoms, duchies, provinces).
async fn get_worldgen_regions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let worldgen_dir = state.planets_dir.join(&id).join("worldgen");
    if !worldgen_dir.exists() {
        return (StatusCode::OK, Json(serde_json::json!([]))).into_response();
    }

    let mut regions: Vec<serde_json::Value> = Vec::new();

    // Read continents
    if let Ok(data) = std::fs::read_to_string(worldgen_dir.join("continents.json")) {
        if let Ok(continents) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
            for c in continents {
                let raw_id = c.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                regions.push(serde_json::json!({
                    "id": format!("wgen_continents_{}", raw_id),
                    "rawId": raw_id,
                    "name": c.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Continent"),
                    "type": "Continent",
                    "kingdomIds": c.get("kingdomIds").cloned().unwrap_or(serde_json::json!([])),
                }));
            }
        }
    }

    // Read kingdoms
    if let Ok(data) = std::fs::read_to_string(worldgen_dir.join("kingdoms.json")) {
        if let Ok(kingdoms) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
            for k in kingdoms {
                let raw_id = k.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                regions.push(serde_json::json!({
                    "id": format!("wgen_kingdoms_{}", raw_id),
                    "rawId": raw_id,
                    "name": k.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Kingdom"),
                    "type": "Kingdom",
                    "duchyIds": k.get("duchyIds").cloned().unwrap_or(serde_json::json!([])),
                }));
            }
        }
    }

    // Read duchies
    if let Ok(data) = std::fs::read_to_string(worldgen_dir.join("duchies.json")) {
        if let Ok(duchies) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
            for d in duchies {
                let raw_id = d.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                regions.push(serde_json::json!({
                    "id": format!("wgen_duchies_{}", raw_id),
                    "rawId": raw_id,
                    "name": d.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Duchy"),
                    "type": "Duchy",
                    "kingdomId": d.get("kingdomId").cloned().unwrap_or(serde_json::json!(0)),
                    "provinceIds": d.get("provinceIds").cloned().unwrap_or(serde_json::json!([])),
                }));
            }
        }
    }

    // Read provinces
    if let Ok(data) = std::fs::read_to_string(worldgen_dir.join("provinces.json")) {
        if let Ok(provinces) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
            for p in provinces {
                let raw_id = p.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                regions.push(serde_json::json!({
                    "id": format!("wgen_provinces_{}", raw_id),
                    "rawId": raw_id,
                    "name": p.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Province"),
                    "type": "Province",
                    "duchyId": p.get("duchyId").cloned().unwrap_or(serde_json::json!(0)),
                    "kingdomId": p.get("kingdomId").cloned().unwrap_or(serde_json::json!(0)),
                    "area": p.get("area").cloned().unwrap_or(serde_json::json!(0)),
                    "biomePrimary": p.get("biomePrimary").cloned().unwrap_or(serde_json::json!(0)),
                    "biomePrimaryId": p.get("biomePrimaryId").cloned().unwrap_or(serde_json::json!(null)),
                    "biomeConfidence": p.get("biomeConfidence").cloned().unwrap_or(serde_json::json!(null)),
                    "biomeCandidateIds": p.get("biomeCandidateIds").cloned().unwrap_or(serde_json::json!([])),
                    "population": p.get("population").cloned().unwrap_or(serde_json::json!(null)),
                    "wealth": p.get("wealth").cloned().unwrap_or(serde_json::json!(null)),
                    "development": p.get("development").cloned().unwrap_or(serde_json::json!(null)),
                }));
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!(regions))).into_response()
}

fn current_timestamp_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn default_main_lore_snippet() -> serde_json::Value {
    serde_json::json!({
        "id": "main-lore",
        "title": "Main Lore",
        "priority": "main",
        "date": serde_json::Value::Null,
        "location": "World",
        "content": "",
        "locationId": serde_json::Value::Null,
        "provinceRegionId": serde_json::Value::Null,
        "source": "manual",
        "isCustomized": true,
        "involvedFactions": [],
        "involvedCharacters": []
    })
}

fn ensure_string_array(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn normalize_lore_priority(value: Option<&serde_json::Value>) -> String {
    match value.and_then(|v| v.as_str()).unwrap_or("minor") {
        "main" => "main".to_string(),
        "critical" => "critical".to_string(),
        "major" => "major".to_string(),
        _ => "minor".to_string(),
    }
}

fn normalize_lore_snippet_value(value: &serde_json::Value) -> Option<serde_json::Value> {
    let obj = value.as_object()?;
    let mut id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut priority = normalize_lore_priority(obj.get("priority"));
    let mut title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);

    if id == "main-lore" || priority == "main" {
        id = "main-lore".to_string();
        priority = "main".to_string();
        title = Some("Main Lore".to_string());
    }

    let date = match obj.get("date") {
        Some(v) if v.is_object() => v.clone(),
        Some(serde_json::Value::Null) => serde_json::Value::Null,
        _ => serde_json::Value::Null,
    };
    let location = obj
        .get("location")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(if priority == "main" {
            "World"
        } else {
            "Unknown"
        })
        .to_string();
    let content = obj
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let location_id = obj
        .get("locationId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let province_region_id = obj
        .get("provinceRegionId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let source = match obj.get("source").and_then(|v| v.as_str()).unwrap_or("manual") {
        "humanity_generated" => "humanity_generated",
        _ => "manual",
    };
    let is_customized = obj
        .get("isCustomized")
        .and_then(|v| v.as_bool())
        .unwrap_or(priority == "main");

    Some(serde_json::json!({
        "id": id,
        "title": title,
        "priority": priority,
        "date": if priority == "main" { serde_json::Value::Null } else { date },
        "location": if priority == "main" { serde_json::Value::String("World".to_string()) } else { serde_json::Value::String(location) },
        "locationId": if priority == "main" { serde_json::Value::Null } else { location_id.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null) },
        "provinceRegionId": if priority == "main" { serde_json::Value::Null } else { province_region_id.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null) },
        "source": if priority == "main" { serde_json::Value::String("manual".to_string()) } else { serde_json::Value::String(source.to_string()) },
        "isCustomized": serde_json::Value::Bool(if priority == "main" { true } else { is_customized }),
        "content": content,
        "involvedFactions": ensure_string_array(obj.get("involvedFactions")),
        "involvedCharacters": ensure_string_array(obj.get("involvedCharacters"))
    }))
}

fn normalize_lore_snippets_value(value: serde_json::Value) -> serde_json::Value {
    let mut normalized = value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(normalize_lore_snippet_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut canonical_main: Option<serde_json::Value> = None;

    for snippet in &mut normalized {
        let is_main = snippet
            .get("priority")
            .and_then(|v| v.as_str())
            .map(|v| v == "main")
            .unwrap_or(false);
        let is_main_id = snippet
            .get("id")
            .and_then(|v| v.as_str())
            .map(|v| v == "main-lore")
            .unwrap_or(false);

        if is_main || is_main_id {
            if canonical_main.is_none() {
                let mut main = snippet.clone();
                if let Some(obj) = main.as_object_mut() {
                    obj.insert(
                        "id".to_string(),
                        serde_json::Value::String("main-lore".to_string()),
                    );
                    obj.insert(
                        "title".to_string(),
                        serde_json::Value::String("Main Lore".to_string()),
                    );
                    obj.insert(
                        "priority".to_string(),
                        serde_json::Value::String("main".to_string()),
                    );
                    obj.insert("date".to_string(), serde_json::Value::Null);
                    obj.insert(
                        "location".to_string(),
                        serde_json::Value::String("World".to_string()),
                    );
                    obj.insert(
                        "locationId".to_string(),
                        serde_json::Value::Null,
                    );
                    obj.insert(
                        "provinceRegionId".to_string(),
                        serde_json::Value::Null,
                    );
                    obj.insert(
                        "source".to_string(),
                        serde_json::Value::String("manual".to_string()),
                    );
                    obj.insert(
                        "isCustomized".to_string(),
                        serde_json::Value::Bool(true),
                    );
                }
                canonical_main = Some(main);
            } else if let Some(obj) = snippet.as_object_mut() {
                if obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|v| v == "main-lore")
                    .unwrap_or(false)
                {
                    obj.insert(
                        "id".to_string(),
                        serde_json::Value::String(Uuid::new_v4().to_string()),
                    );
                }
                obj.insert(
                    "priority".to_string(),
                    serde_json::Value::String("major".to_string()),
                );
            }
        }
    }

    normalized.retain(|snippet| {
        snippet
            .get("id")
            .and_then(|v| v.as_str())
            .map(|id| id != "main-lore")
            .unwrap_or(true)
            || snippet
                .get("priority")
                .and_then(|v| v.as_str())
                .map(|priority| priority != "main")
                .unwrap_or(true)
    });

    let mut ordered = vec![canonical_main.unwrap_or_else(default_main_lore_snippet)];
    normalized.sort_by(|a, b| {
        let rank = |snippet: &serde_json::Value| match snippet
            .get("priority")
            .and_then(|v| v.as_str())
            .unwrap_or("minor")
        {
            "critical" => 0,
            "major" => 1,
            "minor" => 2,
            _ => 3,
        };
        rank(a).cmp(&rank(b))
    });
    ordered.extend(normalized);
    serde_json::Value::Array(ordered)
}

fn read_lore_snippets(state: &AppState, world_id: &str) -> serde_json::Value {
    let planet_dir = state.planets_dir.join(world_id);
    let _ = std::fs::create_dir_all(&planet_dir);
    let file_path = planet_dir.join("lore_snippets.json");
    let raw = std::fs::read_to_string(&file_path)
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::Value::Array(vec![default_main_lore_snippet()]));
    let normalized = normalize_lore_snippets_value(raw);
    let _ = std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&normalized).unwrap_or_default(),
    );
    normalized
}

fn lore_snippet_signature(snippet: &serde_json::Value) -> String {
    serde_json::to_string(&serde_json::json!({
        "title": snippet.get("title").cloned().unwrap_or(serde_json::Value::Null),
        "priority": snippet.get("priority").cloned().unwrap_or(serde_json::Value::Null),
        "date": snippet.get("date").cloned().unwrap_or(serde_json::Value::Null),
        "location": snippet.get("location").cloned().unwrap_or(serde_json::Value::Null),
        "locationId": snippet.get("locationId").cloned().unwrap_or(serde_json::Value::Null),
        "provinceRegionId": snippet.get("provinceRegionId").cloned().unwrap_or(serde_json::Value::Null),
        "content": snippet.get("content").cloned().unwrap_or(serde_json::Value::Null),
        "involvedFactions": snippet.get("involvedFactions").cloned().unwrap_or(serde_json::Value::Array(vec![])),
        "involvedCharacters": snippet.get("involvedCharacters").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    }))
    .unwrap_or_default()
}

fn merge_saved_lore_snippets(existing: &serde_json::Value, incoming: serde_json::Value) -> serde_json::Value {
    let normalized_existing = normalize_lore_snippets_value(existing.clone());
    let normalized_incoming = normalize_lore_snippets_value(incoming);
    let existing_by_id = normalized_existing
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|snippet| snippet.get("id").and_then(|value| value.as_str()).map(|id| (id.to_string(), snippet.clone())))
        .collect::<HashMap<_, _>>();

    let merged = normalized_incoming
        .as_array()
        .into_iter()
        .flatten()
        .map(|snippet| {
            let mut next = snippet.clone();
            let id = snippet.get("id").and_then(|value| value.as_str()).unwrap_or_default();
            let priority = snippet.get("priority").and_then(|value| value.as_str()).unwrap_or("minor");
            if let Some(previous) = existing_by_id.get(id) {
                let previous_source = previous.get("source").and_then(|value| value.as_str()).unwrap_or("manual");
                let changed = lore_snippet_signature(previous) != lore_snippet_signature(snippet);
                if let Some(obj) = next.as_object_mut() {
                    obj.insert(
                        "source".to_string(),
                        serde_json::Value::String(previous_source.to_string()),
                    );
                    obj.insert(
                        "isCustomized".to_string(),
                        serde_json::Value::Bool(
                            previous.get("isCustomized").and_then(|value| value.as_bool()).unwrap_or(priority == "main")
                                || changed
                        ),
                    );
                }
            } else if let Some(obj) = next.as_object_mut() {
                obj.insert(
                    "source".to_string(),
                    serde_json::Value::String("manual".to_string()),
                );
                obj.insert(
                    "isCustomized".to_string(),
                    serde_json::Value::Bool(true),
                );
            }
            if priority == "main" {
                if let Some(obj) = next.as_object_mut() {
                    obj.insert(
                        "source".to_string(),
                        serde_json::Value::String("manual".to_string()),
                    );
                    obj.insert(
                        "isCustomized".to_string(),
                        serde_json::Value::Bool(true),
                    );
                }
            }
            next
        })
        .collect::<Vec<_>>();

    serde_json::Value::Array(merged)
}

fn evaluate_humanity_readiness_from_lore(lore: &serde_json::Value) -> HumanityReadinessResponse {
    let min_main_lore_chars = 250usize;
    let main_lore = lore
        .as_array()
        .into_iter()
        .flatten()
        .find(|snippet| {
            snippet.get("id").and_then(|value| value.as_str()) == Some("main-lore")
                || snippet.get("priority").and_then(|value| value.as_str()) == Some("main")
        });
    let main_lore_text = main_lore
        .and_then(|snippet| snippet.get("content").and_then(|value| value.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    let main_lore_chars = main_lore_text.chars().count();
    let has_main_lore = !main_lore_text.is_empty();
    let mut blockers = Vec::new();
    if !has_main_lore {
        blockers.push("Main lore is empty. Write the foundational world canon in /history before running Humanity.".to_string());
    } else if main_lore_chars < min_main_lore_chars {
        blockers.push(format!(
            "Main lore is too short for Humanity generation. Add at least {} more characters to the main lore entry.",
            min_main_lore_chars.saturating_sub(main_lore_chars)
        ));
    }

    HumanityReadinessResponse {
        ready: blockers.is_empty(),
        blockers,
        main_lore_chars,
        min_main_lore_chars,
        has_main_lore,
    }
}

fn default_gm_settings(world_id: &str) -> serde_json::Value {
    serde_json::json!({
        "worldId": world_id,
        "worldPrompt": "",
        "contextSources": {
            "mainLore": true,
            "criticalLore": true,
            "majorLore": true,
            "minorLore": false,
            "regions": true,
            "locations": true,
            "factions": true,
            "characters": true,
            "temporality": true
        },
        "maxLoreSnippets": 8,
        "systemDirective": "You are the Ashtrail Game Master. Treat the world canon as fixed context and generate events that reinforce it rather than overwrite it.",
        "ambience": {
            "atmosphere": "high",
            "pressure": "high",
            "scarcity": "medium",
            "socialTension": "high",
            "groundedConsequences": "high",
            "tones": ["bleak", "frontier"],
            "notes": ""
        },
        "ambienceDirective": "Favor atmosphere, pressure, scarcity, social tension, and grounded consequences that match the world's established tone.",
        "negativeDirective": "Do not contradict established lore, invent unrelated genre shifts, or let events rewrite canon history.",
        "eventPromptPrefix": "Use the following world canon and ambience as hard context for event generation.",
        "updatedAt": current_timestamp_ms()
    })
}

fn normalize_gm_intensity(value: Option<&serde_json::Value>, fallback: &str) -> serde_json::Value {
    let normalized = value
        .and_then(|entry| entry.as_str())
        .map(|entry| entry.trim().to_lowercase())
        .filter(|entry| matches!(entry.as_str(), "low" | "medium" | "high"))
        .unwrap_or_else(|| fallback.to_string());
    serde_json::Value::String(normalized)
}

fn normalize_gm_ambience_value(
    input: Option<&serde_json::Value>,
    defaults: &serde_json::Value,
    legacy_ambience_directive: Option<&str>,
    default_legacy_ambience_directive: &str,
) -> serde_json::Value {
    let input = input
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    let defaults = defaults.as_object().cloned().unwrap_or_default();

    let default_notes = defaults
        .get("notes")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let legacy_notes = legacy_ambience_directive
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != default_legacy_ambience_directive)
        .unwrap_or(default_notes);

    let tones = input
        .get("tones")
        .and_then(|value| value.as_array())
        .map(|items| {
            let mut deduped = Vec::<String>::new();
            for item in items {
                if let Some(value) = item.as_str() {
                    let normalized = value.trim().to_lowercase();
                    if !normalized.is_empty() && !deduped.contains(&normalized) {
                        deduped.push(normalized);
                    }
                }
            }
            deduped
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| {
            defaults
                .get("tones")
                .and_then(|value| value.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        });

    let notes = input
        .get("notes")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(legacy_notes);

    serde_json::json!({
        "atmosphere": normalize_gm_intensity(input.get("atmosphere"), defaults.get("atmosphere").and_then(|value| value.as_str()).unwrap_or("high")),
        "pressure": normalize_gm_intensity(input.get("pressure"), defaults.get("pressure").and_then(|value| value.as_str()).unwrap_or("high")),
        "scarcity": normalize_gm_intensity(input.get("scarcity"), defaults.get("scarcity").and_then(|value| value.as_str()).unwrap_or("medium")),
        "socialTension": normalize_gm_intensity(input.get("socialTension"), defaults.get("socialTension").and_then(|value| value.as_str()).unwrap_or("high")),
        "groundedConsequences": normalize_gm_intensity(input.get("groundedConsequences"), defaults.get("groundedConsequences").and_then(|value| value.as_str()).unwrap_or("high")),
        "tones": tones,
        "notes": notes
    })
}

fn compile_gm_ambience_directive(
    ambience: Option<&serde_json::Value>,
    legacy_ambience_directive: Option<&str>,
) -> String {
    let Some(ambience) = ambience.and_then(|value| value.as_object()) else {
        return legacy_ambience_directive
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Favor atmosphere, pressure, scarcity, social tension, and grounded consequences that match the world's established tone.")
            .to_string();
    };

    let read_level = |key: &str, fallback: &str| -> String {
        ambience
            .get(key)
            .and_then(|value| value.as_str())
            .unwrap_or(fallback)
            .to_string()
    };

    let tones = ambience
        .get("tones")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .filter(|item| !item.trim().is_empty())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let notes = ambience
        .get("notes")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or("");

    let mut parts = vec![format!(
        "Keep atmosphere {atmosphere}, narrative pressure {pressure}, scarcity {scarcity}, social tension {social_tension}, and grounded consequences {grounded_consequences}.",
        atmosphere = read_level("atmosphere", "high"),
        pressure = read_level("pressure", "high"),
        scarcity = read_level("scarcity", "medium"),
        social_tension = read_level("socialTension", "high"),
        grounded_consequences = read_level("groundedConsequences", "high"),
    )];

    if !tones.is_empty() {
        parts.push(format!("Lean into tonal accents such as {tones}."));
    }
    if !notes.is_empty() {
        parts.push(format!("Additional ambience notes: {notes}"));
    }

    parts.join(" ")
}

fn normalize_gm_settings_value(value: serde_json::Value, world_id: &str) -> serde_json::Value {
    let defaults = default_gm_settings(world_id);
    let mut normalized = defaults.as_object().cloned().unwrap_or_default();
    let input = value.as_object().cloned().unwrap_or_default();
    let default_legacy_ambience_directive = normalized
        .get("ambienceDirective")
        .and_then(|value| value.as_str())
        .unwrap_or("Favor atmosphere, pressure, scarcity, social tension, and grounded consequences that match the world's established tone.")
        .to_string();

    if let Some(context_defaults) = normalized
        .get("contextSources")
        .and_then(|v| v.as_object())
        .cloned()
    {
        let input_sources = input
            .get("contextSources")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        let mut merged_sources = serde_json::Map::new();
        for (key, default_value) in context_defaults {
            let merged = input_sources
                .get(&key)
                .and_then(|v| v.as_bool())
                .map(serde_json::Value::Bool)
                .unwrap_or(default_value);
            merged_sources.insert(key, merged);
        }
        normalized.insert(
            "contextSources".to_string(),
            serde_json::Value::Object(merged_sources),
        );
    }

    normalized.insert(
        "worldId".to_string(),
        serde_json::Value::String(world_id.to_string()),
    );
    normalized.insert(
        "maxLoreSnippets".to_string(),
        serde_json::Value::Number(
            input
                .get("maxLoreSnippets")
                .and_then(|v| v.as_u64())
                .unwrap_or(8)
                .clamp(1, 32)
                .into(),
        ),
    );

    let normalized_ambience = normalize_gm_ambience_value(
        input.get("ambience"),
        defaults.get("ambience").unwrap_or(&serde_json::Value::Null),
        input
            .get("ambienceDirective")
            .and_then(|value| value.as_str())
            .or_else(|| {
                normalized
                    .get("ambienceDirective")
                    .and_then(|value| value.as_str())
            }),
        &default_legacy_ambience_directive,
    );
    normalized.insert("ambience".to_string(), normalized_ambience);

    for key in [
        "worldPrompt",
        "systemDirective",
        "ambienceDirective",
        "negativeDirective",
        "eventPromptPrefix",
    ] {
        let value = input
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                normalized
                    .get(key)
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
            .unwrap_or_default();
        normalized.insert(key.to_string(), serde_json::Value::String(value));
    }

    normalized.insert(
        "updatedAt".to_string(),
        serde_json::Value::Number(current_timestamp_ms().into()),
    );

    serde_json::Value::Object(normalized)
}

fn read_gm_settings(state: &AppState, world_id: &str) -> serde_json::Value {
    let planet_dir = state.planets_dir.join(world_id);
    let _ = std::fs::create_dir_all(&planet_dir);
    let file_path = planet_dir.join("gm_settings.json");
    let raw = std::fs::read_to_string(&file_path)
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| default_gm_settings(world_id));
    let normalized = normalize_gm_settings_value(raw, world_id);
    let _ = std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&normalized).unwrap_or_default(),
    );
    normalized
}

fn summarize_named_records(data: &serde_json::Value, text_key: &str, limit: usize) -> String {
    data.as_array()
        .map(|items| {
            items
                .iter()
                .take(limit)
                .filter_map(|item| {
                    let name = item.get("name").and_then(|v| v.as_str())?;
                    let detail = item.get(text_key).and_then(|v| v.as_str()).unwrap_or("");
                    if detail.trim().is_empty() {
                        Some(name.to_string())
                    } else {
                        Some(format!("{name}: {detail}"))
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn build_context_section_summary(
    key: &str,
    label: &str,
    enabled: bool,
    item_count: usize,
    preview: String,
    meta: Option<String>,
) -> serde_json::Value {
    serde_json::json!({
        "key": key,
        "label": label,
        "enabled": enabled,
        "itemCount": item_count,
        "preview": if preview.trim().is_empty() {
            if enabled {
                "No canon records are available yet.".to_string()
            } else {
                "Excluded from the compiled GM context.".to_string()
            }
        } else {
            preview
        },
        "meta": meta
    })
}

async fn get_gm_settings(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    (StatusCode::OK, Json(read_gm_settings(&state, &id))).into_response()
}

async fn save_gm_settings(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(settings): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let normalized = normalize_gm_settings_value(settings, &id);
    let file_path = planet_dir.join("gm_settings.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&normalized).unwrap_or_default(),
    ) {
        Ok(_) => (StatusCode::OK, Json(normalized)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_gm_context(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let lore = read_lore_snippets(&state, &id);
    let settings = read_gm_settings(&state, &id);
    let planet_dir = state.planets_dir.join(&id);
    let metadata = std::fs::read_to_string(planet_dir.join("metadata.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let factions = std::fs::read_to_string(planet_dir.join("factions.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::json!([]));
    let locations = std::fs::read_to_string(planet_dir.join("locations.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::json!([]));
    let characters = std::fs::read_to_string(planet_dir.join("characters.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::json!([]));
    let regions = std::fs::read_to_string(planet_dir.join("geography.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or_else(|| serde_json::json!([]));
    let temporality = std::fs::read_to_string(planet_dir.join("temporality.json"))
        .ok()
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .unwrap_or(serde_json::Value::Null);

    let context_sources = settings
        .get("contextSources")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let max_lore = settings
        .get("maxLoreSnippets")
        .and_then(|v| v.as_u64())
        .unwrap_or(8) as usize;

    let lore_items = lore.as_array().cloned().unwrap_or_default();
    let lore_counts = {
        let mut counts = serde_json::Map::new();
        for key in ["main", "critical", "major", "minor"] {
            let count = lore_items
                .iter()
                .filter(|snippet| snippet.get("priority").and_then(|v| v.as_str()) == Some(key))
                .count();
            counts.insert(
                key.to_string(),
                serde_json::Value::Number((count as u64).into()),
            );
        }
        counts
    };

    let mut selected_lore: Vec<serde_json::Value> = Vec::new();
    if context_sources
        .get("mainLore")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
    {
        if let Some(main) = lore_items
            .iter()
            .find(|snippet| snippet.get("priority").and_then(|v| v.as_str()) == Some("main"))
        {
            selected_lore.push(main.clone());
        }
    }

    let mut lore_budget = max_lore;
    for (priority, enabled_key) in [
        ("critical", "criticalLore"),
        ("major", "majorLore"),
        ("minor", "minorLore"),
    ] {
        if !context_sources
            .get(enabled_key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }
        for snippet in lore_items
            .iter()
            .filter(|snippet| snippet.get("priority").and_then(|v| v.as_str()) == Some(priority))
        {
            if lore_budget == 0 {
                break;
            }
            selected_lore.push(snippet.clone());
            lore_budget -= 1;
        }
    }

    let used_counts = {
        let mut counts = serde_json::Map::new();
        for key in ["main", "critical", "major", "minor"] {
            let count = selected_lore
                .iter()
                .filter(|snippet| snippet.get("priority").and_then(|v| v.as_str()) == Some(key))
                .count();
            counts.insert(
                key.to_string(),
                serde_json::Value::Number((count as u64).into()),
            );
        }
        counts
    };

    let world_name = metadata
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown World");
    let world_seed_prompt = metadata
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let world_prompt = settings
        .get("worldPrompt")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let compiled_ambience_directive = compile_gm_ambience_directive(
        settings.get("ambience"),
        settings
            .get("ambienceDirective")
            .and_then(|value| value.as_str()),
    );

    let lore_block = selected_lore
        .iter()
        .map(|snippet| {
            let priority = snippet
                .get("priority")
                .and_then(|v| v.as_str())
                .unwrap_or("minor")
                .to_uppercase();
            let title = snippet
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|v| !v.trim().is_empty())
                .or_else(|| snippet.get("location").and_then(|v| v.as_str()))
                .unwrap_or("Untitled");
            let content = snippet
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{priority}] {title}\n{content}")
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut enabled_sources = Vec::new();
    for (key, enabled) in &context_sources {
        if enabled.as_bool().unwrap_or(false) {
            enabled_sources.push(key.clone());
        }
    }

    let lore_preview = selected_lore
        .iter()
        .take(3)
        .map(|snippet| {
            let title = snippet
                .get("title")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .or_else(|| snippet.get("location").and_then(|value| value.as_str()))
                .unwrap_or("Untitled");
            let content = snippet
                .get("content")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if content.is_empty() {
                title.to_string()
            } else {
                format!("{title}: {content}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let factions_enabled = context_sources
        .get("factions")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let locations_enabled = context_sources
        .get("locations")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let characters_enabled = context_sources
        .get("characters")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let regions_enabled = context_sources
        .get("regions")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let temporality_enabled = context_sources
        .get("temporality")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let factions_preview = summarize_named_records(&factions, "lore", 3);
    let locations_preview = summarize_named_records(&locations, "lore", 3);
    let characters_preview = summarize_named_records(&characters, "lore", 3);
    let regions_preview = summarize_named_records(&regions, "lore", 3);
    let temporality_preview =
        serde_json::to_string_pretty(&temporality).unwrap_or_else(|_| "Unavailable".to_string());
    let lore_enabled = context_sources
        .get("mainLore")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
        || context_sources
            .get("criticalLore")
            .and_then(|value| value.as_bool())
            .unwrap_or(true)
        || context_sources
            .get("majorLore")
            .and_then(|value| value.as_bool())
            .unwrap_or(true)
        || context_sources
            .get("minorLore")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
    let source_sections = vec![
        build_context_section_summary(
            "lore",
            "Lore / History",
            lore_enabled,
            selected_lore.len(),
            lore_preview,
            Some(format!(
                "{used_main} main, {used_critical} critical, {used_major} major, {used_minor} minor",
                used_main = used_counts.get("main").and_then(|value| value.as_u64()).unwrap_or(0),
                used_critical = used_counts.get("critical").and_then(|value| value.as_u64()).unwrap_or(0),
                used_major = used_counts.get("major").and_then(|value| value.as_u64()).unwrap_or(0),
                used_minor = used_counts.get("minor").and_then(|value| value.as_u64()).unwrap_or(0),
            )),
        ),
        build_context_section_summary(
            "factions",
            "Factions",
            factions_enabled,
            factions.as_array().map(|items| items.len()).unwrap_or(0),
            factions_preview.clone(),
            Some("Dynamic faction canon from History".to_string()),
        ),
        build_context_section_summary(
            "locations",
            "Locations",
            locations_enabled,
            locations.as_array().map(|items| items.len()).unwrap_or(0),
            locations_preview.clone(),
            Some("Scene anchors and place-state injected at runtime".to_string()),
        ),
        build_context_section_summary(
            "characters",
            "Characters",
            characters_enabled,
            characters.as_array().map(|items| items.len()).unwrap_or(0),
            characters_preview.clone(),
            Some("Live NPC and world-character context".to_string()),
        ),
        build_context_section_summary(
            "regions",
            "Regions",
            regions_enabled,
            regions.as_array().map(|items| items.len()).unwrap_or(0),
            regions_preview.clone(),
            Some("Geographic context stays dynamic".to_string()),
        ),
        build_context_section_summary(
            "temporality",
            "Temporality",
            temporality_enabled,
            if temporality.is_null() { 0 } else { 1 },
            temporality_preview.clone(),
            Some("Timeline state and calendar context".to_string()),
        ),
    ];

    let framework_section = format!(
        "{event_prefix}\n\nNegative Directive:\n{negative_directive}\n\nUse this material as ambient canon and hard context. Generated gameplay events must fit within it and must not rewrite or replace it.",
        event_prefix = settings.get("eventPromptPrefix").and_then(|value| value.as_str()).unwrap_or("Use the following world canon and ambience as hard context for event generation."),
        negative_directive = settings.get("negativeDirective").and_then(|value| value.as_str()).unwrap_or(""),
    );
    let authoring_section = format!(
        "World: {world_name}\nCanonical World Prompt:\n{world_prompt_block}\n\nSystem Directive:\n{system_directive}\n\nAmbience Directive:\n{ambience_directive}",
        world_name = world_name,
        world_prompt_block = if world_prompt.trim().is_empty() {
            "MISSING - write a canonical world prompt in Game Master before using this context."
        } else {
            world_prompt
        },
        system_directive = settings.get("systemDirective").and_then(|v| v.as_str()).unwrap_or(""),
        ambience_directive = compiled_ambience_directive,
    );
    let dynamic_context_section = format!(
        "Canon Lore:\n{lore_block}\n\nFactions:\n{factions_block}\n\nLocations:\n{locations_block}\n\nCharacters:\n{characters_block}\n\nRegions:\n{regions_block}\n\nTemporality:\n{temporality_block}",
        lore_block = lore_block,
        factions_block = if factions_enabled {
            factions_preview.clone()
        } else {
            "Disabled".to_string()
        },
        locations_block = if locations_enabled {
            locations_preview.clone()
        } else {
            "Disabled".to_string()
        },
        characters_block = if characters_enabled {
            characters_preview.clone()
        } else {
            "Disabled".to_string()
        },
        regions_block = if regions_enabled {
            regions_preview.clone()
        } else {
            "Disabled".to_string()
        },
        temporality_block = if temporality_enabled {
            temporality_preview.clone()
        } else {
            "Disabled".to_string()
        },
    );

    let prompt_block = format!(
        "{event_prefix}\n\nWorld: {world_name}\nCanonical World Prompt:\n{world_prompt_block}\n\nSystem Directive:\n{system_directive}\n\nAmbience Directive:\n{ambience_directive}\n\nNegative Directive:\n{negative_directive}\n\nCanon Lore:\n{lore_block}\n\nFactions:\n{factions_block}\n\nLocations:\n{locations_block}\n\nCharacters:\n{characters_block}\n\nRegions:\n{regions_block}\n\nTemporality:\n{temporality_block}\n\nUse this material as ambient canon and hard context. Generated gameplay events must fit within it and must not rewrite or replace it.",
        event_prefix = settings.get("eventPromptPrefix").and_then(|v| v.as_str()).unwrap_or("Use the following world canon and ambience as hard context for event generation."),
        world_prompt_block = if world_prompt.trim().is_empty() {
            "MISSING - write a canonical world prompt in Game Master before using this context."
        } else {
            world_prompt
        },
        system_directive = settings.get("systemDirective").and_then(|v| v.as_str()).unwrap_or(""),
        ambience_directive = compiled_ambience_directive,
        negative_directive = settings.get("negativeDirective").and_then(|v| v.as_str()).unwrap_or(""),
        factions_block = if factions_enabled {
            summarize_named_records(&factions, "lore", 12)
        } else {
            "Disabled".to_string()
        },
        locations_block = if locations_enabled {
            summarize_named_records(&locations, "lore", 12)
        } else {
            "Disabled".to_string()
        },
        characters_block = if characters_enabled {
            summarize_named_records(&characters, "lore", 12)
        } else {
            "Disabled".to_string()
        },
        regions_block = if regions_enabled {
            summarize_named_records(&regions, "lore", 12)
        } else {
            "Disabled".to_string()
        },
        temporality_block = if temporality_enabled {
            serde_json::to_string_pretty(&temporality).unwrap_or_else(|_| "Unavailable".to_string())
        } else {
            "Disabled".to_string()
        },
    );

    let response = serde_json::json!({
        "worldId": id,
        "worldName": world_name,
        "worldPrompt": world_prompt,
        "worldSeedPrompt": world_seed_prompt,
        "ambience": settings.get("ambience").cloned().unwrap_or(serde_json::Value::Null),
        "settings": settings,
        "snippets": selected_lore,
        "promptBlock": prompt_block,
        "compiledSections": {
            "framework": framework_section,
            "authoring": authoring_section,
            "dynamicContext": dynamic_context_section
        },
        "sourceSummary": {
            "enabledSources": enabled_sources,
            "loreCounts": lore_counts,
            "usedLoreCounts": used_counts,
            "maxLoreSnippets": max_lore,
            "sections": source_sections
        }
    });

    (StatusCode::OK, Json(response)).into_response()
}

async fn get_lore_snippets(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    (StatusCode::OK, Json(read_lore_snippets(&state, &id))).into_response()
}

async fn get_humanity_readiness(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let lore = read_lore_snippets(&state, &id);
    (
        StatusCode::OK,
        Json(serde_json::json!(evaluate_humanity_readiness_from_lore(&lore))),
    )
        .into_response()
}

async fn save_lore_snippets(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(snippets): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("lore_snippets.json");
    let existing = read_lore_snippets(&state, &id);
    let normalized = merge_saved_lore_snippets(&existing, snippets);
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&normalized).unwrap_or_default(),
    ) {
        Ok(_) => (StatusCode::OK, Json(normalized)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_temporality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("temporality.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    // Return empty payload if not found
    (StatusCode::OK, Json(serde_json::Value::Null)).into_response()
}

async fn save_temporality(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(temporality): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("temporality.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&temporality).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_factions(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("factions.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    (StatusCode::OK, Json(serde_json::json!([]))).into_response()
}

async fn save_factions(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(factions): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("factions.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&factions).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_locations(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let locations = locations::read_locations(&state.planets_dir, &id);
    (StatusCode::OK, Json(serde_json::json!(locations))).into_response()
}

async fn get_areas(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    get_locations(State(state), Path(id)).await
}

async fn get_location_generation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let metadata = locations::read_generation_metadata(&state.planets_dir, &id)
        .map(|value| serde_json::json!(value))
        .unwrap_or(serde_json::Value::Null);
    (StatusCode::OK, Json(metadata)).into_response()
}

async fn save_locations(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(locations): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let existing = locations::read_locations(&state.planets_dir, &id);
    let normalized = locations::merge_saved_locations(&existing, locations::normalize_locations_value(locations));
    match locations::write_locations(&state.planets_dir, &id, &normalized) {
        Ok(saved) => (StatusCode::OK, Json(serde_json::json!(saved))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

async fn adopt_humanity_managed_locations(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<HumanityAdoptionRequest>,
) -> impl IntoResponse {
    match locations::adopt_existing_humanity_output(
        &state.planets_dir,
        &id,
        &request.scope_mode,
        &request.scope_targets,
    ) {
        Ok(saved) => (StatusCode::OK, Json(serde_json::json!(saved))).into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, error).into_response(),
    }
}

async fn generate_locations_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(world_id): Path<String>,
    Json(request): Json<locations::LocationGenerationRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let lore = read_lore_snippets(&state, &world_id);
    let readiness = evaluate_humanity_readiness_from_lore(&lore);
    if !readiness.ready {
        return Err((StatusCode::BAD_REQUEST, readiness.blockers.join(" ")));
    }

    let job_id = Uuid::new_v4().to_string();
    let tracked_meta = parse_tracked_job_meta(&headers);

    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        let mut job = make_job_record(
            tracked_meta
                .as_ref()
                .and_then(|meta| meta.kind.as_deref())
                .unwrap_or("worldgen.locations.generate"),
            tracked_meta
                .as_ref()
                .and_then(|meta| meta.title.as_deref())
                .unwrap_or("Generate Locations"),
            tracked_meta
                .as_ref()
                .and_then(|meta| meta.tool.as_deref())
                .unwrap_or("worldgen"),
            "Preparing location simulation...",
            Some(world_id.clone()),
            None,
        );
        let mut metadata = serde_json::Map::new();
        metadata.insert("scopeMode".to_string(), serde_json::json!(request.scope_mode));
        metadata.insert("scopeTargets".to_string(), serde_json::json!(request.scope_targets));
        if let Some(meta) = tracked_meta {
            if let Some(restore) = meta.restore {
                metadata.insert("restore".to_string(), restore);
            }
            if let Some(extra) = meta.metadata {
                metadata.insert("metadata".to_string(), extra);
            }
        }
        job.metadata = Some(serde_json::Value::Object(metadata));
        jobs.insert(job_id.clone(), job);
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    let request_for_job = request.clone();
    tokio::task::spawn(async move {
        set_location_job_state(
            &jobs,
            &spawned_job_id,
            JobStatus::Running,
            5.0,
            "Loading worldgen and ecology inputs...",
            None,
        );

        match locations::simulate_locations(&planets_dir, &world_id, &request_for_job).await {
            Ok(output) => {
                set_location_job_state(
                    &jobs,
                    &spawned_job_id,
                    JobStatus::Running,
                    92.0,
                    "Persisting scoped Humanity output...",
                    None,
                );
                let write_locations = locations::write_locations(&planets_dir, &world_id, &output.locations);
                let lore_path = planets_dir.join(&world_id).join("lore_snippets.json");
                let normalized_lore = normalize_lore_snippets_value(serde_json::json!(output.lore_snippets));
                let write_lore = std::fs::write(
                    &lore_path,
                    serde_json::to_string_pretty(&normalized_lore).unwrap_or_default(),
                )
                .map_err(|error| format!("Failed to write {}: {}", lore_path.display(), error));
                let write_metadata =
                    locations::write_generation_metadata(&planets_dir, &world_id, &output.metadata);
                match (write_locations, write_lore, write_metadata) {
                    (Ok(_), Ok(_), Ok(_)) => {
                        if let Ok(mut map) = jobs.lock() {
                            if let Some(job) = map.get_mut(&spawned_job_id) {
                                let base_metadata = job
                                    .metadata
                                    .as_ref()
                                    .and_then(|value| value.as_object())
                                    .cloned()
                                    .unwrap_or_default();
                                let mut metadata = base_metadata;
                                metadata.insert(
                                    "resolvedProvinceIds".to_string(),
                                    serde_json::json!(output.resolved_province_ids),
                                );
                                metadata.insert(
                                    "generatedLocationCount".to_string(),
                                    serde_json::json!(output.generated_location_count),
                                );
                                metadata.insert(
                                    "generatedLoreCount".to_string(),
                                    serde_json::json!(output.generated_lore_count),
                                );
                                job.metadata = Some(serde_json::Value::Object(metadata));
                                job.output_refs = vec![
                                    JobOutputRef {
                                        id: "worldgen-route".to_string(),
                                        label: "Open Worldgen".to_string(),
                                        kind: "route".to_string(),
                                        href: None,
                                        route: Some(jobs::JobRouteRef {
                                            path: "/worldgen".to_string(),
                                            search: Some(serde_json::Map::from_iter([(
                                                "step".to_string(),
                                                serde_json::Value::String("HUMANITY".to_string()),
                                            )])),
                                        }),
                                        preview_text: None,
                                    },
                                    JobOutputRef {
                                        id: "history-locations-route".to_string(),
                                        label: "Open History Locations".to_string(),
                                        kind: "route".to_string(),
                                        href: None,
                                        route: Some(jobs::JobRouteRef {
                                            path: "/history".to_string(),
                                            search: Some(serde_json::Map::from_iter([(
                                                "tab".to_string(),
                                                serde_json::Value::String("locations".to_string()),
                                            )])),
                                        }),
                                        preview_text: None,
                                    },
                                    build_text_output_ref(
                                        "Humanity Summary",
                                        &format!(
                                            "{} locations • {} lore snippets • {} provinces",
                                            output.generated_location_count,
                                            output.generated_lore_count,
                                            output.resolved_province_ids.len()
                                        ),
                                    ),
                                ];
                            }
                        }
                        set_location_job_state(
                        &jobs,
                        &spawned_job_id,
                        JobStatus::Completed,
                        100.0,
                        "Completed",
                        None,
                    )
                    }
                    (Err(error), _, _) | (_, Err(error), _) | (_, _, Err(error)) => set_location_job_state(
                        &jobs,
                        &spawned_job_id,
                        JobStatus::Failed,
                        100.0,
                        "Failed to persist Humanity output",
                        Some(error),
                    ),
                }
            }
            Err(error) => {
                set_location_job_state(
                    &jobs,
                    &spawned_job_id,
                    JobStatus::Failed,
                    100.0,
                    "Location simulation failed",
                    Some(error),
                );
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

fn set_location_job_state(
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    job_id: &str,
    status: JobStatus,
    progress: f32,
    current_stage: &str,
    error: Option<String>,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = status;
            job.progress = progress;
            job.current_stage = current_stage.to_string();
            job.error = error;
            if !matches!(job.status, JobStatus::Completed) {
                job.result = None;
            }
        }
    }
}

async fn get_characters(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("characters.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    (StatusCode::OK, Json(serde_json::json!([]))).into_response()
}

async fn save_characters(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(characters): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("characters.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&characters).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_cells(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("cells.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    (StatusCode::OK, Json(serde_json::json!({}))).into_response()
}

async fn save_cells(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(cells): Json<serde_json::Value>,
) -> impl IntoResponse {
    let planet_dir = state.planets_dir.join(&id);
    if let Err(e) = std::fs::create_dir_all(&planet_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create planet dir: {e}"),
        )
            .into_response();
    }

    let file_path = planet_dir.join("cells.json");
    match std::fs::write(
        &file_path,
        serde_json::to_string_pretty(&cells).unwrap_or_default(),
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_cell_features(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let file_path = state.planets_dir.join(&id).join("cell_features.json");
    if let Ok(data) = std::fs::read_to_string(&file_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
            return (StatusCode::OK, Json(json)).into_response();
        }
    }
    (StatusCode::OK, Json(serde_json::json!(null))).into_response()
}

async fn reassign_worldgen_hierarchy(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
    Json(request): Json<HierarchyReassignRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let planets_dir = state.planets_dir.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let worldgen_dir = planets_dir.join(&planet_id).join("worldgen");
        if !worldgen_dir.exists() {
            return Err("Worldgen directory not found. Run the pipeline first.".to_string());
        }

        let provinces_path = worldgen_dir.join("provinces.json");
        let duchies_path = worldgen_dir.join("duchies.json");
        let kingdoms_path = worldgen_dir.join("kingdoms.json");
        let province_id_path = worldgen_dir.join("province_id.png");

        let provinces_text = std::fs::read_to_string(&provinces_path)
            .map_err(|e| format!("Failed to read provinces.json: {e}"))?;
        let duchies_text = std::fs::read_to_string(&duchies_path)
            .map_err(|e| format!("Failed to read duchies.json: {e}"))?;
        let kingdoms_text = std::fs::read_to_string(&kingdoms_path)
            .map_err(|e| format!("Failed to read kingdoms.json: {e}"))?;

        let mut provinces: Vec<ProvinceRecord> = serde_json::from_str(&provinces_text)
            .map_err(|e| format!("Failed to parse provinces.json: {e}"))?;
        let mut duchies: Vec<DuchyRecord> = serde_json::from_str(&duchies_text)
            .map_err(|e| format!("Failed to parse duchies.json: {e}"))?;
        let mut kingdoms: Vec<KingdomRecord> = serde_json::from_str(&kingdoms_text)
            .map_err(|e| format!("Failed to parse kingdoms.json: {e}"))?;
        let continents_path = worldgen_dir.join("continents.json");
        let mut existing_continents = read_continents_file(&continents_path).unwrap_or_default();

        let entity_type = request.entity_type.trim().to_ascii_lowercase();
        match entity_type.as_str() {
            "province" => {
                let Some(new_duchy_index) = duchies.iter().position(|d| d.id == request.target_id)
                else {
                    return Err(format!("Target duchy {} not found", request.target_id));
                };

                let Some(province_index) = provinces.iter().position(|p| p.id == request.entity_id)
                else {
                    return Err(format!("Province {} not found", request.entity_id));
                };

                let old_duchy_id = provinces[province_index].duchy_id;
                let new_duchy_id = duchies[new_duchy_index].id;
                let new_kingdom_id = duchies[new_duchy_index].kingdom_id;

                if old_duchy_id != new_duchy_id {
                    if let Some(old_duchy_index) = duchies.iter().position(|d| d.id == old_duchy_id)
                    {
                        duchies[old_duchy_index]
                            .province_ids
                            .retain(|&pid| pid != request.entity_id);
                    }
                    if !duchies[new_duchy_index]
                        .province_ids
                        .contains(&request.entity_id)
                    {
                        duchies[new_duchy_index]
                            .province_ids
                            .push(request.entity_id);
                    }
                }

                provinces[province_index].duchy_id = new_duchy_id;
                provinces[province_index].kingdom_id = new_kingdom_id;
            }
            "duchy" => {
                let Some(new_kingdom_index) =
                    kingdoms.iter().position(|k| k.id == request.target_id)
                else {
                    return Err(format!("Target kingdom {} not found", request.target_id));
                };

                let Some(duchy_index) = duchies.iter().position(|d| d.id == request.entity_id)
                else {
                    return Err(format!("Duchy {} not found", request.entity_id));
                };

                let old_kingdom_id = duchies[duchy_index].kingdom_id;
                let duchy_id = duchies[duchy_index].id;
                let new_kingdom_id = kingdoms[new_kingdom_index].id;

                if old_kingdom_id != new_kingdom_id {
                    if let Some(old_kingdom_index) =
                        kingdoms.iter().position(|k| k.id == old_kingdom_id)
                    {
                        kingdoms[old_kingdom_index]
                            .duchy_ids
                            .retain(|&did| did != duchy_id);
                    }
                    if !kingdoms[new_kingdom_index].duchy_ids.contains(&duchy_id) {
                        kingdoms[new_kingdom_index].duchy_ids.push(duchy_id);
                    }
                }

                duchies[duchy_index].kingdom_id = new_kingdom_id;
                for province in &mut provinces {
                    if province.duchy_id == duchy_id {
                        province.kingdom_id = new_kingdom_id;
                    }
                }
            }
            "kingdom" => {
                let Some(kingdom_index) = kingdoms.iter().position(|k| k.id == request.entity_id)
                else {
                    return Err(format!("Kingdom {} not found", request.entity_id));
                };
                let target_continent_exists = existing_continents
                    .iter()
                    .any(|c| c.id == request.target_id);
                if !target_continent_exists {
                    return Err(format!("Target continent {} not found", request.target_id));
                }
                // Kingdom reassignment is expressed through continent membership mapping below.
                let _kingdom_id = kingdoms[kingdom_index].id;
            }
            _ => {
                return Err("entityType must be one of: province, duchy, kingdom".to_string());
            }
        }

        // Rebuild parent-child lists from authoritative links to avoid stale memberships.
        for duchy in &mut duchies {
            duchy.province_ids.clear();
        }
        for province in &provinces {
            if let Some(duchy_index) = duchies.iter().position(|d| d.id == province.duchy_id) {
                duchies[duchy_index].province_ids.push(province.id);
            }
        }

        for kingdom in &mut kingdoms {
            kingdom.duchy_ids.clear();
        }
        for duchy in &duchies {
            if let Some(kingdom_index) = kingdoms.iter().position(|k| k.id == duchy.kingdom_id) {
                kingdoms[kingdom_index].duchy_ids.push(duchy.id);
            }
        }

        // Keep IDs unique and deterministic in arrays.
        for duchy in &mut duchies {
            duchy.province_ids.sort_unstable();
            duchy.province_ids.dedup();
        }
        for kingdom in &mut kingdoms {
            kingdom.duchy_ids.sort_unstable();
            kingdom.duchy_ids.dedup();
        }

        let provinces_json = serde_json::to_string_pretty(&provinces)
            .map_err(|e| format!("Failed to serialize provinces: {e}"))?;
        let duchies_json = serde_json::to_string_pretty(&duchies)
            .map_err(|e| format!("Failed to serialize duchies: {e}"))?;
        let kingdoms_json = serde_json::to_string_pretty(&kingdoms)
            .map_err(|e| format!("Failed to serialize kingdoms: {e}"))?;

        std::fs::write(&provinces_path, provinces_json)
            .map_err(|e| format!("Failed to write provinces.json: {e}"))?;
        std::fs::write(&duchies_path, duchies_json)
            .map_err(|e| format!("Failed to write duchies.json: {e}"))?;
        std::fs::write(&kingdoms_path, kingdoms_json)
            .map_err(|e| format!("Failed to write kingdoms.json: {e}"))?;

        // Rebuild duchy/kingdom ID textures from province labels + updated mappings.
        let province_img = image::open(&province_id_path)
            .map_err(|e| format!("Failed to open province_id.png: {e}"))?
            .to_rgb8();
        let (w, h) = province_img.dimensions();
        let labels_len = (w * h) as usize;

        let province_to_duchy: HashMap<u32, u32> =
            provinces.iter().map(|p| (p.id, p.duchy_id)).collect();
        let duchy_to_kingdom: HashMap<u32, u32> =
            duchies.iter().map(|d| (d.id, d.kingdom_id)).collect();

        let mut duchy_labels = vec![0u32; labels_len];
        let mut kingdom_labels = vec![0u32; labels_len];

        for (i, pixel) in province_img.pixels().enumerate() {
            let province_id =
                pixel[0] as u32 | ((pixel[1] as u32) << 8) | ((pixel[2] as u32) << 16);
            let duchy_id = province_to_duchy.get(&province_id).copied().unwrap_or(0);
            let kingdom_id = duchy_to_kingdom.get(&duchy_id).copied().unwrap_or(0);
            duchy_labels[i] = duchy_id;
            kingdom_labels[i] = kingdom_id;
        }

        worldgen_core::export::write_id_texture(
            &duchy_labels,
            w,
            h,
            &worldgen_dir.join("duchy_id.png"),
        )?;
        worldgen_core::export::write_id_texture(
            &kingdom_labels,
            w,
            h,
            &worldgen_dir.join("kingdom_id.png"),
        )?;

        let mut kingdom_to_continent: HashMap<u32, u32> = HashMap::new();
        let mut continent_names: HashMap<u32, String> = HashMap::new();
        for continent in &existing_continents {
            continent_names.insert(continent.id, continent.name.clone());
            for &kingdom_id in &continent.kingdom_ids {
                kingdom_to_continent.insert(kingdom_id, continent.id);
            }
        }
        if entity_type == "kingdom" {
            kingdom_to_continent.insert(request.entity_id, request.target_id);
        }
        // Ensure every kingdom belongs to a continent.
        for kingdom in &kingdoms {
            kingdom_to_continent.entry(kingdom.id).or_insert(kingdom.id);
            continent_names
                .entry(*kingdom_to_continent.get(&kingdom.id).unwrap_or(&kingdom.id))
                .or_insert_with(|| format!("Continent {}", kingdom.id + 1));
        }

        let mut continent_kingdom_ids: HashMap<u32, Vec<u32>> = HashMap::new();
        for kingdom in &kingdoms {
            let cid = kingdom_to_continent
                .get(&kingdom.id)
                .copied()
                .unwrap_or(kingdom.id);
            continent_kingdom_ids
                .entry(cid)
                .or_default()
                .push(kingdom.id);
        }

        let mut continents: Vec<ContinentRecord> = continent_kingdom_ids
            .into_iter()
            .map(|(continent_id, mut kingdom_ids)| {
                kingdom_ids.sort_unstable();
                kingdom_ids.dedup();
                let kingdom_set: HashSet<u32> = kingdom_ids.iter().copied().collect();

                let mut duchy_ids: Vec<u32> = duchies
                    .iter()
                    .filter(|d| kingdom_set.contains(&d.kingdom_id))
                    .map(|d| d.id)
                    .collect();
                duchy_ids.sort_unstable();
                duchy_ids.dedup();

                let mut province_ids: Vec<u32> = provinces
                    .iter()
                    .filter(|p| kingdom_set.contains(&p.kingdom_id))
                    .map(|p| p.id)
                    .collect();
                province_ids.sort_unstable();
                province_ids.dedup();

                ContinentRecord {
                    id: continent_id,
                    kingdom_ids,
                    duchy_ids,
                    province_ids,
                    name: continent_names
                        .get(&continent_id)
                        .cloned()
                        .unwrap_or_else(|| format!("Continent {}", continent_id + 1)),
                }
            })
            .collect();
        continents.sort_by_key(|c| c.id);

        let kingdom_to_continent: HashMap<u32, u32> = continents
            .iter()
            .flat_map(|c| c.kingdom_ids.iter().map(move |&kid| (kid, c.id)))
            .collect();
        let continent_labels: Vec<u32> = kingdom_labels
            .iter()
            .map(|&kid| kingdom_to_continent.get(&kid).copied().unwrap_or(0))
            .collect();
        worldgen_core::export::write_id_texture(
            &continent_labels,
            w,
            h,
            &worldgen_dir.join("continent_id.png"),
        )?;
        let continents_json = serde_json::to_string_pretty(&continents)
            .map_err(|e| format!("Failed to serialize continents: {e}"))?;
        std::fs::write(&continents_path, continents_json)
            .map_err(|e| format!("Failed to write continents.json: {e}"))?;

        Ok(())
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(HierarchyReassignResponse { success: true }))
}

async fn rename_worldgen_hierarchy(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
    Json(request): Json<HierarchyRenameRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let planets_dir = state.planets_dir.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let worldgen_dir = planets_dir.join(&planet_id).join("worldgen");
        if !worldgen_dir.exists() {
            return Err("Worldgen directory not found. Run the pipeline first.".to_string());
        }

        let clean_name = request.name.trim();
        if clean_name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }

        let entity_type = request.entity_type.trim().to_ascii_lowercase();
        match entity_type.as_str() {
            "province" => {
                let provinces_path = worldgen_dir.join("provinces.json");
                let provinces_text = std::fs::read_to_string(&provinces_path)
                    .map_err(|e| format!("Failed to read provinces.json: {e}"))?;
                let mut provinces: Vec<ProvinceRecord> = serde_json::from_str(&provinces_text)
                    .map_err(|e| format!("Failed to parse provinces.json: {e}"))?;
                let Some(index) = provinces.iter().position(|p| p.id == request.entity_id) else {
                    return Err(format!("Province {} not found", request.entity_id));
                };
                provinces[index].name = clean_name.to_string();
                let payload = serde_json::to_string_pretty(&provinces)
                    .map_err(|e| format!("Failed to serialize provinces: {e}"))?;
                std::fs::write(&provinces_path, payload)
                    .map_err(|e| format!("Failed to write provinces.json: {e}"))?;
            }
            "duchy" => {
                let duchies_path = worldgen_dir.join("duchies.json");
                let duchies_text = std::fs::read_to_string(&duchies_path)
                    .map_err(|e| format!("Failed to read duchies.json: {e}"))?;
                let mut duchies: Vec<DuchyRecord> = serde_json::from_str(&duchies_text)
                    .map_err(|e| format!("Failed to parse duchies.json: {e}"))?;
                let Some(index) = duchies.iter().position(|d| d.id == request.entity_id) else {
                    return Err(format!("Duchy {} not found", request.entity_id));
                };
                duchies[index].name = clean_name.to_string();
                let payload = serde_json::to_string_pretty(&duchies)
                    .map_err(|e| format!("Failed to serialize duchies: {e}"))?;
                std::fs::write(&duchies_path, payload)
                    .map_err(|e| format!("Failed to write duchies.json: {e}"))?;
            }
            "kingdom" => {
                let kingdoms_path = worldgen_dir.join("kingdoms.json");
                let kingdoms_text = std::fs::read_to_string(&kingdoms_path)
                    .map_err(|e| format!("Failed to read kingdoms.json: {e}"))?;
                let mut kingdoms: Vec<KingdomRecord> = serde_json::from_str(&kingdoms_text)
                    .map_err(|e| format!("Failed to parse kingdoms.json: {e}"))?;
                let Some(index) = kingdoms.iter().position(|k| k.id == request.entity_id) else {
                    return Err(format!("Kingdom {} not found", request.entity_id));
                };
                kingdoms[index].name = clean_name.to_string();
                let payload = serde_json::to_string_pretty(&kingdoms)
                    .map_err(|e| format!("Failed to serialize kingdoms: {e}"))?;
                std::fs::write(&kingdoms_path, payload)
                    .map_err(|e| format!("Failed to write kingdoms.json: {e}"))?;
            }
            "continent" => {
                let continents_path = worldgen_dir.join("continents.json");
                let mut continents = read_continents_file(&continents_path)?;
                let Some(index) = continents.iter().position(|c| c.id == request.entity_id) else {
                    return Err(format!("Continent {} not found", request.entity_id));
                };
                continents[index].name = clean_name.to_string();
                let payload = serde_json::to_string_pretty(&continents)
                    .map_err(|e| format!("Failed to serialize continents: {e}"))?;
                std::fs::write(&continents_path, payload)
                    .map_err(|e| format!("Failed to write continents.json: {e}"))?;
            }
            _ => {
                return Err(
                    "entityType must be one of: province, duchy, kingdom, continent".to_string(),
                )
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(HierarchyRenameResponse { success: true }))
}

async fn init_province_stats(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let planets_dir = state.planets_dir.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let worldgen_dir = planets_dir.join(&planet_id).join("worldgen");
        if !worldgen_dir.exists() {
            return Err("Worldgen directory not found. Run the pipeline first.".to_string());
        }

        let provinces_path = worldgen_dir.join("provinces.json");
        let provinces_text = std::fs::read_to_string(&provinces_path)
            .map_err(|e| format!("Failed to read provinces.json: {e}"))?;
        let mut provinces: Vec<ProvinceRecord> = serde_json::from_str(&provinces_text)
            .map_err(|e| format!("Failed to parse provinces.json: {e}"))?;

        // Simple deterministic hash-based random from province id
        for prov in provinces.iter_mut() {
            let seed = prov.id as u64;
            // wealth: -50 to 10 (range 60)
            let wh = ((seed.wrapping_mul(2654435761) >> 16) % 61) as i32 - 50;
            // development: -50 to 10 (range 60)
            let dv = ((seed.wrapping_mul(40503) >> 8) % 61) as i32 - 50;
            // population based on biome
            let base_pop: u64 = match prov.biome_primary {
                0 => 0,   // ocean
                1 => 50,  // tundra
                2 => 200, // taiga
                3 => 800, // temperate
                4 => 500, // grassland
                5 => 80,  // desert
                6 => 350, // savanna
                7 => 600, // tropical
                8 => 120, // mountain
                9 => 10,  // ice
                _ => 60,  // volcanic / other
            };
            // scale by area (bigger province = more population, roughly)
            let area_factor = (prov.area as f64 / 10000.0).max(0.1).min(20.0);
            let pop_variation = ((seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407)
                >> 20)
                % 50) as f64
                / 100.0;
            let pop = (base_pop as f64 * area_factor * (0.75 + pop_variation)) as u64;

            prov.wealth = Some(wh);
            prov.development = Some(dv);
            prov.population = Some(pop);
        }

        let payload = serde_json::to_string_pretty(&provinces)
            .map_err(|e| format!("Failed to serialize provinces: {e}"))?;
        std::fs::write(&provinces_path, payload)
            .map_err(|e| format!("Failed to write provinces.json: {e}"))?;

        Ok(())
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

fn read_continents_file(path: &std::path::Path) -> Result<Vec<ContinentRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read continents.json: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("Failed to parse continents.json: {e}"))
}

fn build_continents(
    provinces: &[ProvinceRecord],
    duchies: &[DuchyRecord],
    kingdoms: &[KingdomRecord],
    adjacency: &[ProvinceAdjacency],
    previous_names: Option<&HashMap<u32, String>>,
) -> Vec<ContinentRecord> {
    let province_to_kingdom: HashMap<u32, u32> =
        provinces.iter().map(|p| (p.id, p.kingdom_id)).collect();
    let mut kingdom_graph: HashMap<u32, HashSet<u32>> =
        kingdoms.iter().map(|k| (k.id, HashSet::new())).collect();

    for adj in adjacency {
        let Some(&k1) = province_to_kingdom.get(&adj.province_id) else {
            continue;
        };
        for edge in &adj.neighbors {
            let Some(&k2) = province_to_kingdom.get(&edge.neighbor_id) else {
                continue;
            };
            if k1 == k2 {
                continue;
            }
            kingdom_graph.entry(k1).or_default().insert(k2);
            kingdom_graph.entry(k2).or_default().insert(k1);
        }
    }

    let mut kingdom_ids: Vec<u32> = kingdoms.iter().map(|k| k.id).collect();
    kingdom_ids.sort_unstable();
    let mut visited: HashSet<u32> = HashSet::new();
    let mut components: Vec<Vec<u32>> = Vec::new();

    for start in kingdom_ids {
        if visited.contains(&start) {
            continue;
        }
        let mut stack = vec![start];
        let mut component: Vec<u32> = Vec::new();
        visited.insert(start);

        while let Some(node) = stack.pop() {
            component.push(node);
            if let Some(neighbors) = kingdom_graph.get(&node) {
                for &next in neighbors {
                    if visited.insert(next) {
                        stack.push(next);
                    }
                }
            }
        }

        component.sort_unstable();
        components.push(component);
    }

    components.sort_by_key(|c| c.first().copied().unwrap_or(0));

    components
        .into_iter()
        .enumerate()
        .map(|(index, kingdom_ids)| {
            let id = kingdom_ids.first().copied().unwrap_or(index as u32);
            let kingdom_set: HashSet<u32> = kingdom_ids.iter().copied().collect();

            let mut duchy_ids: Vec<u32> = duchies
                .iter()
                .filter(|d| kingdom_set.contains(&d.kingdom_id))
                .map(|d| d.id)
                .collect();
            duchy_ids.sort_unstable();
            duchy_ids.dedup();

            let mut province_ids: Vec<u32> = provinces
                .iter()
                .filter(|p| kingdom_set.contains(&p.kingdom_id))
                .map(|p| p.id)
                .collect();
            province_ids.sort_unstable();
            province_ids.dedup();

            let name = previous_names
                .and_then(|names| names.get(&id).cloned())
                .unwrap_or_else(|| format!("Continent {}", index + 1));

            ContinentRecord {
                id,
                kingdom_ids,
                duchy_ids,
                province_ids,
                name,
            }
        })
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpscaleRequest {
    history_id: String,
}

async fn start_upscale_job(
    State(state): State<AppState>,
    Json(request): Json<UpscaleRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();

    info!(
        job_id = %job_id,
        history_id = %request.history_id,
        "upscale job starting"
    );

    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.upscale.generate",
                "Upscale World Texture",
                "worldgen",
                "Queued for Upscaling",
                Some(request.history_id.clone()),
                None,
            ),
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();

    tokio::task::spawn(async move {
        run_upscale_job(spawned_job_id, request.history_id, jobs, planets_dir).await;
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn run_upscale_job(
    job_id: String,
    history_id: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: std::path::PathBuf,
) {
    let start = std::time::Instant::now();

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Reading History...".to_string();
        }
    }

    let planet_dir = planets_dir.join(&history_id);
    let metadata_file = planet_dir.join("metadata.json");

    let item: serde_json::Value = match std::fs::read_to_string(&metadata_file) {
        Ok(data) => match serde_json::from_str(&data) {
            Ok(json) => json,
            Err(_) => {
                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&job_id) {
                        job.status = JobStatus::Failed;
                        job.current_stage = "Failed".to_string();
                        job.error = Some("Failed to parse metadata".to_string());
                    }
                }
                return;
            }
        },
        Err(_) => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&job_id) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Failed".to_string();
                    job.error = Some("History item not found via metadata file".to_string());
                }
            }
            return;
        }
    };

    let texture_url = match item.get("textureUrl").and_then(|t| t.as_str()) {
        Some(u) => u.to_string(),
        None => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&job_id) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Failed".to_string();
                    job.error = Some("No texture in history item".to_string());
                }
            }
            return;
        }
    };
    let heightmap_url = item
        .get("heightmapUrl")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    let file_name = texture_url.split('/').last().unwrap_or("");
    let textures_dir = planet_dir.join("textures");
    let input_path = textures_dir.join(file_name);

    if !input_path.exists() {
        if let Ok(mut map) = jobs.lock() {
            if let Some(job) = map.get_mut(&job_id) {
                job.status = JobStatus::Failed;
                job.current_stage = "Failed".to_string();
                job.error = Some(format!("Source image not found: {:?}", input_path));
            }
        }
        return;
    }

    let output_filename = format!("upscaled_{}.png", Uuid::new_v4());
    let output_path = textures_dir.join(&output_filename);

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.progress = 50.0;
            job.current_stage = "Running ESRGAN (This may take a minute)...".to_string();
        }
    }

    let exe_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join("realesrgan-ncnn-vulkan");
    let model_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join("models");

    info!(
        job_id = %job_id,
        exe_path = %exe_path.display(),
        input = %input_path.display(),
        output = %output_path.display(),
        "Launching ESRGAN"
    );

    let output = std::process::Command::new(&exe_path)
        .arg("-i")
        .arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("-s")
        .arg("4")
        .arg("-m")
        .arg(&model_dir)
        .output();

    let success = match output {
        Ok(out) => out.status.success(),
        Err(e) => {
            error!("Failed to launch ESRGAN: {}", e);
            false
        }
    };

    if !success || !output_path.exists() {
        if let Ok(mut map) = jobs.lock() {
            if let Some(job) = map.get_mut(&job_id) {
                job.status = JobStatus::Failed;
                job.current_stage = "Failed".to_string();
                job.error = Some("ESRGAN process failed to generate output".to_string());
            }
        }
        return;
    }

    let new_texture_url = format!("/api/planets/{}/textures/{}", history_id, output_filename);

    // Create new history item pointing to upscale
    let mut new_item = item.clone();
    let new_id = Uuid::new_v4().to_string();
    if let Some(obj) = new_item.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(new_id.clone()));
        obj.insert(
            "textureUrl".to_string(),
            serde_json::Value::String(new_texture_url.clone()),
        );
        obj.insert("isUpscaled".to_string(), serde_json::Value::Bool(true));
        obj.insert(
            "parentId".to_string(),
            serde_json::Value::String(history_id.clone()),
        );
        obj.insert(
            "timestamp".to_string(),
            serde_json::Value::Number(serde_json::Number::from(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            )),
        );
        // Also preserve heightmapUrl if it existed
        if let Some(ref h_url) = heightmap_url {
            obj.insert(
                "heightmapUrl".to_string(),
                serde_json::Value::String(h_url.clone()),
            );
        }
    }

    // Save new item directly as its own planet dir (for now, to maintain API compatibility until frontend update)
    // Then we can switch correctly in frontend over to a "texture array"
    let new_planet_dir = planets_dir.join(&new_id);
    let _ = std::fs::create_dir_all(&new_planet_dir);
    // Link the texture over virtually so we don't have to duplicate the 20MB png
    // Actually we just use the url pointing back to history_id
    let _ = std::fs::write(
        new_planet_dir.join("metadata.json"),
        serde_json::to_string_pretty(&new_item).unwrap_or_default(),
    );

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Completed;
            job.progress = 100.0;
            job.current_stage = "Completed".to_string();
            job.result = serde_json::to_value(GenerateTerrainResponse {
                cols: 8192,
                rows: 4096,
                cell_data: Vec::new(),
                cell_colors: Vec::new(),
                texture_url: Some(new_texture_url.clone()),
                heightmap_url: heightmap_url.clone(), // preserve upscaled heightmap if exists
            })
            .ok();
            job.error = None;
        }
    }

    info!(job_id = %job_id, elapsed_ms = start.elapsed().as_millis(), "upscale completed successfully");
}

async fn start_ecology_job(
    State(state): State<AppState>,
    Json(request): Json<PlanetImageEditRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let request_key = format!("ecology-{}", Uuid::new_v4());
    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.ecology.paint",
                "Generate Ecology Layer",
                "worldgen",
                "Requesting Gemini Ecology Layer...",
                Some(request_key.clone()),
                None,
            ),
        );
    }
    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    tokio::task::spawn(async move {
        run_image_edit_job(
            spawned_job_id,
            request.prompt,
            request.base64_image,
            request.temperature,
            request_key,
            jobs,
            planets_dir,
        )
        .await;
    });
    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn start_humanity_job(
    State(state): State<AppState>,
    Json(request): Json<PlanetImageEditRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let request_key = format!("humanity-{}", Uuid::new_v4());
    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.humanity.paint",
                "Generate Humanity Layer",
                "worldgen",
                "Requesting Gemini Humanity Layer...",
                Some(request_key.clone()),
                None,
            ),
        );
    }
    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    tokio::task::spawn(async move {
        run_image_edit_job(
            spawned_job_id,
            request.prompt,
            request.base64_image,
            request.temperature,
            request_key,
            jobs,
            planets_dir,
        )
        .await;
    });
    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn run_image_edit_job(
    job_id: String,
    prompt: String,
    base64_image: String,
    temperature: Option<f32>,
    request_key: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: std::path::PathBuf,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Calling Gemini Vision API...".to_string();
        }
    }

    let (mime_type, data) = if base64_image.starts_with("data:") {
        let parts: Vec<&str> = base64_image.split(',').collect();
        let mime = parts[0]
            .split(';')
            .next()
            .unwrap()
            .strip_prefix("data:")
            .unwrap_or("image/jpeg");
        (mime.to_string(), parts.get(1).unwrap_or(&"").to_string())
    } else {
        ("image/jpeg".to_string(), base64_image)
    };

    let image_bytes = match gemini::generate_image_edit_bytes(
        &prompt,
        &data,
        &mime_type,
        temperature,
        None,
    )
    .await
    {
        Ok(b) => b,
        Err((_code, err_msg)) => {
            error!("Failed to fetch Gemini edit image: {}", err_msg);
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&job_id) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Failed to communicate with Gemini".to_string();
                    job.error = Some(err_msg);
                }
            }
            return;
        }
    };

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.current_stage = "Caching resulting image...".to_string();
            job.progress = 50.0;
        }
    }

    let planet_dir = planets_dir.join(&request_key);
    let planet_textures_dir = planet_dir.join("textures");
    if let Err(e) = std::fs::create_dir_all(&planet_textures_dir) {
        error!("Failed to create cache dir: {}", e);
    }

    let image_path = planet_textures_dir.join(format!("base.jpg"));
    if let Err(e) = std::fs::write(&image_path, &image_bytes) {
        error!("Failed to write edited image: {}", e);
    }

    let response = GenerateTerrainResponse {
        cols: 0,
        rows: 0,
        cell_data: vec![],
        cell_colors: vec![],
        texture_url: Some(format!("/api/planets/{}/textures/base.jpg", request_key)),
        heightmap_url: None,
    };

    let world_data_path = planet_dir.join("world_data.json");
    if let Ok(file) = std::fs::File::create(&world_data_path) {
        if let Err(err) = serde_json::to_writer(std::io::BufWriter::new(file), &response) {
            error!("failed to write cache json: {}", err);
        }
    }

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Completed;
            job.progress = 100.0;
            job.current_stage = "Completed".to_string();
            job.result = serde_json::to_value(response).ok();
            job.error = None;
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartCellsJobRequest {
    history_id: String,
    /// Optional geography regions from the frontend. If absent, loaded from disk.
    regions: Option<Vec<cell_analyzer::GeoRegionInput>>,
}

async fn start_cells_job(
    State(state): State<AppState>,
    Json(request): Json<StartCellsJobRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let history_id = request.history_id.clone();
    let regions = request.regions;

    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "job store lock poisoned".to_string(),
            )
        })?;
        jobs.insert(
            job_id.clone(),
            make_job_record(
                "worldgen.cells.generate",
                "Generate Planet Cells",
                "worldgen",
                "Reading base map...",
                Some(history_id.clone()),
                None,
            ),
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();

    tokio::task::spawn(async move {
        run_cells_job(spawned_job_id, history_id, regions, jobs, planets_dir).await;
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn run_cells_job(
    job_id: String,
    history_id: String,
    request_regions: Option<Vec<cell_analyzer::GeoRegionInput>>,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: std::path::PathBuf,
) {
    let start = std::time::Instant::now();
    let planet_dir = planets_dir.join(&history_id);
    let texture_path = planet_dir.join("textures").join("base.jpg");

    if !texture_path.exists() {
        if let Ok(mut map) = jobs.lock() {
            if let Some(job) = map.get_mut(&job_id) {
                job.status = JobStatus::Failed;
                job.current_stage = "Missing texture image".to_string();
                job.error = Some("Planet texture not found on disk".to_string());
            }
        }
        return;
    }

    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Loading map pixels...".to_string();
        }
    }

    // Load geography regions: use provided regions, or fall back to disk
    let regions = match request_regions {
        Some(r) => r,
        None => {
            let geo_path = planet_dir.join("geography.json");
            if geo_path.exists() {
                match std::fs::read_to_string(&geo_path) {
                    Ok(data) => serde_json::from_str::<Vec<cell_analyzer::GeoRegionInput>>(&data)
                        .unwrap_or_default(),
                    Err(_) => Vec::new(),
                }
            } else {
                Vec::new()
            }
        }
    };

    info!(
        job_id = %job_id,
        history_id = %history_id,
        region_count = regions.len(),
        "cell analysis starting"
    );

    // Load texture image
    let tp = texture_path.clone();
    let image_result =
        tokio::task::spawn_blocking(move || image::open(tp).map(|img| img.to_rgba8()))
            .await
            .unwrap();

    let rgba_image = match image_result {
        Ok(img) => img,
        Err(e) => {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&job_id) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Failed to open texture image".to_string();
                    job.error = Some(e.to_string());
                }
            }
            return;
        }
    };

    let image_width = rgba_image.width();
    let image_height = rgba_image.height();
    let pixel_data = rgba_image.into_raw();

    // Determine cell grid size: use a sensible coarse grid.
    // At 2K textures (2048x1024), use 128x64 = ~8K cells.
    // At 4K textures (4096x2048), use 256x128 = ~32K cells.
    let cell_cols = (image_width / 16).max(32).min(512);
    let cell_rows = (image_height / 16).max(16).min(256);

    info!(
        job_id = %job_id,
        image_width, image_height,
        cell_cols, cell_rows,
        total_cells = cell_cols * cell_rows,
        "running cell analysis"
    );

    // Run analysis in blocking thread
    let progress_jobs = jobs.clone();
    let log_job_id = job_id.clone();
    let log_job_id2 = job_id.clone();

    let result = tokio::task::spawn_blocking(move || {
        cell_analyzer::analyze_cells(
            &pixel_data,
            image_width,
            image_height,
            cell_cols,
            cell_rows,
            &regions,
            |progress| {
                if let Ok(mut map) = progress_jobs.lock() {
                    if let Some(job) = map.get_mut(&log_job_id) {
                        job.progress = progress.progress;
                        job.current_stage = progress.stage.to_string();
                    }
                }
            },
        )
    })
    .await;

    let elapsed = start.elapsed();

    match result {
        Ok(analysis) => {
            let total_cells = analysis.total_cells;
            let features_path = planet_dir.join("cell_features.json");

            // Write cell features to disk
            match std::fs::File::create(&features_path) {
                Ok(file) => {
                    if let Err(err) =
                        serde_json::to_writer(std::io::BufWriter::new(file), &analysis)
                    {
                        error!(job_id = %log_job_id2, error = %err, "failed to write cell_features.json");
                    } else {
                        info!(
                            job_id = %log_job_id2,
                            path = %features_path.display(),
                            total_cells,
                            elapsed_ms = elapsed.as_millis(),
                            "cell features saved"
                        );
                    }
                }
                Err(err) => {
                    error!(job_id = %log_job_id2, error = %err, "failed to create cell_features.json");
                }
            }

            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.status = JobStatus::Completed;
                    job.progress = 100.0;
                    job.current_stage = "Completed".to_string();
                    // Provide a lightweight result — the full data is on disk
                    job.result = serde_json::to_value(GenerateTerrainResponse {
                        cols: analysis.cols,
                        rows: analysis.rows,
                        cell_data: Vec::new(),
                        cell_colors: Vec::new(),
                        texture_url: Some(format!("/api/planets/{}/textures/base.jpg", history_id)),
                        heightmap_url: None, // Cells analysis doesn't generate heightmap
                    })
                    .ok();
                }
            }
        }
        Err(e) => {
            error!(job_id = %log_job_id2, error = %e, "cell analysis task panicked");
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&log_job_id2) {
                    job.status = JobStatus::Failed;
                    job.current_stage = "Task died".to_string();
                    job.error = Some(format!("Thread panic: {e}"));
                }
            }
        }
    }
}

/// Generate a batch of pixel-art icons via Gemini, stored in a dedicated folder.
async fn generate_icon_batch(
    State(state): State<AppState>,
    Json(request): Json<IconBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let prompts = request.prompts;

    if prompts.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No prompts provided".to_string()));
    }
    if prompts.len() > 50 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Maximum 50 prompts per batch".to_string(),
        ));
    }

    // Use the user-supplied name (slugified) as folder name, fallback to UUID
    let batch_name = request
        .batch_name
        .as_deref()
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .unwrap_or("")
        .to_string();

    let batch_id = if batch_name.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        slugify_prompt(&batch_name)
    };

    let batch_dir = state.icons_dir.join(&batch_id);
    std::fs::create_dir_all(&batch_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create batch dir: {e}"),
        )
    })?;

    info!(
        batch_id = %batch_id,
        batch_name = %batch_name,
        count = prompts.len(),
        "icon batch generation starting"
    );

    let created_at = chrono::Utc::now().to_rfc3339();
    let mut icons: Vec<BatchIcon> = Vec::new();
    let style_prompt = request.style_prompt.unwrap_or_default();

    for (i, item_prompt) in prompts.iter().enumerate() {
        let full_prompt = if style_prompt.trim().is_empty() {
            item_prompt.clone()
        } else {
            format!("{} {}", style_prompt.trim(), item_prompt.trim())
        };

        let wrapped_prompt = format!(
            "Generate a game icon. \
            Centered composition, transparent or solid dark background. \
            Visual content: {}. \
            Output ONLY the icon image, no text, no borders, no decorations.",
            full_prompt
        );

        info!(batch_id = %batch_id, index = i, prompt = %full_prompt, "generating icon");

        let temperature = request.temperature.or(Some(0.4));

        let image_bytes_result = if let Some(base64_img) = &request.base64_image {
            // If they provided a reference image, use the vision/edit endpoint
            gemini::generate_image_edit_bytes(
                &wrapped_prompt,
                base64_img,
                "image/png",
                temperature,
                Some("1:1"),
            )
            .await
        } else {
            // Standard image generation
            gemini::generate_image_bytes(&wrapped_prompt, temperature, 256, 256, Some("1:1")).await
        };

        let image_bytes = image_bytes_result.map_err(|(code, msg)| {
            error!("Icon generation failed for item {}: {}", i, msg);
            (code, msg)
        })?;

        let batch_dir_clone = batch_dir.clone();
        let batch_id_clone = batch_id.clone();
        let full_prompt_cloned = full_prompt.clone();
        let item_prompt_cloned = item_prompt.clone();
        let style_prompt_cloned = style_prompt.clone();

        let icon =
            tokio::task::spawn_blocking(move || -> Result<BatchIcon, (StatusCode, String)> {
                let img = image::load_from_memory(&image_bytes).map_err(|e| {
                    error!("Failed to decode icon image: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Image decode error: {e}"),
                    )
                })?;

                let filename = format!("{:03}.png", i);
                let path = batch_dir_clone.join(&filename);

                img.save(&path).map_err(|e| {
                    error!("Failed to save icon: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Save error: {e}"),
                    )
                })?;

                info!(path = %path.display(), "icon saved");
                Ok(BatchIcon {
                    filename: filename.clone(),
                    prompt: full_prompt_cloned,
                    style_prompt: style_prompt_cloned,
                    item_prompt: item_prompt_cloned,
                    url: format!("/api/icons/{}/{}", batch_id_clone, filename),
                })
            })
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Task join error: {e}"),
                )
            })?
            .map_err(|e| e)?;

        icons.push(icon);
    }

    // Write manifest
    let manifest = BatchManifest {
        batch_id: batch_id.clone(),
        batch_name: if batch_name.is_empty() {
            batch_id[..8].to_uppercase()
        } else {
            batch_name
        },
        created_at,
        icons,
    };

    let manifest_path = batch_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("JSON error: {e}"),
        )
    })?;
    std::fs::write(&manifest_path, &manifest_json).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Manifest write error: {e}"),
        )
    })?;

    info!(batch_id = %batch_id, total = manifest.icons.len(), "batch generation completed");
    Ok(Json(manifest))
}

/// List all icon batches.
async fn list_icon_batches(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let icons_dir = state.icons_dir.clone();

    let batches = tokio::task::spawn_blocking(move || -> Result<Vec<BatchSummary>, String> {
        let mut result = Vec::new();
        if !icons_dir.exists() {
            return Ok(result);
        }
        let dir = std::fs::read_dir(&icons_dir).map_err(|e| format!("read dir: {e}"))?;
        for entry in dir {
            let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = path.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            let data = std::fs::read_to_string(&manifest_path)
                .map_err(|e| format!("read manifest: {e}"))?;
            let manifest: BatchManifest =
                serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;

            let thumbnail_url = manifest.icons.first().map(|i| i.url.clone());
            result.push(BatchSummary {
                batch_id: manifest.batch_id,
                batch_name: manifest.batch_name,
                icon_count: manifest.icons.len(),
                created_at: manifest.created_at,
                thumbnail_url,
            });
        }
        // Sort newest first
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(result)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(batches))
}

async fn get_icon_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let manifest_path = state.icons_dir.join(&batch_id).join("manifest.json");
    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    let data = tokio::fs::read_to_string(&manifest_path)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Read error: {e}"),
            )
        })?;
    let manifest: BatchManifest = serde_json::from_str(&data).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Parse error: {e}"),
        )
    })?;
    Ok(Json(manifest))
}

/// Delete an icon batch and its directory.
async fn delete_icon_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let batch_dir = state.icons_dir.join(&batch_id);
    if !batch_dir.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    std::fs::remove_dir_all(&batch_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete batch: {e}"),
        )
    })?;
    Ok(StatusCode::NO_CONTENT)
}

/// Generate a batch of textures via Gemini.
async fn generate_texture_batch(
    State(state): State<AppState>,
    Json(request): Json<TextureBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let prompts = request.prompts;

    if prompts.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No prompts provided".to_string()));
    }

    let batch_name = request
        .batch_name
        .as_deref()
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .unwrap_or("")
        .to_string();

    let batch_id = if batch_name.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        slugify_prompt(&batch_name)
    };

    let batch_dir = state.textures_dir.join(&batch_id);
    std::fs::create_dir_all(&batch_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create batch dir: {e}"),
        )
    })?;

    let created_at = chrono::Utc::now().to_rfc3339();
    let mut textures: Vec<BatchTexture> = Vec::new();
    let style_prompt = request.style_prompt.unwrap_or_default();

    for (i, item_prompt) in prompts.iter().enumerate() {
        let full_prompt = if style_prompt.trim().is_empty() {
            item_prompt.clone()
        } else {
            format!("{} {}", style_prompt.trim(), item_prompt.trim())
        };

        // Tailor the prompt based on category/subcategory
        let wrapped_prompt = match (request.category.as_str(), request.sub_category.as_deref()) {
            ("battle_assets", Some("ground")) => format!(
                "Generate a high-quality top-down flat game texture for an isometric RPG. \
                Visual content: {}. \
                Must be seamless and tileable if possible. No perspective, no depth, no borders, no text. \
                Output ONLY the texture image.",
                full_prompt
            ),
            ("battle_assets", Some("obstacle")) => format!(
                "Generate a high-quality game asset obstacle. \
                Visual content: {}. \
                Isolated object on a solid black or dark background. Centered composition. \
                Top-down or slight isometric angle to match the game's view. No borders, no text. \
                Output ONLY the asset image.",
                full_prompt
            ),
            ("character", _) => format!(
                "Generate a high-quality character texture or portrait. \
                Visual content: {}. \
                No borders, no text. Output ONLY the image.",
                full_prompt
            ),
            ("item", _) => format!(
                "Generate a high-quality item texture. \
                Visual content: {}. \
                Centered composition on dark background. No text, no borders. \
                Output ONLY the item image.",
                full_prompt
            ),
            ("ecology_illustrations", Some("flora")) => format!(
                "Generate a polished natural-history flora illustration. \
                Visual content: {}. \
                Single subject or tightly grouped specimen, readable silhouette, rich material detail, painterly realism, no text, no frame, no UI, no sprite sheet. \
                Output ONLY the illustration image.",
                full_prompt
            ),
            ("ecology_illustrations", Some("fauna")) => format!(
                "Generate a polished natural-history fauna illustration. \
                Visual content: {}. \
                Show the creature clearly in a field-guide or concept-art style, full body when possible, strong anatomy readability, painterly realism, no text, no frame, no UI, no sprite sheet. \
                Output ONLY the illustration image.",
                full_prompt
            ),
            ("ecology_illustrations", _) => format!(
                "Generate a polished ecology illustration for a worldbuilding archive. \
                Visual content: {}. \
                Natural-history presentation, clean readable subject, painterly realism, no text, no frame, no UI, no sprite sheet. \
                Output ONLY the illustration image.",
                full_prompt
            ),
            _ => format!(
                "Generate a game texture. \
                Visual content: {}. \
                No text, no borders. Output ONLY the image.",
                full_prompt
            ),
        };

        info!(batch_id = %batch_id, index = i, prompt = %full_prompt, "generating texture");

        let temperature = request.temperature.or(Some(0.4));

        let image_bytes_result = if let Some(base64_img) = &request.base64_image {
            gemini::generate_image_edit_bytes(
                &wrapped_prompt,
                base64_img,
                "image/png",
                temperature,
                Some("1:1"),
            )
            .await
        } else {
            gemini::generate_image_bytes(&wrapped_prompt, temperature, 512, 512, Some("1:1")).await
        };

        let image_bytes = image_bytes_result.map_err(|(code, msg)| {
            error!("Texture generation failed for item {}: {}", i, msg);
            (code, msg)
        })?;

        let batch_dir_clone = batch_dir.clone();
        let batch_id_clone = batch_id.clone();
        let full_prompt_cloned = full_prompt.clone();
        let item_prompt_cloned = item_prompt.clone();
        let style_prompt_cloned = style_prompt.clone();

        let texture =
            tokio::task::spawn_blocking(move || -> Result<BatchTexture, (StatusCode, String)> {
                let img = image::load_from_memory(&image_bytes).map_err(|e| {
                    error!("Failed to decode texture image: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Image decode error: {e}"),
                    )
                })?;

                let filename = format!("{:03}.png", i);
                let path = batch_dir_clone.join(&filename);

                img.save(&path).map_err(|e| {
                    error!("Failed to save texture: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Save error: {e}"),
                    )
                })?;

                info!(path = %path.display(), "texture saved");
                Ok(BatchTexture {
                    filename: filename.clone(),
                    prompt: full_prompt_cloned,
                    style_prompt: style_prompt_cloned,
                    item_prompt: item_prompt_cloned,
                    url: format!("/api/textures/{}/{}", batch_id_clone, filename),
                    metadata: serde_json::Value::Null,
                })
            })
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Task join error: {e}"),
                )
            })?
            .map_err(|e| e)?;

        textures.push(texture);
    }

    let manifest = TextureBatchManifest {
        batch_id: batch_id.clone(),
        batch_name: if batch_name.is_empty() {
            batch_id[..8].to_uppercase()
        } else {
            batch_name
        },
        created_at,
        category: request.category,
        sub_category: request.sub_category,
        game_asset: request.game_asset,
        textures,
    };

    let manifest_path = batch_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("JSON error: {e}"),
        )
    })?;
    std::fs::write(&manifest_path, &manifest_json).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Manifest write error: {e}"),
        )
    })?;

    info!(batch_id = %batch_id, total = manifest.textures.len(), "texture batch completed");
    Ok(Json(manifest))
}

/// List all texture batches.
async fn list_texture_batches(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let textures_dir = state.textures_dir.clone();

    let batches =
        tokio::task::spawn_blocking(move || -> Result<Vec<TextureBatchSummary>, String> {
            let mut result = Vec::new();
            if !textures_dir.exists() {
                return Ok(result);
            }
            let dir = std::fs::read_dir(&textures_dir).map_err(|e| format!("read dir: {e}"))?;
            for entry in dir {
                let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let manifest_path = path.join("manifest.json");
                if !manifest_path.exists() {
                    continue;
                }
                let data = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| format!("read manifest: {e}"))?;
                let manifest: TextureBatchManifest =
                    serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;

                let thumbnail_url = manifest.textures.first().map(|i| i.url.clone());
                result.push(TextureBatchSummary {
                    batch_id: manifest.batch_id,
                    batch_name: manifest.batch_name,
                    texture_count: manifest.textures.len(),
                    created_at: manifest.created_at,
                    category: manifest.category,
                    sub_category: manifest.sub_category,
                    game_asset: manifest.game_asset,
                    thumbnail_url,
                });
            }
            result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            Ok(result)
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task error: {e}"),
            )
        })?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(batches))
}

/// Get a single texture batch manifest.
async fn get_texture_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let manifest_path = state.textures_dir.join(&batch_id).join("manifest.json");
    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    let data = tokio::fs::read_to_string(&manifest_path)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Read error: {e}"),
            )
        })?;
    let manifest: TextureBatchManifest = serde_json::from_str(&data).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Parse error: {e}"),
        )
    })?;
    Ok(Json(manifest))
}

fn build_sprite_prompt(full_prompt: &str, sprite_type: &str, direction: Option<&str>) -> String {
    match direction {
        Some(direction) => format!(
            "Generate a gameplay-ready 2D exploration sprite for a {sprite_type}. \
            Facing {direction}. \
            Keep the same subject identity, silhouette clarity, and readable proportions. \
            Centered composition, dark or transparent background, no border, no text. \
            Visual content: {full_prompt}. \
            Output ONLY the sprite image."
        ),
        None => format!(
            "Generate a polished reference illustration for a {sprite_type}. \
            Centered composition, dark or transparent background, no border, no text. \
            Visual content: {full_prompt}. \
            Output ONLY the illustration image."
        ),
    }
}

fn clean_sprite_png(image_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut rgba = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Image decode error: {e}"))?
        .to_rgba8();

    let (width, height) = rgba.dimensions();
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let px = rgba.get_pixel_mut(x, y);
            let [r, g, b, a] = px.0;
            let is_dark_bg = a > 0 && r < 24 && g < 24 && b < 24;
            if a == 0 || is_dark_bg {
                *px = image::Rgba([0, 0, 0, 0]);
                continue;
            }

            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }

    let cropped = if found {
        let margin = 8u32;
        let left = min_x.saturating_sub(margin);
        let top = min_y.saturating_sub(margin);
        let right = (max_x + margin).min(width.saturating_sub(1));
        let bottom = (max_y + margin).min(height.saturating_sub(1));
        image::imageops::crop_imm(&rgba, left, top, right - left + 1, bottom - top + 1).to_image()
    } else {
        rgba
    };

    let side = cropped.width().max(cropped.height()).max(64);
    let mut square = image::RgbaImage::new(side, side);
    let offset_x = (side - cropped.width()) / 2;
    let offset_y = (side - cropped.height()) / 2;
    image::imageops::overlay(&mut square, &cropped, offset_x as i64, offset_y as i64);

    let mut output = Vec::new();
    image::DynamicImage::ImageRgba8(square)
        .write_to(
            &mut std::io::Cursor::new(&mut output),
            image::ImageFormat::Png,
        )
        .map_err(|e| format!("PNG encode error: {e}"))?;
    Ok(output)
}

async fn generate_sprite_batch(
    State(state): State<AppState>,
    Json(request): Json<SpriteBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if request.prompts.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No prompts provided".to_string()));
    }
    if request.prompts.len() > 24 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Maximum 24 prompts per sprite batch".to_string(),
        ));
    }

    let batch_name = request
        .batch_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("")
        .to_string();
    let batch_id = if batch_name.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        slugify_prompt(&batch_name)
    };

    let batch_dir = state.sprites_dir.join(&batch_id);
    std::fs::create_dir_all(&batch_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create sprite batch dir: {e}"),
        )
    })?;

    let created_at = chrono::Utc::now().to_rfc3339();
    let style_prompt = request.style_prompt.clone().unwrap_or_default();
    let temperature = request.temperature.or(Some(0.4));
    let includes_illustration =
        request.mode == "illustration" || request.include_illustration.unwrap_or(false);
    let mut sprites = Vec::new();

    for (index, item_prompt) in request.prompts.iter().enumerate() {
        let full_prompt = if style_prompt.trim().is_empty() {
            item_prompt.clone()
        } else {
            format!("{} {}", style_prompt.trim(), item_prompt.trim())
        };

        if request.mode == "illustration" {
            let wrapped_prompt = build_sprite_prompt(&full_prompt, &request.sprite_type, None);
            let image_bytes = if let Some(base64_img) = &request.base64_image {
                gemini::generate_image_edit_bytes(
                    &wrapped_prompt,
                    base64_img,
                    "image/png",
                    temperature,
                    Some("1:1"),
                )
                .await
            } else {
                gemini::generate_image_bytes(&wrapped_prompt, temperature, 512, 512, Some("1:1"))
                    .await
            }
            .map_err(|(code, msg)| (code, msg))?;

            let cleaned = clean_sprite_png(&image_bytes)
                .map_err(|msg| (StatusCode::INTERNAL_SERVER_ERROR, msg))?;
            let filename = format!("{:03}_illustration.png", index);
            let path = batch_dir.join(&filename);
            std::fs::write(&path, &cleaned).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to save sprite illustration: {e}"),
                )
            })?;
            let url = format!("/api/sprites/{}/{}", batch_id, filename);
            sprites.push(GeneratedSpriteSet {
                sprite_id: format!("sprite-{:03}", index),
                prompt: full_prompt.clone(),
                style_prompt: style_prompt.clone(),
                item_prompt: item_prompt.clone(),
                actor_type: request.sprite_type.clone(),
                mode: request.mode.clone(),
                preview_url: url.clone(),
                directions: Vec::new(),
                illustration_url: Some(url),
                target: request.target.clone(),
            });
            continue;
        }

        let south_prompt = build_sprite_prompt(&full_prompt, &request.sprite_type, Some("south"));
        let south_bytes = if let Some(base64_img) = &request.base64_image {
            gemini::generate_image_edit_bytes(
                &south_prompt,
                base64_img,
                "image/png",
                temperature,
                Some("1:1"),
            )
            .await
        } else {
            gemini::generate_image_bytes(&south_prompt, temperature, 512, 512, Some("1:1")).await
        }
        .map_err(|(code, msg)| (code, msg))?;

        let south_clean = clean_sprite_png(&south_bytes)
            .map_err(|msg| (StatusCode::INTERNAL_SERVER_ERROR, msg))?;
        let south_b64 = base64::engine::general_purpose::STANDARD.encode(&south_clean);
        let mut directions = Vec::new();
        let ordered_directions = ["south", "east", "west", "north"];

        for direction in ordered_directions {
            let direction_bytes = if direction == "south" {
                south_clean.clone()
            } else {
                let direction_prompt =
                    build_sprite_prompt(&full_prompt, &request.sprite_type, Some(direction));
                let edited = gemini::generate_image_edit_bytes(
                    &direction_prompt,
                    &south_b64,
                    "image/png",
                    temperature,
                    Some("1:1"),
                )
                .await
                .map_err(|(code, msg)| (code, msg))?;
                clean_sprite_png(&edited).map_err(|msg| (StatusCode::INTERNAL_SERVER_ERROR, msg))?
            };

            let filename = format!("{:03}_{}.png", index, direction);
            let path = batch_dir.join(&filename);
            std::fs::write(&path, &direction_bytes).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to save sprite frame: {e}"),
                )
            })?;
            directions.push(DirectionalSpriteFrame {
                direction: direction.to_string(),
                url: format!("/api/sprites/{}/{}", batch_id, filename),
            });
        }

        let preview_url = directions
            .iter()
            .find(|frame| frame.direction == "south")
            .map(|frame| frame.url.clone())
            .unwrap_or_default();

        let illustration_url = if request.include_illustration.unwrap_or(false) {
            let illustration_prompt = build_sprite_prompt(&full_prompt, &request.sprite_type, None);
            let image_bytes = gemini::generate_image_edit_bytes(
                &illustration_prompt,
                &south_b64,
                "image/png",
                temperature,
                Some("1:1"),
            )
            .await
            .map_err(|(code, msg)| (code, msg))?;

            let cleaned = clean_sprite_png(&image_bytes)
                .map_err(|msg| (StatusCode::INTERNAL_SERVER_ERROR, msg))?;
            let filename = format!("{:03}_illustration.png", index);
            let path = batch_dir.join(&filename);
            std::fs::write(&path, &cleaned).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to save sprite illustration: {e}"),
                )
            })?;
            Some(format!("/api/sprites/{}/{}", batch_id, filename))
        } else {
            None
        };

        sprites.push(GeneratedSpriteSet {
            sprite_id: format!("sprite-{:03}", index),
            prompt: full_prompt.clone(),
            style_prompt: style_prompt.clone(),
            item_prompt: item_prompt.clone(),
            actor_type: request.sprite_type.clone(),
            mode: request.mode.clone(),
            preview_url,
            directions,
            illustration_url,
            target: request.target.clone(),
        });
    }

    let manifest = SpriteBatchManifest {
        batch_id: batch_id.clone(),
        batch_name: if batch_name.is_empty() {
            batch_id[..8.min(batch_id.len())].to_uppercase()
        } else {
            batch_name
        },
        created_at,
        sprite_type: request.sprite_type,
        mode: request.mode,
        includes_illustration,
        target: request.target,
        world_id: request.world_id,
        source_entity_type: request.source_entity_type,
        source_entity_id: request.source_entity_id,
        biome_ids: request.biome_ids,
        sprites,
    };

    let manifest_path = batch_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Sprite manifest JSON error: {e}"),
        )
    })?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Sprite manifest write error: {e}"),
        )
    })?;

    Ok(Json(manifest))
}

async fn list_sprite_batches(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let sprites_dir = state.sprites_dir.clone();

    let batches =
        tokio::task::spawn_blocking(move || -> Result<Vec<SpriteBatchSummary>, String> {
            let mut result = Vec::new();
            if !sprites_dir.exists() {
                return Ok(result);
            }
            let dir = std::fs::read_dir(&sprites_dir).map_err(|e| format!("read dir: {e}"))?;
            for entry in dir {
                let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let manifest_path = path.join("manifest.json");
                if !manifest_path.exists() {
                    continue;
                }
                let data = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| format!("read manifest: {e}"))?;
                let manifest: SpriteBatchManifest =
                    serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;
                let thumbnail_url = manifest
                    .sprites
                    .first()
                    .map(|sprite| sprite.preview_url.clone());
                result.push(SpriteBatchSummary {
                    batch_id: manifest.batch_id,
                    batch_name: manifest.batch_name,
                    created_at: manifest.created_at,
                    sprite_type: manifest.sprite_type,
                    mode: manifest.mode,
                    includes_illustration: manifest.includes_illustration,
                    sprite_count: manifest.sprites.len(),
                    target: manifest.target,
                    thumbnail_url,
                });
            }
            result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            Ok(result)
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task error: {e}"),
            )
        })?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(batches))
}

async fn get_sprite_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let manifest_path = state.sprites_dir.join(&batch_id).join("manifest.json");
    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Sprite batch not found".to_string()));
    }
    let data = tokio::fs::read_to_string(&manifest_path)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Read error: {e}"),
            )
        })?;
    let manifest: SpriteBatchManifest = serde_json::from_str(&data).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Parse error: {e}"),
        )
    })?;
    Ok(Json(manifest))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadataRequest {
    metadata: serde_json::Value,
}

/// Update metadata for a single texture in a batch.
async fn update_texture_metadata(
    State(state): State<AppState>,
    Path((batch_id, filename)): Path<(String, String)>,
    Json(request): Json<UpdateMetadataRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let batch_dir = state.textures_dir.join(&batch_id);
    let manifest_path = batch_dir.join("manifest.json");

    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }

    let data = std::fs::read_to_string(&manifest_path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read manifest: {e}"),
        )
    })?;

    let mut manifest: TextureBatchManifest = serde_json::from_str(&data).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse manifest: {e}"),
        )
    })?;

    if let Some(texture) = manifest
        .textures
        .iter_mut()
        .find(|t| t.filename == filename)
    {
        texture.metadata = request.metadata;

        let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("JSON error: {e}"),
            )
        })?;

        std::fs::write(&manifest_path, &manifest_json).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Manifest write error: {e}"),
            )
        })?;

        info!(batch_id = %batch_id, filename = %filename, "texture metadata updated");
        Ok(StatusCode::OK)
    } else {
        Err((
            StatusCode::NOT_FOUND,
            "Texture not found in batch".to_string(),
        ))
    }
}

/// Delete a texture batch and its directory.
async fn delete_texture_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let batch_dir = state.textures_dir.join(&batch_id);
    if !batch_dir.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    std::fs::remove_dir_all(&batch_dir).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete batch: {e}"),
        )
    })?;
    Ok(StatusCode::NO_CONTENT)
}

/// Regenerate a single icon in a batch.
async fn regenerate_icon(
    State(state): State<AppState>,
    Path((batch_id, filename)): Path<(String, String)>,
    Json(request): Json<RegenerateIconRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let batch_dir = state.icons_dir.join(&batch_id);
    let manifest_path = batch_dir.join("manifest.json");

    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }

    let item_text = request.item_prompt;
    let style_text = request.style_prompt;
    let full_prompt = if style_text.trim().is_empty() {
        item_text.clone()
    } else {
        format!("{} {}", style_text.trim(), item_text.trim())
    };

    let wrapped_prompt = format!(
        "Generate a game icon. \
        Centered composition, transparent or solid dark background. \
        Visual content: {}. \
        Output ONLY the icon image, no text, no borders, no decorations.",
        full_prompt
    );

    info!(batch_id = %batch_id, filename = %filename, prompt = %full_prompt, "regenerating single icon");

    let temperature = request.temperature.or(Some(0.4));

    let image_bytes_result = if let Some(base64_img) = &request.base64_image {
        gemini::generate_image_edit_bytes(
            &wrapped_prompt,
            base64_img,
            "image/png",
            temperature,
            Some("1:1"),
        )
        .await
    } else {
        gemini::generate_image_bytes(&wrapped_prompt, temperature, 256, 256, Some("1:1")).await
    };

    let image_bytes = image_bytes_result.map_err(|(code, msg)| {
        error!("Icon regeneration failed: {}", msg);
        (code, msg)
    })?;

    let batch_id_clone = batch_id.clone();
    let filename_clone = filename.clone();
    let full_prompt_cloned = full_prompt.clone();
    let item_prompt_cloned = item_text.clone();
    let style_prompt_cloned = style_text.clone();

    let updated_icon =
        tokio::task::spawn_blocking(move || -> Result<BatchIcon, (StatusCode, String)> {
            let img = image::load_from_memory(&image_bytes).map_err(|e| {
                error!("Failed to decode icon image: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Image decode error: {e}"),
                )
            })?;

            let path = batch_dir.join(&filename_clone);
            img.save(&path).map_err(|e| {
                error!("Failed to save icon: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Save error: {e}"),
                )
            })?;

            // Update manifest
            let data = std::fs::read_to_string(&manifest_path).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Read manifest error: {e}"),
                )
            })?;
            let mut manifest: BatchManifest = serde_json::from_str(&data).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Parse manifest error: {e}"),
                )
            })?;

            let mut found = false;
            for icon in &mut manifest.icons {
                if icon.filename == filename_clone {
                    icon.prompt = full_prompt_cloned.clone();
                    icon.item_prompt = item_prompt_cloned.clone();
                    icon.style_prompt = style_prompt_cloned.clone();
                    found = true;
                    break;
                }
            }

            if !found {
                return Err((
                    StatusCode::NOT_FOUND,
                    "Icon not found in manifest".to_string(),
                ));
            }

            let updated_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Serialize manifest error: {e}"),
                )
            })?;
            std::fs::write(&manifest_path, &updated_json).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Write manifest error: {e}"),
                )
            })?;

            info!(path = %path.display(), "icon regenerated and manifest updated");
            Ok(BatchIcon {
                filename: filename_clone.clone(),
                prompt: full_prompt_cloned,
                item_prompt: item_prompt_cloned,
                style_prompt: style_prompt_cloned,
                url: format!("/api/icons/{}/{}", batch_id_clone, filename_clone),
            })
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task join error: {e}"),
            )
        })?
        .map_err(|e| e)?;

    Ok(Json(updated_icon))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    total_icons: usize,
    total_batches: usize,
    export_path: String,
}

/// Export all icon batches into a flat folder + TS registry file.
/// Icons are copied to game-assets/assets/icons/ with slugified names,
/// and an index.ts is generated for easy imports.
async fn export_icons_registry(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let icons_dir = state.icons_dir.clone();
    let export_dir = state.icons_export_dir.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<ExportResult, String> {
        // Collect all batch manifests
        let mut all_manifests: Vec<BatchManifest> = Vec::new();

        if icons_dir.exists() {
            let dir = std::fs::read_dir(&icons_dir).map_err(|e| format!("read icons dir: {e}"))?;
            for entry in dir {
                let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let manifest_path = path.join("manifest.json");
                if !manifest_path.exists() {
                    continue;
                }
                let data = std::fs::read_to_string(&manifest_path)
                    .map_err(|e| format!("read manifest: {e}"))?;
                let manifest: BatchManifest = serde_json::from_str(&data)
                    .map_err(|e| format!("parse manifest: {e}"))?;
                all_manifests.push(manifest);
            }
        }

        // Sort by created_at so order is stable
        all_manifests.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Create export directory
        std::fs::create_dir_all(&export_dir)
            .map_err(|e| format!("create export dir: {e}"))?;

        let mut ts_entries: Vec<String> = Vec::new();
        let mut total_icons: usize = 0;

        for manifest in &all_manifests {
            let mut icon_entries: Vec<String> = Vec::new();

            for icon in &manifest.icons {
                // Generate a safe key from the prompt
                let key = slugify_prompt(&icon.prompt);
                icon_entries.push(format!(
                    "    {{ key: '{}', prompt: '{}', file: './{}/{}' }}",
                    key,
                    icon.prompt.replace('\\', "\\\\").replace('\'', "\\'"),
                    manifest.batch_id,
                    icon.filename
                ));
                total_icons += 1;
            }

            let display_name = if manifest.batch_name.is_empty() {
                manifest.batch_id[..8.min(manifest.batch_id.len())].to_uppercase()
            } else {
                manifest.batch_name.clone()
            };
            ts_entries.push(format!(
                "  // {} — {} — {} icons\n  {{\n    batchId: '{}',\n    name: '{}',\n    createdAt: '{}',\n    icons: [\n{}\n    ],\n  }}",
                display_name,
                manifest.created_at,
                manifest.icons.len(),
                manifest.batch_id,
                manifest.batch_name.replace('\\', "\\\\").replace('\'', "\\'"),
                manifest.created_at,
                icon_entries.join(",\n")
            ));
        }

        // Write index.ts
        let ts_content = format!(
            "// ──────────────────────────────────────────\n\
             // AUTO-GENERATED — DO NOT EDIT MANUALLY\n\
             // Generated by dev-tools icon export\n\
             // Total: {} icons across {} batches\n\
             // ──────────────────────────────────────────\n\
             \n\
             export interface IconEntry {{\n\
             \x20 key: string;\n\
             \x20 prompt: string;\n\
             \x20 file: string;\n\
             }}\n\
             \n\
             export interface IconBatch {{\n\
             \x20 batchId: string;\n\
             \x20 name: string;\n\
             \x20 createdAt: string;\n\
             \x20 icons: IconEntry[];\n\
             }}\n\
             \n\
             export const ICON_BATCHES: IconBatch[] = [\n\
             {}\n\
             ];\n\
             \n\
             /** Flat map of all icons by key for quick lookup. */\n\
             export const ICONS: Record<string, IconEntry> = Object.fromEntries(\n\
             \x20 ICON_BATCHES.flatMap(b => b.icons).map(i => [i.key, i])\n\
             );\n",
            total_icons,
            all_manifests.len(),
            ts_entries.join(",\n")
        );

        let index_path = export_dir.join("index.ts");
        std::fs::write(&index_path, ts_content)
            .map_err(|e| format!("write index.ts: {e}"))?;

        info!(
            total_icons = total_icons,
            total_batches = all_manifests.len(),
            path = %index_path.display(),
            "icon registry exported"
        );

        Ok(ExportResult {
            total_icons,
            total_batches: all_manifests.len(),
            export_path: index_path.display().to_string(),
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {e}")))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
}

/// Rename a batch: update manifest + rename folder on disk.
async fn rename_icon_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
    Json(request): Json<RenameBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let new_name = request.new_name.trim().to_string();
    if new_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name cannot be empty".to_string()));
    }

    let new_batch_id = slugify_prompt(&new_name);
    let icons_dir = state.icons_dir.clone();
    let old_dir = icons_dir.join(&batch_id);
    let new_dir = icons_dir.join(&new_batch_id);

    if !old_dir.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }

    // If the new name resolves to a different folder that already exists, error
    if new_batch_id != batch_id && new_dir.exists() {
        return Err((
            StatusCode::CONFLICT,
            format!("A batch named '{}' already exists", new_batch_id),
        ));
    }

    let result = tokio::task::spawn_blocking(move || -> Result<BatchManifest, String> {
        // Read current manifest
        let manifest_path = old_dir.join("manifest.json");
        let data =
            std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
        let mut manifest: BatchManifest =
            serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;

        // Update manifest fields
        manifest.batch_name = new_name;
        manifest.batch_id = new_batch_id.clone();

        // Update icon URLs to reflect the new batch_id
        for icon in &mut manifest.icons {
            icon.url = format!("/api/icons/{}/{}", new_batch_id, icon.filename);
        }

        // Write updated manifest
        let updated_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("serialize manifest: {e}"))?;
        std::fs::write(&manifest_path, &updated_json)
            .map_err(|e| format!("write manifest: {e}"))?;

        // Rename folder if batch_id changed
        if old_dir != new_dir {
            std::fs::rename(&old_dir, &new_dir).map_err(|e| format!("rename folder: {e}"))?;
            info!(
                old = %old_dir.display(),
                new = %new_dir.display(),
                "batch folder renamed"
            );
        }

        Ok(manifest)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
}

/// Rename a texture batch.
async fn rename_texture_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
    Json(request): Json<RenameBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let new_name = request.new_name.trim().to_string();
    if new_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name cannot be empty".to_string()));
    }

    let new_batch_id = slugify_prompt(&new_name);
    let textures_dir = state.textures_dir.clone();
    let old_dir = textures_dir.join(&batch_id);
    let new_dir = textures_dir.join(&new_batch_id);

    if !old_dir.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }

    if new_batch_id != batch_id && new_dir.exists() {
        return Err((
            StatusCode::CONFLICT,
            format!("A batch named '{}' already exists", new_batch_id),
        ));
    }

    let result = tokio::task::spawn_blocking(move || -> Result<TextureBatchManifest, String> {
        let manifest_path = old_dir.join("manifest.json");
        let data =
            std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
        let mut manifest: TextureBatchManifest =
            serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;

        manifest.batch_name = new_name;
        manifest.batch_id = new_batch_id.clone();

        for texture in &mut manifest.textures {
            texture.url = format!("/api/textures/{}/{}", new_batch_id, texture.filename);
        }

        let updated_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("serialize manifest: {e}"))?;
        std::fs::write(&manifest_path, &updated_json)
            .map_err(|e| format!("write manifest: {e}"))?;

        if old_dir != new_dir {
            std::fs::rename(&old_dir, &new_dir).map_err(|e| format!("rename folder: {e}"))?;
        }

        Ok(manifest)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
}

async fn rename_sprite_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
    Json(request): Json<RenameBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let new_name = request.new_name.trim().to_string();
    if new_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name cannot be empty".to_string()));
    }

    let new_batch_id = slugify_prompt(&new_name);
    let sprites_dir = state.sprites_dir.clone();
    let old_dir = sprites_dir.join(&batch_id);
    let new_dir = sprites_dir.join(&new_batch_id);

    if !old_dir.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    if new_batch_id != batch_id && new_dir.exists() {
        return Err((
            StatusCode::CONFLICT,
            format!("A batch named '{}' already exists", new_batch_id),
        ));
    }

    let result = tokio::task::spawn_blocking(move || -> Result<SpriteBatchManifest, String> {
        let manifest_path = old_dir.join("manifest.json");
        let data =
            std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
        let mut manifest: SpriteBatchManifest =
            serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;

        manifest.batch_name = new_name;
        manifest.batch_id = new_batch_id.clone();

        for sprite in &mut manifest.sprites {
            sprite.preview_url = sprite.preview_url.replace(
                &format!("/api/sprites/{batch_id}/"),
                &format!("/api/sprites/{new_batch_id}/"),
            );
            if let Some(url) = sprite.illustration_url.as_mut() {
                *url = url.replace(
                    &format!("/api/sprites/{batch_id}/"),
                    &format!("/api/sprites/{new_batch_id}/"),
                );
            }
            for frame in &mut sprite.directions {
                frame.url = frame.url.replace(
                    &format!("/api/sprites/{batch_id}/"),
                    &format!("/api/sprites/{new_batch_id}/"),
                );
            }
        }

        let updated_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("serialize manifest: {e}"))?;
        std::fs::write(&manifest_path, &updated_json)
            .map_err(|e| format!("write manifest: {e}"))?;

        if old_dir != new_dir {
            std::fs::rename(&old_dir, &new_dir).map_err(|e| format!("rename folder: {e}"))?;
        }

        Ok(manifest)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
}

/// Regenerate a single texture in a batch.
async fn regenerate_texture(
    State(state): State<AppState>,
    Path((batch_id, filename)): Path<(String, String)>,
    Json(request): Json<RegenerateTextureRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let batch_dir = state.textures_dir.join(&batch_id);
    let manifest_path = batch_dir.join("manifest.json");

    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }

    let item_text = request.item_prompt;
    let style_text = request.style_prompt;
    let full_prompt = if style_text.trim().is_empty() {
        item_text.clone()
    } else {
        format!("{} {}", style_text.trim(), item_text.trim())
    };

    let wrapped_prompt = match (request.category.as_str(), request.sub_category.as_deref()) {
        ("battle_assets", Some("ground")) => format!(
            "Generate a high-quality top-down flat game texture for an isometric RPG. \
            Visual content: {}. \
            Must be seamless and tileable if possible. No perspective, no depth, no borders, no text. \
            Output ONLY the texture image.",
            full_prompt
        ),
        ("battle_assets", Some("obstacle")) => format!(
            "Generate a high-quality game asset obstacle. \
            Visual content: {}. \
            Isolated object on a solid black or dark background. Centered composition. \
            Top-down or slight isometric angle to match the game's view. No borders, no text. \
            Output ONLY the asset image.",
            full_prompt
        ),
        ("ecology_illustrations", Some("flora")) => format!(
            "Generate a polished natural-history flora illustration. \
            Visual content: {}. \
            Single subject or tightly grouped specimen, readable silhouette, rich material detail, painterly realism, no text, no frame, no UI, no sprite sheet. \
            Output ONLY the illustration image.",
            full_prompt
        ),
        ("ecology_illustrations", Some("fauna")) => format!(
            "Generate a polished natural-history fauna illustration. \
            Visual content: {}. \
            Show the creature clearly in a field-guide or concept-art style, full body when possible, strong anatomy readability, painterly realism, no text, no frame, no UI, no sprite sheet. \
            Output ONLY the illustration image.",
            full_prompt
        ),
        ("ecology_illustrations", _) => format!(
            "Generate a polished ecology illustration for a worldbuilding archive. \
            Visual content: {}. \
            Natural-history presentation, clean readable subject, painterly realism, no text, no frame, no UI, no sprite sheet. \
            Output ONLY the illustration image.",
            full_prompt
        ),
        _ => format!(
            "Generate a game texture. Visual content: {}. No text, no borders.",
            full_prompt
        ),
    };

    let temperature = request.temperature.or(Some(0.4));
    let image_bytes_result = if let Some(base64_img) = &request.base64_image {
        gemini::generate_image_edit_bytes(
            &wrapped_prompt,
            base64_img,
            "image/png",
            temperature,
            Some("1:1"),
        )
        .await
    } else {
        gemini::generate_image_bytes(&wrapped_prompt, temperature, 512, 512, Some("1:1")).await
    };

    let image_bytes = image_bytes_result.map_err(|(code, msg)| (code, msg))?;

    let updated_texture =
        tokio::task::spawn_blocking(move || -> Result<BatchTexture, (StatusCode, String)> {
            let img = image::load_from_memory(&image_bytes).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Image decode error: {e}"),
                )
            })?;

            let path = batch_dir.join(&filename);
            img.save(&path).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Save error: {e}"),
                )
            })?;

            let data = std::fs::read_to_string(&manifest_path).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Read manifest error: {e}"),
                )
            })?;
            let mut manifest: TextureBatchManifest = serde_json::from_str(&data).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Parse manifest error: {e}"),
                )
            })?;

            for texture in &mut manifest.textures {
                if texture.filename == filename {
                    texture.prompt = full_prompt.clone();
                    texture.item_prompt = item_text.clone();
                    texture.style_prompt = style_text.clone();
                    break;
                }
            }

            let updated_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Serialize manifest error: {e}"),
                )
            })?;
            std::fs::write(&manifest_path, &updated_json).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Write manifest error: {e}"),
                )
            })?;
            Ok(BatchTexture {
                filename: filename.clone(),
                prompt: full_prompt,
                style_prompt: style_text,
                item_prompt: item_text,
                url: format!("/api/textures/{}/{}", batch_id, filename),
                metadata: serde_json::Value::Null,
            })
        })
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task join error: {e}"),
            )
        })?
        .map_err(|e| e)?;

    Ok(Json(updated_texture))
}

/// Export textures registry to a TypeScript file.
async fn export_textures_registry(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let textures_dir = state.textures_dir.clone();
    let export_dir = state.textures_export_dir.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<ExportResult, String> {
        let mut all_manifests: Vec<TextureBatchManifest> = Vec::new();
        if textures_dir.exists() {
            let dir = std::fs::read_dir(&textures_dir).map_err(|e| format!("read textures dir: {e}"))?;
            for entry in dir {
                let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
                let path = entry.path();
                if !path.is_dir() { continue; }
                let manifest_path = path.join("manifest.json");
                if !manifest_path.exists() { continue; }
                let data = std::fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?;
                let manifest: TextureBatchManifest = serde_json::from_str(&data).map_err(|e| format!("parse manifest: {e}"))?;
                all_manifests.push(manifest);
            }
        }
        all_manifests.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        std::fs::create_dir_all(&export_dir).map_err(|e| format!("create export dir: {e}"))?;

        let mut ts_entries: Vec<String> = Vec::new();
        let mut total_textures: usize = 0;

        for manifest in &all_manifests {
            let mut texture_entries: Vec<String> = Vec::new();
            for texture in &manifest.textures {
                let key = slugify_prompt(&texture.prompt);
                texture_entries.push(format!(
                    "    {{ key: '{}', prompt: '{}', file: './{}/{}' }}",
                    key,
                    texture.prompt.replace('\\', "\\\\").replace('\'', "\\'"),
                    manifest.batch_id,
                    texture.filename
                ));
                total_textures += 1;
            }

            let display_name = if manifest.batch_name.is_empty() {
                manifest.batch_id[..8.min(manifest.batch_id.len())].to_uppercase()
            } else {
                manifest.batch_name.clone()
            };
            ts_entries.push(format!(
                "  // {} — {} — {} textures\n  {{\n    batchId: '{}',\n    name: '{}',\n    createdAt: '{}',\n    category: '{}',\n    subCategory: {},\n    textures: [\n{}\n    ],\n  }}",
                display_name,
                manifest.created_at,
                manifest.textures.len(),
                manifest.batch_id,
                manifest.batch_name.replace('\\', "\\\\").replace('\'', "\\'"),
                manifest.created_at,
                manifest.category,
                manifest.sub_category.as_ref().map(|s| format!("'{}'", s)).unwrap_or("undefined".to_string()),
                texture_entries.join(",\n")
            ));
        }

        let ts_content = format!(
            "// ──────────────────────────────────────────\n\
             // AUTO-GENERATED — DO NOT EDIT MANUALLY\n\
             // Generated by dev-tools texture export\n\
             // Total: {} textures across {} batches\n\
             // ──────────────────────────────────────────\n\
             \n\
             export interface TextureEntry {{\n\
             \x20 key: string;\n\
             \x20 prompt: string;\n\
             \x20 file: string;\n\
             }}\n\
             \n\
             export interface TextureBatch {{\n\
             \x20 batchId: string;\n\
             \x20 name: string;\n\
             \x20 createdAt: string;\n\
             \x20 category: string;\n\
             \x20 subCategory?: string;\n\
             \x20 textures: TextureEntry[];\n\
             }}\n\
             \n\
             export const TEXTURE_BATCHES: TextureBatch[] = [\n\
             {}\n\
             ];\n\
             \n\
             export const TEXTURES: Record<string, TextureEntry> = Object.fromEntries(\n\
             \x20 TEXTURE_BATCHES.flatMap(b => b.textures).map(i => [i.key, i])\n\
             );\n",
            total_textures,
            all_manifests.len(),
            ts_entries.join(",\n")
        );

        let index_path = export_dir.join("textures_index.ts");
        std::fs::write(&index_path, ts_content).map_err(|e| format!("write textures_index.ts: {e}"))?;

        Ok(ExportResult {
            total_icons: total_textures,
            total_batches: all_manifests.len(),
            export_path: index_path.display().to_string(),
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {e}")))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
}

fn load_supabase_storage_config() -> Option<SupabaseStorageConfig> {
    let url = std::env::var("SUPABASE_URL")
        .ok()?
        .trim()
        .trim_end_matches('/')
        .to_string();
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .ok()?
        .trim()
        .to_string();
    let bucket = std::env::var("SUPABASE_BUCKET").ok()?.trim().to_string();

    if url.is_empty() || service_role_key.is_empty() || bucket.is_empty() {
        return None;
    }

    let prefix = std::env::var("SUPABASE_STORAGE_PREFIX")
        .ok()
        .map(|v| v.trim().trim_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "ashtrail".to_string());

    Some(SupabaseStorageConfig {
        url,
        service_role_key,
        bucket,
        prefix,
    })
}

fn normalize_slashes(path: &std::path::Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_image_file(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
}

fn guess_content_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

fn collect_files_recursive(root: &std::path::Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_files_recursive(&path, out);
            } else if path.is_file() {
                out.push(path);
            }
        }
    }
}

fn local_to_cloud_key(
    state: &AppState,
    cfg: &SupabaseStorageConfig,
    local_path: &std::path::Path,
) -> Option<String> {
    if let Ok(rel) = local_path.strip_prefix(&state.planets_dir) {
        return Some(format!("{}/planets/{}", cfg.prefix, normalize_slashes(rel)));
    }
    if let Ok(rel) = local_path.strip_prefix(&state.icons_dir) {
        return Some(format!("{}/icons/{}", cfg.prefix, normalize_slashes(rel)));
    }
    if let Ok(rel) = local_path.strip_prefix(&state.isolated_dir) {
        return Some(format!(
            "{}/isolated/{}",
            cfg.prefix,
            normalize_slashes(rel)
        ));
    }
    None
}

fn cloud_key_to_local(state: &AppState, cfg: &SupabaseStorageConfig, key: &str) -> Option<PathBuf> {
    let planets_prefix = format!("{}/planets/", cfg.prefix);
    let icons_prefix = format!("{}/icons/", cfg.prefix);
    let isolated_prefix = format!("{}/isolated/", cfg.prefix);
    if let Some(rel) = key.strip_prefix(&planets_prefix) {
        return Some(state.planets_dir.join(rel));
    }
    if let Some(rel) = key.strip_prefix(&icons_prefix) {
        return Some(state.icons_dir.join(rel));
    }
    if let Some(rel) = key.strip_prefix(&isolated_prefix) {
        return Some(state.isolated_dir.join(rel));
    }
    None
}

fn local_modified_at(path: &std::path::Path) -> Option<chrono::DateTime<chrono::Utc>> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(chrono::DateTime::<chrono::Utc>::from(modified))
}

fn remote_updated_at(updated_at: Option<&str>) -> Option<chrono::DateTime<chrono::Utc>> {
    let raw = updated_at?;
    chrono::DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc))
}

async fn list_supabase_objects_recursive(
    client: &reqwest::Client,
    cfg: &SupabaseStorageConfig,
    prefix: &str,
) -> Result<Vec<RemoteObject>, String> {
    let mut folders = vec![prefix.trim_matches('/').to_string()];
    let mut files: Vec<RemoteObject> = Vec::new();

    while let Some(current_prefix) = folders.pop() {
        let list_url = format!("{}/storage/v1/object/list/{}", cfg.url, cfg.bucket);
        let response = client
            .post(&list_url)
            .header("Authorization", format!("Bearer {}", cfg.service_role_key))
            .header("apikey", &cfg.service_role_key)
            .json(&serde_json::json!({
                "prefix": current_prefix,
                "limit": 1000,
                "offset": 0,
                "sortBy": { "column": "name", "order": "asc" }
            }))
            .send()
            .await
            .map_err(|e| format!("supabase list request failed: {e}"))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("supabase list failed ({}): {}", status, body));
        }

        let entries = response
            .json::<Vec<serde_json::Value>>()
            .await
            .map_err(|e| format!("supabase list parse failed: {e}"))?;

        for entry in entries {
            let Some(name) = entry.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            let full_path = if current_prefix.is_empty() {
                name.to_string()
            } else {
                format!("{}/{}", current_prefix, name)
            };
            let is_folder = entry.get("id").and_then(|v| v.as_str()).is_none();
            if is_folder {
                folders.push(full_path);
                continue;
            }
            files.push(RemoteObject {
                path: full_path,
                updated_at: entry
                    .get("updated_at")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                size_bytes: entry
                    .get("metadata")
                    .and_then(|m| m.get("size"))
                    .and_then(|s| s.as_u64()),
            });
        }
    }

    Ok(files)
}

async fn ensure_supabase_bucket_exists(
    client: &reqwest::Client,
    cfg: &SupabaseStorageConfig,
) -> Result<(), String> {
    let get_url = format!("{}/storage/v1/bucket/{}", cfg.url, cfg.bucket);
    let get_response = client
        .get(get_url)
        .header("Authorization", format!("Bearer {}", cfg.service_role_key))
        .header("apikey", &cfg.service_role_key)
        .send()
        .await
        .map_err(|e| format!("bucket existence check failed: {e}"))?;

    let get_status = get_response.status();
    if get_status.is_success() {
        return Ok(());
    }

    if get_status != StatusCode::NOT_FOUND {
        let body = get_response.text().await.unwrap_or_default();
        return Err(format!("bucket check failed ({}): {}", get_status, body));
    }

    let create_url = format!("{}/storage/v1/bucket", cfg.url);
    let create_response = client
        .post(create_url)
        .header("Authorization", format!("Bearer {}", cfg.service_role_key))
        .header("apikey", &cfg.service_role_key)
        .json(&serde_json::json!({
            "id": cfg.bucket,
            "name": cfg.bucket,
            "public": true
        }))
        .send()
        .await
        .map_err(|e| format!("bucket create request failed: {e}"))?;

    let create_status = create_response.status();
    if create_status.is_success() || create_status == StatusCode::CONFLICT {
        Ok(())
    } else {
        let body = create_response.text().await.unwrap_or_default();
        Err(format!(
            "bucket create failed ({}): {}",
            create_status, body
        ))
    }
}

async fn upload_to_supabase(
    client: &reqwest::Client,
    cfg: &SupabaseStorageConfig,
    key: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let upload_url = format!("{}/storage/v1/object/{}/{}", cfg.url, cfg.bucket, key);
    let response = client
        .post(upload_url)
        .header("Authorization", format!("Bearer {}", cfg.service_role_key))
        .header("apikey", &cfg.service_role_key)
        .header("x-upsert", "true")
        .header("Content-Type", guess_content_type(key))
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("upload request failed: {e}"))?;

    let status = response.status();
    if status.is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(format!("upload failed ({}): {}", status, body))
    }
}

async fn download_from_supabase(
    client: &reqwest::Client,
    cfg: &SupabaseStorageConfig,
    key: &str,
) -> Result<Vec<u8>, String> {
    let download_url = format!("{}/storage/v1/object/{}/{}", cfg.url, cfg.bucket, key);
    let response = client
        .get(download_url)
        .header("Authorization", format!("Bearer {}", cfg.service_role_key))
        .header("apikey", &cfg.service_role_key)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("download failed ({}): {}", status, body));
    }

    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("download bytes failed: {e}"))
}

async fn browse_supabase_objects(
    State(state): State<AppState>,
    Query(query): Query<SupabaseBrowseQuery>,
) -> impl IntoResponse {
    let Some(cfg) = state.supabase.as_ref() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Supabase storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET."
            })),
        )
            .into_response();
    };

    let normalized_prefix = query
        .prefix
        .as_deref()
        .map(|p| p.trim().trim_matches('/').to_string())
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| cfg.prefix.clone());
    let images_only = query.images_only.unwrap_or(true);

    let client = reqwest::Client::new();
    if let Err(err) = ensure_supabase_bucket_exists(&client, cfg).await {
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response();
    }

    match list_supabase_objects_recursive(&client, cfg, &normalized_prefix).await {
        Ok(mut objects) => {
            objects.sort_by(|a, b| b.path.cmp(&a.path));
            let items = objects
                .into_iter()
                .filter(|o| !images_only || is_image_file(&o.path))
                .map(|o| SupabaseObjectInfo {
                    name: o.path.split('/').last().unwrap_or("").to_string(),
                    path: o.path.clone(),
                    size_bytes: o.size_bytes,
                    updated_at: o.updated_at.clone(),
                    public_url: format!(
                        "{}/storage/v1/object/public/{}/{}",
                        cfg.url, cfg.bucket, o.path
                    ),
                })
                .collect::<Vec<_>>();

            (
                StatusCode::OK,
                Json(SupabaseBrowseResponse {
                    prefix: normalized_prefix,
                    objects: items,
                }),
            )
                .into_response()
        }
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn sync_supabase_storage(
    State(state): State<AppState>,
    Json(request): Json<SupabaseSyncRequest>,
) -> impl IntoResponse {
    let Some(cfg) = state.supabase.as_ref() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Supabase storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET."
            })),
        )
            .into_response();
    };

    let direction = request
        .direction
        .unwrap_or_else(|| "both".to_string())
        .to_lowercase();
    if direction != "push" && direction != "pull" && direction != "both" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "direction must be one of: push, pull, both" })),
        )
            .into_response();
    }
    let images_only = request.images_only.unwrap_or(false);

    let client = reqwest::Client::new();
    if let Err(err) = ensure_supabase_bucket_exists(&client, cfg).await {
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response();
    }

    let mut uploaded = 0usize;
    let mut downloaded = 0usize;
    let mut skipped = 0usize;
    let mut failed = 0usize;

    let planets_prefix = format!("{}/planets", cfg.prefix);
    let icons_prefix = format!("{}/icons", cfg.prefix);
    let isolated_prefix = format!("{}/isolated", cfg.prefix);
    let remote_planets = match list_supabase_objects_recursive(&client, cfg, &planets_prefix).await
    {
        Ok(v) => v,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": err })),
            )
                .into_response();
        }
    };
    let remote_icons = match list_supabase_objects_recursive(&client, cfg, &icons_prefix).await {
        Ok(v) => v,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": err })),
            )
                .into_response();
        }
    };
    let remote_isolated =
        match list_supabase_objects_recursive(&client, cfg, &isolated_prefix).await {
            Ok(v) => v,
            Err(err) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({ "error": err })),
                )
                    .into_response();
            }
        };
    let remote_files = remote_planets
        .into_iter()
        .chain(remote_icons.into_iter())
        .chain(remote_isolated.into_iter())
        .collect::<Vec<_>>();
    let remote_map = remote_files
        .iter()
        .map(|o| (o.path.clone(), o.clone()))
        .collect::<HashMap<_, _>>();

    let mut local_files = Vec::new();
    collect_files_recursive(&state.planets_dir, &mut local_files);
    collect_files_recursive(&state.icons_dir, &mut local_files);
    collect_files_recursive(&state.isolated_dir, &mut local_files);

    if direction == "push" || direction == "both" {
        for local_path in &local_files {
            let Some(cloud_key) = local_to_cloud_key(&state, cfg, local_path) else {
                continue;
            };
            if images_only && !is_image_file(&cloud_key) {
                continue;
            }

            let local_time = local_modified_at(local_path);
            let remote_time = remote_map
                .get(&cloud_key)
                .and_then(|o| remote_updated_at(o.updated_at.as_deref()));

            if remote_time.is_some() && local_time.is_some() && remote_time >= local_time {
                skipped += 1;
                continue;
            }

            match std::fs::read(local_path) {
                Ok(bytes) => {
                    if upload_to_supabase(&client, cfg, &cloud_key, bytes)
                        .await
                        .is_ok()
                    {
                        uploaded += 1;
                    } else {
                        failed += 1;
                    }
                }
                Err(_) => failed += 1,
            }
        }
    }

    if direction == "pull" || direction == "both" {
        for remote in &remote_files {
            if images_only && !is_image_file(&remote.path) {
                continue;
            }
            let Some(local_path) = cloud_key_to_local(&state, cfg, &remote.path) else {
                continue;
            };

            let local_time = local_modified_at(&local_path);
            let remote_time = remote_updated_at(remote.updated_at.as_deref());
            if local_time.is_some() && remote_time.is_some() && local_time >= remote_time {
                skipped += 1;
                continue;
            }

            match download_from_supabase(&client, cfg, &remote.path).await {
                Ok(bytes) => {
                    if let Some(parent) = local_path.parent() {
                        if std::fs::create_dir_all(parent).is_err() {
                            failed += 1;
                            continue;
                        }
                    }
                    if std::fs::write(&local_path, bytes).is_ok() {
                        downloaded += 1;
                    } else {
                        failed += 1;
                    }
                }
                Err(_) => failed += 1,
            }
        }
    }

    (
        StatusCode::OK,
        Json(SupabaseSyncResponse {
            direction,
            uploaded,
            downloaded,
            skipped,
            failed,
        }),
    )
        .into_response()
}

/// Turn a prompt into a safe snake_case key.
fn slugify_prompt(prompt: &str) -> String {
    let slug: String = prompt
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    // Collapse multiple underscores and trim
    let mut result = String::new();
    let mut prev_underscore = false;
    for c in slug.chars() {
        if c == '_' {
            if !prev_underscore && !result.is_empty() {
                result.push('_');
            }
            prev_underscore = true;
        } else {
            result.push(c);
            prev_underscore = false;
        }
    }
    result.trim_end_matches('_').to_string()
}
