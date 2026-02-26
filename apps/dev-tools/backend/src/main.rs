mod cell_analyzer;
mod generator;
mod hierarchy;
mod gemini;
mod worldgen_pipeline;
mod cms;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, delete},
    Json, Router,
};
use generator::{
    generate_hybrid_with_progress_and_cancel, generate_world_with_progress_and_cancel, load_cached_response, request_cache_key,
    save_cached_response, GenerateTerrainRequest, GenerateTerrainResponse,
};
use hierarchy::{generate_full_planet_hierarchy, HierarchyGenerateRequest, PlanetManifest};
use serde::Deserialize;
use serde::Serialize;
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use base64::Engine as _;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: PathBuf,
    planet_root: PathBuf,
    icons_dir: PathBuf,
    icons_export_dir: PathBuf,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "lowercase")]
enum JobStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Clone)]
struct JobRecord {
    status: JobStatus,
    progress: f32,
    current_stage: String,
    result: Option<GenerateTerrainResponse>,
    error: Option<String>,
    cancel_requested: bool,
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
    result: Option<GenerateTerrainResponse>,
    error: Option<String>,
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
    prompt: String, // The full prompt used
    #[serde(default)]
    style_prompt: String,
    #[serde(default)]
    item_prompt: String,
    url: String,
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
    std::fs::create_dir_all(&icons_dir).expect("failed to create game-assets/assets/Icons directory");

    let icons_export_dir = PathBuf::from("../../game-assets/assets/Icons");
    std::fs::create_dir_all(&icons_export_dir).expect("failed to create game-assets/assets/Icons directory");

    let state = AppState {
        jobs: Arc::new(Mutex::new(HashMap::new())),
        planets_dir,
        planet_root: PathBuf::from("generated/planet"), // For the hierarchical generator
        icons_dir: icons_dir.clone(),
        icons_export_dir,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/terrain/generate", post(start_generate_job))
        .route(
            "/api/terrain/jobs/{job_id}",
            get(get_job_status).delete(cancel_job),
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
        .route("/api/planet/ecology", post(start_ecology_job))
        .route("/api/planet/ecology/{job_id}", get(get_job_status))
        .route("/api/planet/humanity", post(start_humanity_job))
        .route("/api/planet/humanity/{job_id}", get(get_job_status))
        .route("/api/history", get(get_history).post(save_history).delete(clear_history))
        .route("/api/history/{id}", delete(delete_history))
        .route("/api/planet/geography/{id}", get(get_geography).post(save_geography))
        .route("/api/planet/cells/job", post(start_cells_job))
        .route("/api/planet/cells/job/{job_id}", get(get_job_status))
        .route("/api/planet/cells/{id}", get(get_cells).post(save_cells))
        .route("/api/planet/cell-features/{id}", get(get_cell_features))
        .route("/api/planet/upscale", post(start_upscale_job))
        .route("/api/planet/upscale/{job_id}", get(get_job_status))
        .route("/api/icons/generate-batch", post(generate_icon_batch))
        .route("/api/icons/batches", get(list_icon_batches))
        .route("/api/icons/batches/{batch_id}", get(get_icon_batch))
        .route("/api/icons/batches/{batch_id}/rename", axum::routing::put(rename_icon_batch))
        .route("/api/icons/batches/{batch_id}/icons/{filename}/regenerate", post(regenerate_icon))
        .route("/api/icons/export", post(export_icons_registry))
        // ── Worldgen Pipeline ──
        .route("/api/worldgen/{planet_id}/status", get(worldgen_pipeline::get_pipeline_status))
        .route("/api/worldgen/{planet_id}/run/{stage_name}", post(worldgen_pipeline::run_pipeline_stage))
        .route("/api/worldgen/{planet_id}/job/{job_id}", get(worldgen_pipeline::get_worldgen_job_status))
        .route("/api/worldgen/{planet_id}/clear", delete(worldgen_pipeline::clear_pipeline))
        // Static file serving for all planet textures
        .route("/api/data/traits", get(cms::get_traits).post(cms::save_traits))
        .route("/api/data/occupations", get(cms::get_occupations).post(cms::save_occupations))
        .route("/api/data/items", get(cms::get_items).post(cms::save_items))
        .route("/api/data/characters", get(cms::get_characters).post(cms::save_character))
        .nest_service("/api/planets", ServeDir::new("generated/planets"))
        .nest_service("/api/icons", ServeDir::new(icons_dir.clone()))
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
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
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
                        job.result = Some(cached);
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
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
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
                        job.result = Some(cached);
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

        run_generation_job(&spawned_job_id, terrain_request, &request_key, &jobs, &planets_dir);
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
                    job.result = Some(response);
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
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Requesting Gemini Image...".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
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
        run_hybrid_generation_job(spawned_job_id, terrain_request, request.prompt, request.temperature, generate_cells_opt, request_key, jobs, planets_dir).await;
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

    let image_bytes = match gemini::generate_image_bytes(&prompt, temperature, request.cols, request.rows, None).await {
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
    }).await.unwrap();

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
    }).await;

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
                    if let Err(err) = serde_json::to_writer(std::io::BufWriter::new(file), &response) {
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
                    job.result = Some(lightweight_response);
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
    };

    Ok(Json(response))
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
    }

    info!(job_id = %job_id, "job cancellation requested");
    Ok(StatusCode::ACCEPTED)
}

async fn generate_full_planet(
    State(state): State<AppState>,
    Json(request): Json<HierarchyGenerateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!(
        root_cols = request.root_cols,
        root_rows = request.root_rows,
        max_lod = request.max_lod,
        max_nodes = request.max_nodes,
        "planet hierarchy generation requested"
    );

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

    Ok(Json(GeneratePlanetResponse { manifest, run_path }))
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
                let metadata = std::fs::metadata(&path)
                    .map_err(|e| format!("metadata error: {e}"))?;
                let modified = metadata.modified()
                    .ok()
                    .and_then(|t| {
                        let dt: chrono::DateTime<chrono::Utc> = t.into();
                        Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    })
                    .unwrap_or_default();
                let file_name = path.file_name()
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
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("task error: {e}")))?
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
    let response = tokio::task::spawn_blocking(move || {
        load_cached_response(&planets_dir, &cache_key)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("task error: {e}")))?
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
    Json(request): Json<GenerateTextRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    match gemini::generate_text(&request.prompt).await {
        Ok(text) => Ok((StatusCode::OK, Json(serde_json::json!({ "text": text })))),
        Err((code, msg)) => Err((code, msg)),
    }
}

async fn query_lore_handler(
    State(state): State<AppState>,
    Json(payload): Json<LoreQueryRequest>,
) -> impl IntoResponse {
    info!("Handling lore query for coords {}, {}", payload.lon, payload.lat);

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
            let clean_text = text.trim().strip_prefix("```json").unwrap_or(&text)
                .strip_prefix("```").unwrap_or(&text)
                .strip_suffix("```").unwrap_or(&text)
                .trim().to_string();
                
            let _ = std::fs::create_dir_all(&state.planets_dir);
            let _ = std::fs::write(&cache_file, &clean_text);

            (
                StatusCode::OK,
                Json(serde_json::json!({ "status": "success", "text": clean_text })),
            )
                .into_response()
        },
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
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create planet dir: {e}")).into_response();
    }

    let metadata_file = planet_dir.join("metadata.json");
    match std::fs::write(&metadata_file, serde_json::to_string_pretty(&item).unwrap_or_default()) {
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

async fn get_geography(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
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
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create planet dir: {e}")).into_response();
    }

    let file_path = planet_dir.join("geography.json");
    match std::fs::write(&file_path, serde_json::to_string_pretty(&regions).unwrap_or_default()) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_cells(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
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
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create planet dir: {e}")).into_response();
    }

    let file_path = planet_dir.join("cells.json");
    match std::fs::write(&file_path, serde_json::to_string_pretty(&cells).unwrap_or_default()) {
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
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued for Upscaling".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
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
    let heightmap_url = item.get("heightmapUrl").and_then(|t| t.as_str()).map(|s| s.to_string());
    
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
    
    let exe_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("bin").join("realesrgan-ncnn-vulkan");
    let model_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("bin").join("models");
    
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
        obj.insert("textureUrl".to_string(), serde_json::Value::String(new_texture_url.clone()));
        obj.insert("isUpscaled".to_string(), serde_json::Value::Bool(true));
        obj.insert("parentId".to_string(), serde_json::Value::String(history_id.clone()));
        obj.insert("timestamp".to_string(), serde_json::Value::Number(serde_json::Number::from(
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64
        )));
        // Also preserve heightmapUrl if it existed
        if let Some(ref h_url) = heightmap_url {
            obj.insert("heightmapUrl".to_string(), serde_json::Value::String(h_url.clone()));
        }
    }
    
    // Save new item directly as its own planet dir (for now, to maintain API compatibility until frontend update)
    // Then we can switch correctly in frontend over to a "texture array"
    let new_planet_dir = planets_dir.join(&new_id);
    let _ = std::fs::create_dir_all(&new_planet_dir);
    // Link the texture over virtually so we don't have to duplicate the 20MB png
    // Actually we just use the url pointing back to history_id
    let _ = std::fs::write(new_planet_dir.join("metadata.json"), serde_json::to_string_pretty(&new_item).unwrap_or_default());
    
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(&job_id) {
            job.status = JobStatus::Completed;
            job.progress = 100.0;
            job.current_stage = "Completed".to_string();
            job.result = Some(GenerateTerrainResponse {
                cols: 8192,
                rows: 4096,
                cell_data: Vec::new(),
                cell_colors: Vec::new(),
                texture_url: Some(new_texture_url.clone()),
                heightmap_url: heightmap_url.clone(), // preserve upscaled heightmap if exists
            });
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
    {
        let mut jobs = state.jobs.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "job store lock poisoned".to_string()))?;
        jobs.insert(job_id.clone(), JobRecord {
            status: JobStatus::Queued, progress: 0.0, current_stage: "Requesting Gemini Ecology Layer...".to_string(),
            result: None, error: None, cancel_requested: false,
        });
    }
    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    let request_key = format!("ecology-{}", Uuid::new_v4());
    tokio::task::spawn(async move {
        run_image_edit_job(spawned_job_id, request.prompt, request.base64_image, request.temperature, request_key, jobs, planets_dir).await;
    });
    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
}

async fn start_humanity_job(
    State(state): State<AppState>,
    Json(request): Json<PlanetImageEditRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    {
        let mut jobs = state.jobs.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "job store lock poisoned".to_string()))?;
        jobs.insert(job_id.clone(), JobRecord {
            status: JobStatus::Queued, progress: 0.0, current_stage: "Requesting Gemini Humanity Layer...".to_string(),
            result: None, error: None, cancel_requested: false,
        });
    }
    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let spawned_job_id = job_id.clone();
    let request_key = format!("humanity-{}", Uuid::new_v4());
    tokio::task::spawn(async move {
        run_image_edit_job(spawned_job_id, request.prompt, request.base64_image, request.temperature, request_key, jobs, planets_dir).await;
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
        let mime = parts[0].split(';').next().unwrap().strip_prefix("data:").unwrap_or("image/jpeg");
        (mime.to_string(), parts.get(1).unwrap_or(&"").to_string())
    } else {
        ("image/jpeg".to_string(), base64_image)
    };

    let image_bytes = match gemini::generate_image_edit_bytes(&prompt, &data, &mime_type, temperature, None).await {
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
            job.result = Some(response);
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
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Reading base map...".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
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
    let image_result = tokio::task::spawn_blocking(move || {
        image::open(tp).map(|img| img.to_rgba8())
    }).await.unwrap();

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
    }).await;

    let elapsed = start.elapsed();

    match result {
        Ok(analysis) => {
            let total_cells = analysis.total_cells;
            let features_path = planet_dir.join("cell_features.json");

            // Write cell features to disk
            match std::fs::File::create(&features_path) {
                Ok(file) => {
                    if let Err(err) = serde_json::to_writer(std::io::BufWriter::new(file), &analysis) {
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
                    job.result = Some(GenerateTerrainResponse {
                        cols: analysis.cols,
                        rows: analysis.rows,
                        cell_data: Vec::new(),
                        cell_colors: Vec::new(),
                        texture_url: Some(format!("/api/planets/{}/textures/base.jpg", history_id)),
                        heightmap_url: None, // Cells analysis doesn't generate heightmap
                    });
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
        return Err((StatusCode::BAD_REQUEST, "Maximum 50 prompts per batch".to_string()));
    }

    // Use the user-supplied name (slugified) as folder name, fallback to UUID
    let batch_name = request.batch_name
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
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create batch dir: {e}"))
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
            gemini::generate_image_edit_bytes(&wrapped_prompt, base64_img, "image/png", temperature, Some("1:1")).await
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

        let icon = tokio::task::spawn_blocking(move || -> Result<BatchIcon, (StatusCode, String)> {
            let img = image::load_from_memory(&image_bytes).map_err(|e| {
                error!("Failed to decode icon image: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Image decode error: {e}"))
            })?;

            let filename = format!("{:03}.png", i);
            let path = batch_dir_clone.join(&filename);

            img.save(&path).map_err(|e| {
                error!("Failed to save icon: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Save error: {e}"))
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
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {e}")))?
        .map_err(|e| e)?;

        icons.push(icon);
    }

    // Write manifest
    let manifest = BatchManifest {
        batch_id: batch_id.clone(),
        batch_name: if batch_name.is_empty() { batch_id[..8].to_uppercase() } else { batch_name },
        created_at,
        icons,
    };

    let manifest_path = batch_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("JSON error: {e}"))
    })?;
    std::fs::write(&manifest_path, &manifest_json).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Manifest write error: {e}"))
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
            let manifest: BatchManifest = serde_json::from_str(&data)
                .map_err(|e| format!("parse manifest: {e}"))?;

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
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {e}")))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(batches))
}

/// Get a single batch manifest.
async fn get_icon_batch(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let manifest_path = state.icons_dir.join(&batch_id).join("manifest.json");
    if !manifest_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Batch not found".to_string()));
    }
    let data = tokio::fs::read_to_string(&manifest_path).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Read error: {e}"))
    })?;
    let manifest: BatchManifest = serde_json::from_str(&data).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Parse error: {e}"))
    })?;
    Ok(Json(manifest))
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
        gemini::generate_image_edit_bytes(&wrapped_prompt, base64_img, "image/png", temperature, Some("1:1")).await
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

    let updated_icon = tokio::task::spawn_blocking(move || -> Result<BatchIcon, (StatusCode, String)> {
        let img = image::load_from_memory(&image_bytes).map_err(|e| {
            error!("Failed to decode icon image: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Image decode error: {e}"))
        })?;

        let path = batch_dir.join(&filename_clone);
        img.save(&path).map_err(|e| {
            error!("Failed to save icon: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Save error: {e}"))
        })?;

        // Update manifest
        let data = std::fs::read_to_string(&manifest_path).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Read manifest error: {e}"))
        })?;
        let mut manifest: BatchManifest = serde_json::from_str(&data).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Parse manifest error: {e}"))
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
            return Err((StatusCode::NOT_FOUND, "Icon not found in manifest".to_string()));
        }

        let updated_json = serde_json::to_string_pretty(&manifest).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Serialize manifest error: {e}"))
        })?;
        std::fs::write(&manifest_path, &updated_json).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Write manifest error: {e}"))
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
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {e}")))?
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
        return Err((StatusCode::CONFLICT, format!("A batch named '{}' already exists", new_batch_id)));
    }

    let result = tokio::task::spawn_blocking(move || -> Result<BatchManifest, String> {
        // Read current manifest
        let manifest_path = old_dir.join("manifest.json");
        let data = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("read manifest: {e}"))?;
        let mut manifest: BatchManifest = serde_json::from_str(&data)
            .map_err(|e| format!("parse manifest: {e}"))?;

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
            std::fs::rename(&old_dir, &new_dir)
                .map_err(|e| format!("rename folder: {e}"))?;
            info!(
                old = %old_dir.display(),
                new = %new_dir.display(),
                "batch folder renamed"
            );
        }

        Ok(manifest)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {e}")))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(result))
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
