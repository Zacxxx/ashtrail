use crate::raster::neighbors8;

/// Stage 9: Postprocessing for CK3-style province cleanup.
/// - Enforce contiguity (one connected component per province)
/// - Merge tiny provinces into neighbors
/// - Border smoothing via majority filter

pub fn postprocess_provinces(
    labels: &mut Vec<u32>,
    landmask: &[bool],
    width: u32,
    height: u32,
    min_area: u32,
    smooth_iterations: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) {
    let _n = (width * height) as usize;
    let _no_label = u32::MAX;

    on_progress(0.0, "Enforcing contiguity");
    enforce_contiguity(labels, landmask, width, height);

    on_progress(30.0, "Merging tiny provinces");
    merge_tiny_provinces(labels, landmask, width, height, min_area);

    on_progress(60.0, "Smoothing borders");
    for iter in 0..smooth_iterations {
        let progress = 60.0 + (iter as f32 / smooth_iterations as f32) * 35.0;
        on_progress(
            progress,
            &format!("Smoothing pass {}/{}", iter + 1, smooth_iterations),
        );
        majority_filter(labels, landmask, width, height);
    }

    on_progress(100.0, "Postprocessing complete");
}

/// For each province, keep only the largest connected component.
/// Reassign orphaned pixels to the nearest province by shared border.
fn enforce_contiguity(labels: &mut [u32], _landmask: &[bool], width: u32, height: u32) {
    let n = (width * height) as usize;
    let no_label = u32::MAX;

    // Find all unique province IDs
    let mut province_ids: Vec<u32> = labels.iter().filter(|&&l| l != no_label).cloned().collect();
    province_ids.sort();
    province_ids.dedup();

    let mut visited = vec![false; n];

    for &pid in &province_ids {
        // Find all connected components for this province
        let mut components: Vec<Vec<usize>> = Vec::new();

        for i in 0..n {
            if labels[i] == pid && !visited[i] {
                // Flood fill
                let mut component = Vec::new();
                let mut stack = vec![i];
                visited[i] = true;

                while let Some(ci) = stack.pop() {
                    component.push(ci);
                    let x = (ci % width as usize) as u32;
                    let y = (ci / width as usize) as u32;
                    for (_, _, ni) in neighbors8(x, y, width, height) {
                        if !visited[ni] && labels[ni] == pid {
                            visited[ni] = true;
                            stack.push(ni);
                        }
                    }
                }
                components.push(component);
            }
        }

        if components.len() <= 1 {
            continue;
        }

        // Keep largest, reassign rest
        let largest_idx = components
            .iter()
            .enumerate()
            .max_by_key(|(_, c)| c.len())
            .map(|(i, _)| i)
            .unwrap();

        for (ci, component) in components.iter().enumerate() {
            if ci == largest_idx {
                continue;
            }
            // Reassign to the most common neighbor province
            for &pixel_idx in component {
                let x = (pixel_idx % width as usize) as u32;
                let y = (pixel_idx / width as usize) as u32;
                let mut best_neighbor = no_label;
                let mut best_count = 0u32;
                let mut neighbor_counts = std::collections::HashMap::new();

                for (_, _, ni) in neighbors8(x, y, width, height) {
                    let nl = labels[ni];
                    if nl != pid && nl != no_label {
                        *neighbor_counts.entry(nl).or_insert(0u32) += 1;
                    }
                }

                for (nl, count) in neighbor_counts {
                    if count > best_count {
                        best_count = count;
                        best_neighbor = nl;
                    }
                }

                if best_neighbor != no_label {
                    labels[pixel_idx] = best_neighbor;
                }
            }
        }
    }
}

/// Merge provinces smaller than min_area into their best neighbor.
fn merge_tiny_provinces(
    labels: &mut [u32],
    _landmask: &[bool],
    width: u32,
    height: u32,
    min_area: u32,
) {
    let n = (width * height) as usize;
    let no_label = u32::MAX;

    loop {
        // Count areas
        let mut area_map = std::collections::HashMap::new();
        for i in 0..n {
            if labels[i] != no_label {
                *area_map.entry(labels[i]).or_insert(0u32) += 1;
            }
        }

        // Find provinces below min_area
        let tiny: Vec<u32> = area_map
            .iter()
            .filter(|(_, &area)| area < min_area)
            .map(|(&id, _)| id)
            .collect();

        if tiny.is_empty() {
            break;
        }

        for &pid in &tiny {
            // Find the neighbor with the longest shared border
            let mut border_counts: std::collections::HashMap<u32, u32> =
                std::collections::HashMap::new();

            for i in 0..n {
                if labels[i] != pid {
                    continue;
                }
                let x = (i % width as usize) as u32;
                let y = (i / width as usize) as u32;
                for (_, _, ni) in neighbors8(x, y, width, height) {
                    let nl = labels[ni];
                    if nl != pid && nl != no_label {
                        *border_counts.entry(nl).or_insert(0) += 1;
                    }
                }
            }

            if let Some((&best_neighbor, _)) = border_counts.iter().max_by_key(|(_, &c)| c) {
                // Merge: relabel all pixels
                for i in 0..n {
                    if labels[i] == pid {
                        labels[i] = best_neighbor;
                    }
                }
            }
        }
    }
}

/// Border smoothing: majority filter on boundary pixels only.
fn majority_filter(labels: &mut [u32], _landmask: &[bool], width: u32, height: u32) {
    let n = (width * height) as usize;
    let no_label = u32::MAX;
    let original = labels.to_vec();

    for i in 0..n {
        if original[i] == no_label {
            continue;
        }

        let x = (i % width as usize) as u32;
        let y = (i / width as usize) as u32;
        let neighbors = neighbors8(x, y, width, height);

        // Check if this is a border pixel
        let is_border = neighbors
            .iter()
            .any(|(_, _, ni)| original[*ni] != original[i] && original[*ni] != no_label);
        if !is_border {
            continue;
        }

        // Count neighbor labels
        let mut counts = std::collections::HashMap::new();
        for (_, _, ni) in &neighbors {
            let nl = original[*ni];
            if nl != no_label {
                *counts.entry(nl).or_insert(0u32) += 1;
            }
        }

        // If 6+ of 8 neighbors are another label, flip
        if let Some((&majority_label, &count)) = counts.iter().max_by_key(|(_, &c)| c) {
            if count >= 6 && majority_label != original[i] {
                labels[i] = majority_label;
            }
        }
    }
}
