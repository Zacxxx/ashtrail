use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentalEnvelope {
    pub temperature_min: f32,
    pub temperature_max: f32,
    pub precipitation_min: f32,
    pub precipitation_max: f32,
    pub elevation_min: f32,
    pub elevation_max: f32,
    pub slope_min: f32,
    pub slope_max: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColorProfile {
    pub h: f32,
    pub s: f32,
    pub v: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeArchetypeCalibration {
    pub enabled: bool,
    pub temperature_offset: f32,
    pub precipitation_offset: f32,
    pub elevation_offset: f32,
    pub slope_offset: f32,
    pub hue_tolerance: f32,
    pub sat_tolerance: f32,
    pub val_tolerance: f32,
    pub score_bias: f32,
}

impl Default for BiomeArchetypeCalibration {
    fn default() -> Self {
        Self {
            enabled: false,
            temperature_offset: 0.0,
            precipitation_offset: 0.0,
            elevation_offset: 0.0,
            slope_offset: 0.0,
            hue_tolerance: 1.0,
            sat_tolerance: 1.0,
            val_tolerance: 1.0,
            score_bias: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeArchetype {
    pub id: String,
    pub name: String,
    pub hex_color: String,
    pub env_conditions: EnvironmentalEnvelope,
    pub color_profile: ColorProfile,
    pub suitability_weight: f32,
    #[serde(default)]
    pub calibration: BiomeArchetypeCalibration,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeRegistry {
    pub archetypes: Vec<BiomeArchetype>,
}

impl BiomeRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn find_best_match(
        &self,
        temp: f32,
        rain: f32,
        elev: f32,
        slope: f32,
        h: f32,
        s: f32,
        v: f32,
        use_color: bool,
    ) -> Option<&BiomeArchetype> {
        if self.archetypes.is_empty() {
            return None;
        }

        let mut best_match = None;
        let mut min_score = f32::MAX;

        for archetype in &self.archetypes {
            let env_score = archetype.environmental_score(temp, rain, elev, slope);
            let color_score = if use_color {
                archetype.color_score(h, s, v)
            } else {
                0.0
            };

            // Heuristic penalty to prevent "jittery" selection if values are on the edge
            let total_score = if use_color {
                env_score * 0.2 + color_score
            } else {
                env_score
            };

            if total_score < min_score {
                min_score = total_score;
                best_match = Some(archetype);
            }
        }

        best_match
    }

    pub fn get_by_id(&self, id: &str) -> Option<&BiomeArchetype> {
        self.archetypes.iter().find(|a| a.id == id)
    }

    pub fn index_of_id(&self, id: &str) -> Option<usize> {
        self.archetypes.iter().position(|a| a.id == id)
    }

    pub fn default_registry() -> Self {
        let mut archetypes = Vec::new();

        // --- OCEANIC ---
        archetypes.push(BiomeArchetype {
            id: "abyssal_ocean".to_string(),
            name: "Abyssal Ocean".to_string(),
            hex_color: "#0a1628".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 100.0,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: -1.0,
                elevation_max: 0.2, // Deep
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 220.0,
                s: 0.7,
                v: 0.15,
            },
            suitability_weight: 0.0,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "deep_ocean".to_string(),
            name: "Deep Ocean".to_string(),
            hex_color: "#0f2847".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 100.0,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.2,
                elevation_max: 0.35,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 215.0,
                s: 0.6,
                v: 0.25,
            },
            suitability_weight: 0.0,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "ocean".to_string(),
            name: "Ocean".to_string(),
            hex_color: "#1a5276".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 100.0,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.35,
                elevation_max: 0.45,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 210.0,
                s: 0.5,
                v: 0.4,
            },
            suitability_weight: 0.0,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- COASTAL & WETLANDS ---
        archetypes.push(BiomeArchetype {
            id: "coral_reef".to_string(),
            name: "Coral Reef".to_string(),
            hex_color: "#48c9b0".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.7,
                temperature_max: 100.0,
                precipitation_min: 0.5,
                precipitation_max: 2.0,
                elevation_min: 0.4,
                elevation_max: 0.5,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 170.0,
                s: 0.6,
                v: 0.7,
            },
            suitability_weight: 0.2,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "mangrove".to_string(),
            name: "Mangrove Swamp".to_string(),
            hex_color: "#1e7845".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.7,
                temperature_max: 100.0,
                precipitation_min: 0.6,
                precipitation_max: 2.0,
                elevation_min: 0.45,
                elevation_max: 0.55,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 145.0,
                s: 0.7,
                v: 0.4,
            },
            suitability_weight: 0.3,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "salt_marsh".to_string(),
            name: "Salt Marsh".to_string(),
            hex_color: "#9ab973".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.3,
                temperature_max: 0.7,
                precipitation_min: 0.4,
                precipitation_max: 1.0,
                elevation_min: 0.48,
                elevation_max: 0.52,
                slope_min: -1.0,
                slope_max: 0.02,
            },
            color_profile: ColorProfile {
                h: 87.0,
                s: 0.38,
                v: 0.72,
            },
            suitability_weight: 0.4,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- TROPICAL ---
        archetypes.push(BiomeArchetype {
            id: "tropical_rainforest".to_string(),
            name: "Tropical Rainforest".to_string(),
            hex_color: "#0b6623".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.7,
                temperature_max: 100.0,
                precipitation_min: 0.6,
                precipitation_max: 2.0,
                elevation_min: 0.5,
                elevation_max: 0.75,
                slope_min: -1.0,
                slope_max: 0.1,
            },
            color_profile: ColorProfile {
                h: 140.0,
                s: 0.7,
                v: 0.3,
            },
            suitability_weight: 0.5,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "monsoon_forest".to_string(),
            name: "Tropical Seasonal (Monsoon) Forest".to_string(),
            hex_color: "#3d9140".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.65,
                temperature_max: 0.9,
                precipitation_min: 0.5,
                precipitation_max: 0.7,
                elevation_min: 0.5,
                elevation_max: 0.7,
                slope_min: -1.0,
                slope_max: 0.2,
            },
            color_profile: ColorProfile {
                h: 122.0,
                s: 0.58,
                v: 0.57,
            },
            suitability_weight: 0.6,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "tropical_savanna".to_string(),
            name: "Tropical Savanna".to_string(),
            hex_color: "#c4a747".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.6,
                temperature_max: 0.8,
                precipitation_min: 0.3,
                precipitation_max: 0.5,
                elevation_min: 0.5,
                elevation_max: 0.75,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 45.0,
                s: 0.6,
                v: 0.6,
            },
            suitability_weight: 0.6,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- ARID ---
        archetypes.push(BiomeArchetype {
            id: "hot_desert".to_string(),
            name: "Hot Desert".to_string(),
            hex_color: "#e8c872".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.75,
                temperature_max: 100.0,
                precipitation_min: -1.0,
                precipitation_max: 0.25,
                elevation_min: 0.5,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 0.2,
            },
            color_profile: ColorProfile {
                h: 38.0,
                s: 0.35,
                v: 0.75,
            },
            suitability_weight: 0.1,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "arid_scrubland".to_string(),
            name: "Arid Scrubland".to_string(),
            hex_color: "#b9a064".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.5,
                temperature_max: 0.9,
                precipitation_min: 0.15,
                precipitation_max: 0.35,
                elevation_min: 0.4,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 35.0,
                s: 0.3,
                v: 0.6,
            },
            suitability_weight: 0.3,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "cold_desert".to_string(),
            name: "Cold Desert (Gobi-style)".to_string(),
            hex_color: "#d2b48c".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -0.1,
                temperature_max: 0.3,
                precipitation_min: -1.0,
                precipitation_max: 0.15,
                elevation_min: 0.6,
                elevation_max: 0.9,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 34.0,
                s: 0.31,
                v: 0.82,
            },
            suitability_weight: 0.2,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- SUBTROPICAL & MEDITERRANEAN ---
        archetypes.push(BiomeArchetype {
            id: "mediterranean_matorral".to_string(),
            name: "Mediterranean Matorral".to_string(),
            hex_color: "#838b3b".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.55,
                temperature_max: 0.75,
                precipitation_min: 0.25,
                precipitation_max: 0.45,
                elevation_min: 0.5,
                elevation_max: 0.7,
                slope_min: -1.0,
                slope_max: 0.3,
            },
            color_profile: ColorProfile {
                h: 66.0,
                s: 0.57,
                v: 0.54,
            },
            suitability_weight: 0.85,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- TEMPERATE ---
        archetypes.push(BiomeArchetype {
            id: "temperate_deciduous_forest".to_string(),
            name: "Temperate Forest".to_string(),
            hex_color: "#2d7d46".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.3,
                temperature_max: 0.7,
                precipitation_min: 0.4,
                precipitation_max: 0.8,
                elevation_min: 0.5,
                elevation_max: 0.75,
                slope_min: -1.0,
                slope_max: 0.1,
            },
            color_profile: ColorProfile {
                h: 100.0,
                s: 0.5,
                v: 0.4,
            },
            suitability_weight: 0.8,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "temperate_grassland_steppe".to_string(),
            name: "Temperate Steppe".to_string(),
            hex_color: "#7db46c".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.2,
                temperature_max: 0.6,
                precipitation_min: 0.2,
                precipitation_max: 0.45,
                elevation_min: 0.5,
                elevation_max: 0.75,
                slope_min: -1.0,
                slope_max: 0.05,
            },
            color_profile: ColorProfile {
                h: 80.0,
                s: 0.4,
                v: 0.6,
            },
            suitability_weight: 0.9,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "temperate_rainforest".to_string(),
            name: "Temperate Rainforest".to_string(),
            hex_color: "#1e4d2b".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.4,
                temperature_max: 0.6,
                precipitation_min: 0.75,
                precipitation_max: 2.0,
                elevation_min: 0.5,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 0.4,
            },
            color_profile: ColorProfile {
                h: 140.0,
                s: 0.6,
                v: 0.25,
            },
            suitability_weight: 0.7,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- COLD ---
        archetypes.push(BiomeArchetype {
            id: "taiga_boreal".to_string(),
            name: "Dark Taiga (Spruce)".to_string(),
            hex_color: "#1b3022".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -0.1,
                temperature_max: 0.25,
                precipitation_min: 0.25,
                precipitation_max: 0.6,
                elevation_min: 0.5,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 145.0,
                s: 0.44,
                v: 0.19,
            },
            suitability_weight: 0.3,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "tundra_arctic".to_string(),
            name: "Arctic Tundra".to_string(),
            hex_color: "#8b9f8e".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 0.1,
                precipitation_min: 0.05,
                precipitation_max: 0.3,
                elevation_min: 0.5,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 0.1,
            },
            color_profile: ColorProfile {
                h: 129.0,
                s: 0.12,
                v: 0.62,
            },
            suitability_weight: 0.1,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "ice_sheet_polar".to_string(),
            name: "Polar Ice Sheet".to_string(),
            hex_color: "#ffffff".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: -0.1,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.5,
                elevation_max: 1.0,
                slope_min: -1.0,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 0.0,
                s: 0.0,
                v: 1.0,
            },
            suitability_weight: 0.0,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- MOUNTAIN & HIGHLAND ---
        archetypes.push(BiomeArchetype {
            id: "alpine_meadow".to_string(),
            name: "Alpine Meadow".to_string(),
            hex_color: "#5eab5a".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.0,
                temperature_max: 0.3,
                precipitation_min: 0.4,
                precipitation_max: 1.0,
                elevation_min: 0.75,
                elevation_max: 0.85,
                slope_min: 0.05,
                slope_max: 0.3,
            },
            color_profile: ColorProfile {
                h: 117.0,
                s: 0.47,
                v: 0.67,
            },
            suitability_weight: 0.4,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "alpine_tundra_rock".to_string(),
            name: "High Alpine / Bare Rock".to_string(),
            hex_color: "#7a7a7a".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 0.1,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.85,
                elevation_max: 1.0,
                slope_min: 0.1,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 0.0,
                s: 0.0,
                v: 0.48,
            },
            suitability_weight: 0.0,
            calibration: BiomeArchetypeCalibration::default(),
        });

        // --- SPECIAL ---
        archetypes.push(BiomeArchetype {
            id: "volcanic".to_string(),
            name: "Volcanic Island / Peak".to_string(),
            hex_color: "#3d3d3d".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: 0.4,
                temperature_max: 1.0,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.6,
                elevation_max: 1.0,
                slope_min: 0.3,
                slope_max: 1.0,
            },
            color_profile: ColorProfile {
                h: 0.0,
                s: 0.0,
                v: 0.24,
            },
            suitability_weight: 0.1,
            calibration: BiomeArchetypeCalibration::default(),
        });

        archetypes.push(BiomeArchetype {
            id: "ashlands".to_string(),
            name: "Ashlands".to_string(),
            hex_color: "#2a2a2a".to_string(),
            env_conditions: EnvironmentalEnvelope {
                temperature_min: -100.0,
                temperature_max: 100.0,
                precipitation_min: -1.0,
                precipitation_max: 2.0,
                elevation_min: 0.0,
                elevation_max: 0.8,
                slope_min: -1.0,
                slope_max: 0.15, // Mostly flat plains
            },
            color_profile: ColorProfile {
                h: 0.0,
                s: 0.0,
                v: 0.18,
            },
            suitability_weight: 0.1,
            calibration: BiomeArchetypeCalibration::default(),
        });

        Self { archetypes }
    }
}

impl BiomeArchetype {
    pub fn environmental_score(&self, temp: f32, rain: f32, elev: f32, slope: f32) -> f32 {
        let env = &self.env_conditions;
        let calibration = &self.calibration;
        let temp = if calibration.enabled {
            temp + calibration.temperature_offset
        } else {
            temp
        };
        let rain = if calibration.enabled {
            rain + calibration.precipitation_offset
        } else {
            rain
        };
        let elev = if calibration.enabled {
            elev + calibration.elevation_offset
        } else {
            elev
        };
        let slope = if calibration.enabled {
            slope + calibration.slope_offset
        } else {
            slope
        };

        score_range(temp, env.temperature_min, env.temperature_max)
            + score_range(rain, env.precipitation_min, env.precipitation_max)
            + score_range(elev, env.elevation_min, env.elevation_max)
            + score_range(slope, env.slope_min, env.slope_max)
    }

    pub fn color_score(&self, h: f32, s: f32, v: f32) -> f32 {
        let cp = &self.color_profile;
        let calibration = &self.calibration;
        let mut dh = (h - cp.h).abs();
        if dh > 180.0 {
            dh = 360.0 - dh;
        }
        dh /= 180.0;

        let ds = s - cp.s;
        let dv = v - cp.v;
        let hue_weight = s.max(cp.s);
        let hue_tolerance = if calibration.enabled {
            calibration.hue_tolerance.max(0.01)
        } else {
            1.0
        };
        let sat_tolerance = if calibration.enabled {
            calibration.sat_tolerance.max(0.01)
        } else {
            1.0
        };
        let val_tolerance = if calibration.enabled {
            calibration.val_tolerance.max(0.01)
        } else {
            1.0
        };

        dh * dh * hue_weight / hue_tolerance + ds * ds / sat_tolerance + dv * dv / val_tolerance
    }
}

fn score_range(value: f32, min: f32, max: f32) -> f32 {
    if value < min {
        (min - value).powi(2)
    } else if value > max {
        (value - max).powi(2)
    } else {
        0.0
    }
}
