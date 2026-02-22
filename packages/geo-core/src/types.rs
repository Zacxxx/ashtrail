use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorldConfig {
    pub seed: u32,
    #[serde(rename = "planetRadius")]
    pub planet_radius: f64,
    #[serde(rename = "axialTilt")]
    pub axial_tilt: f64,
    #[serde(rename = "solarLuminosity")]
    pub solar_luminosity: f64,
    #[serde(rename = "atmosphericDensity")]
    pub atmospheric_density: f64,
    #[serde(rename = "oceanCoverage")]
    pub ocean_coverage: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeoConfig {
    pub continental_scale: f64,
    pub plate_count: u32,
    pub tectonic_intensity: f64,
    pub volcanic_density: f64,
    pub erosion_iterations: u32,
    pub octaves: u32,
    pub persistence: f64,
    pub lacunarity: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClimateConfig {
    pub global_mean_temp: f64,
    pub latitude_gradient: f64,
    pub prevailing_wind_dir: f64,
    pub wind_strength: f64,
    pub precipitation_multiplier: f64,
    pub ocean_warmth_factor: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SimulationConfig {
    pub world: WorldConfig,
    pub geo: GeoConfig,
    pub climate: ClimateConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BiomeType {
    AbyssalOcean,
    DeepOcean,
    Ocean,
    CoastalShelf,
    CoralReef,
    TidalFlat,
    Beach,
    Mangrove,
    SaltMarsh,
    RiverDelta,
    TropicalRainforest,
    TropicalSavanna,
    SubtropicalDesert,
    TemperateDeciduousForest,
    TemperateGrassland,
    Mediterranean,
    BorealForest,
    Tundra,
    IceSheet,
    AlpineMeadow,
    AlpineBare,
    VolcanicWasteland,
    IrradiatedZone,
    SaltFlat,
    ToxicSwamp,
    AshDesert,
}

impl BiomeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AbyssalOcean => "ABYSSAL_OCEAN",
            Self::DeepOcean => "DEEP_OCEAN",
            Self::Ocean => "OCEAN",
            Self::CoastalShelf => "COASTAL_SHELF",
            Self::CoralReef => "CORAL_REEF",
            Self::TidalFlat => "TIDAL_FLAT",
            Self::Beach => "BEACH",
            Self::Mangrove => "MANGROVE",
            Self::SaltMarsh => "SALT_MARSH",
            Self::RiverDelta => "RIVER_DELTA",
            Self::TropicalRainforest => "TROPICAL_RAINFOREST",
            Self::TropicalSavanna => "TROPICAL_SAVANNA",
            Self::SubtropicalDesert => "SUBTROPICAL_DESERT",
            Self::TemperateDeciduousForest => "TEMPERATE_DECIDUOUS_FOREST",
            Self::TemperateGrassland => "TEMPERATE_GRASSLAND",
            Self::Mediterranean => "MEDITERRANEAN",
            Self::BorealForest => "BOREAL_FOREST",
            Self::Tundra => "TUNDRA",
            Self::IceSheet => "ICE_SHEET",
            Self::AlpineMeadow => "ALPINE_MEADOW",
            Self::AlpineBare => "ALPINE_BARE",
            Self::VolcanicWasteland => "VOLCANIC_WASTELAND",
            Self::IrradiatedZone => "IRRADIATED_ZONE",
            Self::SaltFlat => "SALT_FLAT",
            Self::ToxicSwamp => "TOXIC_SWAMP",
            Self::AshDesert => "ASH_DESERT",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MineralType {
    Iron,
    Copper,
    FuelDeposit,
    RareEarth,
    Salt,
    Crystal,
    ScrapMetal,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SoilType {
    Bedrock,
    Rocky,
    Sandy,
    Clay,
    Loam,
    Silt,
    Peat,
    Ash,
    Irradiated,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TerrainCell {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub elevation_meters: f64,
    pub tectonic_stress: f64,
    pub volcanic_activity: f64,
    pub slope: f64,
    pub temperature: f64,
    pub moisture: f64,
    pub precipitation: f64,
    pub wind_exposure: f64,
    pub water_table_depth: f64,
    pub river_flow: f64,
    pub is_lake: bool,
    pub vegetation_density: f64,
    pub soil_type: SoilType,
    pub mineral_deposits: Vec<MineralType>,
    pub radiation_level: f64,
    pub biome: BiomeType,
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorldData {
    pub cells: Vec<TerrainCell>,
    pub cols: u32,
    pub rows: u32,
}
