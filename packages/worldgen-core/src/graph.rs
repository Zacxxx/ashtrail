use crate::raster::neighbors8;
use serde::{Deserialize, Serialize};

/// Information about an edge between two provinces.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeInfo {
    pub neighbor_id: u32,
    pub shared_border_length: u32,
    pub crosses_river: bool,
    pub mean_border_height: f32,
}

/// Province adjacency info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceAdjacency {
    pub province_id: u32,
    pub neighbors: Vec<EdgeInfo>,
}

/// Stage 10: Build adjacency graph from province labels.
pub fn build_adjacency(
    labels: &[u32],
    height: &[u16],
    river_mask: &[u8],
    width: u32,
    height_dim: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<ProvinceAdjacency> {
    let _n = (width * height_dim) as usize;
    let no_label = u32::MAX;

    on_progress(0.0, "Scanning border pixels");

    // Collect edge data: (id_a, id_b) -> (border_length, crosses_river, height_sum, count)
    let mut edge_data: std::collections::HashMap<(u32, u32), (u32, bool, f64, u32)> =
        std::collections::HashMap::new();

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;
            let label_a = labels[i];
            if label_a == no_label {
                continue;
            }

            for (_, _, ni) in neighbors8(x, y, width, height_dim) {
                let label_b = labels[ni];
                if label_b == no_label || label_b == label_a {
                    continue;
                }

                // Canonicalize edge direction
                let (lo, hi) = if label_a < label_b {
                    (label_a, label_b)
                } else {
                    (label_b, label_a)
                };

                let entry = edge_data.entry((lo, hi)).or_insert((0, false, 0.0, 0));
                entry.0 += 1;
                if river_mask[i] > 0 || river_mask[ni] > 0 {
                    entry.1 = true;
                }
                entry.2 += height[i] as f64;
                entry.3 += 1;
            }
        }

        if y % 200 == 0 {
            let progress = (y as f32 / height_dim as f32) * 90.0;
            on_progress(progress, "Scanning border pixels");
        }
    }

    on_progress(90.0, "Building adjacency list");

    // Collect all province IDs
    let mut province_ids: Vec<u32> = labels.iter().filter(|&&l| l != no_label).cloned().collect();
    province_ids.sort();
    province_ids.dedup();

    let mut adjacency: Vec<ProvinceAdjacency> = Vec::new();

    for &pid in &province_ids {
        let mut neighbors = Vec::new();

        for (&(lo, hi), &(border_len, crosses_river, height_sum, count)) in &edge_data {
            if lo == pid || hi == pid {
                let neighbor_id = if lo == pid { hi } else { lo };
                neighbors.push(EdgeInfo {
                    neighbor_id,
                    shared_border_length: border_len / 2, // Each edge counted from both sides
                    crosses_river,
                    mean_border_height: if count > 0 {
                        (height_sum / count as f64) as f32
                    } else {
                        0.0
                    },
                });
            }
        }

        neighbors.sort_by(|a, b| b.shared_border_length.cmp(&a.shared_border_length));
        adjacency.push(ProvinceAdjacency {
            province_id: pid,
            neighbors,
        });
    }

    on_progress(100.0, "Adjacency graph complete");
    adjacency
}
