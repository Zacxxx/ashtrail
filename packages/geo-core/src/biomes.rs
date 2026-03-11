use crate::color_utils::lerp_color;
use crate::types::{BiomeType, SoilType};

pub fn get_biome_color(biome_id: &str) -> &'static str {
    match biome_id {
        "abyssal_ocean" => "#0a1628",
        "deep_ocean" => "#0f2847",
        "ocean" => "#1a5276",
        "coastal_shelf" => "#2e86c1",
        "coral_reef" => "#48c9b0",
        "tidal_flat" => "#7fb3d3",
        "beach" => "#f0d9b5",
        "mangrove" => "#1e7845",
        "salt_marsh" => "#8fbc8f",
        "river_delta" => "#5dade2",
        "tropical_rainforest" => "#0b6623",
        "tropical_savanna" => "#c4a747",
        "subtropical_desert" => "#e8c872",
        "temperate_deciduous_forest" => "#2d7d46",
        "temperate_grassland" => "#7db46c",
        "mediterranean" => "#b8a94a",
        "boreal_forest" => "#3b5e2f",
        "tundra" => "#8b9f8e",
        "ice_sheet" => "#dce6f0",
        "alpine_meadow" => "#7b8f6a",
        "alpine_bare" => "#9e9e9e",
        "volcanic_wasteland" => "#4a2c2a",
        "irradiated_zone" => "#5e3f71",
        "salt_flat" => "#d4c8a8",
        "toxic_swamp" => "#4a6741",
        "ash_desert" => "#8b7d6b",
        _ => "#7db46c", // Default to grassland
    }
}

pub fn classify_biome(
    temperature: f64,
    precipitation: f64,
    elevation: f64,
    volcanic_activity: f64,
    radiation_level: f64,
    water_level: f64,
) -> String {
    let biome_type = if radiation_level > 0.7 {
        BiomeType::IrradiatedZone
    } else if volcanic_activity > 0.7 {
        BiomeType::VolcanicWasteland
    } else if elevation < water_level {
        let depth = water_level - elevation;
        if depth > 0.20 {
            BiomeType::AbyssalOcean
        } else if depth > 0.14 {
            BiomeType::DeepOcean
        } else if depth > 0.06 {
            BiomeType::Ocean
        } else if depth > 0.02 {
            if temperature > 22.0 && precipitation > 0.5 {
                BiomeType::CoralReef
            } else {
                BiomeType::CoastalShelf
            }
        } else {
            BiomeType::TidalFlat
        }
    } else {
        let coast_proximity = elevation - water_level;
        if coast_proximity < 0.03 {
            if precipitation > 0.6 && temperature > 20.0 {
                BiomeType::Mangrove
            } else if precipitation > 0.7 {
                BiomeType::SaltMarsh
            } else {
                BiomeType::Beach
            }
        } else if elevation > 0.92 {
            BiomeType::IceSheet
        } else if elevation > 0.84 {
            BiomeType::AlpineBare
        } else if elevation > 0.76 {
            BiomeType::AlpineMeadow
        } else if volcanic_activity > 0.4 && precipitation < 0.2 {
            BiomeType::AshDesert
        } else if precipitation < 0.08 && temperature > 10.0 {
            BiomeType::SaltFlat
        } else if precipitation > 0.6 {
            if temperature > 18.0 {
                BiomeType::TropicalRainforest
            } else if temperature > 5.0 {
                BiomeType::TemperateDeciduousForest
            } else {
                BiomeType::BorealForest
            }
        } else if precipitation > 0.3 {
            if temperature > 18.0 {
                BiomeType::TropicalSavanna
            } else if temperature > 10.0 {
                BiomeType::Mediterranean
            } else if temperature > 0.0 {
                BiomeType::TemperateGrassland
            } else {
                BiomeType::Tundra
            }
        } else {
            if temperature > 20.0 {
                BiomeType::SubtropicalDesert
            } else {
                BiomeType::Tundra
            }
        }
    };

    biome_type_to_id(biome_type)
}

fn biome_type_to_id(bt: BiomeType) -> String {
    match bt {
        BiomeType::AbyssalOcean => "abyssal_ocean",
        BiomeType::DeepOcean => "deep_ocean",
        BiomeType::Ocean => "ocean",
        BiomeType::CoastalShelf => "coastal_shelf",
        BiomeType::CoralReef => "coral_reef",
        BiomeType::TidalFlat => "tidal_flat",
        BiomeType::Beach => "beach",
        BiomeType::Mangrove => "mangrove",
        BiomeType::SaltMarsh => "salt_marsh",
        BiomeType::RiverDelta => "river_delta",
        BiomeType::TropicalRainforest => "tropical_rainforest",
        BiomeType::TropicalSavanna => "tropical_savanna",
        BiomeType::SubtropicalDesert => "subtropical_desert",
        BiomeType::TemperateDeciduousForest => "temperate_deciduous_forest",
        BiomeType::TemperateGrassland => "temperate_grassland",
        BiomeType::Mediterranean => "mediterranean",
        BiomeType::BorealForest => "boreal_forest",
        BiomeType::Tundra => "tundra",
        BiomeType::IceSheet => "ice_sheet",
        BiomeType::AlpineMeadow => "alpine_meadow",
        BiomeType::AlpineBare => "alpine_bare",
        BiomeType::VolcanicWasteland => "volcanic_wasteland",
        BiomeType::IrradiatedZone => "irradiated_zone",
        BiomeType::SaltFlat => "salt_flat",
        BiomeType::ToxicSwamp => "toxic_swamp",
        BiomeType::AshDesert => "ash_desert",
    }
    .to_string()
}

pub fn classify_soil(
    elevation: f64,
    moisture: f64,
    temperature: f64,
    volcanic_activity: f64,
    radiation_level: f64,
) -> SoilType {
    if radiation_level > 0.7 {
        return SoilType::Irradiated;
    }
    if volcanic_activity > 0.5 {
        return SoilType::Ash;
    }
    if elevation > 0.75 {
        return SoilType::Bedrock;
    }
    if elevation > 0.6 {
        return SoilType::Rocky;
    }
    if moisture > 0.8 && temperature > 10.0 {
        return SoilType::Peat;
    }
    if moisture > 0.6 {
        return SoilType::Silt;
    }
    if moisture > 0.4 {
        return SoilType::Loam;
    }
    if temperature > 25.0 && moisture < 0.2 {
        return SoilType::Sandy;
    }
    if moisture > 0.3 {
        return SoilType::Clay;
    }
    SoilType::Sandy
}

pub fn get_elevation_color(elevation: f64) -> String {
    if elevation < 0.35 {
        return lerp_color("#0a1628", "#2e86c1", elevation / 0.35);
    }
    if elevation < 0.45 {
        return lerp_color("#2d7d46", "#7db46c", (elevation - 0.35) / 0.1);
    }
    if elevation < 0.65 {
        return lerp_color("#7db46c", "#8b7d6b", (elevation - 0.45) / 0.2);
    }
    if elevation < 0.8 {
        return lerp_color("#8b7d6b", "#b8a89a", (elevation - 0.65) / 0.15);
    }
    lerp_color("#8b7d6b", "#f0eee8", (elevation - 0.8) / 0.2)
}
// ... other color functions omitted for brevity or added as needed
