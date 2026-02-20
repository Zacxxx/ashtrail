mod generator;
mod hierarchy;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use generator::{
    generate_world_with_progress_and_cancel, load_cached_response, request_cache_key,
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
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    cache_root: PathBuf,
    planet_root: PathBuf,
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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_thread_names(true)
        .compact()
        .init();

    let state = AppState {
        jobs: Arc::new(Mutex::new(HashMap::new())),
        cache_root: PathBuf::from("generated/world-cache"),
        planet_root: PathBuf::from("generated/planet"),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/terrain/generate", post(start_generate_job))
        .route(
            "/api/terrain/jobs/{job_id}",
            get(get_job_status).delete(cancel_job),
        )
        .route("/api/planet/preview", post(generate_planet_preview))
        .route("/api/planet/generate-full", post(generate_full_planet))
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
    let cache_root = state.cache_root.clone();
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

        match load_cached_response(&cache_root, &request_key) {
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

        let mut last_stage = String::new();
        let mut last_bucket: i32 = -1;

        let progress_jobs = jobs.clone();
        let cancel_jobs = jobs.clone();
        let cancel_job_id = spawned_job_id.clone();

        let result = generate_world_with_progress_and_cancel(
            request,
            |progress| {
                if let Ok(mut map) = progress_jobs.lock() {
                    if let Some(job) = map.get_mut(&spawned_job_id) {
                        job.status = JobStatus::Running;
                        job.progress = progress.progress;
                        job.current_stage = progress.stage.to_string();
                    }
                }

                let bucket = (progress.progress / 10.0).floor() as i32;
                if progress.stage != last_stage || bucket != last_bucket {
                    info!(
                        job_id = %spawned_job_id,
                        progress = format!("{:.0}", progress.progress),
                        stage = progress.stage,
                        "terrain job progress"
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

        match result {
            Ok(response) => {
                if let Err(err) = save_cached_response(&cache_root, &request_key, &response) {
                    error!(job_id = %spawned_job_id, error = %err, "failed to write terrain cache");
                } else {
                    info!(job_id = %spawned_job_id, cache_key = %request_key, "terrain job cached");
                }

                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&spawned_job_id) {
                        job.status = JobStatus::Completed;
                        job.progress = 100.0;
                        job.current_stage = "Completed".to_string();
                        job.result = Some(response);
                        job.error = None;
                    }
                }
                info!(job_id = %spawned_job_id, "terrain job completed");
            }
            Err(err) => {
                if let Ok(mut map) = jobs.lock() {
                    if let Some(job) = map.get_mut(&spawned_job_id) {
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
                    info!(job_id = %spawned_job_id, "terrain job cancelled");
                } else {
                    error!(job_id = %spawned_job_id, error = %err, "terrain job failed");
                }
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(StartJobResponse { job_id })))
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

    info!(job_id = %job_id, "terrain job cancellation requested");
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

    let cache_root = state.cache_root.clone();
    let planet_root = state.planet_root.clone();

    let request_for_task = request.clone();
    let manifest = tokio::task::spawn_blocking(move || {
        generate_full_planet_hierarchy(request_for_task, &cache_root, &planet_root)
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

async fn generate_planet_preview(
    State(state): State<AppState>,
    Json(request): Json<PlanetPreviewRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let cols = request.cols.unwrap_or(480).clamp(128, 2048);
    let rows = request.rows.unwrap_or(240).clamp(64, 1024);

    let terrain_request = GenerateTerrainRequest {
        config: request.config,
        cols,
        rows,
        km_per_cell: 100.0,
        octaves: 2,
    };

    let cache_key = request_cache_key(&terrain_request).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("cache key error: {e}"),
        )
    })?;

    if let Some(hit) = load_cached_response(&state.cache_root, &cache_key).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("cache read error: {e}"),
        )
    })? {
        info!(cache_key = %cache_key, cols, rows, "planet preview cache hit");
        return Ok(Json(hit));
    }

    let cache_root = state.cache_root.clone();
    let response = tokio::task::spawn_blocking(move || {
        let generated = generate_world_with_progress_and_cancel(terrain_request, |_| {}, || false)?;
        save_cached_response(&cache_root, &cache_key, &generated)?;
        Ok::<GenerateTerrainResponse, String>(generated)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("planet preview task join error: {e}"),
        )
    })?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    info!(cols, rows, "planet preview generated");
    Ok(Json(response))
}
