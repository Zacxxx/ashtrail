use crate::color_utils::lerp_color;
use crate::types::{BiomeType, SoilType};

pub fn get_biome_color(biome: &BiomeType) -> &'static str {
    match biome {
        BiomeType::AbyssalOcean => "#0a1628",
        BiomeType::DeepOcean => "#0f2847",
        BiomeType::Ocean => "#1a5276",
        BiomeType::CoastalShelf => "#2e86c1",
        BiomeType::CoralReef => "#48c9b0",
        BiomeType::TidalFlat => "#7fb3d3",
        BiomeType::Beach => "#f0d9b5",
        BiomeType::Mangrove => "#1e7845",
        BiomeType::SaltMarsh => "#8fbc8f",
        BiomeType::RiverDelta => "#5dade2",
        BiomeType::TropicalRainforest => "#0b6623",
        BiomeType::TropicalSavanna => "#c4a747",
        BiomeType::SubtropicalDesert => "#e8c872",
        BiomeType::TemperateDeciduousForest => "#2d7d46",
        BiomeType::TemperateGrassland => "#7db46c",
        BiomeType::Mediterranean => "#b8a94a",
        BiomeType::BorealForest => "#3b5e2f",
        BiomeType::Tundra => "#8b9f8e",
        BiomeType::IceSheet => "#dce6f0",
        BiomeType::AlpineMeadow => "#7b8f6a",
        BiomeType::AlpineBare => "#9e9e9e",
        BiomeType::VolcanicWasteland => "#4a2c2a",
        BiomeType::IrradiatedZone => "#5e3f71",
        BiomeType::SaltFlat => "#d4c8a8",
        BiomeType::ToxicSwamp => "#4a6741",
        BiomeType::AshDesert => "#8b7d6b",
    }
}

pub fn classify_biome(
    temperature: f64,
    precipitation: f64,
    elevation: f64,
    volcanic_activity: f64,
    radiation_level: f64,
    water_level: f64,
) -> BiomeType {
    if radiation_level > 0.7 {
        return BiomeType::IrradiatedZone;
    }
    if volcanic_activity > 0.7 {
        return BiomeType::VolcanicWasteland;
    }

    if elevation < water_level {
        let depth = water_level - elevation;
        if depth > 0.35 {
            return BiomeType::AbyssalOcean;
        }
        if depth > 0.25 {
            return BiomeType::DeepOcean;
        }
        if depth > 0.10 {
            return BiomeType::Ocean;
        }
        if depth > 0.05 {
            if temperature > 22.0 && precipitation > 0.5 {
                return BiomeType::CoralReef;
            }
            return BiomeType::CoastalShelf;
        }
        return BiomeType::TidalFlat;
    }

    let coast_proximity = elevation - water_level;
    if coast_proximity < 0.02 {
        if precipitation > 0.6 && temperature > 20.0 {
            return BiomeType::Mangrove;
        }
        if precipitation > 0.7 {
            return BiomeType::SaltMarsh;
        }
        return BiomeType::Beach;
    }

    if elevation > 0.85 {
        return BiomeType::IceSheet;
    }
    if elevation > 0.75 {
        return BiomeType::AlpineBare;
    }
    if elevation > 0.65 {
        return BiomeType::AlpineMeadow;
    }

    if volcanic_activity > 0.4 && precipitation < 0.2 {
        return BiomeType::AshDesert;
    }
    if precipitation < 0.08 && temperature > 10.0 {
        return BiomeType::SaltFlat;
    }

    if temperature > 20.0 {
        if precipitation > 0.65 {
            return BiomeType::TropicalRainforest;
        }
        if precipitation > 0.3 {
            return BiomeType::TropicalSavanna;
        }
        return BiomeType::SubtropicalDesert;
    }

    if temperature > 10.0 {
        if precipitation > 0.6 {
            return BiomeType::TemperateDeciduousForest;
        }
        if precipitation > 0.3 {
            return BiomeType::Mediterranean;
        }
        return BiomeType::TemperateGrassland;
    }

    if temperature > 0.0 {
        if precipitation > 0.4 {
            return BiomeType::BorealForest;
        }
        return BiomeType::Tundra;
    }

    if precipitation > 0.3 {
        BiomeType::IceSheet
    } else {
        BiomeType::Tundra
    }
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
