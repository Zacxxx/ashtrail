mod biomes;
mod climate;
mod color_utils;
mod geo_noise;
mod hydrology;
mod types;

use crate::biomes::{classify_biome, classify_soil, get_biome_color};
use crate::climate::ClimateSimulator;
use crate::geo_noise::NoiseManager;
use crate::hydrology::simulate_hydrology_with_cancel;
use crate::types::MineralType;

pub use crate::types::{ClimateConfig, GeoConfig, SimulationConfig, TerrainCell, WorldConfig, WorldData};

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

    let mut elevations = vec![0.0; total];
    let mut tectonic_stress = vec![0.0; total];
    let mut volcanic_activity = vec![0.0; total];
    let mut radiation = vec![0.0; total];

    emit_progress(&mut on_progress, 5.0, "Generating elevation and tectonics");

    let row_step_pass1 = (rows / 20).max(1);
    for y in 0..rows {
        for x in 0..cols {
            let idx = (y * cols + x) as usize;
            let nx = x as f64 / cols as f64;
            let ny = y as f64 / rows as f64;

            let (plate_idx, _d1, boundary_proximity) = noise_manager.get_plate_info(nx, ny);
            let plate = &noise_manager.plate_seeds[plate_idx];

            // RimWorld-style blend: micro perlin + macro ridged, modulated by
            // macro factor and continental mask, then biased for desired ocean ratio.
            let micro = noise_manager.get_fbm(
                &noise_manager.continental_noise,
                nx,
                ny,
                config.geo.continental_scale,
                3.min(octaves),
                config.geo.persistence,
                config.geo.lacunarity,
            );
            let macro_factor =
                (noise_manager.sample_noise3d(&noise_manager.warp_noise, nx, ny, 1.35) + 1.0) * 0.5;
            let macro_ridged = noise_manager.get_ridged_fbm(
                &noise_manager.mountain_noise,
                nx,
                ny,
                config.geo.continental_scale * 1.5,
                4.min(octaves),
                0.55,
                2.05,
            ) * macro_factor;
            let blend_factor = 0.52;
            let mut elev = micro * (1.0 - blend_factor) + macro_ridged * blend_factor;

            let mut continents =
                noise_manager.get_fbm(&noise_manager.detail_noise, nx, ny, config.geo.continental_scale * 2.2, 5, 0.5, 2.0);
            if config.world.ocean_coverage < 0.55 {
                continents = continents * 0.86 - 0.12;
            } else {
                continents = continents * 0.92 + 0.12;
            }
            elev = elev * 0.76 + continents * 0.24;
            elev = ((elev + 1.0) * 0.5).clamp(0.0, 1.0).powf(3.0);

            if plate.is_continental && boundary_proximity > 0.6 {
                let shelf_drop = (boundary_proximity - 0.6) / 0.4;
                elev -= shelf_drop * 0.15;
            }

            elev = elev.clamp(0.0, 1.0);

            let stress = (boundary_proximity.max(0.0).powi(2) * config.geo.tectonic_intensity).min(1.0);
            tectonic_stress[idx] = stress;

            let mut ridges = 0.0;
            if stress >= 0.15 {
                let m_scale = config.geo.continental_scale * 0.3;
                let ridge_height = (noise_manager.get_fbm(
                    &noise_manager.mountain_noise,
                    nx,
                    ny,
                    m_scale,
                    5.min(octaves),
                    0.45,
                    2.2,
                ) + 1.0)
                    / 2.0;
                ridges = ridge_height * stress * 0.45;
            }

            let mountain_lines = 1.0 - noise_manager.sample_noise3d(&noise_manager.warp_noise, nx, ny, 2.2).abs();
            let mountain_mask = (mountain_lines - 0.2).clamp(0.0, 1.0);
            ridges += mountain_mask.powf(2.2) * stress * 0.42;

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
                * 0.06;

            let hills_micro = noise_manager.sample_climate(nx, ny, 4.0);
            let hills_macro = noise_manager.sample_climate(nx, ny, 1.35);
            let hills_boost = if hills_micro > 0.36 && hills_macro > -0.25 && elev > water_level {
                0.03
            } else {
                0.0
            };

            elevations[idx] = (elev + ridges + detail + hills_boost).clamp(0.0, 1.0);

            let volcanic_base = (noise_manager.sample_climate(nx, ny, 2.2) + 1.0) / 2.0;
            let tectonic_influence = stress * 0.6;
            let hotspot = volcanic_base.powi(3) * config.geo.volcanic_density;
            volcanic_activity[idx] = (tectonic_influence + hotspot).min(1.0);

            let rad = (noise_manager.sample_climate(nx, ny, 1.2) + 1.0) / 2.0;
            radiation[idx] = (rad - 0.7).max(0.0).powi(2) / 0.3f64.powi(2);
        }

        if y % row_step_pass1 == 0 || y + 1 == rows {
            check_cancel(&mut should_cancel)?;
            let t = (y + 1) as f32 / rows as f32;
            emit_progress(
                &mut on_progress,
                5.0 + (55.0 - 5.0) * t,
                "Generating elevation and tectonics",
            );
        }
    }

    // Match desired ocean coverage by deriving sea level from elevation distribution.
    water_level = percentile(&elevations, config.world.ocean_coverage);

    emit_progress(&mut on_progress, 56.0, "Preparing hydrology inputs");

    let mut moisture_base = vec![0.0; total];
    let moisture_step = (total / 20).max(1);
    for i in 0..total {
        if i % moisture_step == 0 {
            check_cancel(&mut should_cancel)?;
            let t = i as f32 / total as f32;
            emit_progress(
                &mut on_progress,
                56.0 + (63.0 - 56.0) * t,
                "Preparing hydrology inputs",
            );
        }
        let x = i as u32 % cols;
        let y = i as u32 / cols;
        let nx = x as f64 / cols as f64;
        let ny = y as f64 / rows as f64;
        moisture_base[i] = climate_sim.get_precipitation(elevations[i], 0.5, true, ny, nx, ny);
    }
    emit_progress(&mut on_progress, 63.0, "Simulating hydrology");

    let mut hydrology_cancel = || should_cancel();
    let mut hydrology_progress = |p: f32, stage: &'static str| {
        emit_progress(&mut on_progress, 63.0 + (70.0 - 63.0) * (p / 100.0), stage);
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

    emit_progress(&mut on_progress, 70.0, "Computing ocean proximity");

    let mut ocean_proximity = vec![0.0; total];
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
        if idx % ((total / 25).max(1)) == 0 {
            check_cancel(&mut should_cancel)?;
        }
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
    for i in 0..total {
        ocean_proximity[i] = (1.0 - dist[i] / max_dist).max(0.0);
    }

    emit_progress(&mut on_progress, 75.0, "Finalizing terrain cells");

    let mut cells = Vec::with_capacity(total);
    let row_step_pass4 = (rows / 20).max(1);
    for y in 0..rows {
        for x in 0..cols {
            let idx = (y * cols + x) as usize;
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
            for (dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let nx = (cx + dx).rem_euclid(cols as i32);
                let ny = cy + dy;
                if ny >= 0 && ny < rows as i32 {
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    max_diff = max_diff.max((elevation - elevations[n_idx]).abs());
                }
            }
            let slope = (max_diff * 10.0).min(1.0);

            let left_x = if x == 0 { cols - 1 } else { x - 1 };
            let right_x = if x + 1 == cols { 0 } else { x + 1 };
            let left = elevations[(y * cols + left_x) as usize];
            let right = elevations[(y * cols + right_x) as usize];
            let up = if y > 0 { elevations[idx - cols as usize] } else { elevation };
            let down = if y < rows - 1 { elevations[idx + cols as usize] } else { elevation };
            let grad_x = right - left;
            let grad_y = down - up;

            let windward = climate_sim.is_windward(grad_x, grad_y);
            let temperature = climate_sim.get_temperature(normalized_y, elevation, ocean, nx, ny);
            let precipitation = climate_sim.get_precipitation(elevation, ocean, windward, normalized_y, nx, ny);
            let wind_exposure = climate_sim.get_wind_exposure(elevation, slope, nx, ny);
            let moisture = (precipitation + hydrology.flow[idx] * 0.3).min(1.0);

            let vegetation_density = if elevation >= water_level {
                (moisture * 0.5
                    + if temperature > 0.0 && temperature < 35.0 { 0.3 } else { 0.0 }
                    + if precipitation > 0.3 { 0.2 } else { 0.0 }
                    - rad * 0.5
                    - volcanic * 0.5
                    - slope * 0.3)
                    .clamp(0.0, 1.0)
            } else {
                0.0
            };

            let biome = classify_biome(temperature, precipitation, elevation, volcanic, rad, water_level);
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

            cells.push(TerrainCell {
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
            });
        }

        if y % row_step_pass4 == 0 || y + 1 == rows {
            check_cancel(&mut should_cancel)?;
            let t = (y + 1) as f32 / rows as f32;
            emit_progress(&mut on_progress, 75.0 + (98.0 - 75.0) * t, "Finalizing terrain cells");
        }
    }

    emit_progress(&mut on_progress, 100.0, "Completed");

    Ok(WorldData { cells, cols, rows })
}
