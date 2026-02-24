use serde::{Deserialize, Serialize};

/// All tuneable knobs for the worldgen pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldgenConfig {
    /// Number of county seeds to place
    pub counties: u32,
    /// Minimum county area in pixels
    pub min_county_area: u32,
    /// Minimum Poisson disk radius (dense areas)
    pub seed_radius_min: f64,
    /// Maximum Poisson disk radius (sparse areas)
    pub seed_radius_max: f64,
    /// Cost multiplier for slope crossings
    pub cost_slope: f64,
    /// Cost multiplier for river crossings
    pub cost_river_crossing: f64,
    /// Cost multiplier for ridge crossings
    pub cost_ridge_crossing: f64,
    /// Minimum duchy size (counties per duchy)
    pub duchy_size_min: u32,
    /// Maximum duchy size
    pub duchy_size_max: u32,
    /// Minimum kingdom size (duchies per kingdom)
    pub kingdom_size_min: u32,
    /// Maximum kingdom size
    pub kingdom_size_max: u32,
    /// Number of border smoothing iterations
    pub smooth_iterations: u32,
}

impl Default for WorldgenConfig {
    fn default() -> Self {
        Self {
            counties: 500,
            min_county_area: 100,
            seed_radius_min: 8.0,
            seed_radius_max: 40.0,
            cost_slope: 2.0,
            cost_river_crossing: 5.0,
            cost_ridge_crossing: 3.0,
            duchy_size_min: 4,
            duchy_size_max: 8,
            kingdom_size_min: 6,
            kingdom_size_max: 12,
            smooth_iterations: 2,
        }
    }
}
