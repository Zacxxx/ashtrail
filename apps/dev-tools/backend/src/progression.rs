use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tracing::{info, warn};

use crate::{
    combat_engine::content_loader::{load_content_bundle, ContentBundle},
    game_rules::{
        GameRulesConfig, LevelTableEntry, PioneerMilestone, PioneerRules, XpAndLevelingRules,
    },
    AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelProgressSnapshot {
    pub level: u8,
    pub max_level: u8,
    pub total_xp: u64,
    pub current_level_cumulative_xp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_level_cumulative_xp: Option<u64>,
    pub xp_into_level: u64,
    pub xp_to_next_level: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_level_xp: Option<u64>,
    pub progress_pct: f64,
    pub is_max_level: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedOccupationProgress {
    pub occupation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupation: Option<Value>,
    pub unlocked_talent_node_ids: Vec<String>,
    pub spent_talent_points: u16,
    pub level: u16,
    pub available_talent_points: u16,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedProgression {
    #[serde(flatten)]
    pub level_progress: LevelProgressSnapshot,
    pub occupation_points_total: u16,
    pub stat_points_total: u16,
    pub available_talent_points: u16,
    pub available_stat_points: u16,
    pub available_pioneer_points: u16,
    pub pioneer_level: u16,
    pub pioneer_points_total: u16,
    pub occupations: Vec<ResolvedOccupationProgress>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveProgressionRequest {
    pub total_xp: u64,
    #[serde(default)]
    pub spent_talent_points: u16,
    #[serde(default)]
    pub spent_stat_points: u16,
    #[serde(default)]
    pub spent_pioneer_occupation_points: u16,
    #[serde(default)]
    pub spent_pioneer_stat_points: u16,
}

fn canonical_default_level_table() -> Vec<LevelTableEntry> {
    vec![
        LevelTableEntry {
            level: 1,
            cumulative_xp: 0,
            next_level_xp: Some(120),
        },
        LevelTableEntry {
            level: 2,
            cumulative_xp: 120,
            next_level_xp: Some(522),
        },
        LevelTableEntry {
            level: 3,
            cumulative_xp: 642,
            next_level_xp: Some(1_070),
        },
        LevelTableEntry {
            level: 4,
            cumulative_xp: 1_712,
            next_level_xp: Some(1_721),
        },
        LevelTableEntry {
            level: 5,
            cumulative_xp: 3_433,
            next_level_xp: Some(2_457),
        },
        LevelTableEntry {
            level: 6,
            cumulative_xp: 5_890,
            next_level_xp: Some(3_265),
        },
        LevelTableEntry {
            level: 7,
            cumulative_xp: 9_155,
            next_level_xp: Some(4_138),
        },
        LevelTableEntry {
            level: 8,
            cumulative_xp: 13_293,
            next_level_xp: Some(5_069),
        },
        LevelTableEntry {
            level: 9,
            cumulative_xp: 18_362,
            next_level_xp: Some(6_054),
        },
        LevelTableEntry {
            level: 10,
            cumulative_xp: 24_416,
            next_level_xp: Some(7_088),
        },
        LevelTableEntry {
            level: 11,
            cumulative_xp: 31_504,
            next_level_xp: Some(8_167),
        },
        LevelTableEntry {
            level: 12,
            cumulative_xp: 39_671,
            next_level_xp: Some(9_288),
        },
        LevelTableEntry {
            level: 13,
            cumulative_xp: 48_959,
            next_level_xp: Some(10_447),
        },
        LevelTableEntry {
            level: 14,
            cumulative_xp: 59_406,
            next_level_xp: Some(11_642),
        },
        LevelTableEntry {
            level: 15,
            cumulative_xp: 71_048,
            next_level_xp: Some(12_870),
        },
        LevelTableEntry {
            level: 16,
            cumulative_xp: 83_918,
            next_level_xp: Some(14_129),
        },
        LevelTableEntry {
            level: 17,
            cumulative_xp: 98_047,
            next_level_xp: Some(15_417),
        },
        LevelTableEntry {
            level: 18,
            cumulative_xp: 113_464,
            next_level_xp: Some(16_731),
        },
        LevelTableEntry {
            level: 19,
            cumulative_xp: 130_195,
            next_level_xp: Some(18_071),
        },
        LevelTableEntry {
            level: 20,
            cumulative_xp: 148_266,
            next_level_xp: Some(19_435),
        },
        LevelTableEntry {
            level: 21,
            cumulative_xp: 167_701,
            next_level_xp: Some(20_821),
        },
        LevelTableEntry {
            level: 22,
            cumulative_xp: 188_522,
            next_level_xp: Some(22_229),
        },
        LevelTableEntry {
            level: 23,
            cumulative_xp: 210_751,
            next_level_xp: Some(23_657),
        },
        LevelTableEntry {
            level: 24,
            cumulative_xp: 234_408,
            next_level_xp: Some(25_105),
        },
        LevelTableEntry {
            level: 25,
            cumulative_xp: 259_513,
            next_level_xp: Some(26_573),
        },
        LevelTableEntry {
            level: 26,
            cumulative_xp: 286_086,
            next_level_xp: Some(28_373),
        },
        LevelTableEntry {
            level: 27,
            cumulative_xp: 317_886,
            next_level_xp: Some(30_389),
        },
        LevelTableEntry {
            level: 28,
            cumulative_xp: 348_275,
            next_level_xp: Some(32_030),
        },
        LevelTableEntry {
            level: 29,
            cumulative_xp: 380_305,
            next_level_xp: Some(33_695),
        },
        LevelTableEntry {
            level: 30,
            cumulative_xp: 414_000,
            next_level_xp: None,
        },
    ]
}

fn is_default_formula(rules: &XpAndLevelingRules) -> bool {
    let formula = &rules.reference_formula;
    (formula.base - 120.0).abs() < f64::EPSILON
        && (formula.exponent - 2.419).abs() < f64::EPSILON
        && (formula.level_offset - 1.0).abs() < f64::EPSILON
        && rules.max_character_level == 30
        && rules.max_character_cumulative_xp == 414_000
}

pub fn generate_level_table_from_formula(rules: &XpAndLevelingRules) -> Vec<LevelTableEntry> {
    if is_default_formula(rules) {
        return canonical_default_level_table();
    }

    let mut cumulative_values = Vec::with_capacity(rules.max_character_level as usize);
    let formula = &rules.reference_formula;
    let mut previous = 0_u64;

    for level in 1..=rules.max_character_level {
        let cumulative_xp = if level == rules.max_character_level {
            rules.max_character_cumulative_xp
        } else {
            let power_input = (level as f64 - formula.level_offset).max(0.0);
            let raw = (formula.base * power_input.powf(formula.exponent)).round();
            let clamped = raw
                .max(previous as f64)
                .min((rules.max_character_cumulative_xp.saturating_sub(1)) as f64)
                as u64;
            clamped
        };
        previous = cumulative_xp.max(previous);
        cumulative_values.push(previous);
    }

    cumulative_values
        .iter()
        .enumerate()
        .map(|(index, cumulative_xp)| {
            let next_level_xp = cumulative_values
                .get(index + 1)
                .map(|next_cumulative| next_cumulative.saturating_sub(*cumulative_xp));
            LevelTableEntry {
                level: (index + 1) as u8,
                cumulative_xp: *cumulative_xp,
                next_level_xp,
            }
        })
        .collect()
}

fn generate_pioneer_milestones(pioneer: &PioneerRules) -> Vec<PioneerMilestone> {
    let mut milestones = Vec::new();
    let interesting = [
        1_u16, 2, 3, 4, 5, 10, 15, 20, 21, 25, 30, 40, 50, 51, 60, 75, 100, 101, 125, 150, 151,
        175, 200,
    ];
    for level in interesting {
        if level <= pioneer.max_level {
            milestones.push(PioneerMilestone {
                level,
                cumulative_xp: cumulative_pioneer_xp_from_level(level, pioneer),
            });
        }
    }
    milestones
}

pub fn normalize_xp_and_leveling_rules(rules: &mut XpAndLevelingRules) {
    if rules.max_character_level == 0 {
        *rules = XpAndLevelingRules::default();
    }

    if rules.rewards.occupation_points_per_level == 0 {
        rules.rewards.occupation_points_per_level = 1;
    }
    if rules.rewards.level_one_occupation_points == 0 {
        rules.rewards.level_one_occupation_points = 1;
    }
    if rules.rewards.stat_point_every_levels == 0 {
        rules.rewards.stat_point_every_levels = 3;
    }
    if rules.pioneer.max_level == 0 {
        rules.pioneer = PioneerRules::default();
    }
    if rules.pioneer.tiers.is_empty() {
        rules.pioneer.tiers = PioneerRules::default().tiers;
    }
    if rules.pioneer.milestones.is_empty() {
        rules.pioneer.milestones = generate_pioneer_milestones(&rules.pioneer);
    } else {
        rules.pioneer.milestones = generate_pioneer_milestones(&rules.pioneer);
    }

    rules.generated_level_table = generate_level_table_from_formula(rules);
}

pub fn cumulative_xp_for_level(level: u8, rules: &XpAndLevelingRules) -> u64 {
    let normalized = level.clamp(1, rules.max_character_level);
    rules
        .generated_level_table
        .iter()
        .find(|entry| entry.level == normalized)
        .map(|entry| entry.cumulative_xp)
        .unwrap_or(0)
}

pub fn xp_for_next_level(level: u8, rules: &XpAndLevelingRules) -> Option<u64> {
    let normalized = level.clamp(1, rules.max_character_level);
    rules
        .generated_level_table
        .iter()
        .find(|entry| entry.level == normalized)
        .and_then(|entry| entry.next_level_xp)
}

pub fn character_level_from_total_xp(total_xp: u64, rules: &XpAndLevelingRules) -> u8 {
    let mut resolved = 1_u8;
    for entry in &rules.generated_level_table {
        if total_xp >= entry.cumulative_xp {
            resolved = entry.level;
        } else {
            break;
        }
    }
    resolved
}

pub fn level_progress_from_total_xp(
    total_xp: u64,
    rules: &XpAndLevelingRules,
) -> LevelProgressSnapshot {
    let level = character_level_from_total_xp(total_xp, rules);
    let current_level_cumulative_xp = cumulative_xp_for_level(level, rules);
    let next_level_cumulative_xp = if level >= rules.max_character_level {
        None
    } else {
        Some(cumulative_xp_for_level(level + 1, rules))
    };
    let next_level_xp = xp_for_next_level(level, rules);
    let xp_into_level = total_xp.saturating_sub(current_level_cumulative_xp);
    let xp_to_next_level = next_level_cumulative_xp
        .map(|next| next.saturating_sub(total_xp))
        .unwrap_or(0);
    let progress_pct = match next_level_xp {
        Some(required) if required > 0 => (xp_into_level as f64 / required as f64) * 100.0,
        _ => 100.0,
    };

    LevelProgressSnapshot {
        level,
        max_level: rules.max_character_level,
        total_xp,
        current_level_cumulative_xp,
        next_level_cumulative_xp,
        xp_into_level,
        xp_to_next_level,
        next_level_xp,
        progress_pct: progress_pct.clamp(0.0, 100.0),
        is_max_level: level >= rules.max_character_level,
    }
}

pub fn can_level_up(stored_level: u8, total_xp: u64, rules: &XpAndLevelingRules) -> bool {
    character_level_from_total_xp(total_xp, rules)
        > stored_level.clamp(1, rules.max_character_level)
}

pub fn levels_gained_from_xp_gain(
    previous_total_xp: u64,
    gained_xp: u64,
    rules: &XpAndLevelingRules,
) -> u8 {
    let previous_level = character_level_from_total_xp(previous_total_xp, rules);
    let next_level =
        character_level_from_total_xp(previous_total_xp.saturating_add(gained_xp), rules);
    next_level.saturating_sub(previous_level)
}

pub fn occupation_points_total_for_level(level: u8, rules: &XpAndLevelingRules) -> u16 {
    let normalized = level.clamp(1, rules.max_character_level);
    let base = normalized as u16 * rules.rewards.occupation_points_per_level;
    if normalized == 1 {
        base.max(rules.rewards.level_one_occupation_points)
    } else {
        base
    }
}

pub fn stat_points_total_for_level(level: u8, rules: &XpAndLevelingRules) -> u16 {
    let normalized = level.clamp(1, rules.max_character_level) as u16;
    let generated = normalized / rules.rewards.stat_point_every_levels.max(1);
    generated.min(rules.rewards.max_stat_points_at_max_level)
}

pub fn occupation_points_available(
    total_for_level: u16,
    spent_talent_points: u16,
    available_pioneer_points: u16,
) -> u16 {
    total_for_level
        .saturating_add(available_pioneer_points)
        .saturating_sub(spent_talent_points)
}

pub fn stat_points_available(total_for_level: u16, spent_stat_points: u16) -> u16 {
    total_for_level.saturating_sub(spent_stat_points)
}

fn cumulative_pioneer_xp_from_level(level: u16, pioneer: &PioneerRules) -> u64 {
    if level == 0 {
        return 0;
    }

    let mut total = 0_u64;
    for current_level in 1..=level.min(pioneer.max_level) {
        if let Some(tier) = pioneer
            .tiers
            .iter()
            .find(|tier| current_level >= tier.start_level && current_level <= tier.end_level)
        {
            total = total.saturating_add(tier.xp_per_level);
        }
    }
    total
}

pub fn cumulative_pioneer_xp(level: u16, rules: &XpAndLevelingRules) -> u64 {
    cumulative_pioneer_xp_from_level(level, &rules.pioneer)
}

pub fn pioneer_level_from_xp(total_xp: u64, rules: &XpAndLevelingRules) -> u16 {
    let base_xp = rules.max_character_cumulative_xp;
    if total_xp <= base_xp {
        return 0;
    }

    let pioneer_xp = total_xp.saturating_sub(base_xp);
    let mut resolved = 0_u16;
    for level in 1..=rules.pioneer.max_level {
        if pioneer_xp >= cumulative_pioneer_xp(level, rules) {
            resolved = level;
        } else {
            break;
        }
    }
    resolved
}

pub fn xp_for_next_pioneer_level(total_xp: u64, rules: &XpAndLevelingRules) -> Option<u64> {
    let current_level = pioneer_level_from_xp(total_xp, rules);
    if current_level >= rules.pioneer.max_level {
        return None;
    }

    let current_total = rules
        .max_character_cumulative_xp
        .saturating_add(cumulative_pioneer_xp(current_level + 1, rules));
    Some(current_total.saturating_sub(total_xp))
}

pub fn pioneer_points_total(total_xp: u64, rules: &XpAndLevelingRules) -> u16 {
    pioneer_level_from_xp(total_xp, rules)
        .min(rules.pioneer.max_level)
        .saturating_mul(rules.pioneer.point_per_level)
}

pub fn resolve_progression(
    total_xp: u64,
    spent_talent_points: u16,
    spent_stat_points: u16,
    spent_pioneer_occupation_points: u16,
    spent_pioneer_stat_points: u16,
    occupations: Vec<ResolvedOccupationProgress>,
    rules: &XpAndLevelingRules,
) -> ResolvedProgression {
    let level_progress = level_progress_from_total_xp(total_xp, rules);
    let occupation_points_total = occupation_points_total_for_level(level_progress.level, rules);
    let stat_points_total = stat_points_total_for_level(level_progress.level, rules);
    let pioneer_points_total = pioneer_points_total(total_xp, rules);
    let available_pioneer_points = pioneer_points_total
        .saturating_sub(spent_pioneer_occupation_points)
        .saturating_sub(spent_pioneer_stat_points);
    let available_talent_points = occupation_points_available(
        occupation_points_total,
        spent_talent_points,
        available_pioneer_points,
    );
    let available_stat_points = stat_points_available(stat_points_total, spent_stat_points);

    ResolvedProgression {
        pioneer_level: pioneer_level_from_xp(total_xp, rules),
        pioneer_points_total,
        occupation_points_total,
        stat_points_total,
        available_talent_points,
        available_stat_points,
        available_pioneer_points,
        occupations,
        level_progress,
    }
}

fn value_as_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|entry| {
        entry
            .as_u64()
            .or_else(|| entry.as_i64().map(|raw| raw.max(0) as u64))
    })
}

fn value_as_u16(value: Option<&Value>) -> u16 {
    value_as_u64(value).unwrap_or(0).min(u16::MAX as u64) as u16
}

fn value_as_string_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(|entry| entry.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn talent_cost_for_unlocks(
    occupation_id: &str,
    unlocked_ids: &[String],
    content: Option<&ContentBundle>,
) -> u16 {
    let Some(content) = content else {
        return unlocked_ids.len().min(u16::MAX as usize) as u16;
    };
    let Some(tree) = content.talent_trees.get(occupation_id) else {
        return unlocked_ids.len().min(u16::MAX as usize) as u16;
    };

    let unlocked_set = unlocked_ids
        .iter()
        .collect::<std::collections::HashSet<_>>();
    tree.nodes
        .iter()
        .filter(|node| unlocked_set.contains(&node.id))
        .map(|node| node.cost.unwrap_or(1).max(0) as u16)
        .sum()
}

fn legacy_total_xp_from_level(level: u64, rules: &XpAndLevelingRules) -> u64 {
    if level <= rules.max_character_level as u64 {
        return cumulative_xp_for_level(level as u8, rules);
    }

    let pioneer_level = (level.saturating_sub(rules.max_character_level as u64))
        .min(rules.pioneer.max_level as u64) as u16;
    rules
        .max_character_cumulative_xp
        .saturating_add(cumulative_pioneer_xp(pioneer_level, rules))
}

fn should_migrate_legacy_xp(total_xp: u64, level: u64, rules: &XpAndLevelingRules) -> bool {
    if total_xp == 0 && level > 1 {
        return true;
    }

    if level > rules.max_character_level as u64 {
        return true;
    }

    character_level_from_total_xp(total_xp, rules) as u64 != level.max(1)
}

pub fn normalize_character_payload(
    mut payload: Value,
    rules: &GameRulesConfig,
    content: Option<&ContentBundle>,
) -> Value {
    let Some(root) = payload.as_object_mut() else {
        return payload;
    };

    let legacy_level = value_as_u64(root.get("level")).unwrap_or(1).max(1);
    let mut total_xp = value_as_u64(root.get("xp")).unwrap_or(0);
    if should_migrate_legacy_xp(total_xp, legacy_level, &rules.xp_and_leveling) {
        total_xp = legacy_total_xp_from_level(legacy_level, &rules.xp_and_leveling);
    }

    let canonical_level = character_level_from_total_xp(total_xp, &rules.xp_and_leveling);
    root.insert("xp".to_string(), Value::from(total_xp));
    root.insert("level".to_string(), Value::from(canonical_level));

    let occupation_from_root = root.get("occupation").cloned();
    let occupation_id_from_root = occupation_from_root
        .as_ref()
        .and_then(|occupation| occupation.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let (
        primary_occupation_id,
        unlocked_talent_node_ids,
        spent_talent_points,
        spent_stat_points,
        spent_pioneer_occupation_points,
        spent_pioneer_stat_points,
    ) = {
        let progression_value = root
            .entry("progression".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !progression_value.is_object() {
            *progression_value = Value::Object(Map::new());
        }
        let progression = progression_value
            .as_object_mut()
            .expect("progression object");

        let primary_occupation_id = progression
            .get("treeOccupationId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| occupation_id_from_root.clone());

        let unlocked_talent_node_ids =
            value_as_string_vec(progression.get("unlockedTalentNodeIds"));
        let spent_talent_points = primary_occupation_id
            .as_deref()
            .map(|occupation_id| {
                talent_cost_for_unlocks(occupation_id, &unlocked_talent_node_ids, content)
            })
            .unwrap_or_else(|| value_as_u16(progression.get("spentTalentPoints")));
        let spent_stat_points = value_as_u16(progression.get("spentStatPoints"));
        let spent_pioneer_occupation_points =
            value_as_u16(progression.get("spentPioneerOccupationPoints"));
        let spent_pioneer_stat_points = value_as_u16(progression.get("spentPioneerStatPoints"));

        if let Some(occupation_id) = primary_occupation_id.as_deref() {
            progression.insert("treeOccupationId".to_string(), Value::from(occupation_id));
        }
        progression.insert(
            "unlockedTalentNodeIds".to_string(),
            Value::Array(
                unlocked_talent_node_ids
                    .iter()
                    .map(|entry| Value::from(entry.as_str()))
                    .collect(),
            ),
        );
        progression.insert(
            "spentTalentPoints".to_string(),
            Value::from(spent_talent_points),
        );
        progression.insert(
            "spentStatPoints".to_string(),
            Value::from(spent_stat_points),
        );
        progression.insert(
            "spentPioneerOccupationPoints".to_string(),
            Value::from(spent_pioneer_occupation_points),
        );
        progression.insert(
            "spentPioneerStatPoints".to_string(),
            Value::from(spent_pioneer_stat_points),
        );

        (
            primary_occupation_id,
            unlocked_talent_node_ids,
            spent_talent_points,
            spent_stat_points,
            spent_pioneer_occupation_points,
            spent_pioneer_stat_points,
        )
    };

    let mut resolved_occupations = Vec::new();
    if let Some(occupation_id) = primary_occupation_id.as_deref() {
        let occupation_value = occupation_from_root.or_else(|| {
            content
                .and_then(|bundle| bundle.occupations.get(occupation_id))
                .and_then(|occupation| serde_json::to_value(occupation).ok())
        });

        resolved_occupations.push(ResolvedOccupationProgress {
            occupation_id: occupation_id.to_string(),
            occupation: occupation_value.clone(),
            unlocked_talent_node_ids: unlocked_talent_node_ids.clone(),
            spent_talent_points,
            level: 1_u16.saturating_add(spent_talent_points),
            available_talent_points: 0,
            is_primary: true,
        });

        if root.get("occupation").is_none() {
            if let Some(occupation) = occupation_value {
                root.insert("occupation".to_string(), occupation);
            }
        }
    }

    let mut resolved = resolve_progression(
        total_xp,
        spent_talent_points,
        spent_stat_points,
        spent_pioneer_occupation_points,
        spent_pioneer_stat_points,
        resolved_occupations.clone(),
        &rules.xp_and_leveling,
    );

    for occupation in resolved.occupations.iter_mut() {
        occupation.available_talent_points = resolved.available_talent_points;
    }

    if let Some(progression) = root.get_mut("progression").and_then(Value::as_object_mut) {
        progression.insert(
            "availableTalentPoints".to_string(),
            Value::from(resolved.available_talent_points),
        );

        if let Ok(occupation_states_value) = serde_json::to_value(&resolved.occupations) {
            progression.insert(
                "occupationStates".to_string(),
                occupation_states_value.clone(),
            );
            root.insert("occupations".to_string(), occupation_states_value);
        }
    }

    if let Ok(resolved_value) = serde_json::to_value(&resolved) {
        root.insert("resolvedProgression".to_string(), resolved_value);
    }

    payload
}

pub fn migrate_generated_characters_on_startup() -> Result<(), String> {
    let characters_dir = std::env::current_dir()
        .map_err(|e| format!("resolve cwd: {e}"))?
        .join("generated")
        .join("characters");
    if !characters_dir.exists() {
        return Ok(());
    }

    let rules = crate::game_rules::load_rules_from_file();
    let content = load_content_bundle().ok();
    let mut migrated_count = 0_u32;

    for entry in std::fs::read_dir(&characters_dir)
        .map_err(|e| format!("read characters dir {}: {e}", characters_dir.display()))?
    {
        let path = match entry {
            Ok(file) => file.path(),
            Err(error) => {
                warn!("Skipping character entry during migration: {error}");
                continue;
            }
        };

        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let raw = match std::fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(error) => {
                warn!("Could not read character file {}: {error}", path.display());
                continue;
            }
        };

        let payload = match serde_json::from_str::<Value>(&raw) {
            Ok(payload) => payload,
            Err(error) => {
                warn!("Could not parse character file {}: {error}", path.display());
                continue;
            }
        };

        let normalized = normalize_character_payload(payload, &rules, content.as_ref());
        let normalized_string = match serde_json::to_string_pretty(&normalized) {
            Ok(value) => value,
            Err(error) => {
                warn!(
                    "Could not serialize migrated character {}: {error}",
                    path.display()
                );
                continue;
            }
        };

        if normalized_string != raw {
            std::fs::write(&path, normalized_string)
                .map_err(|e| format!("write migrated character {}: {e}", path.display()))?;
            migrated_count = migrated_count.saturating_add(1);
        }
    }

    if migrated_count > 0 {
        info!(
            "Migrated {migrated_count} generated character file(s) to canonical XP & Leveling data"
        );
    }

    Ok(())
}

pub async fn preview_rules(
    State(_state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rules: GameRulesConfig = serde_json::from_value(payload).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Invalid rules payload: {e}"),
        )
    })?;
    let normalized = crate::game_rules::normalize_game_rules(rules);
    Ok((StatusCode::OK, Json(json!(normalized))))
}

pub async fn resolve_progression_handler(
    State(_state): State<AppState>,
    Json(payload): Json<ResolveProgressionRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rules = crate::game_rules::load_rules_from_file();
    let resolved = resolve_progression(
        payload.total_xp,
        payload.spent_talent_points,
        payload.spent_stat_points,
        payload.spent_pioneer_occupation_points,
        payload.spent_pioneer_stat_points,
        Vec::new(),
        &rules.xp_and_leveling,
    );
    Ok((StatusCode::OK, Json(json!(resolved))))
}

pub async fn resolve_character_handler(
    State(_state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rules = crate::game_rules::load_rules_from_file();
    let content = load_content_bundle().ok();
    let normalized = normalize_character_payload(payload, &rules, content.as_ref());
    Ok((StatusCode::OK, Json(normalized)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game_rules::GameRulesConfig;

    #[test]
    fn default_formula_uses_canonical_table() {
        let mut rules = GameRulesConfig::default();
        normalize_xp_and_leveling_rules(&mut rules.xp_and_leveling);
        let table = &rules.xp_and_leveling.generated_level_table;
        assert_eq!(table.first().unwrap().cumulative_xp, 0);
        assert_eq!(table.first().unwrap().next_level_xp, Some(120));
        assert_eq!(table[2].cumulative_xp, 642);
        assert_eq!(table[3].cumulative_xp, 1_712);
        assert_eq!(table.last().unwrap().cumulative_xp, 414_000);
    }

    #[test]
    fn level_boundaries_match_rules() {
        let rules = crate::game_rules::load_rules_from_file();
        assert_eq!(character_level_from_total_xp(0, &rules.xp_and_leveling), 1);
        assert_eq!(
            character_level_from_total_xp(119, &rules.xp_and_leveling),
            1
        );
        assert_eq!(
            character_level_from_total_xp(120, &rules.xp_and_leveling),
            2
        );
        assert_eq!(
            character_level_from_total_xp(413_999, &rules.xp_and_leveling),
            29
        );
        assert_eq!(
            character_level_from_total_xp(414_000, &rules.xp_and_leveling),
            30
        );
    }

    #[test]
    fn rewards_and_pioneer_rules_match_defaults() {
        let rules = crate::game_rules::load_rules_from_file();
        assert_eq!(
            occupation_points_total_for_level(1, &rules.xp_and_leveling),
            1
        );
        assert_eq!(stat_points_total_for_level(30, &rules.xp_and_leveling), 10);
        assert_eq!(cumulative_pioneer_xp(20, &rules.xp_and_leveling), 700_000);
        assert_eq!(cumulative_pioneer_xp(50, &rules.xp_and_leveling), 2_050_000);
        assert_eq!(
            cumulative_pioneer_xp(100, &rules.xp_and_leveling),
            5_050_000
        );
        assert_eq!(
            cumulative_pioneer_xp(150, &rules.xp_and_leveling),
            9_050_000
        );
        assert_eq!(
            cumulative_pioneer_xp(200, &rules.xp_and_leveling),
            14_050_000
        );
    }

    #[test]
    fn multi_level_gain_is_counted_correctly() {
        let rules = crate::game_rules::load_rules_from_file();
        let gained = levels_gained_from_xp_gain(0, 700, &rules.xp_and_leveling);
        assert_eq!(gained, 2);
    }

    #[test]
    fn legacy_level_is_migrated_to_canonical_xp() {
        let rules = crate::game_rules::load_rules_from_file();
        let payload = json!({
            "id": "char-test",
            "name": "Test",
            "stats": {
                "strength": 3,
                "agility": 3,
                "intelligence": 3,
                "wisdom": 3,
                "endurance": 3,
                "charisma": 3
            },
            "traits": [],
            "inventory": [],
            "level": 12,
            "xp": 0
        });
        let normalized = normalize_character_payload(payload, &rules, None);
        assert_eq!(normalized.get("xp").and_then(Value::as_u64), Some(39_671));
        assert_eq!(normalized.get("level").and_then(Value::as_u64), Some(12));
    }
}
