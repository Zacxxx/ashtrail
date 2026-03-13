use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use base64::Engine as _;
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path as FsPath, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    sync::{Arc, Mutex},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::{
    gemini,
    jobs::{now_ms, JobOutputRef, JobRecord, JobRouteRef, JobStatus},
    locations::{self, LocationCategory, LocationHistoryHooks, LocationRecord, LocationScale, LocationStatus, RecordSource},
    AppState,
};

const DEFAULT_ROWS: u32 = 64;
const DEFAULT_COLS: u32 = 64;
pub const TEST_EXPLORATION_LOCATION_ID: &str = "__test_exploration__";

#[derive(Clone)]
pub struct ExplorationGenerationRuntime {
    pub jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    pub global_limiter: ExplorationWorkLimiter,
    pub text_limiter: ExplorationWorkLimiter,
    pub image_limiter: ExplorationWorkLimiter,
    pub enabled: bool,
}

#[derive(Clone)]
pub struct ExplorationWorkLimiter {
    pub semaphore: Arc<Semaphore>,
    pub max_concurrent: usize,
    pub max_queue: usize,
    pub outstanding: Arc<AtomicUsize>,
}

pub struct ExplorationQueueReservation {
    outstanding: Arc<AtomicUsize>,
}

#[derive(Clone, Copy)]
enum ExplorationChildJobKind {
    Semantics,
    BlockPack,
    AssetKit,
    Preview,
}

impl Drop for ExplorationQueueReservation {
    fn drop(&mut self) {
        self.outstanding.fetch_sub(1, Ordering::SeqCst);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationJobAcceptedResponse {
    pub job_id: String,
    pub kind: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExplorationLocationRequest {
    pub world_id: String,
    pub location_id: String,
    #[serde(default)]
    pub location_name: Option<String>,
    #[serde(default)]
    pub prompt: String,
    #[serde(default = "default_rows")]
    pub rows: u32,
    #[serde(default = "default_cols")]
    pub cols: u32,
    #[serde(default)]
    pub selected_char_ids: Vec<String>,
    #[serde(default)]
    pub biome_pack_id: Option<String>,
    #[serde(default)]
    pub biome_source: Option<String>,
    #[serde(default)]
    pub biome_name: Option<String>,
    #[serde(default)]
    pub structure_pack_ids: Vec<String>,
    #[serde(default)]
    pub structure_source_map: HashMap<String, String>,
    #[serde(default)]
    pub structure_names: Vec<String>,
    #[serde(default)]
    pub seed: Option<u64>,
    #[serde(default)]
    pub generation_mode: Option<String>,
    #[serde(default)]
    pub block_palette_id: Option<String>,
    #[serde(default)]
    pub asset_mode: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationAssetJobRequest {
    pub world_id: String,
    pub location_id: String,
    #[serde(default)]
    pub location_name: Option<String>,
    #[serde(default)]
    pub block_palette_id: Option<String>,
    #[serde(default)]
    pub asset_mode: Option<String>,
    #[serde(default)]
    pub parent_job_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobLaunchMeta {
    #[serde(default)]
    restore: Option<JobRestoreSpec>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobRestoreSpec {
    route: String,
    #[serde(default)]
    search: Option<Map<String, Value>>,
    payload: Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExplorationTile {
    r#type: String,
    walkable: bool,
    move_cost: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    texture_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_spawn_zone: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExplorationObject {
    id: String,
    r#type: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    passable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    texture_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_natural: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    move_cost: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fertility: Option<f32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExplorationMapManifest {
    id: String,
    width: u32,
    height: u32,
    tiles: Vec<ExplorationTile>,
    pawns: Vec<Value>,
    objects: Vec<ExplorationObject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fog_of_war: Option<Vec<bool>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerationContext {
    location_name: String,
    location_lore: String,
    location_type: String,
    generation_mode: String,
    asset_mode: String,
    rows: u32,
    cols: u32,
    seed: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationManifestListItem {
    pub location_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_name: Option<String>,
    pub built_in: bool,
}

impl ExplorationWorkLimiter {
    pub fn new(max_concurrent: usize, max_queue: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            max_concurrent,
            max_queue,
            outstanding: Arc::new(AtomicUsize::new(0)),
        }
    }
}

impl ExplorationGenerationRuntime {
    pub fn from_env(enabled: bool, jobs: Arc<Mutex<HashMap<String, JobRecord>>>) -> Self {
        Self {
            jobs,
            global_limiter: ExplorationWorkLimiter::new(
                read_usize_env("EXPLORATION_JOB_MAX_CONCURRENT", 2),
                read_usize_env("EXPLORATION_JOB_MAX_QUEUE", 8),
            ),
            text_limiter: ExplorationWorkLimiter::new(
                read_usize_env("EXPLORATION_TEXT_MAX_CONCURRENT", 1),
                read_usize_env("EXPLORATION_TEXT_MAX_QUEUE", 4),
            ),
            image_limiter: ExplorationWorkLimiter::new(
                read_usize_env("EXPLORATION_IMAGE_MAX_CONCURRENT", 1),
                read_usize_env("EXPLORATION_IMAGE_MAX_QUEUE", 2),
            ),
            enabled,
        }
    }

    pub fn create_job(
        &self,
        kind: &str,
        title: &str,
        world_id: &str,
        parent_job_id: Option<String>,
    ) -> Result<String, (StatusCode, String)> {
        let job_id = format!("xjob-{}", uuid::Uuid::new_v4());
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let mut job = JobRecord::new(kind, title, "exploration");
        job.world_id = Some(world_id.to_string());
        job.parent_job_id = parent_job_id;
        jobs.insert(job_id.clone(), job);
        Ok(job_id)
    }

    pub fn update_job(
        &self,
        job_id: &str,
        status: JobStatus,
        progress: f32,
        stage: &str,
        result: Option<Value>,
        error: Option<String>,
    ) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.status = status;
                job.progress = progress;
                job.current_stage = stage.to_string();
                if result.is_some() {
                    job.result = result;
                }
                job.error = error;
                job.updated_at = now_ms();
            }
        }
    }

    pub fn set_job_metadata(&self, job_id: &str, metadata: Value) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.metadata = Some(metadata);
                job.updated_at = now_ms();
            }
        }
    }

    pub fn set_output_refs(&self, job_id: &str, output_refs: Vec<JobOutputRef>) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.output_refs = output_refs;
                job.updated_at = now_ms();
            }
        }
    }

    pub fn cancel_job(&self, job_id: &str) -> Result<bool, (StatusCode, String)> {
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let Some(job) = jobs.get_mut(job_id) else {
            return Ok(false);
        };
        job.cancel_requested = true;
        if matches!(job.status, JobStatus::Queued | JobStatus::Running) {
            job.current_stage = "Cancellation requested".to_string();
            job.updated_at = now_ms();
        }
        Ok(true)
    }

    pub fn is_cancel_requested(&self, job_id: &str) -> bool {
        self.jobs
            .lock()
            .ok()
            .and_then(|jobs| jobs.get(job_id).map(|job| job.cancel_requested))
            .unwrap_or(false)
    }

    pub async fn wait_for_text_permits(
        &self,
        job_id: &str,
    ) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
        wait_for_permits(
            self,
            job_id,
            &self.global_limiter,
            &self.text_limiter,
            "Waiting for exploration text capacity",
        )
        .await
    }
}

pub async fn start_generate_location_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GenerateExplorationLocationRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if !state.exploration_runtime.enabled {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Exploration generation runtime disabled".to_string(),
        ));
    }

    let Some(reservation) = try_reserve_capacity(&state.exploration_runtime.global_limiter) else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Exploration generation queue full. Please wait for running jobs to finish."
                .to_string(),
        ));
    };

    let job_id = state.exploration_runtime.create_job(
        "exploration.generate-location.v1",
        "Generate Exploration Map",
        &payload.world_id,
        None,
    )?;

    let launch_meta = parse_job_launch_meta(&headers);
    let metadata = build_location_job_metadata(&payload, launch_meta.as_ref().and_then(|meta| meta.restore.clone()));
    state
        .exploration_runtime
        .set_job_metadata(&job_id, Value::Object(metadata));

    let spawned_state = state.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        let _reservation = reservation;
        run_generate_location_job(spawned_state, payload, spawned_job_id).await;
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(ExplorationJobAcceptedResponse {
            job_id,
            kind: "generate-location".to_string(),
        }),
    ))
}

pub async fn start_generate_block_pack_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ExplorationAssetJobRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    start_placeholder_asset_job(
        state,
        headers,
        payload,
        "exploration.generate-block-pack.v1",
        "Generate Exploration Block Pack",
        "generate-block-pack",
    )
    .await
}

pub async fn start_generate_asset_kit_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ExplorationAssetJobRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    start_placeholder_asset_job(
        state,
        headers,
        payload,
        "exploration.generate-asset-kit.v1",
        "Generate Exploration Asset Kit",
        "generate-asset-kit",
    )
    .await
}

pub async fn get_exploration_manifest(
    State(state): State<AppState>,
    Path((world_id, location_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = manifest_path(&state.planets_dir, &world_id, &location_id);
    if !path.exists() {
        if is_test_exploration_location(&location_id) {
            let manifest = build_test_manifest_value(&world_id);
            return (StatusCode::OK, Json(manifest)).into_response();
        }
        return (StatusCode::NOT_FOUND, "Exploration manifest not found".to_string()).into_response();
    }

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse exploration manifest: {error}"),
            )
                .into_response(),
        },
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read exploration manifest: {error}"),
        )
            .into_response(),
    }
}

pub async fn list_exploration_manifests(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> impl IntoResponse {
    let mut items = vec![ExplorationManifestListItem {
        location_id: TEST_EXPLORATION_LOCATION_ID.to_string(),
        name: "Test Exploration".to_string(),
        manifest_name: Some("Test Exploration".to_string()),
        built_in: true,
    }];

    let location_names: HashMap<String, String> = locations::read_locations(&state.planets_dir, &world_id)
        .into_iter()
        .map(|entry| (entry.id, entry.name))
        .collect();

    let root = state.planets_dir.join(&world_id).join("exploration");
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }

            let location_id = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().join("manifest.json");
            if !path.exists() {
                continue;
            }

            let manifest_name = fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<Value>(&content).ok())
                .and_then(|value| value.get("name").and_then(Value::as_str).map(str::to_string));

            let name = location_names
                .get(&location_id)
                .cloned()
                .or_else(|| manifest_name.clone())
                .unwrap_or_else(|| location_id.clone());

            items.push(ExplorationManifestListItem {
                location_id,
                name,
                manifest_name,
                built_in: false,
            });
        }
    }

    items.sort_by(|left, right| {
        right.built_in
            .cmp(&left.built_in)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    (StatusCode::OK, Json(items)).into_response()
}

async fn start_placeholder_asset_job(
    state: AppState,
    headers: HeaderMap,
    payload: ExplorationAssetJobRequest,
    kind: &str,
    title: &str,
    accepted_kind: &str,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let Some(reservation) = try_reserve_capacity(&state.exploration_runtime.global_limiter) else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Exploration generation queue full. Please wait for running jobs to finish."
                .to_string(),
        ));
    };

    let job_id = state.exploration_runtime.create_job(
        kind,
        title,
        &payload.world_id,
        payload.parent_job_id.clone(),
    )?;

    let restore = parse_job_launch_meta(&headers).and_then(|meta| meta.restore);
    state.exploration_runtime.set_job_metadata(
        &job_id,
        Value::Object(build_asset_job_metadata(&payload, restore)),
    );

    let output_refs = build_location_output_refs(
        &payload.world_id,
        &payload.location_id,
        &job_id,
        payload.location_name.as_deref().unwrap_or("Location"),
    );
    state.exploration_runtime.set_output_refs(&job_id, output_refs);

    let runtime = state.exploration_runtime.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        let _reservation = reservation;
        runtime.update_job(
            &spawned_job_id,
            JobStatus::Running,
            35.0,
            "Linking exploration assets...",
            None,
            None,
        );
        runtime.update_job(
            &spawned_job_id,
            JobStatus::Completed,
            100.0,
            "Completed",
            Some(json!({
                "worldId": payload.world_id,
                "locationId": payload.location_id,
                "assetMode": payload.asset_mode,
                "blockPaletteId": payload.block_palette_id,
            })),
            None,
        );
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(ExplorationJobAcceptedResponse {
            job_id,
            kind: accepted_kind.to_string(),
        }),
    ))
}

async fn run_generate_location_job(
    state: AppState,
    payload: GenerateExplorationLocationRequest,
    job_id: String,
) {
    let runtime = state.exploration_runtime.clone();
    runtime.update_job(
        &job_id,
        JobStatus::Running,
        5.0,
        "Loading location context...",
        None,
        None,
    );

    let locations = locations::read_locations(&state.planets_dir, &payload.world_id);
    let location_record = match locations.into_iter().find(|entry| entry.id == payload.location_id) {
        Some(entry) => entry,
        None if is_test_exploration_location(&payload.location_id) => {
            build_test_location_record(&payload.world_id)
        }
        None => {
            runtime.update_job(
                &job_id,
                JobStatus::Failed,
                100.0,
                "Failed",
                None,
                Some("Location not found for active world".to_string()),
            );
            return;
        }
    };

    if runtime.is_cancel_requested(&job_id) {
        runtime.update_job(
            &job_id,
            JobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some("cancelled".to_string()),
        );
        return;
    }

    let context = build_generation_context(&payload, &location_record);
    let semantics_job = runtime
        .create_job(
            "exploration.generate-semantics.v1",
            "Generate Exploration Semantics",
            &payload.world_id,
            Some(job_id.clone()),
        )
        .ok();
    if let Some(child_job_id) = semantics_job.as_deref() {
        runtime.set_job_metadata(
            child_job_id,
            Value::Object(build_child_job_metadata(
                &payload,
                &context.location_name,
                ExplorationChildJobKind::Semantics,
            )),
        );
    }

    let semantics_summary = run_semantics_child_job(
        &state,
        &job_id,
        semantics_job.as_deref(),
        &payload,
        &context,
    )
    .await;

    if runtime.is_cancel_requested(&job_id) {
        runtime.update_job(
            &job_id,
            JobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some("cancelled".to_string()),
        );
        return;
    }

    runtime.update_job(
        &job_id,
        JobStatus::Running,
        45.0,
        "Building exploration map...",
        None,
        None,
    );

    let manifest = build_manifest(&payload, &location_record, &context, semantics_summary.as_deref());
    let manifest_value = build_manifest_value(&manifest, &payload, &context);

    if runtime.is_cancel_requested(&job_id) {
        runtime.update_job(
            &job_id,
            JobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some("cancelled".to_string()),
        );
        return;
    }

    if let Err(error) = write_manifest(
        &state.planets_dir,
        &payload.world_id,
        &payload.location_id,
        &manifest_value,
    ) {
        runtime.update_job(
            &job_id,
            JobStatus::Failed,
            100.0,
            "Failed",
            None,
            Some(error),
        );
        return;
    }

    if runtime.is_cancel_requested(&job_id) {
        remove_manifest_if_exists(&state.planets_dir, &payload.world_id, &payload.location_id);
        runtime.update_job(
            &job_id,
            JobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some("cancelled".to_string()),
        );
        return;
    }

    let block_pack_job = runtime
        .create_job(
            "exploration.generate-block-pack.v1",
            "Generate Exploration Block Pack",
            &payload.world_id,
            Some(job_id.clone()),
        )
        .ok();
    if let Some(child_job_id) = block_pack_job.as_deref() {
        runtime.set_job_metadata(
            child_job_id,
            Value::Object(build_child_job_metadata(
                &payload,
                &context.location_name,
                ExplorationChildJobKind::BlockPack,
            )),
        );
    }
    complete_child_job(
        &runtime,
        block_pack_job.as_deref(),
        70.0,
        "Linked block palette",
        json!({
            "blockPaletteId": payload.block_palette_id,
            "assetMode": payload.asset_mode,
        }),
        build_asset_generator_output_refs(),
    );

    let asset_kit_job = runtime
        .create_job(
            "exploration.generate-asset-kit.v1",
            "Generate Exploration Asset Kit",
            &payload.world_id,
            Some(job_id.clone()),
        )
        .ok();
    if let Some(child_job_id) = asset_kit_job.as_deref() {
        runtime.set_job_metadata(
            child_job_id,
            Value::Object(build_child_job_metadata(
                &payload,
                &context.location_name,
                ExplorationChildJobKind::AssetKit,
            )),
        );
    }
    complete_child_job(
        &runtime,
        asset_kit_job.as_deref(),
        82.0,
        "Linked exploration kits",
        json!({
            "biomePackId": payload.biome_pack_id,
            "structurePackIds": payload.structure_pack_ids,
            "assetMode": payload.asset_mode,
        }),
        build_pack_output_refs(),
    );

    let preview_job = runtime
        .create_job(
            "exploration.generate-preview.v1",
            "Generate Exploration Preview",
            &payload.world_id,
            Some(job_id.clone()),
        )
        .ok();
    if let Some(child_job_id) = preview_job.as_deref() {
        runtime.set_job_metadata(
            child_job_id,
            Value::Object(build_child_job_metadata(
                &payload,
                &context.location_name,
                ExplorationChildJobKind::Preview,
            )),
        );
    }
    complete_child_job(
        &runtime,
        preview_job.as_deref(),
        92.0,
        "Preview ready",
        json!({
            "locationName": context.location_name,
            "rows": context.rows,
            "cols": context.cols,
        }),
        build_location_output_refs(
            &payload.world_id,
            &payload.location_id,
            &job_id,
            &context.location_name,
        ),
    );

    let output_refs = build_location_output_refs(
        &payload.world_id,
        &payload.location_id,
        &job_id,
        &context.location_name,
    );
    runtime.set_output_refs(&job_id, output_refs);
    runtime.update_job(
        &job_id,
        JobStatus::Completed,
        100.0,
        "Completed",
        Some(json!({
            "worldId": payload.world_id,
            "locationId": payload.location_id,
            "locationName": context.location_name,
            "mapName": manifest.name,
            "manifestAvailable": true,
            "generatedAt": now_ms(),
        })),
        None,
    );
}

async fn run_semantics_child_job(
    state: &AppState,
    parent_job_id: &str,
    child_job_id: Option<&str>,
    payload: &GenerateExplorationLocationRequest,
    context: &GenerationContext,
) -> Option<String> {
    let runtime = state.exploration_runtime.clone();
    let Some(child_job_id) = child_job_id else {
        return heuristic_semantics(payload, context);
    };

    runtime.update_job(
        child_job_id,
        JobStatus::Queued,
        0.0,
        "Waiting for exploration text capacity",
        None,
        None,
    );

    if payload.prompt.trim().is_empty() {
        runtime.update_job(
            child_job_id,
            JobStatus::Completed,
            100.0,
            "Skipped semantic hint generation",
            Some(json!({
                "summary": heuristic_semantics(payload, context),
                "mode": "heuristic",
            })),
            None,
        );
        return heuristic_semantics(payload, context);
    }

    let Ok((_global_permit, _text_permit)) = runtime.wait_for_text_permits(child_job_id).await else {
        runtime.update_job(
            child_job_id,
            JobStatus::Completed,
            100.0,
            "Fell back to heuristic semantics",
            Some(json!({
                "summary": heuristic_semantics(payload, context),
                "mode": "heuristic",
            })),
            None,
        );
        return heuristic_semantics(payload, context);
    };

    if runtime.is_cancel_requested(parent_job_id) || runtime.is_cancel_requested(child_job_id) {
        runtime.update_job(
            child_job_id,
            JobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some("cancelled".to_string()),
        );
        return None;
    }

    runtime.update_job(
        child_job_id,
        JobStatus::Running,
        40.0,
        "Generating layout semantics...",
        None,
        None,
    );

    let ai_prompt = format!(
        "You are generating short semantic hints for an isometric exploration map.\n\
Location: {}\n\
Type: {}\n\
Lore: {}\n\
Prompt: {}\n\
Selected structures: {}\n\
Respond with 2 compact sentences describing the map layout, room themes, and traversal feel.",
        context.location_name,
        context.location_type,
        context.location_lore,
        payload.prompt.trim(),
        if payload.structure_names.is_empty() {
            "none".to_string()
        } else {
            payload.structure_names.join(", ")
        },
    );

    let summary = match gemini::generate_text(&ai_prompt).await {
        Ok(text) => text.trim().to_string(),
        Err(_) => heuristic_semantics(payload, context).unwrap_or_default(),
    };

    runtime.update_job(
        child_job_id,
        JobStatus::Completed,
        100.0,
        "Completed",
        Some(json!({
            "summary": summary,
            "mode": if payload.prompt.trim().is_empty() { "heuristic" } else { "ai-assisted" },
        })),
        None,
    );

    Some(summary)
}

fn complete_child_job(
    runtime: &ExplorationGenerationRuntime,
    job_id: Option<&str>,
    progress: f32,
    stage: &str,
    result: Value,
    output_refs: Vec<JobOutputRef>,
) {
    let Some(job_id) = job_id else {
        return;
    };
    runtime.set_output_refs(job_id, output_refs);
    runtime.update_job(job_id, JobStatus::Completed, progress, stage, Some(result), None);
}

fn build_generation_context(
    payload: &GenerateExplorationLocationRequest,
    location: &LocationRecord,
) -> GenerationContext {
    GenerationContext {
        location_name: payload
            .location_name
            .clone()
            .unwrap_or_else(|| location.name.clone()),
        location_lore: location.lore.clone(),
        location_type: location.type_label.clone(),
        generation_mode: payload
            .generation_mode
            .clone()
            .unwrap_or_else(|| "procedural".to_string()),
        asset_mode: payload
            .asset_mode
            .clone()
            .unwrap_or_else(|| "linked-packs".to_string()),
        rows: clamp_dimension(payload.rows, DEFAULT_ROWS),
        cols: clamp_dimension(payload.cols, DEFAULT_COLS),
        seed: payload
            .seed
            .unwrap_or_else(|| now_ms()),
    }
}

fn is_test_exploration_location(location_id: &str) -> bool {
    location_id == TEST_EXPLORATION_LOCATION_ID
}

fn build_test_location_record(world_id: &str) -> LocationRecord {
    LocationRecord {
        id: TEST_EXPLORATION_LOCATION_ID.to_string(),
        name: "Test Exploration".to_string(),
        category: LocationCategory::Settlement,
        subtype: "debug_sandbox".to_string(),
        status: LocationStatus::Stable,
        scale: LocationScale::Minor,
        province_id: 0,
        province_region_id: format!("test-region-{world_id}"),
        province_name: "Debug Province".to_string(),
        duchy_id: None,
        kingdom_id: None,
        continent_id: None,
        x: 0.0,
        y: 0.0,
        population_estimate: Some(12),
        importance: 1,
        habitability_score: 100,
        economic_score: 40,
        strategic_score: 20,
        hazard_score: 5,
        ruling_faction: "Debug Crew".to_string(),
        tags: vec!["test".to_string(), "sandbox".to_string(), "exploration".to_string()],
        placement_drivers: vec!["debug".to_string(), "iteration".to_string()],
        history_hooks: LocationHistoryHooks {
            founding_reason: "Built as a stable sandbox for exploration iteration.".to_string(),
            current_tension: "Used to reproduce UI and traversal bugs quickly.".to_string(),
            story_seeds: vec![
                "Check pathing around the central compound.".to_string(),
                "Inspect line of sight around the ruin wall.".to_string(),
            ],
            linked_lore_snippet_ids: Vec::new(),
        },
        lore: "A compact sandbox location used to test traversal, spawning, structures, and UI flows without depending on generated world content.".to_string(),
        source: RecordSource::Manual,
        is_customized: true,
        last_humanity_job_id: None,
        type_label: "Test Sandbox".to_string(),
    }
}

fn build_test_manifest_value(world_id: &str) -> Value {
    let payload = GenerateExplorationLocationRequest {
        world_id: world_id.to_string(),
        location_id: TEST_EXPLORATION_LOCATION_ID.to_string(),
        location_name: Some("Test Exploration".to_string()),
        prompt: "Debug sandbox with a central courtyard, a few walls, and obstacles for pathing validation.".to_string(),
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        selected_char_ids: Vec::new(),
        biome_pack_id: None,
        biome_source: Some("built-in".to_string()),
        biome_name: Some("Test Grounds".to_string()),
        structure_pack_ids: Vec::new(),
        structure_source_map: HashMap::new(),
        structure_names: vec![
            "debug compound".to_string(),
            "test ruin".to_string(),
            "pathing lane".to_string(),
        ],
        seed: Some(1337),
        generation_mode: Some("procedural".to_string()),
        block_palette_id: None,
        asset_mode: Some("textureless".to_string()),
    };
    let location = build_test_location_record(world_id);
    let context = build_generation_context(&payload, &location);
    let manifest = build_manifest(&payload, &location, &context, Some("sandbox"));
    build_manifest_value(&manifest, &payload, &context)
}

fn build_manifest(
    payload: &GenerateExplorationLocationRequest,
    location: &LocationRecord,
    context: &GenerationContext,
    semantics_summary: Option<&str>,
) -> ExplorationMapManifest {
    let width = context.cols;
    let height = context.rows;
    let mut tiles = vec![
        ExplorationTile {
            r#type: "floor".to_string(),
            walkable: true,
            move_cost: 1.0,
            texture_url: None,
            is_spawn_zone: None,
        };
        (width * height) as usize
    ];
    let mut objects = Vec::new();
    let mut rng = StdRng::seed_from_u64(context.seed);

    for x in 0..width {
        set_wall(&mut tiles, width, x, 0);
        set_wall(&mut tiles, width, x, height.saturating_sub(1));
    }
    for y in 0..height {
        set_wall(&mut tiles, width, 0, y);
        set_wall(&mut tiles, width, width.saturating_sub(1), y);
    }

    let structure_count = payload
        .structure_names
        .len()
        .max(if matches!(location.category, locations::LocationCategory::Settlement | locations::LocationCategory::Ruin) { 2 } else { 1 })
        .min(5);
    let center_clear_x = width / 2;
    let center_clear_y = height / 2;
    let mut placed = Vec::<(u32, u32, u32, u32)>::new();

    for index in 0..structure_count {
        let label = payload
            .structure_names
            .get(index)
            .cloned()
            .unwrap_or_else(|| match location.category {
                locations::LocationCategory::Settlement => "building".to_string(),
                locations::LocationCategory::Ruin => "ruin".to_string(),
                _ => "outpost".to_string(),
            });

        let mut attempt = 0;
        while attempt < 24 {
            attempt += 1;
            let room_w = rng.random_range(7..=12).min(width.saturating_sub(4));
            let room_h = rng.random_range(6..=10).min(height.saturating_sub(4));
            let x = rng.random_range(2..=width.saturating_sub(room_w + 2));
            let y = rng.random_range(2..=height.saturating_sub(room_h + 2));
            if rect_intersects_center(x, y, room_w, room_h, center_clear_x, center_clear_y) {
                continue;
            }
            if placed.iter().any(|(px, py, pw, ph)| rects_overlap(x, y, room_w, room_h, *px, *py, *pw, *ph)) {
                continue;
            }
            placed.push((x, y, room_w, room_h));
            carve_room(&mut tiles, width, x, y, room_w, room_h, &mut rng);
            objects.push(ExplorationObject {
                id: format!("obj-structure-{index}"),
                r#type: label.to_lowercase().replace(' ', "-"),
                x,
                y,
                width: room_w,
                height: room_h,
                passable: false,
                texture_url: None,
                is_natural: Some(false),
                is_hidden: Some(false),
                move_cost: None,
                fertility: None,
            });
            break;
        }
    }

    let natural_count = natural_object_count(payload, location, semantics_summary);
    for index in 0..natural_count {
        let x = rng.random_range(2..width.saturating_sub(2));
        let y = rng.random_range(2..height.saturating_sub(2));
        let idx = tile_index(width, x, y);
        if !tiles[idx].walkable {
            continue;
        }
        objects.push(ExplorationObject {
            id: format!("obj-natural-{index}"),
            r#type: infer_natural_object_type(payload, location),
            x,
            y,
            width: 1,
            height: 1,
            passable: false,
            texture_url: None,
            is_natural: Some(true),
            is_hidden: Some(false),
            move_cost: Some(1.4),
            fertility: Some(1.0),
        });
    }

    clear_spawn_zone(&mut tiles, width, height, center_clear_x, center_clear_y);

    ExplorationMapManifest {
        id: format!("explore-{}-{}", payload.world_id, payload.location_id),
        width,
        height,
        tiles,
        pawns: Vec::new(),
        objects,
        name: Some(context.location_name.clone()),
        fog_of_war: None,
    }
}

fn build_manifest_value(
    manifest: &ExplorationMapManifest,
    payload: &GenerateExplorationLocationRequest,
    context: &GenerationContext,
) -> Value {
    let mut value = serde_json::to_value(manifest).unwrap_or_else(|_| json!({}));
    if let Some(obj) = value.as_object_mut() {
        if let Some(biome_pack_id) = &payload.biome_pack_id {
            obj.insert("biomePackId".to_string(), Value::String(biome_pack_id.clone()));
        }
        if let Some(biome_source) = &payload.biome_source {
            obj.insert("biomeSource".to_string(), Value::String(biome_source.clone()));
        }
        if let Some(biome_name) = &payload.biome_name {
            obj.insert("biomeName".to_string(), Value::String(biome_name.clone()));
        }
        obj.insert(
            "structurePackIds".to_string(),
            Value::Array(
                payload
                    .structure_pack_ids
                    .iter()
                    .cloned()
                    .map(Value::String)
                    .collect(),
            ),
        );
        obj.insert(
            "structureNames".to_string(),
            Value::Array(
                payload
                    .structure_names
                    .iter()
                    .cloned()
                    .map(Value::String)
                    .collect(),
            ),
        );
        obj.insert(
            "structureSourceMap".to_string(),
            serde_json::to_value(&payload.structure_source_map).unwrap_or_else(|_| json!({})),
        );
        obj.insert("worldId".to_string(), Value::String(payload.world_id.clone()));
        obj.insert("locationId".to_string(), Value::String(payload.location_id.clone()));
        obj.insert(
            "generationMode".to_string(),
            Value::String(context.generation_mode.clone()),
        );
        obj.insert("assetMode".to_string(), Value::String(context.asset_mode.clone()));
        obj.insert(
            "seed".to_string(),
            Value::Number(serde_json::Number::from(context.seed)),
        );
        if let Some(block_palette_id) = &payload.block_palette_id {
            obj.insert(
                "blockPaletteId".to_string(),
                Value::String(block_palette_id.clone()),
            );
        }
    }
    value
}

fn build_location_job_metadata(
    payload: &GenerateExplorationLocationRequest,
    restore: Option<JobRestoreSpec>,
) -> Map<String, Value> {
    let mut metadata = Map::new();
    metadata.insert("worldId".to_string(), Value::String(payload.world_id.clone()));
    metadata.insert("locationId".to_string(), Value::String(payload.location_id.clone()));
    metadata.insert(
        "locationName".to_string(),
        Value::String(
            payload
                .location_name
                .clone()
                .unwrap_or_else(|| "Location".to_string()),
        ),
    );
    metadata.insert(
        "generationMode".to_string(),
        Value::String(
            payload
                .generation_mode
                .clone()
                .unwrap_or_else(|| "procedural".to_string()),
        ),
    );
    metadata.insert(
        "seed".to_string(),
        Value::Number(serde_json::Number::from(
            payload.seed.unwrap_or_else(now_ms),
        )),
    );
    metadata.insert(
        "assetMode".to_string(),
        Value::String(
            payload
                .asset_mode
                .clone()
                .unwrap_or_else(|| "linked-packs".to_string()),
        ),
    );
    metadata.insert(
        "mapSize".to_string(),
        json!({
            "rows": clamp_dimension(payload.rows, DEFAULT_ROWS),
            "cols": clamp_dimension(payload.cols, DEFAULT_COLS),
        }),
    );
    metadata.insert(
        "selectedCharIds".to_string(),
        Value::Array(
            payload
                .selected_char_ids
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    if let Some(block_palette_id) = &payload.block_palette_id {
        metadata.insert(
            "blockPaletteId".to_string(),
            Value::String(block_palette_id.clone()),
        );
    }
    if let Some(restore) = restore {
        if let Ok(value) = serde_json::to_value(restore) {
            metadata.insert("restore".to_string(), value);
        }
    }
    metadata
}

fn build_asset_job_metadata(
    payload: &ExplorationAssetJobRequest,
    restore: Option<JobRestoreSpec>,
) -> Map<String, Value> {
    let mut metadata = Map::new();
    metadata.insert("worldId".to_string(), Value::String(payload.world_id.clone()));
    metadata.insert("locationId".to_string(), Value::String(payload.location_id.clone()));
    metadata.insert(
        "locationName".to_string(),
        Value::String(
            payload
                .location_name
                .clone()
                .unwrap_or_else(|| "Location".to_string()),
        ),
    );
    if let Some(block_palette_id) = &payload.block_palette_id {
        metadata.insert(
            "blockPaletteId".to_string(),
            Value::String(block_palette_id.clone()),
        );
    }
    if let Some(asset_mode) = &payload.asset_mode {
        metadata.insert("assetMode".to_string(), Value::String(asset_mode.clone()));
    }
    if let Some(restore) = restore {
        if let Ok(value) = serde_json::to_value(restore) {
            metadata.insert("restore".to_string(), value);
        }
    }
    metadata
}

fn build_child_job_metadata(
    payload: &GenerateExplorationLocationRequest,
    location_name: &str,
    kind: ExplorationChildJobKind,
) -> Map<String, Value> {
    let mut metadata = Map::new();
    metadata.insert("worldId".to_string(), Value::String(payload.world_id.clone()));
    metadata.insert("locationId".to_string(), Value::String(payload.location_id.clone()));
    metadata.insert(
        "locationName".to_string(),
        Value::String(location_name.to_string()),
    );
    metadata.insert(
        "assetMode".to_string(),
        Value::String(
            payload
                .asset_mode
                .clone()
                .unwrap_or_else(|| "linked-packs".to_string()),
        ),
    );
    metadata.insert(
        "generationMode".to_string(),
        Value::String(
            payload
                .generation_mode
                .clone()
                .unwrap_or_else(|| "procedural".to_string()),
        ),
    );
    metadata.insert(
        "mapSize".to_string(),
        json!({
            "rows": clamp_dimension(payload.rows, DEFAULT_ROWS),
            "cols": clamp_dimension(payload.cols, DEFAULT_COLS),
        }),
    );
    metadata.insert(
        "selectedCharIds".to_string(),
        Value::Array(
            payload
                .selected_char_ids
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    if let Some(block_palette_id) = &payload.block_palette_id {
        metadata.insert(
            "blockPaletteId".to_string(),
            Value::String(block_palette_id.clone()),
        );
    }
    if let Some(biome_pack_id) = &payload.biome_pack_id {
        metadata.insert(
            "biomePackId".to_string(),
            Value::String(biome_pack_id.clone()),
        );
    }
    metadata.insert(
        "structurePackIds".to_string(),
        Value::Array(
            payload
                .structure_pack_ids
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
    );
    metadata.insert(
        "childKind".to_string(),
        Value::String(match kind {
            ExplorationChildJobKind::Semantics => "semantics",
            ExplorationChildJobKind::BlockPack => "block-pack",
            ExplorationChildJobKind::AssetKit => "asset-kit",
            ExplorationChildJobKind::Preview => "preview",
        }.to_string()),
    );
    metadata
}

fn build_location_output_refs(
    world_id: &str,
    location_id: &str,
    job_id: &str,
    location_name: &str,
) -> Vec<JobOutputRef> {
    vec![
        JobOutputRef {
            id: "open-map".to_string(),
            label: "Open Exploration Map".to_string(),
            kind: "route".to_string(),
            href: None,
            route: Some(JobRouteRef {
                path: "/gameplay-engine".to_string(),
                search: Some(Map::from_iter([
                    ("step".to_string(), Value::String("EXPLORATION".to_string())),
                    ("mode".to_string(), Value::String("manifest".to_string())),
                    ("worldId".to_string(), Value::String(world_id.to_string())),
                    ("locationId".to_string(), Value::String(location_id.to_string())),
                    ("jobId".to_string(), Value::String(job_id.to_string())),
                ])),
            }),
            preview_text: Some(format!("{} is ready to explore.", location_name)),
        },
        JobOutputRef {
            id: "open-location".to_string(),
            label: "Open Location Record".to_string(),
            kind: "route".to_string(),
            href: None,
            route: Some(JobRouteRef {
                path: "/history".to_string(),
                search: Some(Map::from_iter([(
                    "tab".to_string(),
                    Value::String("locations".to_string()),
                )])),
            }),
            preview_text: None,
        },
        JobOutputRef {
            id: "open-block-pack".to_string(),
            label: "Open Block Pack".to_string(),
            kind: "route".to_string(),
            href: None,
            route: Some(JobRouteRef {
                path: "/asset-generator".to_string(),
                search: Some(Map::from_iter([(
                    "tab".to_string(),
                    Value::String("game-assets".to_string()),
                )])),
            }),
            preview_text: None,
        },
        JobOutputRef {
            id: "open-asset-kit".to_string(),
            label: "Open Asset Kit".to_string(),
            kind: "route".to_string(),
            href: None,
            route: Some(JobRouteRef {
                path: "/asset-generator".to_string(),
                search: Some(Map::from_iter([(
                    "tab".to_string(),
                    Value::String("packs".to_string()),
                )])),
            }),
            preview_text: None,
        },
    ]
}

fn build_asset_generator_output_refs() -> Vec<JobOutputRef> {
    vec![JobOutputRef {
        id: "open-game-assets".to_string(),
        label: "Open Game Assets".to_string(),
        kind: "route".to_string(),
        href: None,
        route: Some(JobRouteRef {
            path: "/asset-generator".to_string(),
            search: Some(Map::from_iter([(
                "tab".to_string(),
                Value::String("game-assets".to_string()),
            )])),
        }),
        preview_text: None,
    }]
}

fn build_pack_output_refs() -> Vec<JobOutputRef> {
    vec![JobOutputRef {
        id: "open-packs".to_string(),
        label: "Open Packs".to_string(),
        kind: "route".to_string(),
        href: None,
        route: Some(JobRouteRef {
            path: "/asset-generator".to_string(),
            search: Some(Map::from_iter([(
                "tab".to_string(),
                Value::String("packs".to_string()),
            )])),
        }),
        preview_text: None,
    }]
}

fn manifest_path(planets_dir: &FsPath, world_id: &str, location_id: &str) -> PathBuf {
    planets_dir
        .join(world_id)
        .join("exploration")
        .join(location_id)
        .join("manifest.json")
}

fn write_manifest(
    planets_dir: &FsPath,
    world_id: &str,
    location_id: &str,
    value: &Value,
) -> Result<(), String> {
    let path = manifest_path(planets_dir, world_id, location_id);
    let Some(parent) = path.parent() else {
        return Err("Invalid exploration manifest path".to_string());
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create exploration directory: {error}"))?;
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize exploration manifest: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Failed to write exploration manifest: {error}"))
}

fn remove_manifest_if_exists(planets_dir: &FsPath, world_id: &str, location_id: &str) {
    let path = manifest_path(planets_dir, world_id, location_id);
    let _ = fs::remove_file(path);
}

fn set_wall(tiles: &mut [ExplorationTile], width: u32, x: u32, y: u32) {
    let idx = tile_index(width, x, y);
    tiles[idx].r#type = "wall".to_string();
    tiles[idx].walkable = false;
    tiles[idx].move_cost = 0.0;
}

fn clear_spawn_zone(
    tiles: &mut [ExplorationTile],
    width: u32,
    height: u32,
    center_x: u32,
    center_y: u32,
) {
    let min_x = center_x.saturating_sub(2);
    let min_y = center_y.saturating_sub(2);
    let max_x = (center_x + 2).min(width.saturating_sub(1));
    let max_y = (center_y + 2).min(height.saturating_sub(1));

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let idx = tile_index(width, x, y);
            tiles[idx].r#type = "floor".to_string();
            tiles[idx].walkable = true;
            tiles[idx].move_cost = 1.0;
            tiles[idx].is_spawn_zone = Some("player".to_string());
        }
    }
}

fn carve_room(
    tiles: &mut [ExplorationTile],
    width: u32,
    x: u32,
    y: u32,
    room_w: u32,
    room_h: u32,
    rng: &mut StdRng,
) {
    for ty in y..(y + room_h) {
        for tx in x..(x + room_w) {
            let idx = tile_index(width, tx, ty);
            let border = tx == x || tx == x + room_w - 1 || ty == y || ty == y + room_h - 1;
            if border {
                tiles[idx].r#type = "wall".to_string();
                tiles[idx].walkable = false;
                tiles[idx].move_cost = 0.0;
            } else {
                tiles[idx].r#type = "floor".to_string();
                tiles[idx].walkable = true;
                tiles[idx].move_cost = 1.0;
            }
        }
    }

    let door_side = rng.random_range(0..4);
    let (door_x, door_y) = match door_side {
        0 => (x + room_w / 2, y),
        1 => (x + room_w / 2, y + room_h - 1),
        2 => (x, y + room_h / 2),
        _ => (x + room_w - 1, y + room_h / 2),
    };
    let idx = tile_index(width, door_x, door_y);
    tiles[idx].r#type = "floor".to_string();
    tiles[idx].walkable = true;
    tiles[idx].move_cost = 1.0;
}

fn tile_index(width: u32, x: u32, y: u32) -> usize {
    (y * width + x) as usize
}

fn rect_intersects_center(
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    center_x: u32,
    center_y: u32,
) -> bool {
    let center_min_x = center_x.saturating_sub(4);
    let center_min_y = center_y.saturating_sub(4);
    let center_max_x = center_x + 4;
    let center_max_y = center_y + 4;
    rects_overlap(x, y, width, height, center_min_x, center_min_y, center_max_x - center_min_x + 1, center_max_y - center_min_y + 1)
}

fn rects_overlap(ax: u32, ay: u32, aw: u32, ah: u32, bx: u32, by: u32, bw: u32, bh: u32) -> bool {
    let ax2 = ax + aw;
    let ay2 = ay + ah;
    let bx2 = bx + bw;
    let by2 = by + bh;
    ax < bx2 && ax2 > bx && ay < by2 && ay2 > by
}

fn natural_object_count(
    payload: &GenerateExplorationLocationRequest,
    location: &LocationRecord,
    semantics_summary: Option<&str>,
) -> usize {
    let prompt = format!(
        "{} {} {}",
        payload.prompt.to_lowercase(),
        location.lore.to_lowercase(),
        semantics_summary.unwrap_or("").to_lowercase()
    );
    if prompt.contains("forest") || prompt.contains("jungle") {
        22
    } else if prompt.contains("ruin") || matches!(location.category, locations::LocationCategory::Ruin) {
        14
    } else {
        10
    }
}

fn infer_natural_object_type(
    payload: &GenerateExplorationLocationRequest,
    location: &LocationRecord,
) -> String {
    let prompt = format!("{} {}", payload.prompt.to_lowercase(), location.lore.to_lowercase());
    if prompt.contains("forest") || prompt.contains("jungle") {
        "tree".to_string()
    } else if prompt.contains("desert") {
        "rock".to_string()
    } else if matches!(location.category, locations::LocationCategory::Ruin) {
        "rubble".to_string()
    } else {
        "shrub".to_string()
    }
}

fn heuristic_semantics(
    payload: &GenerateExplorationLocationRequest,
    context: &GenerationContext,
) -> Option<String> {
    let prompt = payload.prompt.trim();
    if prompt.is_empty() {
        return Some(format!(
            "{} is laid out as a broad approach with blocky structures, readable choke points, and a clear central entry zone.",
            context.location_name
        ));
    }

    Some(format!(
        "{} should feel like {} with structured rooms, blocky obstacles, and a clear navigable spine.",
        context.location_name,
        prompt
    ))
}

fn parse_job_launch_meta(headers: &HeaderMap) -> Option<JobLaunchMeta> {
    let encoded = headers.get("x-ashtrail-job-meta")?.to_str().ok()?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .ok()?;
    serde_json::from_slice::<JobLaunchMeta>(&decoded).ok()
}

fn try_reserve_capacity(limiter: &ExplorationWorkLimiter) -> Option<ExplorationQueueReservation> {
    let max_total = limiter.max_concurrent.saturating_add(limiter.max_queue);
    loop {
        let current = limiter.outstanding.load(Ordering::SeqCst);
        if current >= max_total {
            return None;
        }
        if limiter
            .outstanding
            .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            return Some(ExplorationQueueReservation {
                outstanding: limiter.outstanding.clone(),
            });
        }
    }
}

async fn wait_for_permits(
    runtime: &ExplorationGenerationRuntime,
    job_id: &str,
    primary: &ExplorationWorkLimiter,
    secondary: &ExplorationWorkLimiter,
    stage: &str,
) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
    runtime.update_job(job_id, JobStatus::Queued, 0.0, stage, None, None);
    if runtime.is_cancel_requested(job_id) {
        return Err("cancelled".to_string());
    }
    let primary_permit = primary
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "primary limiter closed".to_string())?;
    let secondary_permit = secondary
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "secondary limiter closed".to_string())?;
    Ok((primary_permit, secondary_permit))
}

fn read_usize_env(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn lock_error<T>(_error: std::sync::PoisonError<T>) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "exploration job store lock poisoned".to_string(),
    )
}

fn clamp_dimension(value: u32, fallback: u32) -> u32 {
    if value == 0 {
        fallback
    } else {
        value.max(16).min(128)
    }
}

fn default_rows() -> u32 {
    DEFAULT_ROWS
}

fn default_cols() -> u32 {
    DEFAULT_COLS
}
