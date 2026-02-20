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
    let mut never_cancel = || false;
    let mut ignore_progress = |_progress: f32, _stage: &'static str| {};
    // This never returns Err because cancellation is disabled.
    simulate_hydrology_with_cancel(
        elevations,
        moisture,
        cols,
        rows,
        water_level,
        &mut never_cancel,
        &mut ignore_progress,
    )
    .expect("simulate_hydrology_with_cancel should not fail when cancellation is disabled")
}

pub fn simulate_hydrology_with_cancel<F, P>(
    elevations: &[f64],
    moisture: &[f64],
    cols: u32,
    rows: u32,
    water_level: f64,
    should_cancel: &mut F,
    on_progress: &mut P,
) -> Result<HydrologyResult, String>
where
    F: FnMut() -> bool,
    P: FnMut(f32, &'static str),
{
    if should_cancel() {
        return Err("cancelled".to_string());
    }

    let total_cells = (cols * rows) as usize;
    let mut flow = vec![0.0; total_cells];
    let mut is_lake = vec![false; total_cells];
    let mut water_table = vec![0.0; total_cells];
    on_progress(5.0, "Hydrology: sorting elevations");

    // ── Step 1: Sort indices by elevation (highest first) ──
    let mut indices: Vec<usize> = (0..total_cells).collect();
    indices.sort_by(|&a, &b| elevations[b].partial_cmp(&elevations[a]).unwrap());
    if should_cancel() {
        return Err("cancelled".to_string());
    }

    // ── Step 2: Flow accumulation (D8) ──
    on_progress(20.0, "Hydrology: flow accumulation");
    let dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    let dy = [-1, -1, -1, 0, 0, 1, 1, 1];
    let step_flow = (total_cells / 20).max(1);

    for (iter_i, idx) in indices.into_iter().enumerate() {
        if iter_i % step_flow == 0 {
            if should_cancel() {
                return Err("cancelled".to_string());
            }
            let t = iter_i as f32 / total_cells as f32;
            on_progress(20.0 + (55.0 - 20.0) * t, "Hydrology: flow accumulation");
        }

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
            let nx = (x + dx[d]).rem_euclid(cols as i32);
            let ny = y + dy[d];
            if ny < 0 || ny >= rows as i32 {
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
    if should_cancel() {
        return Err("cancelled".to_string());
    }
    on_progress(60.0, "Hydrology: normalizing flow");
    let max_flow = flow.iter().fold(0.0f64, |a, &b| a.max(b));
    if max_flow > 0.0 {
        for f in flow.iter_mut() {
            *f /= max_flow;
        }
    }

    // ── Step 4: Water table ──
    if should_cancel() {
        return Err("cancelled".to_string());
    }
    on_progress(70.0, "Hydrology: computing water table");
    let step_water = (total_cells / 20).max(1);
    for i in 0..total_cells {
        if i % step_water == 0 {
            if should_cancel() {
                return Err("cancelled".to_string());
            }
            let t = i as f32 / total_cells as f32;
            on_progress(70.0 + (85.0 - 70.0) * t, "Hydrology: computing water table");
        }
        let elev = elevations[i];
        let moist = moisture[i];
        let river_prox = flow[i];

        water_table[i] = (elev * 0.6 - moist * 0.3 - river_prox * 0.3 + 0.2)
            .max(0.0)
            .min(1.0);
    }

    // ── Step 5: Detect lake basins (Flood fill) ──
    if should_cancel() {
        return Err("cancelled".to_string());
    }
    on_progress(88.0, "Hydrology: detecting lake basins");
    let step_lakes = (total_cells / 20).max(1);
    let mut lake_region_visited = vec![false; total_cells];
    for i in 0..total_cells {
        if i % step_lakes == 0 {
            if should_cancel() {
                return Err("cancelled".to_string());
            }
            let t = i as f32 / total_cells as f32;
            on_progress(88.0 + (99.0 - 88.0) * t, "Hydrology: detecting lake basins");
        }
        if !is_lake[i] || elevations[i] < water_level || lake_region_visited[i] {
            continue;
        }

        if is_lake[i] && elevations[i] >= water_level {
            let mut queue = VecDeque::new();
            queue.push_back(i);
            let mut visited = vec![false; total_cells];
            visited[i] = true;
            lake_region_visited[i] = true;

            while let Some(current) = queue.pop_front() {
                if should_cancel() {
                    return Err("cancelled".to_string());
                }
                let cx = (current % cols as usize) as i32;
                let cy = (current / cols as usize) as i32;

                for d in 0..8 {
                    let nx = (cx + dx[d]).rem_euclid(cols as i32);
                    let ny = cy + dy[d];
                    if ny < 0 || ny >= rows as i32 {
                        continue;
                    }
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    if visited[n_idx] {
                        continue;
                    }

                    if (elevations[n_idx] - elevations[current]).abs() < 0.01 {
                        is_lake[n_idx] = true;
                        lake_region_visited[n_idx] = true;
                        visited[n_idx] = true;
                        queue.push_back(n_idx);
                    }
                }
            }
        }
    }
    on_progress(100.0, "Hydrology: complete");

    Ok(HydrologyResult {
        flow,
        is_lake,
        water_table,
    })
}
