use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use image::io::Reader as ImageReader;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use uuid::Uuid;
use tracing::{info, error};

use worldgen_core::*;
use worldgen_core::export::PipelineStatus;

use crate::{AppState, JobRecord, JobStatus};

// ── Request / Response Types ──

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
    pub error: Option<String>,
}

// ── Helper: resolve planet worldgen directory ──

fn worldgen_dir(planets_dir: &std::path::Path, planet_id: &str) -> PathBuf {
    planets_dir.join(planet_id).join("worldgen")
}

fn base_image_path(planets_dir: &std::path::Path, planet_id: &str) -> PathBuf {
    planets_dir.join(planet_id).join("textures").join("base.jpg")
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
        "normalize" => {
            let img = load_base_image(&base_path)?;
            let flat = normalize::normalize_albedo(&img, 60.0, progress);
            export::write_rgb_image(&flat, &out_dir.join("albedo_flat.png"))
        }

        "landmask" => {
            let flat = load_rgb_png(&out_dir.join("albedo_flat.png"), "Run 'normalize' first")?;
            let mask = landmask::extract_landmask(&flat, 15, 500, 200, progress);
            let (w, h) = flat.dimensions();
            export::write_landmask(&mask, w, h, &out_dir.join("landmask.png"))
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
            let biomes = biome::classify_biomes(&hf, &mask, w, h, progress);
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

// ── File Loading Helpers ──

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
