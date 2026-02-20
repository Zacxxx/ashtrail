use std::collections::VecDeque;

pub struct HydrologyResult {
    pub flow: Vec<f64>,
    pub is_lake: Vec<bool>,
    pub water_table: Vec<f64>,
}

pub fn simulate_hydrology(
    elevations: &[f64],
    moisture: &[f64],
    cols: u32,
    rows: u32,
    water_level: f64,
) -> HydrologyResult {
    let total_cells = (cols * rows) as usize;
    let mut flow = vec![0.0; total_cells];
    let mut is_lake = vec![false; total_cells];
    let mut water_table = vec![0.0; total_cells];

    // ── Step 1: Sort indices by elevation (highest first) ──
    let mut indices: Vec<usize> = (0..total_cells).collect();
    indices.sort_by(|&a, &b| elevations[b].partial_cmp(&elevations[a]).unwrap());

    // ── Step 2: Flow accumulation (D8) ──
    let dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    let dy = [-1, -1, -1, 0, 0, 1, 1, 1];

    for idx in indices {
        let elev = elevations[idx];
        if elev < water_level {
            continue;
        }

        flow[idx] += moisture[idx] * 0.01;

        let x = (idx % cols as usize) as i32;
        let y = (idx / cols as usize) as i32;

        let mut lowest_elev = elev;
        let mut lowest_idx = None;

        for d in 0..8 {
            let nx = x + dx[d];
            let ny = y + dy[d];
            if nx < 0 || nx >= cols as i32 || ny < 0 || ny >= rows as i32 {
                continue;
            }
            let n_idx = (ny * cols as i32 + nx) as usize;
            if elevations[n_idx] < lowest_elev {
                lowest_elev = elevations[n_idx];
                lowest_idx = Some(n_idx);
            }
        }

        if let Some(l_idx) = lowest_idx {
            flow[l_idx] += flow[idx];
        } else {
            is_lake[idx] = true;
        }
    }

    // ── Step 3: Normalize flow ──
    let max_flow = flow.iter().fold(0.0f64, |a, &b| a.max(b));
    if max_flow > 0.0 {
        for f in flow.iter_mut() {
            *f /= max_flow;
        }
    }

    // ── Step 4: Water table ──
    for i in 0..total_cells {
        let elev = elevations[i];
        let moist = moisture[i];
        let river_prox = flow[i];

        water_table[i] = (elev * 0.6 - moist * 0.3 - river_prox * 0.3 + 0.2)
            .max(0.0)
            .min(1.0);
    }

    // ── Step 5: Detect lake basins (Flood fill) ──
    for i in 0..total_cells {
        if is_lake[i] && elevations[i] >= water_level {
            let mut queue = VecDeque::new();
            queue.push_back(i);
            let mut visited = std::collections::HashSet::new();
            visited.insert(i);

            while let Some(current) = queue.pop_front() {
                let cx = (current % cols as usize) as i32;
                let cy = (current / cols as usize) as i32;

                for d in 0..8 {
                    let nx = cx + dx[d];
                    let ny = cy + dy[d];
                    if nx < 0 || nx >= cols as i32 || ny < 0 || ny >= rows as i32 {
                        continue;
                    }
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    if visited.contains(&n_idx) {
                        continue;
                    }

                    if (elevations[n_idx] - elevations[current]).abs() < 0.01 {
                        is_lake[n_idx] = true;
                        visited.insert(n_idx);
                        queue.push_back(n_idx);
                    }
                }
            }
        }
    }

    HydrologyResult {
        flow,
        is_lake,
        water_table,
    }
}
