use rand::Rng;
use rand::SeedableRng;
use rand_pcg::Pcg64;

/// Seed point for province generation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Seed {
    pub id: u32,
    pub x: u32,
    pub y: u32,
}

/// Stage 7: Weighted Poisson disk seed placement.
/// Places N seeds distributed by suitability — denser where suitability is high.
pub fn place_seeds(
    suitability: &[f32],
    landmask: &[bool],
    width: u32,
    height: u32,
    target_count: u32,
    radius_min: f64,
    radius_max: f64,
    rng_seed: u64,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<Seed> {
    let n = (width * height) as usize;
    let mut rng = Pcg64::seed_from_u64(rng_seed);

    on_progress(0.0, "Building candidate pool");

    // Build weighted candidate list — probability proportional to suitability
    let mut candidates: Vec<(u32, u32, f32)> = Vec::new();
    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            if landmask[i] && suitability[i] > 0.01 {
                candidates.push((x, y, suitability[i]));
            }
        }
    }

    if candidates.is_empty() {
        on_progress(100.0, "No land pixels found");
        return Vec::new();
    }

    // Sort by suitability descending for weighted selection
    candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());

    // Compute cumulative weights for weighted random selection
    let total_weight: f64 = candidates.iter().map(|c| c.2 as f64).sum();
    let mut cum_weights: Vec<f64> = Vec::with_capacity(candidates.len());
    let mut running = 0.0f64;
    for c in &candidates {
        running += c.2 as f64 / total_weight;
        cum_weights.push(running);
    }

    on_progress(20.0, "Placing seeds via dart throwing");

    // Grid for spatial acceleration
    let cell_size = radius_min;
    let grid_w = (width as f64 / cell_size).ceil() as usize + 1;
    let grid_h = (height as f64 / cell_size).ceil() as usize + 1;
    let mut grid: Vec<Option<u32>> = vec![None; grid_w * grid_h];

    let mut seeds: Vec<Seed> = Vec::new();
    let max_attempts = target_count * 50;
    let mut attempts = 0u32;

    while (seeds.len() as u32) < target_count && attempts < max_attempts {
        attempts += 1;

        if attempts % 500 == 0 {
            let progress = 20.0 + (seeds.len() as f32 / target_count as f32) * 70.0;
            on_progress(progress, "Placing seeds");
        }

        // Weighted random pick
        let r: f64 = rng.gen();
        let pick_idx = match cum_weights.binary_search_by(|w| w.partial_cmp(&r).unwrap()) {
            Ok(i) => i,
            Err(i) => i.min(candidates.len() - 1),
        };

        let (x, y, suit) = candidates[pick_idx];

        // Compute local radius based on suitability
        let local_radius = radius_max - (radius_max - radius_min) * (suit as f64);

        // Check grid for existing seeds within radius
        let gx = (x as f64 / cell_size) as usize;
        let gy = (y as f64 / cell_size) as usize;
        let gr = (local_radius / cell_size).ceil() as usize + 1;

        let mut too_close = false;
        'check: for dy in 0..=(2 * gr) {
            let check_gy = if gy + gr >= dy {
                gy + gr - dy
            } else {
                continue;
            };
            if check_gy >= grid_h {
                continue;
            }
            for dx in 0..=(2 * gr) {
                let check_gx = if gx + gr >= dx {
                    gx + gr - dx
                } else {
                    continue;
                };
                if check_gx >= grid_w {
                    continue;
                }
                if let Some(existing_id) = grid[check_gy * grid_w + check_gx] {
                    let existing = &seeds[existing_id as usize];
                    let ddx = x as f64 - existing.x as f64;
                    let ddy = y as f64 - existing.y as f64;
                    // Handle x-wrapping
                    let ddx_wrap = ddx
                        .abs()
                        .min((ddx + width as f64).abs())
                        .min((ddx - width as f64).abs());
                    let dist = (ddx_wrap * ddx_wrap + ddy * ddy).sqrt();
                    if dist < local_radius {
                        too_close = true;
                        break 'check;
                    }
                }
            }
        }

        if !too_close {
            let id = seeds.len() as u32;
            seeds.push(Seed { id, x, y });
            if gx < grid_w && gy < grid_h {
                grid[gy * grid_w + gx] = Some(id);
            }
        }
    }

    on_progress(90.0, "Ensuring all islands have seeds");

    let mut has_seed_grid = vec![false; n];
    for s in &seeds {
        has_seed_grid[(s.y * width + s.x) as usize] = true;
    }

    let mut visited = vec![false; n];
    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            if landmask[i] && !visited[i] {
                // Flood fill to find component
                let mut best_suit = -1.0;
                let mut best_i = i;
                let mut has_seed = false;

                let mut stack = vec![i];
                visited[i] = true;

                use crate::raster::neighbors8;
                while let Some(ci) = stack.pop() {
                    let cx = (ci % width as usize) as u32;
                    let cy = (ci / width as usize) as u32;

                    if suitability[ci] > best_suit {
                        best_suit = suitability[ci];
                        best_i = ci;
                    }
                    if has_seed_grid[ci] {
                        has_seed = true;
                    }

                    for (_, _, ni) in neighbors8(cx, cy, width, height) {
                        if landmask[ni] && !visited[ni] {
                            visited[ni] = true;
                            stack.push(ni);
                        }
                    }
                }

                if !has_seed {
                    let id = seeds.len() as u32;
                    let bx = (best_i % width as usize) as u32;
                    let by = (best_i / width as usize) as u32;
                    seeds.push(Seed { id, x: bx, y: by });
                    has_seed_grid[best_i] = true;
                }
            }
        }
    }

    on_progress(100.0, &format!("Placed {} seeds", seeds.len()));
    seeds
}
