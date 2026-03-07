// ═══════════════════════════════════════════════════════════
// combat_engine/rules.rs — Game rules configuration
// Ported from useGameRules.ts
// ═══════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRulesConfig {
    pub core: CoreRules,
    pub combat: CombatRules,
    pub grid: GridRules,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreRules {
    pub hp_base: i32,
    pub hp_per_endurance: i32,
    pub ap_base: i32,
    pub ap_agility_divisor: i32,
    pub mp_base: i32,
    pub crit_per_intelligence: f64,
    pub resist_per_wisdom: f64,
    pub charisma_bonus_per_charisma: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatRules {
    pub damage_variance_min: f64,
    pub damage_variance_max: f64,
    pub strength_to_power_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridRules {
    pub base_disengage_cost: i32,
    pub threat_scaling: f64,
    pub agility_mitigation_divisor: i32,
}

impl Default for GameRulesConfig {
    fn default() -> Self {
        Self {
            core: CoreRules {
                hp_base: 10,
                hp_per_endurance: 5,
                ap_base: 5,
                ap_agility_divisor: 2,
                mp_base: 3,
                crit_per_intelligence: 0.02,
                resist_per_wisdom: 0.05,
                charisma_bonus_per_charisma: 0.03,
            },
            combat: CombatRules {
                damage_variance_min: 0.85,
                damage_variance_max: 1.15,
                strength_to_power_ratio: 0.3,
            },
            grid: GridRules {
                base_disengage_cost: 2,
                threat_scaling: 1.0,
                agility_mitigation_divisor: 10,
            },
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
