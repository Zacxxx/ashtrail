mod biomes;
mod climate;
mod color_utils;
mod geo_noise;
mod hydrology;
mod types;

use crate::biomes::{classify_biome, classify_soil, get_biome_color};
use crate::climate::ClimateSimulator;
use crate::geo_noise::NoiseManager;
use crate::hydrology::simulate_hydrology;
use noise::NoiseFn;

pub use crate::types::{ClimateConfig, GeoConfig, SimulationConfig, TerrainCell, WorldConfig, WorldData};
use crate::types::MineralType;

pub fn generate_world(
    config: SimulationConfig,
    cols: u32,
    rows: u32,
    km_per_cell: f64,
    octaves: u32,
) -> Result<WorldData, String> {
    if cols == 0 || rows == 0 {
        return Err("cols and rows must be greater than 0".to_string());
    }

    let total = (cols * rows) as usize;
    let water_level = config.world.ocean_coverage;

    let noise_manager = NoiseManager::new(config.world.seed, config.geo.clone());
    let climate_sim = ClimateSimulator::new(&config.climate, &noise_manager);

    let mut elevations = vec![0.0; total];
    let mut tectonic_stress = vec![0.0; total];
    let mut volcanic_activity = vec![0.0; total];
    let mut radiation = vec![0.0; total];

    for y in 0..rows {
        for x in 0..cols {
            let idx = (y * cols + x) as usize;
            let wx = x as f64 * km_per_cell;
            let wy = y as f64 * km_per_cell;

            let (plate_idx, _d1, boundary_proximity) = noise_manager.get_plate_info(wx, wy);
            let plate = &noise_manager.plate_seeds[plate_idx];

            let mut elev = plate.base_elevation;
            let shape_noise = noise_manager.get_fbm(
                &noise_manager.continental_noise,
                wx,
                wy,
                config.geo.continental_scale,
                3.min(octaves),
                config.geo.persistence,
                config.geo.lacunarity,
            ) * 0.12;

            elev += shape_noise;

            if plate.is_continental && boundary_proximity > 0.6 {
                let shelf_drop = (boundary_proximity - 0.6) / 0.4;
                elev -= shelf_drop * 0.15;
            }
            elev = elev.max(0.0).min(1.0);

            let stress = (boundary_proximity.max(0.0).powi(2) * config.geo.tectonic_intensity).min(1.0);
            tectonic_stress[idx] = stress;

            let mut ridges = 0.0;
            if stress >= 0.15 {
                let m_scale = config.geo.continental_scale * 0.3;
                let ridge_height = (noise_manager.get_fbm(
                    &noise_manager.mountain_noise,
                    wx,
                    wy,
                    m_scale,
                    5.min(octaves),
                    0.45,
                    2.2,
                ) + 1.0)
                    / 2.0;
                ridges = ridge_height * stress * 0.45;
            }

            let detail = (noise_manager.get_fbm(
                &noise_manager.detail_noise,
                wx,
                wy,
                config.geo.continental_scale * 0.15,
                octaves,
                config.geo.persistence,
                config.geo.lacunarity,
            ) + 1.0)
                / 2.0
                * 0.06;

            elevations[idx] = (elev + ridges + detail).max(0.0).min(1.0);

            let volcanic_base = (noise_manager.climate_noise.get([wx / 200.0, wy / 200.0]) + 1.0) / 2.0;
            let tectonic_influence = stress * 0.6;
            let hotspot = volcanic_base.powi(3) * config.geo.volcanic_density;
            volcanic_activity[idx] = (tectonic_influence + hotspot).min(1.0);

            let rad = (noise_manager.climate_noise.get([wx / 400.0, wy / 400.0]) + 1.0) / 2.0;
            radiation[idx] = (rad - 0.7).max(0.0).powi(2) / 0.3f64.powi(2);
        }
    }

    let mut moisture_base = vec![0.0; total];
    for i in 0..total {
        let wx = (i as u32 % cols) as f64 * km_per_cell;
        let wy = (i as u32 / cols) as f64 * km_per_cell;
        moisture_base[i] = climate_sim.get_precipitation(elevations[i], 0.5, true, wx, wy);
    }
    let hydrology = simulate_hydrology(&elevations, &moisture_base, cols, rows, water_level);

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
        if dist[idx] >= max_dist {
            continue;
        }
        let cx = (idx as u32 % cols) as i32;
        let cy = (idx as u32 / cols) as i32;

        for (dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
            let nx = cx + dx;
            let ny = cy + dy;
            if nx < 0 || nx >= cols as i32 || ny < 0 || ny >= rows as i32 {
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

    let mut cells = Vec::with_capacity(total);
    for y in 0..rows {
        for x in 0..cols {
            let idx = (y * cols + x) as usize;
            let wx = x as f64 * km_per_cell;
            let wy = y as f64 * km_per_cell;

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
                let nx = cx + dx;
                let ny = cy + dy;
                if nx >= 0 && nx < cols as i32 && ny >= 0 && ny < rows as i32 {
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    max_diff = max_diff.max((elevation - elevations[n_idx]).abs());
                }
            }
            let slope = (max_diff * 10.0).min(1.0);

            let left = if x > 0 { elevations[idx - 1] } else { elevation };
            let right = if x < cols - 1 { elevations[idx + 1] } else { elevation };
            let up = if y > 0 { elevations[idx - cols as usize] } else { elevation };
            let down = if y < rows - 1 { elevations[idx + cols as usize] } else { elevation };
            let grad_x = right - left;
            let grad_y = down - up;

            let windward = climate_sim.is_windward(grad_x, grad_y);
            let temperature = climate_sim.get_temperature(normalized_y, elevation, ocean, wx, wy);
            let precipitation = climate_sim.get_precipitation(elevation, ocean, windward, wx, wy);
            let wind_exposure = climate_sim.get_wind_exposure(elevation, slope, wx, wy);
            let moisture = (precipitation + hydrology.flow[idx] * 0.3).min(1.0);

            let vegetation_density = if elevation >= water_level {
                (moisture * 0.5
                    + if temperature > 0.0 && temperature < 35.0 { 0.3 } else { 0.0 }
                    + if precipitation > 0.3 { 0.2 } else { 0.0 }
                    - rad * 0.5
                    - volcanic * 0.5
                    - slope * 0.3)
                    .max(0.0)
                    .min(1.0)
            } else {
                0.0
            };

            let biome = classify_biome(temperature, precipitation, elevation, volcanic, rad, water_level);
            let soil_type = classify_soil(elevation, moisture, temperature, volcanic, rad);

            let mut minerals = Vec::new();
            let mv = (noise_manager.climate_noise.get([wx / 150.0, wy / 150.0]) + 1.0) / 2.0;
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
    }

    Ok(WorldData { cells, cols, rows })
}
