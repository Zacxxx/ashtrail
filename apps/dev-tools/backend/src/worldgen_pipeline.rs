use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use image::io::Reader as ImageReader;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
use tracing::{info, error};
use base64::{engine::general_purpose, Engine as _};
use tokio::sync::OwnedSemaphorePermit;

use worldgen_core::*;
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};
use worldgen_core::export::PipelineStatus;

use crate::{gemini, AppState, JobRecord, JobStatus};

// ── Request / Response Types ──

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolateRequest {
    pub entity_type: String, // "province", "duchy", "kingdom", "continent"
    pub entity_id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolateResponse {
    pub success: bool,
    pub filename: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedImage {
    pub filename: String,
    pub entity_type: String,
    pub entity_id: u32,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIsolatedResponse {
    pub images: Vec<IsolatedImage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteIsolatedResponse {
    pub success: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaledProvinceRequest {
    pub province_id: u32,
    pub prompt: Option<String>,
    pub model_id: Option<String>,
    pub temperature: Option<f32>,
    pub padding_px: Option<u32>,
    pub scale: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpscaledRequest {
    pub target_planet_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaledBoundingBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaledProvinceMetadata {
    pub artifact_id: String,
    pub province_id: u32,
    pub source_planet_id: String,
    pub bbox: UpscaledBoundingBox,
    pub source_width: u32,
    pub source_height: u32,
    pub model_id: String,
    pub fallback_model_id: Option<String>,
    pub prompt: String,
    pub padding_px: u32,
    pub scale: u32,
    pub artifact_width: u32,
    pub artifact_height: u32,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaledProvinceImage {
    pub artifact_id: String,
    pub planet_id: String,
    pub province_id: u32,
    pub model_id: String,
    pub fallback_model_id: Option<String>,
    pub prompt: String,
    pub created_at: u64,
    pub scale: u32,
    pub bbox: UpscaledBoundingBox,
    pub source_width: u32,
    pub source_height: u32,
    pub artifact_width: u32,
    pub artifact_height: u32,
    pub image_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListUpscaledResponse {
    pub images: Vec<UpscaledProvinceImage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteUpscaledResponse {
    pub success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpscaledResponse {
    pub history_item: serde_json::Value,
    pub texture_url: String,
    pub variant_id: String,
    pub parent_id: String,
    pub apply_mode: String,
    pub overlay_count: usize,
}

// ── Job Response Types ──

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStageRequest {
    pub config: WorldgenConfig,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStageResponse {
    pub job_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStatusResponse {
    pub stages: HashMap<String, StageInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInfo {
    pub completed: bool,
    pub completed_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldgenJobStatus {
    pub status: String,
    pub progress: f32,
    pub current_stage: String,
    pub error: Option<String>,
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

struct HierarchyRecords {
    provinces: Vec<ProvinceRecord>,
    duchies: Vec<DuchyRecord>,
    kingdoms: Vec<KingdomRecord>,
    continents: Option<Vec<ContinentRecord>>,
}

// ── Helper: resolve planet worldgen directory ──

fn worldgen_dir(planets_dir: &std::path::Path, planet_id: &str) -> PathBuf {
    planets_dir.join(planet_id).join("worldgen")
}

fn base_image_path(planets_dir: &std::path::Path, planet_id: &str) -> PathBuf {
    let textures_dir = planets_dir.join(planet_id).join("textures");
    let jpg = textures_dir.join("base.jpg");
    if jpg.exists() {
        return jpg;
    }
    textures_dir.join("base.png")
}

fn upscaled_dir(isolated_root_dir: &std::path::Path, planet_id: &str) -> PathBuf {
    isolated_root_dir.join(planet_id).join("upscaled")
}

fn upscaled_png_path(isolated_root_dir: &std::path::Path, planet_id: &str, artifact_id: &str) -> PathBuf {
    upscaled_dir(isolated_root_dir, planet_id).join(format!("{artifact_id}.png"))
}

fn upscaled_meta_path(isolated_root_dir: &std::path::Path, planet_id: &str, artifact_id: &str) -> PathBuf {
    upscaled_dir(isolated_root_dir, planet_id).join(format!("{artifact_id}.json"))
}

fn is_valid_artifact_id(artifact_id: &str) -> bool {
    !artifact_id.is_empty()
        && artifact_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn artifact_id_for_province(province_id: u32) -> String {
    let ts = now_unix_ms();
    let short = Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(8)
        .collect::<String>();
    format!("province_{province_id}_{ts}_{short}")
}

#[derive(Clone)]
struct RefineQueueReservation {
    limiter: crate::RefineLimiter,
}

impl Drop for RefineQueueReservation {
    fn drop(&mut self) {
        self.limiter.outstanding.fetch_sub(1, Ordering::SeqCst);
    }
}

fn try_reserve_refine_capacity(limiter: &crate::RefineLimiter) -> Option<RefineQueueReservation> {
    let max_total = limiter
        .max_concurrent
        .saturating_add(limiter.max_queue);
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
            return Some(RefineQueueReservation {
                limiter: limiter.clone(),
            });
        }
    }
}

pub(crate) fn ensure_isolated_province_asset(
    planets_dir: &std::path::Path,
    isolated_root_dir: &std::path::Path,
    planet_id: &str,
    province_id: u32,
) -> Result<String, String> {
    let out_dir = worldgen_dir(planets_dir, planet_id);
    let isolated_dir = isolated_root_dir.join(planet_id);
    if !isolated_dir.exists() {
        fs::create_dir_all(&isolated_dir)
            .map_err(|e| format!("Failed to create isolated dir: {}", e))?;
    }

    let filename = format!("province_{}.png", province_id);
    let out_path = isolated_dir.join(&filename);
    if out_path.exists() {
        return Ok(filename);
    }

    let base_path = base_image_path(planets_dir, planet_id);
    let (province_id_map, width, height) = load_province_id_map(&out_dir)?;
    let base_img = load_base_texture(&base_path)?;
    let layer = render_single_province_layer(province_id, &province_id_map, width, height, &base_img)?;
    layer
        .save(&out_path)
        .map_err(|e| format!("Failed to save {}: {}", out_path.display(), e))?;

    Ok(filename)
}

// ── GET /api/worldgen/{planet_id}/status ──

pub async fn get_pipeline_status(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let out_dir = worldgen_dir(&state.planets_dir, &planet_id);
    let status_path = out_dir.join("pipeline_status.json");
    let pipeline_status = PipelineStatus::load(&status_path);

    let stages: HashMap<String, StageInfo> = pipeline_status
        .stages
        .into_iter()
        .map(|(k, v)| {
            (
                k,
                StageInfo {
                    completed: v.completed,
                    completed_at: v.completed_at,
                },
            )
        })
        .collect();

    Ok(Json(PipelineStatusResponse { stages }))
}

// ── DELETE /api/worldgen/{planet_id}/clear ──

pub async fn clear_pipeline(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let out_dir = worldgen_dir(&state.planets_dir, &planet_id);
    
    // Attempt to remove the entire worldgen directory
    if out_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&out_dir) {
            error!("Failed to delete worldgen directory {}: {}", out_dir.display(), e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to clear pipeline data".into()));
        }
        info!("Cleared pipeline data for planet {}", planet_id);
    }

    Ok(StatusCode::OK)
}

// ── POST /api/worldgen/{planet_id}/isolate ──

pub async fn isolate_region(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
    Json(request): Json<IsolateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let out_dir = worldgen_dir(&state.planets_dir, &planet_id);
    let isolated_dir = state.isolated_dir.join(&planet_id);
    if !isolated_dir.exists() {
        std::fs::create_dir_all(&isolated_dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    let base_path = base_image_path(&state.planets_dir, &planet_id);

    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let (province_id_map, width, height) = load_province_id_map(&out_dir)?;
        let base_img = load_base_texture(&base_path)?;
        let hierarchy = load_hierarchy_records(&out_dir)?;
        let province_ids = resolve_province_ids_for_entity(&request.entity_type, request.entity_id, &hierarchy)?;

        let layers: Vec<image::RgbaImage> = province_ids
            .into_iter()
            .map(|province_id| render_single_province_layer(province_id, &province_id_map, width, height, &base_img))
            .collect::<Result<Vec<_>, _>>()?;

        let out_img = merge_layers_into_canvas(layers, width, height);
        let filename = format!("{}_{}.png", request.entity_type, request.entity_id);
        let out_path = isolated_dir.join(&filename);

        out_img.save(&out_path).map_err(|e| format!("Failed to save isolated image: {}", e))?;

        Ok(filename)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(IsolateResponse { success: true, filename: result }))
}

// ── POST /api/worldgen/{planet_id}/isolate/provinces ──

pub async fn isolate_all_provinces(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let out_dir = worldgen_dir(&state.planets_dir, &planet_id);
    let isolated_dir = state.isolated_dir.join(&planet_id);
    if !isolated_dir.exists() {
        fs::create_dir_all(&isolated_dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    let province_map_path = out_dir.join("province_id.png");
    if !province_map_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Hierarchy map not found. Did you run the pipeline?".into()));
    }

    let provinces_path = out_dir.join("provinces.json");
    if !provinces_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Province hierarchy not found. Did you run clustering?".into()));
    }

    let base_path = base_image_path(&state.planets_dir, &planet_id);
    if !base_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Base texture not found.".into()));
    }

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
                current_stage: "Queued for Province Isolation".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
        );
    }

    let jobs = state.jobs.clone();
    let spawned_job_id = job_id.clone();
    tokio::task::spawn_blocking(move || {
        run_isolate_all_provinces_job(spawned_job_id, jobs, out_dir, base_path, isolated_dir);
    });

    Ok(Json(RunStageResponse { job_id }))
}

// ── GET /api/worldgen/{planet_id}/isolated ──

pub async fn list_isolated_regions(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let isolated_dir = state.isolated_dir.join(&planet_id);

    let mut images = Vec::new();
    
    if isolated_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(isolated_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "png" {
                        if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                            let parts: Vec<&str> = filename.trim_end_matches(".png").split('_').collect();
                            if parts.len() == 2 {
                                let entity_type = parts[0].to_string();
                                if let Ok(entity_id) = parts[1].parse::<u32>() {
                                    images.push(IsolatedImage {
                                        filename: filename.to_string(),
                                        entity_type,
                                        entity_id,
                                        url: format!("/api/isolated-assets/{}/{}", planet_id, filename), // Note this path needs to match how planets are hosted
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(Json(ListIsolatedResponse { images }))
}

// ── GET /api/worldgen/isolated/all ──

pub async fn list_all_isolated_regions(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut images = Vec::new();
    
    if state.isolated_dir.exists() {
        if let Ok(planets) = std::fs::read_dir(&state.isolated_dir) {
            for planet_entry in planets.flatten() {
                let planet_id = planet_entry.file_name().to_string_lossy().to_string();
                let isolated_dir = planet_entry.path();
                
                if isolated_dir.exists() {
                    if let Ok(entries) = std::fs::read_dir(isolated_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if let Some(ext) = path.extension() {
                                if ext == "png" {
                                    if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                                        let parts: Vec<&str> = filename.trim_end_matches(".png").split('_').collect();
                                        if parts.len() == 2 {
                                            let entity_type = parts[0].to_string();
                                            if let Ok(entity_id) = parts[1].parse::<u32>() {
                                                images.push(IsolatedImage {
                                                    filename: filename.to_string(),
                                                    entity_type,
                                                    entity_id,
                                                    url: format!("/api/isolated-assets/{}/{}", planet_id, filename),
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(Json(ListIsolatedResponse { images }))
}

// ── DELETE /api/worldgen/{planet_id}/isolated/{filename} ──

pub async fn delete_isolated_region(
    State(state): State<AppState>,
    Path((planet_id, filename)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let is_valid = filename.ends_with(".png")
        && filename
            .trim_end_matches(".png")
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !is_valid {
        return Err((StatusCode::BAD_REQUEST, "Invalid isolated image filename.".into()));
    }

    let isolated_dir = state.isolated_dir.join(&planet_id);
    let file_path = isolated_dir.join(&filename);
    if !file_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Isolated image not found.".into()));
    }

    fs::remove_file(&file_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete image: {}", e)))?;

    Ok(Json(DeleteIsolatedResponse { success: true }))
}

// ── POST /api/worldgen/{planet_id}/upscaled/province ──

pub async fn start_upscaled_province_refine(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
    Json(request): Json<UpscaledProvinceRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let source_planet_id = resolve_worldgen_source_planet(&state.planets_dir, &planet_id);
    let out_dir = worldgen_dir(&state.planets_dir, &source_planet_id);
    let province_map_path = out_dir.join("province_id.png");
    if !province_map_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Hierarchy map not found. Run clustering first.".into()));
    }
    let base_path = base_image_path(&state.planets_dir, &planet_id);
    if !base_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Base texture not found.".into()));
    }

    let Some(queue_reservation) = try_reserve_refine_capacity(&state.refine_limiter) else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Province refine queue is full. Please wait for running jobs to finish.".to_string(),
        ));
    };

    let refine_dir = upscaled_dir(&state.isolated_dir, &source_planet_id);
    fs::create_dir_all(&refine_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create upscaled dir: {}", e)))?;

    let padding_px = request.padding_px.unwrap_or(96).min(512);
    let scale = match request.scale.unwrap_or(2) {
        2 => 2,
        4 => 4,
        other => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Invalid scale '{}'. Allowed values are 2 or 4.", other),
            ))
        }
    };
    let job_id = Uuid::new_v4().to_string();
    {
        let mut jobs = state.jobs.lock().map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "job store lock poisoned".to_string())
        })?;
        jobs.insert(
            job_id.clone(),
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued for Province Refinement".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let isolated_dir = state.isolated_dir.clone();
    let refine_limiter = state.refine_limiter.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        let _reservation = queue_reservation;
        run_upscaled_province_job(
            spawned_job_id,
            jobs,
            planets_dir,
            isolated_dir,
            source_planet_id,
            planet_id,
            request.province_id,
            request.prompt,
            request.model_id,
            request.temperature,
            padding_px,
            scale,
            refine_limiter,
        )
        .await;
    });

    Ok(Json(RunStageResponse { job_id }))
}

// ── GET /api/worldgen/{planet_id}/upscaled ──

pub async fn list_upscaled_regions(
    State(state): State<AppState>,
    Path(planet_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let source_planet_id = resolve_worldgen_source_planet(&state.planets_dir, &planet_id);
    let images = read_upscaled_images_for_planet(&state.isolated_dir, &source_planet_id)?;
    Ok(Json(ListUpscaledResponse { images }))
}

// ── GET /api/worldgen/upscaled/all ──

pub async fn list_all_upscaled_regions(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut images = Vec::new();
    if state.isolated_dir.exists() {
        let entries = fs::read_dir(&state.isolated_dir)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read isolated dir: {}", e)))?;
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let planet_id = entry.file_name().to_string_lossy().to_string();
            images.extend(read_upscaled_images_for_planet(&state.isolated_dir, &planet_id)?);
        }
    }

    images.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(ListUpscaledResponse { images }))
}

// ── DELETE /api/worldgen/{planet_id}/upscaled/{artifact_id} ──

pub async fn delete_upscaled_region(
    State(state): State<AppState>,
    Path((planet_id, artifact_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if !is_valid_artifact_id(&artifact_id) {
        return Err((StatusCode::BAD_REQUEST, "Invalid artifact id.".into()));
    }
    let source_planet_id = resolve_worldgen_source_planet(&state.planets_dir, &planet_id);
    let png_path = upscaled_png_path(&state.isolated_dir, &source_planet_id, &artifact_id);
    let meta_path = upscaled_meta_path(&state.isolated_dir, &source_planet_id, &artifact_id);
    if !png_path.exists() && !meta_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Upscaled artifact not found.".into()));
    }
    if png_path.exists() {
        fs::remove_file(&png_path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to delete {}: {}", png_path.display(), e),
            )
        })?;
    }
    if meta_path.exists() {
        fs::remove_file(&meta_path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to delete {}: {}", meta_path.display(), e),
            )
        })?;
    }

    Ok(Json(DeleteUpscaledResponse { success: true }))
}

// ── POST /api/worldgen/{planet_id}/upscaled/{artifact_id}/apply ──

pub async fn apply_upscaled_region(
    State(state): State<AppState>,
    Path((planet_id, artifact_id)): Path<(String, String)>,
    Json(request): Json<ApplyUpscaledRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    if !is_valid_artifact_id(&artifact_id) {
        return Err((StatusCode::BAD_REQUEST, "Invalid artifact id.".into()));
    }

    let target_planet_id = request.target_planet_id.unwrap_or_else(|| planet_id.clone());
    let isolated_dir = state.isolated_dir.clone();
    let planets_dir = state.planets_dir.clone();
    let source_planet_id = resolve_worldgen_source_planet(&state.planets_dir, &planet_id);

    let response = tokio::task::spawn_blocking(move || -> Result<ApplyUpscaledResponse, String> {
        apply_upscaled_region_impl(
            &planets_dir,
            &isolated_dir,
            &source_planet_id,
            &artifact_id,
            &target_planet_id,
        )
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| {
        let lower = e.to_lowercase();
        if lower.contains("not found") {
            (StatusCode::NOT_FOUND, e)
        } else if lower.contains("dimensions") || lower.contains("bounds") {
            (StatusCode::BAD_REQUEST, e)
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    })?;

    Ok(Json(response))
}

// ── POST /api/worldgen/{planet_id}/run/{stage_name} ──

pub async fn run_pipeline_stage(
    State(state): State<AppState>,
    Path((planet_id, stage_name)): Path<(String, String)>,
    Json(request): Json<RunStageRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();

    // Validate stage name
    let valid_stages = [
        "normalize", "landmask", "height", "rivers", "biome",
        "suitability", "seeds", "partition", "postprocess",
        "adjacency", "clustering", "naming",
    ];
    if !valid_stages.contains(&stage_name.as_str()) {
        return Err((StatusCode::BAD_REQUEST, format!("Unknown stage: {}", stage_name)));
    }

    // Check base image exists
    let base_path = base_image_path(&state.planets_dir, &planet_id);
    if !base_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Base image not found. Generate a planet first.".into()));
    }

    // Create job record
    {
        let mut jobs = state.jobs.lock().unwrap();
        jobs.insert(
            job_id.clone(),
            JobRecord {
                status: JobStatus::Running,
                progress: 0.0,
                current_stage: stage_name.clone(),
                result: None,
                error: None,
                cancel_requested: false,
            },
        );
    }

    let spawned_job_id = job_id.clone();
    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let config = request.config;

    // Spawn blocking task
    tokio::task::spawn_blocking(move || {
        run_stage_blocking(
            &spawned_job_id,
            &planet_id,
            &stage_name,
            &config,
            &planets_dir,
            &jobs,
        );
    });

    Ok(Json(RunStageResponse { job_id }))
}

// ── GET /api/worldgen/{planet_id}/job/{job_id} ──

pub async fn get_worldgen_job_status(
    State(state): State<AppState>,
    Path((_planet_id, job_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let jobs = state.jobs.lock().unwrap();
    let job = jobs.get(&job_id).ok_or((StatusCode::NOT_FOUND, "Job not found".into()))?;

    let status_str = match &job.status {
        JobStatus::Queued => "queued",
        JobStatus::Running => "running",
        JobStatus::Completed => "completed",
        JobStatus::Failed => "failed",
        JobStatus::Cancelled => "cancelled",
    };

    Ok(Json(WorldgenJobStatus {
        status: status_str.to_string(),
        progress: job.progress,
        current_stage: job.current_stage.clone(),
        error: job.error.clone(),
    }))
}

// ── DELETE /api/worldgen/{planet_id}/job/{job_id} ──

pub async fn cancel_worldgen_job(
    State(state): State<AppState>,
    Path((_planet_id, job_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut jobs = state.jobs.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "job store lock poisoned".to_string(),
        )
    })?;

    let Some(job) = jobs.get_mut(&job_id) else {
        return Err((StatusCode::NOT_FOUND, "Job not found".to_string()));
    };

    job.cancel_requested = true;
    if matches!(job.status, JobStatus::Queued | JobStatus::Running) {
        job.current_stage = "Cancellation requested".to_string();
    }

    Ok(StatusCode::ACCEPTED)
}

#[derive(Clone)]
struct PreparedUpscaledProvince {
    source_width: u32,
    source_height: u32,
    scale: u32,
    bbox: UpscaledBoundingBox,
    artifact_width: u32,
    artifact_height: u32,
    source_crop: image::RgbaImage,
    mask: Vec<bool>,
    masked_crop_b64: String,
}

fn is_job_cancel_requested(jobs: &Arc<Mutex<HashMap<String, JobRecord>>>, job_id: &str) -> bool {
    if let Ok(store) = jobs.lock() {
        if let Some(job) = store.get(job_id) {
            return job.cancel_requested;
        }
    }
    false
}

fn set_job_cancelled(jobs: &Arc<Mutex<HashMap<String, JobRecord>>>, job_id: &str, stage: &str) {
    if let Ok(mut store) = jobs.lock() {
        if let Some(job) = store.get_mut(job_id) {
            job.status = JobStatus::Cancelled;
            job.current_stage = stage.to_string();
            job.error = None;
        }
    }
}

async fn wait_for_refine_permit(
    job_id: &str,
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    limiter: &crate::RefineLimiter,
) -> Result<OwnedSemaphorePermit, String> {
    set_job_stage(
        jobs,
        job_id,
        JobStatus::Queued,
        0.0,
        "Queued for refine slot",
    );

    loop {
        if is_job_cancel_requested(jobs, job_id) {
            return Err("cancelled".to_string());
        }

        match tokio::time::timeout(
            std::time::Duration::from_millis(250),
            limiter.semaphore.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => return Ok(permit),
            Ok(Err(_)) => return Err("Refine queue is unavailable.".to_string()),
            Err(_) => continue,
        }
    }
}

async fn run_upscaled_province_job(
    job_id: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: PathBuf,
    isolated_dir: PathBuf,
    source_planet_id: String,
    texture_planet_id: String,
    province_id: u32,
    prompt: Option<String>,
    requested_model_id: Option<String>,
    temperature: Option<f32>,
    padding_px: u32,
    scale: u32,
    refine_limiter: crate::RefineLimiter,
) {
    let permit = match wait_for_refine_permit(&job_id, &jobs, &refine_limiter).await {
        Ok(permit) => permit,
        Err(err) if err == "cancelled" => {
            set_job_cancelled(&jobs, &job_id, "Cancelled");
            return;
        }
        Err(err) => {
            set_job_failed(&jobs, &job_id, &err);
            return;
        }
    };
    let _permit = permit;

    if is_job_cancel_requested(&jobs, &job_id) {
        set_job_cancelled(&jobs, &job_id, "Cancelled");
        return;
    }

    set_job_stage(&jobs, &job_id, JobStatus::Running, 1.0, "Preparing province crop");

    let prepared = match tokio::task::spawn_blocking({
        let planets_dir = planets_dir.clone();
        let source_planet_id = source_planet_id.clone();
        let texture_planet_id = texture_planet_id.clone();
        move || {
            prepare_upscaled_province(
                &planets_dir,
                &source_planet_id,
                &texture_planet_id,
                province_id,
                padding_px,
                scale,
            )
        }
    })
    .await
    {
        Ok(Ok(prepared)) => prepared,
        Ok(Err(e)) if e == "cancelled" => {
            set_job_cancelled(&jobs, &job_id, "Cancelled");
            return;
        }
        Ok(Err(e)) => {
            set_job_failed(&jobs, &job_id, &e);
            return;
        }
        Err(e) => {
            set_job_failed(&jobs, &job_id, &format!("Province prep task failed: {}", e));
            return;
        }
    };

    if is_job_cancel_requested(&jobs, &job_id) {
        set_job_cancelled(&jobs, &job_id, "Cancelled");
        return;
    }

    set_job_stage(&jobs, &job_id, JobStatus::Running, 20.0, "Calling image model");

    let model_catalog = gemini::image_model_catalog();
    let mut model_chain = Vec::new();
    if let Some(preferred) = requested_model_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        model_chain.push(preferred);
    } else if !model_catalog.default_model_id.is_empty() {
        model_chain.push(model_catalog.default_model_id.clone());
    }
    for model in &model_catalog.fallback_chain {
        if !model_chain.contains(model) {
            model_chain.push(model.clone());
        }
    }
    if model_chain.is_empty() {
        set_job_failed(&jobs, &job_id, "No configured image models found.");
        return;
    }

    let user_prompt = prompt.unwrap_or_default().trim().to_string();
    let effective_prompt = if user_prompt.is_empty() {
        "Enhance this province at higher detail while preserving coastline, terrain continuity, and existing map style. Keep geography unchanged.".to_string()
    } else {
        format!(
            "Enhance this province at higher detail while preserving coastline, terrain continuity, and existing map style. {}",
            user_prompt
        )
    };

    let mut generated_image: Option<Vec<u8>> = None;
    let mut used_model = String::new();
    let mut primary_error = String::new();
    for (index, model_id) in model_chain.iter().enumerate() {
        if is_job_cancel_requested(&jobs, &job_id) {
            set_job_cancelled(&jobs, &job_id, "Cancelled");
            return;
        }
        let pct = 25.0 + (index as f32 * 15.0);
        set_job_stage(
            &jobs,
            &job_id,
            JobStatus::Running,
            pct.min(75.0),
            &format!("Refining via model {}", model_id),
        );
        match gemini::generate_image_edit_bytes_with_model(
            &effective_prompt,
            &prepared.masked_crop_b64,
            "image/png",
            temperature,
            None,
            model_id,
        )
        .await
        {
            Ok(bytes) => {
                generated_image = Some(bytes);
                used_model = model_id.clone();
                break;
            }
            Err((_code, err)) => {
                if index == 0 {
                    primary_error = err.clone();
                }
                error!(
                    "Province refine model '{}' failed for province {}: {}",
                    model_id, province_id, err
                );
            }
        }
    }

    let Some(generated_bytes) = generated_image else {
        set_job_failed(
            &jobs,
            &job_id,
            &format!("All image models failed. First error: {}", primary_error),
        );
        return;
    };

    set_job_stage(&jobs, &job_id, JobStatus::Running, 85.0, "Postprocessing artifact");

    let artifact_id = artifact_id_for_province(province_id);
    let created_at = now_unix_ms();
    let fallback_model_id = if model_chain.first().map(|s| s.as_str()) == Some(used_model.as_str()) {
        None
    } else {
        Some(used_model.clone())
    };
    let metadata = UpscaledProvinceMetadata {
        artifact_id: artifact_id.clone(),
        province_id,
        source_planet_id: source_planet_id.clone(),
        bbox: prepared.bbox.clone(),
        source_width: prepared.source_width,
        source_height: prepared.source_height,
        model_id: used_model,
        fallback_model_id,
        prompt: effective_prompt,
        padding_px,
        scale: prepared.scale,
        artifact_width: prepared.artifact_width,
        artifact_height: prepared.artifact_height,
        created_at,
    };

    if is_job_cancel_requested(&jobs, &job_id) {
        set_job_cancelled(&jobs, &job_id, "Cancelled");
        return;
    }

    let finalize_result = tokio::task::spawn_blocking({
        let isolated_dir = isolated_dir.clone();
        let source_planet_id = source_planet_id.clone();
        let artifact_id = artifact_id.clone();
        move || -> Result<(), String> {
            finalize_upscaled_artifact(
                &isolated_dir,
                &source_planet_id,
                &artifact_id,
                &prepared,
                &generated_bytes,
                &metadata,
            )
        }
    })
    .await;

    match finalize_result {
        Ok(Ok(())) => {
            set_job_stage(&jobs, &job_id, JobStatus::Completed, 100.0, "Completed");
        }
        Ok(Err(e)) if e == "cancelled" => set_job_cancelled(&jobs, &job_id, "Cancelled"),
        Ok(Err(e)) => set_job_failed(&jobs, &job_id, &e),
        Err(e) => set_job_failed(&jobs, &job_id, &format!("Artifact finalize task failed: {}", e)),
    }
}

fn set_job_stage(
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    job_id: &str,
    status: JobStatus,
    progress: f32,
    stage: &str,
) {
    if let Ok(mut store) = jobs.lock() {
        if let Some(job) = store.get_mut(job_id) {
            job.status = status;
            job.progress = progress;
            job.current_stage = stage.to_string();
        }
    }
}

fn set_job_failed(jobs: &Arc<Mutex<HashMap<String, JobRecord>>>, job_id: &str, err: &str) {
    if let Ok(mut store) = jobs.lock() {
        if let Some(job) = store.get_mut(job_id) {
            job.status = JobStatus::Failed;
            job.current_stage = "Failed".to_string();
            job.error = Some(err.to_string());
        }
    }
}

fn prepare_upscaled_province(
    planets_dir: &std::path::Path,
    planet_id: &str,
    province_id: u32,
    padding_px: u32,
) -> Result<PreparedUpscaledProvince, String> {
    let out_dir = worldgen_dir(planets_dir, planet_id);
    let (province_id_map, width, height) = load_province_id_map(&out_dir)?;
    let base_img = load_base_texture(&base_image_path(planets_dir, planet_id))?;
    let bbox = compute_province_bbox(&province_id_map, width, height, province_id, padding_px)?;

    let mut masked_crop = image::RgbaImage::new(bbox.width, bbox.height);
    let mut source_crop = image::RgbaImage::new(bbox.width, bbox.height);
    let mut mask = vec![false; (bbox.width * bbox.height) as usize];

    for local_y in 0..bbox.height {
        for local_x in 0..bbox.width {
            let world_x = bbox.x + local_x;
            let world_y = bbox.y + local_y;
            let global_idx = (world_y * width + world_x) as usize;
            let local_idx = (local_y * bbox.width + local_x) as usize;
            let src = base_img.get_pixel(world_x, world_y);
            source_crop.put_pixel(local_x, local_y, image::Rgba([src[0], src[1], src[2], 255]));

            if province_id_map[global_idx] == province_id {
                mask[local_idx] = true;
                masked_crop.put_pixel(local_x, local_y, image::Rgba([src[0], src[1], src[2], 255]));
            } else {
                masked_crop.put_pixel(local_x, local_y, image::Rgba([0, 0, 0, 0]));
            }
        }
    }

    let mut png_bytes = Vec::new();
    image::DynamicImage::ImageRgba8(masked_crop.clone())
        .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode province crop PNG: {}", e))?;

    Ok(PreparedUpscaledProvince {
        source_width: width,
        source_height: height,
        bbox,
        source_crop,
        mask,
        masked_crop_b64: general_purpose::STANDARD.encode(png_bytes),
    })
}

fn compute_province_bbox(
    province_id_map: &[u32],
    width: u32,
    height: u32,
    province_id: u32,
    padding_px: u32,
) -> Result<UpscaledBoundingBox, String> {
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) as usize;
            if province_id_map[idx] == province_id {
                found = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if !found {
        return Err(format!("Province {} not found in province_id.png", province_id));
    }

    let x0 = min_x.saturating_sub(padding_px);
    let y0 = min_y.saturating_sub(padding_px);
    let x1 = (max_x + padding_px).min(width.saturating_sub(1));
    let y1 = (max_y + padding_px).min(height.saturating_sub(1));
    Ok(UpscaledBoundingBox {
        x: x0,
        y: y0,
        width: x1.saturating_sub(x0) + 1,
        height: y1.saturating_sub(y0) + 1,
    })
}

fn finalize_upscaled_artifact(
    isolated_root_dir: &std::path::Path,
    planet_id: &str,
    artifact_id: &str,
    prepared: &PreparedUpscaledProvince,
    generated_bytes: &[u8],
    metadata: &UpscaledProvinceMetadata,
) -> Result<(), String> {
    let refine_dir = upscaled_dir(isolated_root_dir, planet_id);
    fs::create_dir_all(&refine_dir)
        .map_err(|e| format!("Failed to create upscaled directory: {}", e))?;

    let mut generated = image::load_from_memory(generated_bytes)
        .map_err(|e| format!("Failed to decode generated image: {}", e))?
        .to_rgba8();

    if generated.width() != prepared.bbox.width || generated.height() != prepared.bbox.height {
        generated = image::imageops::resize(
            &generated,
            prepared.bbox.width,
            prepared.bbox.height,
            image::imageops::FilterType::Lanczos3,
        );
    }

    let mut output = image::RgbaImage::new(prepared.bbox.width, prepared.bbox.height);
    for y in 0..prepared.bbox.height {
        for x in 0..prepared.bbox.width {
            let idx = (y * prepared.bbox.width + x) as usize;
            if prepared.mask[idx] {
                let near_edge = is_near_mask_edge(&prepared.mask, prepared.bbox.width, prepared.bbox.height, x, y, 2);
                if near_edge {
                    output.put_pixel(x, y, *prepared.source_crop.get_pixel(x, y));
                } else {
                    let px = generated.get_pixel(x, y);
                    output.put_pixel(x, y, image::Rgba([px[0], px[1], px[2], 255]));
                }
            } else {
                output.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
            }
        }
    }

    let png_path = upscaled_png_path(isolated_root_dir, planet_id, artifact_id);
    output
        .save(&png_path)
        .map_err(|e| format!("Failed to save {}: {}", png_path.display(), e))?;

    let meta_path = upscaled_meta_path(isolated_root_dir, planet_id, artifact_id);
    let meta_json = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(&meta_path, meta_json)
        .map_err(|e| format!("Failed to write {}: {}", meta_path.display(), e))?;

    Ok(())
}

fn is_near_mask_edge(mask: &[bool], width: u32, height: u32, x: u32, y: u32, radius: u32) -> bool {
    if width == 0 || height == 0 {
        return false;
    }
    let x0 = x.saturating_sub(radius);
    let y0 = y.saturating_sub(radius);
    let x1 = (x + radius).min(width - 1);
    let y1 = (y + radius).min(height - 1);

    for ny in y0..=y1 {
        for nx in x0..=x1 {
            let idx = (ny * width + nx) as usize;
            if !mask[idx] {
                return true;
            }
        }
    }
    false
}

fn read_upscaled_images_for_planet(
    isolated_root_dir: &std::path::Path,
    planet_id: &str,
) -> Result<Vec<UpscaledProvinceImage>, (StatusCode, String)> {
    let mut images = Vec::new();
    let dir = upscaled_dir(isolated_root_dir, planet_id);
    if !dir.exists() {
        return Ok(images);
    }

    let entries = fs::read_dir(&dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read upscaled dir: {}", e)))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read {}: {}", path.display(), e),
            )
        })?;
        let meta: UpscaledProvinceMetadata = serde_json::from_str(&raw).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse {}: {}", path.display(), e),
            )
        })?;
        let png_path = upscaled_png_path(isolated_root_dir, planet_id, &meta.artifact_id);
        if !png_path.exists() {
            continue;
        }

        images.push(UpscaledProvinceImage {
            artifact_id: meta.artifact_id.clone(),
            planet_id: planet_id.to_string(),
            province_id: meta.province_id,
            model_id: meta.model_id.clone(),
            fallback_model_id: meta.fallback_model_id.clone(),
            prompt: meta.prompt.clone(),
            created_at: meta.created_at,
            bbox: meta.bbox.clone(),
            source_width: meta.source_width,
            source_height: meta.source_height,
            image_url: format!(
                "/api/isolated-assets/{}/upscaled/{}.png",
                planet_id, meta.artifact_id
            ),
        });
    }

    images.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(images)
}

fn resolve_planet_texture_path(
    planets_dir: &std::path::Path,
    planet_id: &str,
    metadata: &serde_json::Value,
) -> PathBuf {
    let base_dir = planets_dir.join(planet_id).join("textures");
    if let Some(texture_url) = metadata.get("textureUrl").and_then(|v| v.as_str()) {
        if let Some(filename) = texture_url.split('/').next_back() {
            let candidate = base_dir.join(filename);
            if candidate.exists() {
                return candidate;
            }
        }
    }
    let png = base_dir.join("base.png");
    if png.exists() {
        return png;
    }
    base_dir.join("base.jpg")
}

fn apply_upscaled_region_impl(
    planets_dir: &std::path::Path,
    isolated_root_dir: &std::path::Path,
    source_planet_id: &str,
    artifact_id: &str,
    target_planet_id: &str,
) -> Result<ApplyUpscaledResponse, String> {
    let meta_path = upscaled_meta_path(isolated_root_dir, source_planet_id, artifact_id);
    if !meta_path.exists() {
        return Err(format!("Upscaled artifact metadata not found: {}", meta_path.display()));
    }
    let png_path = upscaled_png_path(isolated_root_dir, source_planet_id, artifact_id);
    if !png_path.exists() {
        return Err(format!("Upscaled artifact image not found: {}", png_path.display()));
    }

    let meta_raw = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read {}: {}", meta_path.display(), e))?;
    let meta: UpscaledProvinceMetadata = serde_json::from_str(&meta_raw)
        .map_err(|e| format!("Failed to parse {}: {}", meta_path.display(), e))?;

    let target_planet_dir = planets_dir.join(target_planet_id);
    let target_metadata_path = target_planet_dir.join("metadata.json");
    let mut target_metadata = if target_metadata_path.exists() {
        let raw = fs::read_to_string(&target_metadata_path)
            .map_err(|e| format!("Failed to read target metadata: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| format!("Failed to parse target metadata: {}", e))?
    } else {
        serde_json::json!({})
    };

    let target_texture_path = resolve_planet_texture_path(planets_dir, target_planet_id, &target_metadata);
    if !target_texture_path.exists() {
        return Err(format!("Target texture not found: {}", target_texture_path.display()));
    }

    let mut target_img = image::open(&target_texture_path)
        .map_err(|e| format!("Failed to open target texture: {}", e))?
        .to_rgba8();
    let tile = image::open(&png_path)
        .map_err(|e| format!("Failed to open upscaled tile: {}", e))?
        .to_rgba8();

    if target_img.width() != meta.source_width || target_img.height() != meta.source_height {
        return Err(format!(
            "Target texture dimensions {}x{} do not match artifact source {}x{}",
            target_img.width(),
            target_img.height(),
            meta.source_width,
            meta.source_height
        ));
    }
    if tile.width() != meta.bbox.width || tile.height() != meta.bbox.height {
        return Err("Upscaled tile dimensions do not match metadata bbox.".to_string());
    }

    if meta.bbox.x + meta.bbox.width > target_img.width() || meta.bbox.y + meta.bbox.height > target_img.height() {
        return Err("Upscaled tile bbox is outside target texture bounds.".to_string());
    }

    for y in 0..meta.bbox.height {
        for x in 0..meta.bbox.width {
            let src = tile.get_pixel(x, y);
            let alpha = src[3] as f32 / 255.0;
            if alpha <= 0.0 {
                continue;
            }
            let dst_x = meta.bbox.x + x;
            let dst_y = meta.bbox.y + y;
            let dst = target_img.get_pixel(dst_x, dst_y);
            let blended = image::Rgba([
                ((src[0] as f32 * alpha) + (dst[0] as f32 * (1.0 - alpha))) as u8,
                ((src[1] as f32 * alpha) + (dst[1] as f32 * (1.0 - alpha))) as u8,
                ((src[2] as f32 * alpha) + (dst[2] as f32 * (1.0 - alpha))) as u8,
                255,
            ]);
            target_img.put_pixel(dst_x, dst_y, blended);
        }
    }

    let variant_id = Uuid::new_v4().to_string();
    let variant_dir = planets_dir.join(&variant_id);
    let variant_textures_dir = variant_dir.join("textures");
    fs::create_dir_all(&variant_textures_dir)
        .map_err(|e| format!("Failed to create variant texture dir: {}", e))?;
    let output_filename = "base.png";
    let output_path = variant_textures_dir.join(output_filename);
    target_img
        .save(&output_path)
        .map_err(|e| format!("Failed to save variant texture {}: {}", output_path.display(), e))?;

    let texture_url = format!("/api/planets/{}/textures/{}", variant_id, output_filename);
    let now = now_unix_ms();

    let parent_name = target_metadata
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "World".to_string());
    if let Some(obj) = target_metadata.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(variant_id.clone()));
        obj.insert(
            "timestamp".to_string(),
            serde_json::Value::Number(serde_json::Number::from(now)),
        );
        obj.insert(
            "textureUrl".to_string(),
            serde_json::Value::String(texture_url.clone()),
        );
        obj.insert(
            "parentId".to_string(),
            serde_json::Value::String(target_planet_id.to_string()),
        );
        obj.insert("isUpscaled".to_string(), serde_json::Value::Bool(false));
        obj.insert(
            "variantKind".to_string(),
            serde_json::Value::String("provinceRefine".to_string()),
        );
        obj.insert(
            "name".to_string(),
            serde_json::Value::String(format!("{} • Province {}", parent_name, meta.province_id)),
        );
    }

    let variant_metadata_path = variant_dir.join("metadata.json");
    fs::write(
        &variant_metadata_path,
        serde_json::to_string_pretty(&target_metadata).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write variant metadata: {}", e))?;

    Ok(ApplyUpscaledResponse {
        history_item: target_metadata,
        texture_url,
        variant_id,
        parent_id: target_planet_id.to_string(),
    })
}

// ── Blocking Stage Runner ──

fn run_stage_blocking(
    job_id: &str,
    planet_id: &str,
    stage_name: &str,
    config: &WorldgenConfig,
    planets_dir: &std::path::Path,
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
) {
    let out_dir = worldgen_dir(planets_dir, planet_id);
    std::fs::create_dir_all(&out_dir).ok();

    let job_id_owned = job_id.to_string();
    let jobs_ref = jobs.clone();

    let update_progress = |pct: f32, msg: &str| {
        if let Ok(mut jobs) = jobs_ref.lock() {
            if let Some(job) = jobs.get_mut(&job_id_owned) {
                job.progress = pct;
                job.current_stage = msg.to_string();
            }
        }
    };

    let result = run_single_stage(
        stage_name,
        config,
        planets_dir,
        planet_id,
        &out_dir,
        &mut |pct, msg| update_progress(pct, msg),
    );

    let mut jobs = jobs.lock().unwrap();
    if let Some(job) = jobs.get_mut(job_id) {
        match result {
            Ok(()) => {
                job.status = JobStatus::Completed;
                job.progress = 100.0;
                info!("Worldgen stage '{}' completed for planet {}", stage_name, planet_id);

                // Update pipeline status
                let mut pipeline = PipelineStatus::load(&out_dir.join("pipeline_status.json"));
                pipeline.mark_completed(stage_name);
                pipeline.save(&out_dir.join("pipeline_status.json")).ok();
            }
            Err(e) => {
                job.status = JobStatus::Failed;
                job.error = Some(e.clone());
                error!("Worldgen stage '{}' failed: {}", stage_name, e);
            }
        }
    }
}

fn run_single_stage(
    stage_name: &str,
    config: &WorldgenConfig,
    planets_dir: &std::path::Path,
    planet_id: &str,
    out_dir: &std::path::Path,
    progress: &mut dyn FnMut(f32, &str),
) -> Result<(), String> {
    let base_path = base_image_path(planets_dir, planet_id);

    match stage_name {
        "landmask" => {
            let base_img = load_rgb_png(&base_path, "Failed to load base image")?;
            let mask = landmask::extract_landmask(&base_img, config, 500, 200, progress);
            let (w, h) = base_img.dimensions();
            export::write_landmask(&mask, w, h, &out_dir.join("landmask.png"))
        }

        "normalize" => {
            let img = load_base_image(&base_path)?;
            let (w, h) = img.dimensions();
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let flat = normalize::normalize_albedo(&img, &mask, 60.0, progress);
            export::write_rgb_image(&flat, &out_dir.join("albedo_flat.png"))
        }

        "height" => {
            let flat = load_rgb_png(&out_dir.join("albedo_flat.png"), "Run 'normalize' first")?;
            let (w, h) = flat.dimensions();
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let hf = height::reconstruct_height(&flat, &mask, 42, progress);
            export::write_height_texture(&hf, w, h, &out_dir.join("height16.png"))
        }

        "rivers" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let hf = load_height16(&out_dir.join("height16.png"), w, h)?;
            let (river_mask, _) = hydrology::compute_rivers(&hf, &mask, w, h, 200, progress);
            export::write_mask_texture(&river_mask, w, h, &out_dir.join("river_mask.png"))
        }

        "biome" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let hf = load_height16(&out_dir.join("height16.png"), w, h)?;
            let base_img = load_rgb_png(&base_path, "Failed to load base image")?;
            let biomes = biome::classify_biomes(&hf, &mask, &base_img, config, w, h, progress);
            export::write_mask_texture(&biomes, w, h, &out_dir.join("biome.png"))
        }

        "suitability" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let hf = load_height16(&out_dir.join("height16.png"), w, h)?;
            let river = load_mask_u8(&out_dir.join("river_mask.png"), w, h)?;
            let biomes = load_mask_u8(&out_dir.join("biome.png"), w, h)?;
            let suit = suitability::compute_suitability(&hf, &mask, &river, &biomes, w, h, progress);
            export::write_f32_binary(&suit, &out_dir.join("suitability.bin"))
        }

        "seeds" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let suit = load_f32_binary(&out_dir.join("suitability.bin"), w, h)?;
            let seeds = sampling::place_seeds(
                &suit, &mask, w, h,
                config.counties, config.seed_radius_min, config.seed_radius_max, 42,
                progress,
            );
            export::write_seeds_json(&seeds, &out_dir.join("seeds.json"))
        }

        "partition" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let hf = load_height16(&out_dir.join("height16.png"), w, h)?;
            let river = load_mask_u8(&out_dir.join("river_mask.png"), w, h)?;
            let seeds = load_seeds_json(&out_dir.join("seeds.json"))?;
            let labels = partition::grow_provinces(
                &seeds, &hf, &mask, &river, w, h,
                config.cost_slope, config.cost_river_crossing, config.cost_ridge_crossing,
                progress,
            );
            export::write_id_texture(&labels, w, h, &out_dir.join("province_id.png"))
        }

        "postprocess" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let mask = load_landmask(&out_dir.join("landmask.png"), w, h)?;
            let mut labels = load_id_texture(&out_dir.join("province_id.png"), w, h)?;
            postprocess::postprocess_provinces(
                &mut labels, &mask, w, h,
                config.min_county_area, config.smooth_iterations,
                progress,
            );
            export::write_id_texture(&labels, w, h, &out_dir.join("province_id.png"))
        }

        "adjacency" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let hf = load_height16(&out_dir.join("height16.png"), w, h)?;
            let river = load_mask_u8(&out_dir.join("river_mask.png"), w, h)?;
            let labels = load_id_texture(&out_dir.join("province_id.png"), w, h)?;
            let adj = graph::build_adjacency(&labels, &hf, &river, w, h, progress);
            export::write_adjacency_json(&adj, &out_dir.join("adjacency.json"))
        }

        "clustering" => {
            let (w, h) = get_dimensions(&out_dir.join("landmask.png"))?;
            let labels = load_id_texture(&out_dir.join("province_id.png"), w, h)?;
            let biomes = load_mask_u8(&out_dir.join("biome.png"), w, h)?;
            let seeds = load_seeds_json(&out_dir.join("seeds.json"))?;
            let adj_json = std::fs::read_to_string(out_dir.join("adjacency.json"))
                .map_err(|e| format!("Failed to read adjacency.json: {}", e))?;
            let adj: Vec<graph::ProvinceAdjacency> = serde_json::from_str(&adj_json)
                .map_err(|e| format!("Failed to parse adjacency.json: {}", e))?;

            let seed_tuples: Vec<(u32, u32, u32)> = seeds.iter().map(|s| (s.id, s.x, s.y)).collect();
            let (provinces, duchies, kingdoms, duchy_labels, kingdom_labels) = cluster::cluster_hierarchy(
                &labels, &biomes, &seed_tuples, &adj, w, h,
                config.duchy_size_min, config.duchy_size_max,
                config.kingdom_size_min, config.kingdom_size_max,
                progress,
            );

            export::write_id_texture(&duchy_labels, w, h, &out_dir.join("duchy_id.png"))?;
            export::write_id_texture(&kingdom_labels, w, h, &out_dir.join("kingdom_id.png"))?;
            let continents = build_continents(&provinces, &duchies, &kingdoms, &adj, None);
            let kingdom_to_continent: HashMap<u32, u32> = continents
                .iter()
                .flat_map(|c| c.kingdom_ids.iter().map(move |&kid| (kid, c.id)))
                .collect();
            let continent_labels: Vec<u32> = kingdom_labels
                .iter()
                .map(|&kid| kingdom_to_continent.get(&kid).copied().unwrap_or(0))
                .collect();
            export::write_id_texture(&continent_labels, w, h, &out_dir.join("continent_id.png"))?;
            let continents_json = serde_json::to_string_pretty(&continents)
                .map_err(|e| format!("Failed to serialize continents.json: {e}"))?;
            std::fs::write(out_dir.join("continents.json"), continents_json)
                .map_err(|e| format!("Failed to write continents.json: {e}"))?;
            export::write_provinces_json(&provinces, &out_dir.join("provinces.json"))?;
            export::write_duchies_json(&duchies, &out_dir.join("duchies.json"))?;
            export::write_kingdoms_json(&kingdoms, &out_dir.join("kingdoms.json"))
        }

        "naming" => {
            progress(0.0, "Placeholder — naming not yet implemented");
            progress(100.0, "Naming stage skipped");
            Ok(())
        }

        _ => Err(format!("Unknown stage: {}", stage_name)),
    }
}

fn run_isolate_all_provinces_job(
    job_id: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    out_dir: PathBuf,
    base_path: PathBuf,
    isolated_dir: PathBuf,
) {
    {
        let mut jobs = jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = JobStatus::Running;
            job.current_stage = "Loading province masks".to_string();
        }
    }

    let result = (|| -> Result<(), String> {
        let (province_id_map, width, height) = load_province_id_map(&out_dir)?;
        let base_img = load_base_texture(&base_path)?;
        let hierarchy = load_hierarchy_records(&out_dir)?;
        let total = hierarchy.provinces.len();

        if total == 0 {
            return Err("No provinces found in provinces.json".to_string());
        }

        for (index, province) in hierarchy.provinces.iter().enumerate() {
            {
                let mut jobs = jobs.lock().unwrap();
                if let Some(job) = jobs.get_mut(&job_id) {
                    job.progress = ((index as f32) / (total as f32)) * 100.0;
                    job.current_stage = format!(
                        "Isolating province {}/{}",
                        index + 1,
                        total
                    );
                }
            }

            let layer = render_single_province_layer(province.id, &province_id_map, width, height, &base_img)?;
            let out_path = isolated_dir.join(format!("province_{}.png", province.id));
            layer
                .save(&out_path)
                .map_err(|e| format!("Failed to save {}: {}", out_path.display(), e))?;
        }

        Ok(())
    })();

    let mut jobs = jobs.lock().unwrap();
    if let Some(job) = jobs.get_mut(&job_id) {
        match result {
            Ok(()) => {
                job.status = JobStatus::Completed;
                job.progress = 100.0;
                job.current_stage = "Completed".to_string();
                job.error = None;
            }
            Err(error_msg) => {
                job.status = JobStatus::Failed;
                job.current_stage = "Failed".to_string();
                job.error = Some(error_msg);
            }
        }
    }
}

// ── File Loading Helpers ──

fn load_province_id_map(out_dir: &std::path::Path) -> Result<(Vec<u32>, u32, u32), String> {
    let province_map_path = out_dir.join("province_id.png");
    if !province_map_path.exists() {
        return Err("Hierarchy map not found. Did you run the pipeline?".to_string());
    }
    let (width, height) = get_dimensions(&province_map_path)?;
    let province_id_map = load_id_texture(&province_map_path, width, height)?;
    Ok((province_id_map, width, height))
}

fn load_base_texture(path: &std::path::Path) -> Result<image::RgbImage, String> {
    if !path.exists() {
        return Err("Base texture not found.".to_string());
    }
    load_rgb_png(path, "Failed to load base image")
}

fn load_hierarchy_records(out_dir: &std::path::Path) -> Result<HierarchyRecords, String> {
    let provinces_path = out_dir.join("provinces.json");
    let duchies_path = out_dir.join("duchies.json");
    let kingdoms_path = out_dir.join("kingdoms.json");
    let continents_path = out_dir.join("continents.json");

    let provinces = load_json_file::<Vec<ProvinceRecord>>(&provinces_path, "provinces.json")?;
    let duchies = load_json_file::<Vec<DuchyRecord>>(&duchies_path, "duchies.json")?;
    let kingdoms = load_json_file::<Vec<KingdomRecord>>(&kingdoms_path, "kingdoms.json")?;
    let continents = if continents_path.exists() {
        Some(load_json_file::<Vec<ContinentRecord>>(&continents_path, "continents.json")?)
    } else {
        None
    };

    Ok(HierarchyRecords {
        provinces,
        duchies,
        kingdoms,
        continents,
    })
}

fn resolve_province_ids_for_entity(
    entity_type: &str,
    entity_id: u32,
    hierarchy: &HierarchyRecords,
) -> Result<Vec<u32>, String> {
    match entity_type {
        "province" => {
            if hierarchy.provinces.iter().any(|province| province.id == entity_id) {
                Ok(vec![entity_id])
            } else {
                Err(format!("Province {} not found", entity_id))
            }
        }
        "duchy" => {
            let duchy = hierarchy
                .duchies
                .iter()
                .find(|duchy| duchy.id == entity_id)
                .ok_or_else(|| format!("Duchy {} not found", entity_id))?;
            Ok(duchy.province_ids.clone())
        }
        "kingdom" => {
            let kingdom = hierarchy
                .kingdoms
                .iter()
                .find(|kingdom| kingdom.id == entity_id)
                .ok_or_else(|| format!("Kingdom {} not found", entity_id))?;
            let duchy_index: HashMap<u32, &DuchyRecord> =
                hierarchy.duchies.iter().map(|duchy| (duchy.id, duchy)).collect();
            let mut province_ids = Vec::new();
            let mut seen = HashSet::new();
            for duchy_id in &kingdom.duchy_ids {
                let duchy = duchy_index
                    .get(duchy_id)
                    .ok_or_else(|| format!("Duchy {} referenced by kingdom {} not found", duchy_id, entity_id))?;
                for province_id in &duchy.province_ids {
                    if seen.insert(*province_id) {
                        province_ids.push(*province_id);
                    }
                }
            }
            Ok(province_ids)
        }
        "continent" => {
            let continents = hierarchy
                .continents
                .as_ref()
                .ok_or_else(|| "continents.json not found".to_string())?;
            let continent = continents
                .iter()
                .find(|continent| continent.id == entity_id)
                .ok_or_else(|| format!("Continent {} not found", entity_id))?;
            Ok(continent.province_ids.clone())
        }
        _ => Err("Invalid entity type".to_string()),
    }
}

fn render_single_province_layer(
    province_id: u32,
    province_id_map: &[u32],
    width: u32,
    height: u32,
    base_img: &image::RgbImage,
) -> Result<image::RgbaImage, String> {
    let mut out_img = image::RgbaImage::new(width, height);
    let mut found = false;
    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) as usize;
            if province_id_map[idx] == province_id {
                found = true;
                let pixel = base_img.get_pixel(x, y);
                out_img.put_pixel(x, y, image::Rgba([pixel[0], pixel[1], pixel[2], 255]));
            } else {
                out_img.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
            }
        }
    }

    if !found {
        return Err(format!("Province {} not found in province_id.png", province_id));
    }

    Ok(out_img)
}

fn merge_layers_into_canvas(
    layers: Vec<image::RgbaImage>,
    width: u32,
    height: u32,
) -> image::RgbaImage {
    let mut out_img = image::RgbaImage::new(width, height);
    for layer in layers {
        for (x, y, pixel) in layer.enumerate_pixels() {
            if pixel[3] > 0 {
                out_img.put_pixel(x, y, *pixel);
            }
        }
    }
    out_img
}

fn load_json_file<T: serde::de::DeserializeOwned>(
    path: &std::path::Path,
    label: &str,
) -> Result<T, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", label, e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", label, e))
}

fn load_base_image(path: &std::path::Path) -> Result<image::RgbImage, String> {
    let img = ImageReader::open(path)
        .map_err(|e| format!("Failed to open {}: {}", path.display(), e))?
        .decode()
        .map_err(|e| format!("Failed to decode {}: {}", path.display(), e))?;
    Ok(img.to_rgb8())
}

fn load_rgb_png(path: &std::path::Path, msg: &str) -> Result<image::RgbImage, String> {
    if !path.exists() {
        return Err(format!("{} (missing: {})", msg, path.display()));
    }
    load_base_image(path)
}

fn get_dimensions(path: &std::path::Path) -> Result<(u32, u32), String> {
    let img = image::open(path).map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    Ok(img.dimensions())
}

fn load_landmask(path: &std::path::Path, _w: u32, _h: u32) -> Result<Vec<bool>, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open landmask: {}", e))?;
    let gray = img.to_luma8();
    Ok(gray.pixels().map(|p| p[0] > 128).collect())
}

fn load_height16(path: &std::path::Path, _w: u32, _h: u32) -> Result<Vec<u16>, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open height16: {}", e))?;
    let gray16 = img.to_luma16();
    Ok(gray16.pixels().map(|p| p[0]).collect())
}

fn load_mask_u8(path: &std::path::Path, _w: u32, _h: u32) -> Result<Vec<u8>, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open mask: {}", e))?;
    let gray = img.to_luma8();
    Ok(gray.pixels().map(|p| p[0]).collect())
}

fn load_f32_binary(path: &std::path::Path, w: u32, h: u32) -> Result<Vec<f32>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let n = (w * h) as usize;
    if bytes.len() != n * 4 {
        return Err(format!("Binary file size mismatch: expected {} bytes, got {}", n * 4, bytes.len()));
    }
    Ok(bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

fn load_seeds_json(path: &std::path::Path) -> Result<Vec<sampling::Seed>, String> {
    let json = std::fs::read_to_string(path).map_err(|e| format!("Failed to read seeds: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse seeds: {}", e))
}

fn load_id_texture(path: &std::path::Path, _w: u32, _h: u32) -> Result<Vec<u32>, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    let rgb = img.to_rgb8();
    Ok(rgb.pixels().map(|p| {
        p[0] as u32 | ((p[1] as u32) << 8) | ((p[2] as u32) << 16)
    }).collect())
}

fn build_continents(
    provinces: &[cluster::ProvinceRecord],
    duchies: &[cluster::DuchyRecord],
    kingdoms: &[cluster::KingdomRecord],
    adjacency: &[graph::ProvinceAdjacency],
    previous_names: Option<&HashMap<u32, String>>,
) -> Vec<ContinentRecord> {
    let province_to_kingdom: HashMap<u32, u32> = provinces.iter().map(|p| (p.id, p.kingdom_id)).collect();
    let mut kingdom_graph: HashMap<u32, HashSet<u32>> = kingdoms
        .iter()
        .map(|k| (k.id, HashSet::new()))
        .collect();

    for adj in adjacency {
        let Some(&k1) = province_to_kingdom.get(&adj.province_id) else { continue; };
        for edge in &adj.neighbors {
            let Some(&k2) = province_to_kingdom.get(&edge.neighbor_id) else { continue; };
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
            let mut duchy_ids: Vec<u32> = duchies
                .iter()
                .filter(|d| kingdom_ids.contains(&d.kingdom_id))
                .map(|d| d.id)
                .collect();
            duchy_ids.sort_unstable();
            duchy_ids.dedup();

            let mut province_ids: Vec<u32> = provinces
                .iter()
                .filter(|p| kingdom_ids.contains(&p.kingdom_id))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_province_bbox_with_padding() {
        let width = 6;
        let height = 5;
        let mut ids = vec![0u32; (width * height) as usize];
        ids[(1 * width + 2) as usize] = 7;
        ids[(2 * width + 3) as usize] = 7;

        let bbox = compute_province_bbox(&ids, width, height, 7, 1).expect("bbox");
        assert_eq!(bbox.x, 1);
        assert_eq!(bbox.y, 0);
        assert_eq!(bbox.width, 4);
        assert_eq!(bbox.height, 4);
    }

    #[test]
    fn near_mask_edge_detects_boundary_pixels() {
        let width = 5;
        let height = 5;
        let mut mask = vec![false; (width * height) as usize];
        for y in 1..4 {
            for x in 1..4 {
                mask[(y * width + x) as usize] = true;
            }
        }
        assert!(is_near_mask_edge(&mask, width, height, 1, 1, 1));
        assert!(!is_near_mask_edge(&mask, width, height, 2, 2, 1));
    }

    #[test]
    fn upscaled_metadata_roundtrip() {
        let meta = UpscaledProvinceMetadata {
            artifact_id: "province_12_1_abcd1234".to_string(),
            province_id: 12,
            source_planet_id: "world-a".to_string(),
            bbox: UpscaledBoundingBox {
                x: 10,
                y: 20,
                width: 128,
                height: 96,
            },
            source_width: 4096,
            source_height: 2048,
            model_id: "gemini-3.1-flash-image-preview".to_string(),
            fallback_model_id: None,
            prompt: "Enhance detail".to_string(),
            padding_px: 96,
            created_at: 123456,
        };

        let raw = serde_json::to_string(&meta).expect("serialize");
        let parsed: UpscaledProvinceMetadata = serde_json::from_str(&raw).expect("parse");
        assert_eq!(parsed.artifact_id, meta.artifact_id);
        assert_eq!(parsed.bbox.width, 128);
    }
}
