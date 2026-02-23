mod biomes;
mod climate;
mod color_utils;
mod geo_noise;
mod hydrology;
mod types;

use crate::biomes::{classify_biome, classify_soil, get_biome_color};
use crate::climate::ClimateSimulator;
use crate::geo_noise::{BoundaryKind, NoiseManager};
use crate::hydrology::simulate_hydrology_with_cancel;
use crate::types::MineralType;
use rayon::prelude::*;

pub use crate::types::{
    ClimateConfig, GeoConfig, SimulationConfig, TerrainCell, WorldConfig, WorldData,
};

#[derive(Clone, Copy, Debug)]
pub struct GenerationProgress {
    pub progress: f32,
    pub stage: &'static str,
}

fn emit_progress<F: FnMut(GenerationProgress)>(
    on_progress: &mut F,
    progress: f32,
    stage: &'static str,
) {
    on_progress(GenerationProgress {
        progress: progress.clamp(0.0, 100.0),
        stage,
    });
}

fn percentile(values: &[f64], t: f64) -> f64 {
    if values.is_empty() {
        return 0.5;
    }
    let mut tmp = values.to_vec();
    tmp.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let k = ((tmp.len() as f64 - 1.0) * t.clamp(0.01, 0.99)).round() as usize;
    tmp[k]
}

/// Remap raw elevation to approximate Earth's bimodal hypsometric curve.
fn hypsometric_remap(raw: f64) -> f64 {
    let x = raw.clamp(0.0, 1.0);
    if x < 0.42 {
        let t = x / 0.42;
        0.05 + t * 0.25
    } else if x < 0.52 {
        let t = (x - 0.42) / 0.10;
        let s = t * t * (3.0 - 2.0 * t);
        0.30 + s * 0.22
    } else if x < 0.82 {
        let t = (x - 0.52) / 0.30;
        0.52 + t * 0.18
    } else {
        let t = (x - 0.82) / 0.18;
        0.70 + t * 0.30
    }
}

/// Per-cell intermediate data computed in parallel.
struct CellGeology {
    elevation: f64,
    tectonic_stress: f64,
    volcanic_activity: f64,
    radiation: f64,
    boundary_kind: BoundaryKind,
}

/// Compute geology for a single cell — pure function, safe for parallel use.
fn compute_cell_geology(
    x: u32,
    y: u32,
    cols: u32,
    rows: u32,
    noise_manager: &NoiseManager,
    config: &SimulationConfig,
    octaves: u32,
    freq_mul: f64,
    water_level: f64,
) -> CellGeology {
    let nx = x as f64 / cols as f64;
    let ny = y as f64 / rows as f64;

    // Tectonic plate info
    let (plate_idx, _second_idx, boundary_proximity, boundary_kind) =
        noise_manager.get_plate_info_extended(nx, ny);
    let plate = &noise_manager.plate_seeds[plate_idx];

    // Domain-warped continental noise
    let continental_base = noise_manager.sample_warped_3d(
        &noise_manager.continental_noise,
        nx,
        ny,
        0.88 * freq_mul,
        0.12,
    );

    let plate_continental_bias = if plate.is_continental { 0.18 } else { -0.14 };

    // Ridged macro terrain
    let macro_factor =
        (noise_manager.sample_warped_3d(&noise_manager.warp_noise, nx, ny, 1.18 * freq_mul, 0.08)
            + 1.0)
            * 0.5;

    let macro_ridged = noise_manager.get_ridged_fbm(
        &noise_manager.mountain_noise,
        nx,
        ny,
        960.0 / freq_mul,
        5.min(octaves),
        0.55,
        2.05,
    ) * (0.75 + 0.5 * macro_factor);

    // Blend continental and ridged terrain
    let blend_factor = 0.48;
    let mut elev = continental_base * (1.0 - blend_factor) + macro_ridged * blend_factor;

    let mut continents =
        noise_manager.sample_warped_3d(&noise_manager.detail_noise, nx, ny, 0.34 * freq_mul, 0.10);
    if config.world.ocean_coverage < 0.55 {
        continents = continents * 0.86 - 0.12;
    } else {
        continents = continents * 0.92 + 0.12;
    }
    elev = elev * 0.68 + continents * 0.18 + plate_continental_bias;
    elev = ((elev + 1.0) * 0.5).clamp(0.0, 1.0);
    elev = hypsometric_remap(elev);

    // Tectonic stress
    let stress =
        (boundary_proximity.max(0.0).powi(2) * config.geo.tectonic_intensity * 0.55).min(1.0);

    // Mountain building
    let mut ridges = 0.0;

    if stress >= 0.12 && boundary_kind == BoundaryKind::Convergent {
        let mountain_line = noise_manager.get_mountain_lines(nx, ny, 1.8 * freq_mul);
        ridges += mountain_line * stress * 0.28;
        let mountain_mass = noise_manager.get_ridged_fbm(
            &noise_manager.mountain_noise,
            nx,
            ny,
            config.geo.continental_scale * 0.3,
            5.min(octaves),
            0.45,
            2.2,
        );
        ridges += ((mountain_mass + 1.0) / 2.0) * stress * 0.18;
    }

    if stress >= 0.2 && boundary_kind == BoundaryKind::Transform {
        let ridge_height = (noise_manager.get_fbm(
            &noise_manager.mountain_noise,
            nx,
            ny,
            config.geo.continental_scale * 0.35,
            4.min(octaves),
            0.45,
            2.2,
        ) + 1.0)
            / 2.0;
        ridges += ridge_height * stress * 0.12;
    }

    if stress >= 0.15 && boundary_kind == BoundaryKind::Divergent {
        let rift_depth = noise_manager.sample_noise3d(
            &noise_manager.mountain_lines_noise,
            nx,
            ny,
            2.0 * freq_mul,
        );
        if elev < 0.4 {
            ridges += (1.0 - rift_depth.abs()) * stress * 0.10;
        } else {
            ridges -= (1.0 - rift_depth.abs()) * stress * 0.08;
        }
    }

    let mountain_lines = 1.0
        - noise_manager
            .sample_noise3d(&noise_manager.warp_noise, nx, ny, 2.2)
            .abs();
    let mountain_mask = (mountain_lines - 0.3).clamp(0.0, 1.0);
    ridges += mountain_mask.powf(2.5) * stress * 0.14;

    // Fine detail
    let detail = (noise_manager.get_fbm(
        &noise_manager.detail_noise,
        nx,
        ny,
        config.geo.continental_scale * 0.15,
        octaves,
        config.geo.persistence,
        config.geo.lacunarity,
    ) + 1.0)
        / 2.0
        * 0.05;

    // Hills patches
    let hills_micro = noise_manager.sample_climate(nx, ny, 4.0);
    let hills_macro = noise_manager.sample_climate(nx, ny, 1.35);
    let hills_boost = if hills_micro > 0.36 && hills_macro > -0.25 && elev > water_level {
        0.025
    } else {
        0.0
    };

    let elevation = (elev + ridges + detail + hills_boost).clamp(0.0, 1.0);

    // Volcanic
    let volcanic_base = (noise_manager.sample_climate(nx, ny, 2.2) + 1.0) / 2.0;
    let volcanic_activity =
        (stress * 0.6 + volcanic_base.powi(3) * config.geo.volcanic_density).min(1.0);

    // Radiation
    let rad = (noise_manager.sample_climate(nx, ny, 1.2) + 1.0) / 2.0;
    let radiation = (rad - 0.7).max(0.0).powi(2) / 0.3f64.powi(2);

    CellGeology {
        elevation,
        tectonic_stress: stress,
        volcanic_activity,
        radiation,
        boundary_kind,
    }
}

pub fn generate_world_from_image<F, C>(
    image_rgba: &[u8],
    image_width: u32,
    image_height: u32,
    config: SimulationConfig,
    cols: u32,
    rows: u32,
    _km_per_cell: f64,
    mut on_progress: F,
    mut_should_cancel: C,
    generate_cells: bool,
) -> Result<WorldData, String>
where
    F: FnMut(GenerationProgress),
    C: FnMut() -> bool,
{
    if cols == 0 || rows == 0 {
        return Err("cols and rows must be greater than 0".to_string());
    }

    emit_progress(
        &mut on_progress,
        1.0,
        "Parsing Gemini Image Data (Parallel)",
    );

    let total = (cols * rows) as usize;
    let mut water_level = config.world.ocean_coverage;
    let noise_manager = NoiseManager::new(config.world.seed, config.geo.clone());
    let climate_sim = ClimateSimulator::new(&config.climate, &noise_manager);

    if !generate_cells {
        emit_progress(&mut on_progress, 100.0, "Skipping cell generation");
        return Ok(WorldData {
            cells: Vec::new(),
            cols,
            rows,
        });
    }

    // ════════════════════════════════════════════════════════════
    // PASS 1: Parallel image parsing for Base Geology
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 5.0, "Extracting elevation from AI map");

    let geology_data: Vec<CellGeology> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let x = idx as u32 % cols;
            let y = idx as u32 / cols;

            // Map grid (x,y) to equirectangular pixel
            let px = ((x as f64 / cols as f64) * image_width as f64) as u32;
            let py = ((y as f64 / rows as f64) * image_height as f64) as u32;

            let px = px.min(image_width - 1);
            let py = py.min(image_height - 1);

            let pixel_idx = ((py * image_width + px) * 4) as usize;

            // Safeguard against malformed images
            let (r, g, b) = if pixel_idx + 2 < image_rgba.len() {
                (
                    image_rgba[pixel_idx] as f64 / 255.0,
                    image_rgba[pixel_idx + 1] as f64 / 255.0,
                    image_rgba[pixel_idx + 2] as f64 / 255.0,
                )
            } else {
                (0.0, 0.0, 0.0)
            };

            // Heuristic Elevation mapping based on color
            let luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // If very blue (Ocean), sink it
            let is_water = b > r * 1.2 && b > g * 1.1;
            let mut elevation = if is_water {
                0.1 + (luma * 0.3) // Deep to shallow oceans
            } else {
                // Landmasses
                0.55 + (luma * 0.45) // Plains to Mountains
            };

            // Add some procedural noise strictly for tectonic lines so we get mountain ranges
            let stress =
                (noise_manager.sample_climate(x as f64 / cols as f64, y as f64 / rows as f64, 2.5))
                    .abs();
            let boundary_kind = if stress > 0.8 {
                BoundaryKind::Convergent
            } else {
                BoundaryKind::Transform
            };

            let volcanic_activity = (stress * 0.6).min(1.0);
            let radiation = (luma - 0.7).max(0.0).powi(2);

            CellGeology {
                elevation,
                tectonic_stress: stress,
                volcanic_activity,
                radiation,
                boundary_kind,
            }
        })
        .collect();

    let mut elevations: Vec<f64> = geology_data.iter().map(|g| g.elevation).collect();
    let tectonic_stress: Vec<f64> = geology_data.iter().map(|g| g.tectonic_stress).collect();
    let volcanic_activity: Vec<f64> = geology_data.iter().map(|g| g.volcanic_activity).collect();
    let radiation: Vec<f64> = geology_data.iter().map(|g| g.radiation).collect();
    drop(geology_data);

    water_level = percentile(&elevations, config.world.ocean_coverage);

    // Skip coastline cleanup/shelves to preserve the pure AI image layout

    // ════════════════════════════════════════════════════════════
    // PASS 5: Parallel moisture computation
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 57.0, "Computing AI-backed climate");

    let moisture_base: Vec<f64> = (0..total)
        .into_par_iter()
        .map(|i| {
            let x = i as u32 % cols;
            let y = i as u32 / cols;
            let nx = x as f64 / cols as f64;
            let ny = y as f64 / rows as f64;
            climate_sim.get_precipitation(elevations[i], 0.5, true, ny, nx, ny)
        })
        .collect();

    // ════════════════════════════════════════════════════════════
    // PASS 6: Hydrology
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 62.0, "Simulating hydrology");
    let mut hydrology_cancel = || false;
    let mut hydrology_progress = |p: f32, stage: &'static str| {
        emit_progress(&mut on_progress, 62.0 + (70.0 - 62.0) * (p / 100.0), stage);
    };
    let hydrology = simulate_hydrology_with_cancel(
        &elevations,
        &moisture_base,
        cols,
        rows,
        water_level,
        &mut hydrology_cancel,
        &mut hydrology_progress,
    )?;

    // ════════════════════════════════════════════════════════════
    // PASS 7: Ocean proximity
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 71.0, "Computing ocean proximity");
    let mut dist = vec![f64::INFINITY; total];
    let mut queue = std::collections::VecDeque::new();
    let max_dist = 20.0;
    for i in 0..total {
        if elevations[i] < water_level {
            dist[i] = 0.0;
            queue.push_back(i);
        }
    }
    while let Some(idx) = queue.pop_front() {
        if dist[idx] >= max_dist {
            continue;
        }
        let cx = (idx as u32 % cols) as i32;
        let cy = (idx as u32 / cols) as i32;
        for (dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
            let nx = (cx + dx).rem_euclid(cols as i32);
            let ny = cy + dy;
            if ny < 0 || ny >= rows as i32 {
                continue;
            }
            let n_idx = (ny * cols as i32 + nx) as usize;
            if dist[n_idx] > dist[idx] + 1.0 {
                dist[n_idx] = dist[idx] + 1.0;
                queue.push_back(n_idx);
            }
        }
    }
    let ocean_proximity: Vec<f64> = dist.iter().map(|d| (1.0 - d / max_dist).max(0.0)).collect();
    drop(dist);

    // ════════════════════════════════════════════════════════════
    // PASS 8: Final cell assembly
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 76.0, "Assembling Hex Cells");

    let cells: Vec<TerrainCell> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let x = idx as u32 % cols;
            let y = idx as u32 / cols;
            let nx = x as f64 / cols as f64;
            let ny = y as f64 / rows as f64;
            let elevation = elevations[idx];
            let stress = tectonic_stress[idx];
            let volcanic = volcanic_activity[idx];
            let rad = radiation[idx];
            let ocean = ocean_proximity[idx];
            let normalized_y = y as f64 / rows as f64;

            let mut max_diff: f64 = 0.0;
            let cx = x as i32;
            let cy = y as i32;
            for (ddx, ddy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nnx = (cx + ddx).rem_euclid(cols as i32);
                let nny = cy + ddy;
                if nny >= 0 && nny < rows as i32 {
                    let n_idx = (nny * cols as i32 + nnx) as usize;
                    max_diff = max_diff.max((elevation - elevations[n_idx]).abs());
                }
            }
            let slope = (max_diff * 10.0).min(1.0);

            let temperature = climate_sim.get_temperature(normalized_y, elevation, ocean, nx, ny);
            let precipitation =
                climate_sim.get_precipitation(elevation, ocean, true, normalized_y, nx, ny);
            let wind_exposure = climate_sim.get_wind_exposure(elevation, slope, nx, ny);
            let moisture = (precipitation + hydrology.flow[idx] * 0.3).min(1.0);

            let vegetation_density = if elevation >= water_level {
                (moisture * 0.5
                    + if temperature > 0.0 && temperature < 35.0 {
                        0.3
                    } else {
                        0.0
                    }
                    + if precipitation > 0.3 { 0.2 } else { 0.0 }
                    - rad * 0.5
                    - volcanic * 0.5
                    - slope * 0.3)
                    .clamp(0.0, 1.0)
            } else {
                0.0
            };

            let biome = classify_biome(
                temperature,
                precipitation,
                elevation,
                volcanic,
                rad,
                water_level,
            );
            let soil_type = classify_soil(elevation, moisture, temperature, volcanic, rad);

            let mut minerals = Vec::new();
            if stress > 0.5 {
                minerals.push(MineralType::Iron);
            }
            if elevation > 0.35 && elevation < 0.5 && volcanic < 0.2 {
                minerals.push(MineralType::FuelDeposit);
            }

            let elevation_meters = if elevation < water_level {
                -11000.0 * (1.0 - elevation / water_level)
            } else {
                ((elevation - water_level) / (1.0 - water_level)) * 8848.0
            };

            // Force the fallback color of the cell to match the exact AI pixel
            let px = ((x as f64 / cols as f64) * image_width as f64) as u32;
            let py = ((y as f64 / rows as f64) * image_height as f64) as u32;
            let px = px.min(image_width - 1);
            let py = py.min(image_height - 1);
            let pixel_idx = ((py * image_width + px) * 4) as usize;
            let cell_color = format!(
                "#{:02x}{:02x}{:02x}",
                image_rgba[pixel_idx],
                image_rgba[pixel_idx + 1],
                image_rgba[pixel_idx + 2]
            );

            TerrainCell {
                x: x as f64,
                y: y as f64,
                elevation,
                elevation_meters,
                tectonic_stress: stress,
                volcanic_activity: volcanic,
                slope,
                temperature,
                moisture,
                precipitation,
                wind_exposure,
                water_table_depth: hydrology.water_table[idx],
                river_flow: hydrology.flow[idx],
                is_lake: hydrology.is_lake[idx],
                vegetation_density,
                soil_type,
                mineral_deposits: minerals,
                radiation_level: rad,
                biome,
                color: cell_color,
            }
        })
        .collect();

    emit_progress(&mut on_progress, 100.0, "Ready to Render AI Grid");

    Ok(WorldData { cells, cols, rows })
}

pub fn generate_world(
    config: SimulationConfig,
    cols: u32,
    rows: u32,
    km_per_cell: f64,
    octaves: u32,
) -> Result<WorldData, String> {
    generate_world_with_progress(config, cols, rows, km_per_cell, octaves, |_| {})
}

pub fn generate_world_with_progress<F>(
    config: SimulationConfig,
    cols: u32,
    rows: u32,
    km_per_cell: f64,
    octaves: u32,
    on_progress: F,
) -> Result<WorldData, String>
where
    F: FnMut(GenerationProgress),
{
    generate_world_with_progress_and_cancel(
        config,
        cols,
        rows,
        km_per_cell,
        octaves,
        on_progress,
        || false,
    )
}

pub fn generate_world_with_progress_and_cancel<F, C>(
    config: SimulationConfig,
    cols: u32,
    rows: u32,
    _km_per_cell: f64,
    octaves: u32,
    mut on_progress: F,
    mut should_cancel: C,
) -> Result<WorldData, String>
where
    F: FnMut(GenerationProgress),
    C: FnMut() -> bool,
{
    let check_cancel = |should_cancel: &mut C| -> Result<(), String> {
        if should_cancel() {
            Err("cancelled".to_string())
        } else {
            Ok(())
        }
    };

    if cols == 0 || rows == 0 {
        return Err("cols and rows must be greater than 0".to_string());
    }
    check_cancel(&mut should_cancel)?;

    emit_progress(&mut on_progress, 1.0, "Initializing noise fields");

    let total = (cols * rows) as usize;
    let mut water_level = config.world.ocean_coverage;
    let noise_manager = NoiseManager::new(config.world.seed, config.geo.clone());
    let climate_sim = ClimateSimulator::new(&config.climate, &noise_manager);
    let freq_mul = (420.0 / config.geo.continental_scale.max(120.0)).clamp(0.45, 2.25);

    // ════════════════════════════════════════════════════════════
    // PASS 1: Parallel elevation + geology computation
    // ════════════════════════════════════════════════════════════
    emit_progress(
        &mut on_progress,
        5.0,
        "Generating tectonic plates and elevation (parallel)",
    );

    // Generate all indices and compute geology in parallel
    let geology_data: Vec<CellGeology> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let x = idx as u32 % cols;
            let y = idx as u32 / cols;
            compute_cell_geology(
                x,
                y,
                cols,
                rows,
                &noise_manager,
                &config,
                octaves,
                freq_mul,
                water_level,
            )
        })
        .collect();

    check_cancel(&mut should_cancel)?;
    emit_progress(&mut on_progress, 42.0, "Unpacking geological data");

    // Unpack parallel results into separate arrays
    let mut elevations: Vec<f64> = geology_data.iter().map(|g| g.elevation).collect();
    let tectonic_stress: Vec<f64> = geology_data.iter().map(|g| g.tectonic_stress).collect();
    let volcanic_activity: Vec<f64> = geology_data.iter().map(|g| g.volcanic_activity).collect();
    let radiation: Vec<f64> = geology_data.iter().map(|g| g.radiation).collect();
    drop(geology_data); // free memory

    // Derive sea level
    water_level = percentile(&elevations, config.world.ocean_coverage);

    // ════════════════════════════════════════════════════════════
    // PASS 2: Morphological coastline cleanup (sequential — reads neighbors)
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 44.0, "Morphological coastline cleanup");

    for pass in 0..4 {
        check_cancel(&mut should_cancel)?;

        // Parallel: each cell reads old `elevations` (immutable), writes to `next`
        let old_elevs = elevations.clone();
        elevations = (0..total)
            .into_par_iter()
            .map(|idx| {
                let x = idx as u32 % cols;
                let y = idx as u32 / cols;
                let mut land_neighbors = 0i32;
                let mut neighbor_elev_sum = 0.0;
                let mut neighbor_count = 0;
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = (x as i32 + dx).rem_euclid(cols as i32);
                        let ny = y as i32 + dy;
                        if ny < 0 || ny >= rows as i32 {
                            continue;
                        }
                        let nidx = (ny * cols as i32 + nx) as usize;
                        if old_elevs[nidx] >= water_level {
                            land_neighbors += 1;
                        }
                        neighbor_elev_sum += old_elevs[nidx];
                        neighbor_count += 1;
                    }
                }
                let is_land = old_elevs[idx] >= water_level;
                let strength = if pass < 2 { 1.0 } else { 0.6 };
                let delta = if is_land {
                    if land_neighbors <= 2 {
                        -0.028 * strength
                    } else if land_neighbors >= 7 {
                        0.012 * strength
                    } else {
                        0.0
                    }
                } else if land_neighbors >= 6 {
                    0.024 * strength
                } else if land_neighbors <= 1 {
                    -0.005 * strength
                } else {
                    0.0
                };

                if neighbor_count > 0 {
                    let avg = neighbor_elev_sum / neighbor_count as f64;
                    (old_elevs[idx] * 0.98 + avg * 0.02 + delta).clamp(0.0, 1.0)
                } else {
                    (old_elevs[idx] + delta).clamp(0.0, 1.0)
                }
            })
            .collect();

        water_level = percentile(&elevations, config.world.ocean_coverage);

        emit_progress(
            &mut on_progress,
            44.0 + (pass as f32 + 1.0) / 4.0 * 6.0,
            "Morphological coastline cleanup",
        );
    }

    // ════════════════════════════════════════════════════════════
    // PASS 3: Thermal erosion (sequential — neighbor writes)
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 51.0, "Thermal erosion");
    check_cancel(&mut should_cancel)?;
    {
        let erosion_threshold = 0.04;
        let erosion_rate = 0.3;
        for _ in 0..config.geo.erosion_iterations.min(6) {
            let mut next = elevations.clone();
            for y in 1..(rows - 1) {
                for x in 0..cols {
                    let idx = (y * cols + x) as usize;
                    let current = elevations[idx];
                    let mut max_diff = 0.0_f64;
                    let mut max_neighbor_idx = idx;
                    for (dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = (x as i32 + dx).rem_euclid(cols as i32);
                        let ny = y as i32 + dy;
                        if ny >= 0 && ny < rows as i32 {
                            let n_idx = (ny * cols as i32 + nx) as usize;
                            let diff = current - elevations[n_idx];
                            if diff > max_diff {
                                max_diff = diff;
                                max_neighbor_idx = n_idx;
                            }
                        }
                    }
                    if max_diff > erosion_threshold {
                        let transfer = (max_diff - erosion_threshold) * erosion_rate * 0.5;
                        next[idx] -= transfer;
                        next[max_neighbor_idx] += transfer;
                    }
                }
            }
            elevations = next;
        }
        water_level = percentile(&elevations, config.world.ocean_coverage);
    }

    // ════════════════════════════════════════════════════════════
    // PASS 4: Continental shelf (BFS — sequential)
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 54.0, "Generating continental shelves");
    check_cancel(&mut should_cancel)?;
    {
        let mut coast_dist = vec![f64::INFINITY; total];
        let mut queue = std::collections::VecDeque::new();
        let shelf_width = 8.0;

        for i in 0..total {
            let is_land = elevations[i] >= water_level;
            let ix = (i as u32 % cols) as i32;
            let iy = (i as u32 / cols) as i32;
            if !is_land {
                continue;
            }
            let mut has_water_neighbor = false;
            for (dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nx = (ix + dx).rem_euclid(cols as i32);
                let ny = iy + dy;
                if ny >= 0 && ny < rows as i32 {
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    if elevations[n_idx] < water_level {
                        has_water_neighbor = true;
                        break;
                    }
                }
            }
            if has_water_neighbor {
                coast_dist[i] = 0.0;
                queue.push_back(i);
            }
        }

        while let Some(idx) = queue.pop_front() {
            if coast_dist[idx] >= shelf_width {
                continue;
            }
            let cx = (idx as u32 % cols) as i32;
            let cy = (idx as u32 / cols) as i32;
            for (dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nx = (cx + dx).rem_euclid(cols as i32);
                let ny = cy + dy;
                if ny >= 0 && ny < rows as i32 {
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    if coast_dist[n_idx] > coast_dist[idx] + 1.0 {
                        coast_dist[n_idx] = coast_dist[idx] + 1.0;
                        queue.push_back(n_idx);
                    }
                }
            }
        }

        for i in 0..total {
            if elevations[i] < water_level && coast_dist[i] < shelf_width {
                let shelf_factor = 1.0 - (coast_dist[i] / shelf_width);
                elevations[i] =
                    (elevations[i] + shelf_factor * shelf_factor * 0.06).min(water_level - 0.005);
            }
        }
    }

    // ════════════════════════════════════════════════════════════
    // PASS 5: Parallel moisture computation
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 57.0, "Computing moisture (parallel)");
    check_cancel(&mut should_cancel)?;

    let moisture_base: Vec<f64> = (0..total)
        .into_par_iter()
        .map(|i| {
            let x = i as u32 % cols;
            let y = i as u32 / cols;
            let nx = x as f64 / cols as f64;
            let ny = y as f64 / rows as f64;
            climate_sim.get_precipitation(elevations[i], 0.5, true, ny, nx, ny)
        })
        .collect();

    // ════════════════════════════════════════════════════════════
    // PASS 6: Hydrology simulation (sequential — flow accumulation)
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 62.0, "Simulating hydrology");

    let mut hydrology_cancel = || should_cancel();
    let mut hydrology_progress = |p: f32, stage: &'static str| {
        emit_progress(&mut on_progress, 62.0 + (70.0 - 62.0) * (p / 100.0), stage);
    };
    let hydrology = simulate_hydrology_with_cancel(
        &elevations,
        &moisture_base,
        cols,
        rows,
        water_level,
        &mut hydrology_cancel,
        &mut hydrology_progress,
    )?;

    // ════════════════════════════════════════════════════════════
    // PASS 7: Parallel ocean proximity
    // ════════════════════════════════════════════════════════════
    emit_progress(&mut on_progress, 71.0, "Computing ocean proximity");

    let mut dist = vec![f64::INFINITY; total];
    let mut queue = std::collections::VecDeque::new();
    let max_dist = 20.0;

    for i in 0..total {
        if elevations[i] < water_level {
            dist[i] = 0.0;
            queue.push_back(i);
        }
    }

    while let Some(idx) = queue.pop_front() {
        if dist[idx] >= max_dist {
            continue;
        }
        let cx = (idx as u32 % cols) as i32;
        let cy = (idx as u32 / cols) as i32;
        for (dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
            let nx = (cx + dx).rem_euclid(cols as i32);
            let ny = cy + dy;
            if ny < 0 || ny >= rows as i32 {
                continue;
            }
            let n_idx = (ny * cols as i32 + nx) as usize;
            if dist[n_idx] > dist[idx] + 1.0 {
                dist[n_idx] = dist[idx] + 1.0;
                queue.push_back(n_idx);
            }
        }
    }

    let ocean_proximity: Vec<f64> = dist.iter().map(|d| (1.0 - d / max_dist).max(0.0)).collect();
    drop(dist);

    // ════════════════════════════════════════════════════════════
    // PASS 8: Parallel final cell assembly
    // ════════════════════════════════════════════════════════════
    emit_progress(
        &mut on_progress,
        76.0,
        "Assembling terrain cells (parallel)",
    );
    check_cancel(&mut should_cancel)?;

    let cells: Vec<TerrainCell> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let x = idx as u32 % cols;
            let y = idx as u32 / cols;
            let nx = x as f64 / cols as f64;
            let ny = y as f64 / rows as f64;
            let elevation = elevations[idx];
            let stress = tectonic_stress[idx];
            let volcanic = volcanic_activity[idx];
            let rad = radiation[idx];
            let ocean = ocean_proximity[idx];
            let normalized_y = y as f64 / rows as f64;

            // Slope
            let mut max_diff: f64 = 0.0;
            let cx = x as i32;
            let cy = y as i32;
            for (ddx, ddy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nnx = (cx + ddx).rem_euclid(cols as i32);
                let nny = cy + ddy;
                if nny >= 0 && nny < rows as i32 {
                    let n_idx = (nny * cols as i32 + nnx) as usize;
                    max_diff = max_diff.max((elevation - elevations[n_idx]).abs());
                }
            }
            let slope = (max_diff * 10.0).min(1.0);

            // Gradient for wind
            let left_x = if x == 0 { cols - 1 } else { x - 1 };
            let right_x = if x + 1 == cols { 0 } else { x + 1 };
            let left = elevations[(y * cols + left_x) as usize];
            let right = elevations[(y * cols + right_x) as usize];
            let up = if y > 0 {
                elevations[idx - cols as usize]
            } else {
                elevation
            };
            let down = if y < rows - 1 {
                elevations[idx + cols as usize]
            } else {
                elevation
            };
            let grad_x = right - left;
            let grad_y = down - up;

            let windward = climate_sim.is_windward(grad_x, grad_y);
            let temperature = climate_sim.get_temperature(normalized_y, elevation, ocean, nx, ny);
            let precipitation =
                climate_sim.get_precipitation(elevation, ocean, windward, normalized_y, nx, ny);
            let wind_exposure = climate_sim.get_wind_exposure(elevation, slope, nx, ny);
            let moisture = (precipitation + hydrology.flow[idx] * 0.3).min(1.0);

            let vegetation_density = if elevation >= water_level {
                (moisture * 0.5
                    + if temperature > 0.0 && temperature < 35.0 {
                        0.3
                    } else {
                        0.0
                    }
                    + if precipitation > 0.3 { 0.2 } else { 0.0 }
                    - rad * 0.5
                    - volcanic * 0.5
                    - slope * 0.3)
                    .clamp(0.0, 1.0)
            } else {
                0.0
            };

            let biome = classify_biome(
                temperature,
                precipitation,
                elevation,
                volcanic,
                rad,
                water_level,
            );
            let soil_type = classify_soil(elevation, moisture, temperature, volcanic, rad);

            let mut minerals = Vec::new();
            let mv = (noise_manager.sample_climate(nx, ny, 3.2) + 1.0) / 2.0;
            if stress > 0.5 && mv > 0.6 {
                minerals.push(MineralType::Iron);
            }
            if elevation > 0.35 && elevation < 0.5 && volcanic < 0.2 && mv > 0.7 {
                minerals.push(MineralType::FuelDeposit);
            }

            let elevation_meters = if elevation < water_level {
                -11000.0 * (1.0 - elevation / water_level)
            } else {
                ((elevation - water_level) / (1.0 - water_level)) * 8848.0
            };

            TerrainCell {
                x: x as f64,
                y: y as f64,
                elevation,
                elevation_meters,
                tectonic_stress: stress,
                volcanic_activity: volcanic,
                slope,
                temperature,
                moisture,
                precipitation,
                wind_exposure,
                water_table_depth: hydrology.water_table[idx],
                river_flow: hydrology.flow[idx],
                is_lake: hydrology.is_lake[idx],
                vegetation_density,
                soil_type,
                mineral_deposits: minerals,
                radiation_level: rad,
                biome: biome.clone(),
                color: get_biome_color(&biome).to_string(),
            }
        })
        .collect();

    emit_progress(&mut on_progress, 100.0, "Completed");

    Ok(WorldData { cells, cols, rows })
}
