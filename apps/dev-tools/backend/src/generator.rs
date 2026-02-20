use geo_core::{generate_world as generate_world_core, SimulationConfig, TerrainCell};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTerrainRequest {
    pub config: SimulationConfig,
    pub cols: u32,
    pub rows: u32,
    pub km_per_cell: f64,
    pub octaves: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateTerrainResponse {
    pub cols: u32,
    pub rows: u32,
    pub cell_data: Vec<TerrainCell>,
    pub cell_colors: Vec<String>,
}

pub fn generate_world(request: GenerateTerrainRequest) -> Result<GenerateTerrainResponse, String> {
    let world = generate_world_core(
        request.config,
        request.cols,
        request.rows,
        request.km_per_cell,
        request.octaves,
    )?;

    let cell_colors = world.cells.iter().map(|c| c.color.clone()).collect();

    Ok(GenerateTerrainResponse {
        cols: world.cols,
        rows: world.rows,
        cell_data: world.cells,
        cell_colors,
    })
}
