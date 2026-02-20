use crate::generator::{
    generate_world_with_progress_and_cancel, load_cached_response, request_cache_key,
    save_cached_response, GenerateTerrainRequest, GenerateTerrainResponse,
};
use geo_core::SimulationConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::VecDeque, fs, path::Path};

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HierarchyGenerateRequest {
    pub config: SimulationConfig,
    pub root_cols: u32,
    pub root_rows: u32,
    pub max_lod: u8,
    pub max_nodes: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegionBounds {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HierarchyNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub lod: u8,
    pub lod_name: String,
    pub seed: u32,
    pub cols: u32,
    pub rows: u32,
    pub km_per_cell: f64,
    pub octaves: u32,
    pub bounds: RegionBounds,
    pub cache_key: String,
    pub node_file: String,
    pub children: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlanetManifest {
    pub run_key: String,
    pub generated_at_utc: String,
    pub root_id: String,
    pub total_nodes: usize,
    pub max_lod: u8,
    pub nodes: Vec<HierarchyNode>,
}

fn lod_name(lod: u8) -> &'static str {
    match lod {
        0 => "Whole planet",
        1 => "Continents",
        2 => "Countries",
        3 => "Regions",
        4 => "Area",
        5 => "Local",
        _ => "Unknown",
    }
}

fn lod_params(lod: u8) -> (f64, u32, u32, u32) {
    match lod {
        0 => (100.0, 2, 360, 180),
        1 => (25.0, 3, 280, 160),
        2 => (8.0, 4, 220, 140),
        3 => (2.0, 5, 180, 120),
        4 => (0.5, 6, 140, 100),
        5 => (0.12, 7, 110, 90),
        _ => (0.12, 7, 110, 90),
    }
}

fn derive_seed(global_seed: u32, node_id: &str, lod: u8) -> u32 {
    let mut hasher = Sha256::new();
    hasher.update(global_seed.to_le_bytes());
    hasher.update(node_id.as_bytes());
    hasher.update([lod]);
    let digest = hasher.finalize();
    u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]])
}

fn request_run_key(request: &HierarchyGenerateRequest) -> Result<String, String> {
    let payload =
        serde_json::to_vec(request).map_err(|e| format!("serialize run request failed: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(payload);
    Ok(format!("{:x}", hasher.finalize()))
}

fn detect_continent_bounds(world: &GenerateTerrainResponse, water_level: f64) -> Vec<RegionBounds> {
    let cols = world.cols as usize;
    let rows = world.rows as usize;
    if cols == 0 || rows == 0 {
        return Vec::new();
    }

    let mut visited = vec![false; cols * rows];
    let mut bounds = Vec::new();

    for y in 0..rows {
        for x in 0..cols {
            let idx = y * cols + x;
            if visited[idx] {
                continue;
            }
            visited[idx] = true;

            let elev = world.cell_data[idx].elevation;
            if elev < water_level {
                continue;
            }

            let mut q = VecDeque::new();
            q.push_back((x, y));
            let mut min_x = x;
            let mut min_y = y;
            let mut max_x = x;
            let mut max_y = y;
            let mut size = 0usize;

            while let Some((cx, cy)) = q.pop_front() {
                size += 1;
                min_x = min_x.min(cx);
                min_y = min_y.min(cy);
                max_x = max_x.max(cx);
                max_y = max_y.max(cy);

                for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= cols as i32 || ny >= rows as i32 {
                        continue;
                    }
                    let nux = nx as usize;
                    let nuy = ny as usize;
                    let nidx = nuy * cols + nux;
                    if visited[nidx] {
                        continue;
                    }
                    visited[nidx] = true;
                    if world.cell_data[nidx].elevation >= water_level {
                        q.push_back((nux, nuy));
                    }
                }
            }

            if size < 40 {
                continue;
            }

            bounds.push(RegionBounds {
                min_x: min_x as f32 / cols as f32,
                min_y: min_y as f32 / rows as f32,
                max_x: (max_x + 1) as f32 / cols as f32,
                max_y: (max_y + 1) as f32 / rows as f32,
            });
        }
    }

    bounds.sort_by(|a, b| {
        let aa = (a.max_x - a.min_x) * (a.max_y - a.min_y);
        let bb = (b.max_x - b.min_x) * (b.max_y - b.min_y);
        bb.partial_cmp(&aa).unwrap_or(std::cmp::Ordering::Equal)
    });
    if bounds.is_empty() {
        vec![RegionBounds {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        }]
    } else {
        bounds
    }
}

fn subdivide(bounds: &RegionBounds) -> Vec<RegionBounds> {
    let mid_x = (bounds.min_x + bounds.max_x) * 0.5;
    let mid_y = (bounds.min_y + bounds.max_y) * 0.5;
    vec![
        RegionBounds {
            min_x: bounds.min_x,
            min_y: bounds.min_y,
            max_x: mid_x,
            max_y: mid_y,
        },
        RegionBounds {
            min_x: mid_x,
            min_y: bounds.min_y,
            max_x: bounds.max_x,
            max_y: mid_y,
        },
        RegionBounds {
            min_x: bounds.min_x,
            min_y: mid_y,
            max_x: mid_x,
            max_y: bounds.max_y,
        },
        RegionBounds {
            min_x: mid_x,
            min_y: mid_y,
            max_x: bounds.max_x,
            max_y: bounds.max_y,
        },
    ]
}

fn cache_load_or_generate(
    cache_root: &Path,
    request: &GenerateTerrainRequest,
) -> Result<(String, GenerateTerrainResponse), String> {
    let key = request_cache_key(request)?;
    if let Some(hit) = load_cached_response(cache_root, &key)? {
        return Ok((key, hit));
    }

    let response = generate_world_with_progress_and_cancel(request.clone(), |_| {}, || false)?;
    save_cached_response(cache_root, &key, &response)?;
    Ok((key, response))
}

pub fn generate_full_planet_hierarchy(
    request: HierarchyGenerateRequest,
    cache_root: &Path,
    output_root: &Path,
) -> Result<PlanetManifest, String> {
    let run_key = request_run_key(&request)?;
    let run_dir = output_root.join(&run_key);
    let node_dir = run_dir.join("nodes");

    let manifest_path = run_dir.join("manifest.json");
    if manifest_path.exists() {
        let text = fs::read_to_string(&manifest_path).map_err(|e| {
            format!(
                "failed to read existing manifest {}: {e}",
                manifest_path.display()
            )
        })?;
        let manifest: PlanetManifest = serde_json::from_str(&text).map_err(|e| {
            format!(
                "failed to parse existing manifest {}: {e}",
                manifest_path.display()
            )
        })?;
        return Ok(manifest);
    }

    fs::create_dir_all(&node_dir).map_err(|e| {
        format!(
            "failed to create node directory {}: {e}",
            node_dir.display()
        )
    })?;

    let mut nodes: Vec<HierarchyNode> = Vec::new();

    let (km0, oct0, _, _) = lod_params(0);
    let root_req = GenerateTerrainRequest {
        config: request.config.clone(),
        cols: request.root_cols,
        rows: request.root_rows,
        km_per_cell: km0,
        octaves: oct0,
    };
    let (root_cache_key, root_world) = cache_load_or_generate(cache_root, &root_req)?;

    let root_id = "lod0-root".to_string();
    let root_file = format!("nodes/{root_id}.json");
    fs::write(
        node_dir.join(format!("{root_id}.json")),
        serde_json::to_string(&root_world).unwrap(),
    )
    .map_err(|e| format!("failed to write root node world: {e}"))?;

    let mut root_node = HierarchyNode {
        id: root_id.clone(),
        parent_id: None,
        lod: 0,
        lod_name: lod_name(0).to_string(),
        seed: request.config.world.seed,
        cols: request.root_cols,
        rows: request.root_rows,
        km_per_cell: km0,
        octaves: oct0,
        bounds: RegionBounds {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        },
        cache_key: root_cache_key,
        node_file: root_file,
        children: Vec::new(),
    };

    let mut frontier: Vec<HierarchyNode> = Vec::new();
    let continents = detect_continent_bounds(&root_world, request.config.world.ocean_coverage);

    for (i, bounds) in continents.iter().enumerate() {
        if nodes.len() + frontier.len() + 1 >= request.max_nodes {
            break;
        }
        let id = format!("lod1-continent-{i}");
        root_node.children.push(id.clone());
        frontier.push(HierarchyNode {
            id,
            parent_id: Some(root_id.clone()),
            lod: 1,
            lod_name: lod_name(1).to_string(),
            seed: 0,
            cols: 0,
            rows: 0,
            km_per_cell: 0.0,
            octaves: 0,
            bounds: bounds.clone(),
            cache_key: String::new(),
            node_file: String::new(),
            children: Vec::new(),
        });
    }

    nodes.push(root_node);

    let mut idx = 0usize;
    while idx < frontier.len() {
        if nodes.len() >= request.max_nodes {
            break;
        }

        let mut node = frontier[idx].clone();
        idx += 1;

        if node.lod > request.max_lod {
            continue;
        }

        let (km, oct, default_cols, default_rows) = lod_params(node.lod);
        let area = ((node.bounds.max_x - node.bounds.min_x)
            * (node.bounds.max_y - node.bounds.min_y))
            .max(0.02);
        let scale = area.sqrt();
        let cols = ((default_cols as f32 * scale).round() as u32).max(64);
        let rows = ((default_rows as f32 * scale).round() as u32).max(48);

        let seed = derive_seed(request.config.world.seed, &node.id, node.lod);
        let mut cfg = request.config.clone();
        cfg.world.seed = seed;

        let req = GenerateTerrainRequest {
            config: cfg,
            cols,
            rows,
            km_per_cell: km,
            octaves: oct,
        };

        let (cache_key, world) = cache_load_or_generate(cache_root, &req)?;
        let node_file_name = format!("{}.json", node.id);
        fs::write(
            node_dir.join(&node_file_name),
            serde_json::to_string(&world).unwrap(),
        )
        .map_err(|e| format!("failed to write node {} world: {e}", node.id))?;

        node.seed = seed;
        node.cols = cols;
        node.rows = rows;
        node.km_per_cell = km;
        node.octaves = oct;
        node.cache_key = cache_key;
        node.node_file = format!("nodes/{node_file_name}");

        if node.lod < request.max_lod {
            for (child_idx, b) in subdivide(&node.bounds).into_iter().enumerate() {
                if nodes.len() + frontier.len() + 1 >= request.max_nodes {
                    break;
                }
                let child_id = format!("{}-c{}", node.id, child_idx);
                node.children.push(child_id.clone());
                frontier.push(HierarchyNode {
                    id: child_id,
                    parent_id: Some(node.id.clone()),
                    lod: node.lod + 1,
                    lod_name: lod_name(node.lod + 1).to_string(),
                    seed: 0,
                    cols: 0,
                    rows: 0,
                    km_per_cell: 0.0,
                    octaves: 0,
                    bounds: b,
                    cache_key: String::new(),
                    node_file: String::new(),
                    children: Vec::new(),
                });
            }
        }

        nodes.push(node);
    }

    let manifest = PlanetManifest {
        run_key: run_key.clone(),
        generated_at_utc: chrono::Utc::now().to_rfc3339(),
        root_id,
        total_nodes: nodes.len(),
        max_lod: request.max_lod,
        nodes,
    };

    fs::create_dir_all(&run_dir)
        .map_err(|e| format!("failed to create run directory {}: {e}", run_dir.display()))?;
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .map_err(|e| format!("failed to write manifest {}: {e}", manifest_path.display()))?;

    Ok(manifest)
}
