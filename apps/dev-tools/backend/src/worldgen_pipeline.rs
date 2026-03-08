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
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
use tracing::{info, error};

use worldgen_core::*;
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};
use worldgen_core::export::PipelineStatus;

use crate::{AppState, JobRecord, JobStatus};

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
    planets_dir.join(planet_id).join("textures").join("base.jpg")
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
