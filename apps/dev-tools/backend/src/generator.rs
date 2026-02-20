use geo_core::{
    generate_world_with_progress_and_cancel as generate_world_with_progress_and_cancel_core,
    GenerationProgress, SimulationConfig, TerrainCell,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTerrainRequest {
    pub config: SimulationConfig,
    pub cols: u32,
    pub rows: u32,
    pub km_per_cell: f64,
    pub octaves: u32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTerrainResponse {
    pub cols: u32,
    pub rows: u32,
    pub cell_data: Vec<TerrainCell>,
    pub cell_colors: Vec<String>,
}

pub fn request_cache_key(request: &GenerateTerrainRequest) -> Result<String, String> {
    const GENERATOR_VERSION: &str = "planet-gen-v3";
    let payload =
        serde_json::to_vec(request).map_err(|e| format!("failed to serialize request: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(GENERATOR_VERSION.as_bytes());
    hasher.update(payload);
    let digest = hasher.finalize();
    Ok(format!("{digest:x}"))
}

pub fn load_cached_response(
    cache_root: &Path,
    key: &str,
) -> Result<Option<GenerateTerrainResponse>, String> {
    let path = cache_root.join(format!("{key}.json"));
    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path)
        .map_err(|e| format!("failed to read cache file {}: {e}", path.display()))?;
    let response: GenerateTerrainResponse = serde_json::from_str(&text)
        .map_err(|e| format!("failed to parse cache file {}: {e}", path.display()))?;
    Ok(Some(response))
}

pub fn save_cached_response(
    cache_root: &Path,
    key: &str,
    response: &GenerateTerrainResponse,
) -> Result<(), String> {
    fs::create_dir_all(cache_root).map_err(|e| {
        format!(
            "failed to create cache directory {}: {e}",
            cache_root.display()
        )
    })?;
    let path = cache_root.join(format!("{key}.json"));
    let serialized = serde_json::to_string(response)
        .map_err(|e| format!("failed to serialize cached response: {e}"))?;
    fs::write(&path, serialized)
        .map_err(|e| format!("failed to write cache file {}: {e}", path.display()))?;
    Ok(())
}

pub fn generate_world_with_progress_and_cancel<F, C>(
    request: GenerateTerrainRequest,
    on_progress: F,
    should_cancel: C,
) -> Result<GenerateTerrainResponse, String>
where
    F: FnMut(GenerationProgress),
    C: FnMut() -> bool,
{
    let world = generate_world_with_progress_and_cancel_core(
        request.config,
        request.cols,
        request.rows,
        request.km_per_cell,
        request.octaves,
        on_progress,
        should_cancel,
    )?;

    let cell_colors = world.cells.iter().map(|c| c.color.clone()).collect();

    Ok(GenerateTerrainResponse {
        cols: world.cols,
        rows: world.rows,
        cell_data: world.cells,
        cell_colors,
    })
}
