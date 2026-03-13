// ═══════════════════════════════════════════════════════════
// combat_engine/rules.rs — Game rules configuration
// Ported from useGameRules.ts
// ═══════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GameRulesConfig {
    pub core: CoreRules,
    pub combat: CombatRules,
    pub grid: GridRules,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GridRules {
    pub base_disengage_cost: i32,
    pub threat_scaling: f64,
    pub agility_mitigation_divisor: i32,
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

/// Load rules from the CMS JSON file, falling back to defaults.
pub fn load_rules_from_file() -> GameRulesConfig {
    let path = std::path::Path::new("generated/game-rules.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Ok(rules) = serde_json::from_str::<GameRulesConfig>(&content) {
                return rules;
            }
        }
    }
    GameRulesConfig::default()
}
