use crate::raster::neighbors8;
use crate::sampling::Seed;
use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// Priority queue entry for Dijkstra.
#[derive(Debug, Clone)]
struct DijkstraEntry {
    cost: f64,
    index: usize,
    source_id: u32,
}

impl PartialEq for DijkstraEntry {
    fn eq(&self, other: &Self) -> bool {
        self.cost == other.cost
    }
}

impl Eq for DijkstraEntry {}

impl Ord for DijkstraEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering for min-heap
        other
            .cost
            .partial_cmp(&self.cost)
            .unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for DijkstraEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Stage 8: Province growth via multi-source Dijkstra.
/// Labels every land pixel with a province ID.
/// Cost function considers slope, river crossings, and ridge crossings.
pub fn grow_provinces(
    seeds: &[Seed],
    height: &[u16],
    landmask: &[bool],
    river_mask: &[u8],
    width: u32,
    height_dim: u32,
    cost_slope: f64,
    cost_river: f64,
    cost_ridge: f64,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<u32> {
    let n = (width * height_dim) as usize;
    let no_label = u32::MAX;
    let mut labels = vec![no_label; n];
    let mut costs = vec![f64::MAX; n];

    on_progress(0.0, "Initializing Dijkstra");

    let mut heap = BinaryHeap::new();

    // Initialize with all seeds
    for seed in seeds {
        let i = (seed.y * width + seed.x) as usize;
        if i < n && landmask[i] {
            labels[i] = seed.id;
            costs[i] = 0.0;
            heap.push(DijkstraEntry {
                cost: 0.0,
                index: i,
                source_id: seed.id,
            });
        }
    }

    on_progress(5.0, "Growing provinces");

    let total_land: usize = landmask.iter().filter(|&&v| v).count();
    let mut labeled_count = seeds.len();
    let mut last_progress = 5.0f32;

    while let Some(entry) = heap.pop() {
        // Skip if this cell was already claimed at lower cost
        if entry.cost > costs[entry.index] {
            continue;
        }

        let x = (entry.index % width as usize) as u32;
        let y = (entry.index / width as usize) as u32;

        let neighbors = neighbors8(x, y, width, height_dim);

        for (nx, ny, ni) in neighbors {
            if !landmask[ni] {
                continue;
            }

            // Compute movement cost
            let base_cost = 1.0;

            // Slope penalty: relative height difference
            let h_diff = (height[ni] as f64 - height[entry.index] as f64).abs() / 65535.0;
            let slope_cost = h_diff * cost_slope * 100.0;

            // River crossing penalty
            let river_cost = if river_mask[ni] > 0 && river_mask[entry.index] == 0 {
                cost_river
            } else {
                0.0
            };

            // Ridge crossing: if going over a local maximum
            let ridge_cost = if height[ni] > height[entry.index] && h_diff > 0.01 {
                h_diff * cost_ridge * 50.0
            } else {
                0.0
            };

            // Diagonal movement costs sqrt(2)
            let dx = (nx as i32 - x as i32).abs();
            let dy = (ny as i32 - y as i32).abs();
            let diag_mul = if dx > 0 && dy > 0 { 1.414 } else { 1.0 };

            let total_cost =
                entry.cost + (base_cost + slope_cost + river_cost + ridge_cost) * diag_mul;

            if total_cost < costs[ni] {
                costs[ni] = total_cost;
                labels[ni] = entry.source_id;
                labeled_count += 1;

                heap.push(DijkstraEntry {
                    cost: total_cost,
                    index: ni,
                    source_id: entry.source_id,
                });

                // Progress update
                if labeled_count % 10000 == 0 {
                    let progress = 5.0 + (labeled_count as f32 / total_land as f32) * 90.0;
                    if progress - last_progress > 2.0 {
                        on_progress(progress, "Growing provinces");
                        last_progress = progress;
                    }
                }
            }
        }
    }

    on_progress(100.0, "Province growth complete");
    labels
}
