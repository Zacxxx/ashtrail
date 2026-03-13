use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::progression::normalize_xp_and_leveling_rules;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GameRulesConfig {
    pub core: CoreRules,
    pub combat: CombatRules,
    pub grid: GridRules,
    pub regions: RegionsRules,
    pub xp_and_leveling: XpAndLevelingRules,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CoreRules {
    pub hp_base: i32,
    pub hp_per_endurance: i32,
    pub ap_base: i32,
    pub ap_agility_divisor: i32,
    pub mp_base: i32,
    pub crit_per_intelligence: f64,
    pub resist_per_wisdom: f64,
    pub charisma_bonus_per_charisma: f64,
    pub armor_agi_scale: f64,
    pub armor_endu_scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CombatRules {
    pub damage_variance_min: f64,
    pub damage_variance_max: f64,
    pub strength_to_power_ratio: f64,
    pub analyze_base_crit: f64,
    pub analyze_intel_scale: f64,
    pub defend_fail_reduction: f64,
    pub defend_partial_reduction: f64,
    pub defend_partial_threshold: i32,
    pub defend_success_reduction: f64,
    pub defend_success_threshold: i32,
    pub distract_charisma_scale: f64,
    pub shove_push_damage_ratio: f64,
    pub shove_shock_damage_ratio: f64,
    pub stealth_base_duration: u32,
    pub stealth_scale_factor: f64,
    pub strength_scaling_min: f64,
    pub strength_scaling_max: f64,
    pub agility_scaling_min: f64,
    pub agility_scaling_max: f64,
    pub melee_scaling_stat: String,
    pub ranged_scaling_stat: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GridRules {
    pub base_disengage_cost: i32,
    pub threat_scaling: f64,
    pub agility_mitigation_divisor: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RegionsRules {
    pub pop_multiplier_continent: i32,
    pub pop_multiplier_kingdom: i32,
    pub pop_multiplier_duchy: i32,
    pub pop_multiplier_province: i32,
    pub pop_base_min: i32,
    pub pop_base_max: i32,
    pub wealth_min: i32,
    pub wealth_max: i32,
    pub dev_min: i32,
    pub dev_max: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct XpAndLevelingRules {
    pub max_character_level: u8,
    pub max_character_cumulative_xp: u64,
    pub target_xp_per_minute: u64,
    pub target_xp_per_hour: u64,
    pub target_hours_to_max_level: u64,
    pub reference_formula: XpFormulaConfig,
    pub generated_level_table: Vec<LevelTableEntry>,
    pub rewards: LevelRewardRules,
    pub pioneer: PioneerRules,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct XpFormulaConfig {
    pub base: f64,
    pub exponent: f64,
    pub level_offset: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LevelTableEntry {
    pub level: u8,
    pub cumulative_xp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_level_xp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LevelRewardRules {
    pub occupation_points_per_level: u16,
    pub level_one_occupation_points: u16,
    pub stat_point_every_levels: u16,
    pub max_stat_points_at_max_level: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PioneerRules {
    pub starts_after_level: u8,
    pub max_level: u16,
    pub point_per_level: u16,
    pub tiers: Vec<PioneerXpTier>,
    pub milestones: Vec<PioneerMilestone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PioneerXpTier {
    pub start_level: u16,
    pub end_level: u16,
    pub xp_per_level: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PioneerMilestone {
    pub level: u16,
    pub cumulative_xp: u64,
}

impl Default for CoreRules {
    fn default() -> Self {
        Self {
            hp_base: 10,
            hp_per_endurance: 5,
            ap_base: 5,
            ap_agility_divisor: 2,
            mp_base: 3,
            crit_per_intelligence: 0.02,
            resist_per_wisdom: 0.05,
            charisma_bonus_per_charisma: 0.03,
            armor_agi_scale: 2.5,
            armor_endu_scale: 3.5,
        }
    }
}

impl Default for CombatRules {
    fn default() -> Self {
        Self {
            damage_variance_min: 0.85,
            damage_variance_max: 1.15,
            strength_to_power_ratio: 0.3,
            analyze_base_crit: 30.0,
            analyze_intel_scale: 0.6,
            defend_fail_reduction: 0.1,
            defend_partial_reduction: 0.2,
            defend_partial_threshold: 5,
            defend_success_reduction: 0.6,
            defend_success_threshold: 10,
            distract_charisma_scale: 0.42,
            shove_push_damage_ratio: 0.1,
            shove_shock_damage_ratio: 0.3,
            stealth_base_duration: 1,
            stealth_scale_factor: 1.4,
            strength_scaling_min: 0.2,
            strength_scaling_max: 0.4,
            agility_scaling_min: 0.2,
            agility_scaling_max: 0.4,
            melee_scaling_stat: "strength".to_string(),
            ranged_scaling_stat: "agility".to_string(),
        }
    }
}

impl Default for GridRules {
    fn default() -> Self {
        Self {
            base_disengage_cost: 2,
            threat_scaling: 1.0,
            agility_mitigation_divisor: 10,
        }
    }
}

impl Default for RegionsRules {
    fn default() -> Self {
        Self {
            pop_multiplier_continent: 50,
            pop_multiplier_kingdom: 10,
            pop_multiplier_duchy: 3,
            pop_multiplier_province: 1,
            pop_base_min: 500,
            pop_base_max: 5000,
            wealth_min: -100,
            wealth_max: 100,
            dev_min: -100,
            dev_max: 100,
        }
    }
}

impl Default for XpAndLevelingRules {
    fn default() -> Self {
        Self {
            max_character_level: 30,
            max_character_cumulative_xp: 414_000,
            target_xp_per_minute: 300,
            target_xp_per_hour: 18_000,
            target_hours_to_max_level: 23,
            reference_formula: XpFormulaConfig::default(),
            generated_level_table: Vec::new(),
            rewards: LevelRewardRules::default(),
            pioneer: PioneerRules::default(),
        }
    }
}

impl Default for XpFormulaConfig {
    fn default() -> Self {
        Self {
            base: 120.0,
            exponent: 2.419,
            level_offset: 1.0,
        }
    }
}

impl Default for LevelRewardRules {
    fn default() -> Self {
        Self {
            occupation_points_per_level: 1,
            level_one_occupation_points: 1,
            stat_point_every_levels: 3,
            max_stat_points_at_max_level: 10,
        }
    }
}

impl Default for PioneerRules {
    fn default() -> Self {
        Self {
            starts_after_level: 30,
            max_level: 200,
            point_per_level: 1,
            tiers: vec![
                PioneerXpTier {
                    start_level: 1,
                    end_level: 20,
                    xp_per_level: 35_000,
                },
                PioneerXpTier {
                    start_level: 21,
                    end_level: 50,
                    xp_per_level: 45_000,
                },
                PioneerXpTier {
                    start_level: 51,
                    end_level: 100,
                    xp_per_level: 60_000,
                },
                PioneerXpTier {
                    start_level: 101,
                    end_level: 150,
                    xp_per_level: 80_000,
                },
                PioneerXpTier {
                    start_level: 151,
                    end_level: 200,
                    xp_per_level: 100_000,
                },
            ],
            milestones: vec![
                PioneerMilestone {
                    level: 1,
                    cumulative_xp: 35_000,
                },
                PioneerMilestone {
                    level: 2,
                    cumulative_xp: 70_000,
                },
                PioneerMilestone {
                    level: 3,
                    cumulative_xp: 105_000,
                },
                PioneerMilestone {
                    level: 4,
                    cumulative_xp: 140_000,
                },
                PioneerMilestone {
                    level: 5,
                    cumulative_xp: 175_000,
                },
                PioneerMilestone {
                    level: 10,
                    cumulative_xp: 350_000,
                },
                PioneerMilestone {
                    level: 15,
                    cumulative_xp: 525_000,
                },
                PioneerMilestone {
                    level: 20,
                    cumulative_xp: 700_000,
                },
                PioneerMilestone {
                    level: 21,
                    cumulative_xp: 745_000,
                },
                PioneerMilestone {
                    level: 25,
                    cumulative_xp: 925_000,
                },
                PioneerMilestone {
                    level: 30,
                    cumulative_xp: 1_150_000,
                },
                PioneerMilestone {
                    level: 40,
                    cumulative_xp: 1_600_000,
                },
                PioneerMilestone {
                    level: 50,
                    cumulative_xp: 2_050_000,
                },
                PioneerMilestone {
                    level: 51,
                    cumulative_xp: 2_110_000,
                },
                PioneerMilestone {
                    level: 60,
                    cumulative_xp: 2_650_000,
                },
                PioneerMilestone {
                    level: 75,
                    cumulative_xp: 3_550_000,
                },
                PioneerMilestone {
                    level: 100,
                    cumulative_xp: 5_050_000,
                },
                PioneerMilestone {
                    level: 101,
                    cumulative_xp: 5_130_000,
                },
                PioneerMilestone {
                    level: 125,
                    cumulative_xp: 7_050_000,
                },
                PioneerMilestone {
                    level: 150,
                    cumulative_xp: 9_050_000,
                },
                PioneerMilestone {
                    level: 151,
                    cumulative_xp: 9_150_000,
                },
                PioneerMilestone {
                    level: 175,
                    cumulative_xp: 11_550_000,
                },
                PioneerMilestone {
                    level: 200,
                    cumulative_xp: 14_050_000,
                },
            ],
        }
    }
}

pub fn game_rules_path() -> Result<PathBuf, String> {
    std::env::current_dir()
        .map_err(|e| format!("resolve cwd: {e}"))
        .map(|cwd| cwd.join("../../packages/core/src/data/game_rules.json"))
}

pub fn normalize_game_rules(mut rules: GameRulesConfig) -> GameRulesConfig {
    normalize_xp_and_leveling_rules(&mut rules.xp_and_leveling);
    rules
}

pub fn load_rules_from_file() -> GameRulesConfig {
    let path = match game_rules_path() {
        Ok(path) => path,
        Err(_) => return normalize_game_rules(GameRulesConfig::default()),
    };

    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(rules) = serde_json::from_str::<GameRulesConfig>(&content) {
                return normalize_game_rules(rules);
            }
        }
    }

    normalize_game_rules(GameRulesConfig::default())
}

pub fn save_rules_to_file(rules: &GameRulesConfig) -> Result<(), String> {
    let path = game_rules_path()?;
    let json_string =
        serde_json::to_string_pretty(rules).map_err(|e| format!("serialize rules: {e}"))?;
    std::fs::write(&path, json_string)
        .map_err(|e| format!("write rules at {}: {e}", path.display()))
}
