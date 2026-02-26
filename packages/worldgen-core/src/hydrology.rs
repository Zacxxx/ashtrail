use crate::raster::neighbors8;

/// Stage 4: Rivers and flow accumulation using D8 algorithm.
/// From height field, compute flow direction and accumulation, extract river mask.
pub fn compute_rivers(
    height: &[u16],
    landmask: &[bool],
    width: u32,
    height_dim: u32,
    river_threshold: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> (Vec<u8>, Vec<u32>) {
    let n = (width * height_dim) as usize;

    on_progress(0.0, "Computing flow direction (D8)");

    // D8 flow direction: each cell flows to its lowest neighbor
    let mut flow_dir: Vec<Option<usize>> = vec![None; n];

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;
            if !landmask[i] {
                continue;
            }

            let neighbors = neighbors8(x, y, width, height_dim);
            let mut lowest_h = height[i];
            let mut lowest_idx = None;

            for (_, _, ni) in &neighbors {
                if height[*ni] < lowest_h {
                    lowest_h = height[*ni];
                    lowest_idx = Some(*ni);
                }
            }

            flow_dir[i] = lowest_idx;
        }
    }

    on_progress(40.0, "Computing flow accumulation");

    // Compute flow accumulation via topological sort
    // Count in-degrees
    let mut in_degree = vec![0u32; n];
    for i in 0..n {
        if let Some(target) = flow_dir[i] {
            in_degree[target] += 1;
        }
    }

    // Topological sort starting from sources (in_degree = 0 on land)
    let mut queue: Vec<usize> = Vec::new();
    let mut accumulation = vec![1u32; n]; // Each cell starts with 1 (itself)

    for i in 0..n {
        if landmask[i] && in_degree[i] == 0 {
            queue.push(i);
        }
    }

    // Set sea cells to 0
    for i in 0..n {
        if !landmask[i] {
            accumulation[i] = 0;
        }
    }

    on_progress(60.0, "Propagating flow");

    let mut head = 0;
    while head < queue.len() {
        let i = queue[head];
        head += 1;

        if let Some(target) = flow_dir[i] {
            accumulation[target] += accumulation[i];
            in_degree[target] -= 1;
            if in_degree[target] == 0 {
                queue.push(target);
            }
        }
    }

    on_progress(80.0, "Extracting river mask");

    // River mask: accumulation > threshold AND landmask
    let river_mask: Vec<u8> = (0..n)
        .map(|i| {
            if landmask[i] && accumulation[i] > river_threshold {
                255u8
            } else {
                0u8
            }
        })
        .collect();

    on_progress(100.0, "Rivers complete");
    (river_mask, accumulation)
}
