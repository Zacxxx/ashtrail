use rand::Rng;
use serde_json::Value;

use super::modifiers::{is_analyzed_effect, is_weapon_damage_replacement_effect};
use super::rules::GameRulesConfig;
use super::types::{
    DamagePreview, EffectType, GameplayEffect, Skill, SkillEffectType, TacticalEntity,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WeaponProfile {
    Melee,
    Ranged,
}

#[derive(Debug, Clone, Copy)]
pub struct DamageRoll {
    pub actual_damage: i32,
    pub is_crit: bool,
    pub is_miss: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct DefendResolution {
    pub protector_damage: i32,
    pub ally_damage: i32,
    pub armor_block: i32,
    pub roll_value: i32,
    pub outcome_label: &'static str,
}

pub fn has_weapon_damage_replacement(skill: &Skill) -> bool {
    skill
        .effects
        .as_ref()
        .is_some_and(|effects| effects.iter().any(is_weapon_damage_replacement_effect))
}

pub fn weapon_profile(entity: &TacticalEntity) -> WeaponProfile {
    if equipped_weapon(entity)
        .and_then(|weapon| weapon.get("weaponType"))
        .and_then(Value::as_str)
        == Some("ranged")
    {
        WeaponProfile::Ranged
    } else {
        WeaponProfile::Melee
    }
}

pub fn resolve_weapon_base_damage(caster: &TacticalEntity, skill: &Skill) -> i32 {
    if has_weapon_damage_replacement(skill) {
        weapon_damage_value(caster).unwrap_or_else(|| skill.damage.unwrap_or(5))
    } else {
        skill.damage.unwrap_or(0)
    }
}

pub fn compute_skill_damage_preview(
    caster: &TacticalEntity,
    target: &TacticalEntity,
    skill: &Skill,
    rules: &GameRulesConfig,
) -> Option<DamagePreview> {
    if skill.damage.is_none() && skill.push_distance.is_none() {
        return None;
    }

    let is_magical = skill.effect_type == Some(SkillEffectType::Magical);
    let base_damage = resolve_weapon_base_damage(caster, skill);
    let analyzed_bonus = analyzed_bonus(target);

    let (min_damage, max_damage) = if uses_legacy_weapon_formula(skill)
        || skill.push_distance.is_some()
    {
        let (min_bonus, max_bonus) = legacy_stat_bonus_bounds(caster, skill, rules, base_damage);
        (
            ((base_damage as f64 + min_bonus) * rules.combat.damage_variance_min) as i32,
            ((base_damage as f64 + max_bonus) * rules.combat.damage_variance_max) as i32,
        )
    } else {
        (
            ((base_damage as f64 + caster.strength as f64 * rules.combat.strength_to_power_ratio)
                * rules.combat.damage_variance_min) as i32,
            ((base_damage as f64 + caster.strength as f64 * rules.combat.strength_to_power_ratio)
                * rules.combat.damage_variance_max) as i32,
        )
    };

    Some(DamagePreview {
        min: mitigate_damage(min_damage, target, is_magical),
        max: mitigate_damage(max_damage, target, is_magical),
        crit_min: mitigate_damage((min_damage as f64 * 1.5) as i32, target, is_magical),
        crit_max: mitigate_damage((max_damage as f64 * 1.5) as i32, target, is_magical),
        is_magical,
        crit_chance: caster.crit_chance + analyzed_bonus,
    })
}

pub fn compute_skill_damage_roll(
    caster: &TacticalEntity,
    target: &TacticalEntity,
    skill: &Skill,
    rules: &GameRulesConfig,
    rng: &mut impl Rng,
) -> Option<DamageRoll> {
    if skill.damage.is_none() && skill.push_distance.is_none() {
        return None;
    }

    let is_physical = skill.effect_type == Some(SkillEffectType::Physical);
    let is_magical = skill.effect_type == Some(SkillEffectType::Magical);

    if is_physical {
        let hit_chance = 100 - target.evasion;
        if rng.random_range(0..100) > hit_chance {
            return Some(DamageRoll {
                actual_damage: 0,
                is_crit: false,
                is_miss: true,
            });
        }
    }

    let base_damage = resolve_weapon_base_damage(caster, skill);
    let crit_chance = caster.crit_chance + analyzed_bonus(target);
    let is_crit = rng.random::<f64>() < crit_chance;
    let variance = rules.combat.damage_variance_min
        + rng.random::<f64>()
            * (rules.combat.damage_variance_max - rules.combat.damage_variance_min);

    let mut rolled_damage = if uses_legacy_weapon_formula(skill) || skill.push_distance.is_some() {
        let stat_bonus = legacy_stat_bonus_roll(caster, skill, rules, base_damage, rng);
        ((base_damage as f64 + stat_bonus) * variance) as i32
    } else {
        ((base_damage as f64 + caster.strength as f64 * rules.combat.strength_to_power_ratio)
            * variance) as i32
    };

    if is_crit {
        rolled_damage = (rolled_damage as f64 * 1.5) as i32;
    }

    Some(DamageRoll {
        actual_damage: mitigate_damage(rolled_damage, target, is_magical),
        is_crit,
        is_miss: false,
    })
}

pub fn compute_basic_attack_preview(
    attacker: &TacticalEntity,
    defender: &TacticalEntity,
    rules: &GameRulesConfig,
) -> DamagePreview {
    let weapon_base = weapon_damage_value(attacker).unwrap_or(5);
    let (min_bonus, max_bonus) = legacy_basic_attack_bonus_bounds(attacker, rules, weapon_base);
    let min_raw = ((weapon_base as f64 + min_bonus) * rules.combat.damage_variance_min) as i32;
    let max_raw = ((weapon_base as f64 + max_bonus) * rules.combat.damage_variance_max) as i32;

    DamagePreview {
        min: mitigate_damage(min_raw, defender, false),
        max: mitigate_damage(max_raw, defender, false),
        crit_min: mitigate_damage((min_raw as f64 * 1.5) as i32, defender, false),
        crit_max: mitigate_damage((max_raw as f64 * 1.5) as i32, defender, false),
        is_magical: false,
        crit_chance: attacker.crit_chance,
    }
}

pub fn compute_basic_attack_roll(
    attacker: &TacticalEntity,
    defender: &TacticalEntity,
    rules: &GameRulesConfig,
    rng: &mut impl Rng,
) -> DamageRoll {
    let hit_chance = 100 - defender.evasion;
    if rng.random_range(0..100) > hit_chance {
        return DamageRoll {
            actual_damage: 0,
            is_crit: false,
            is_miss: true,
        };
    }

    let weapon_base = weapon_damage_value(attacker).unwrap_or(5);
    let variance = rules.combat.damage_variance_min
        + rng.random::<f64>()
            * (rules.combat.damage_variance_max - rules.combat.damage_variance_min);
    let stat_bonus = legacy_basic_attack_bonus_roll(attacker, rules, weapon_base, rng);
    let is_crit = rng.random::<f64>() < attacker.crit_chance;

    let mut raw_damage = ((weapon_base as f64 + stat_bonus) * variance) as i32;
    if is_crit {
        raw_damage = (raw_damage as f64 * 1.5) as i32;
    }

    DamageRoll {
        actual_damage: mitigate_damage(raw_damage, defender, false),
        is_crit,
        is_miss: false,
    }
}

pub fn distract_mp_reduction(charisma: i32, rules: &GameRulesConfig) -> i32 {
    1 + (rules.combat.distract_charisma_scale * ((charisma.max(0) as f64) + 1.0).ln()) as i32
}

pub fn analyze_crit_bonus(intelligence: i32, rules: &GameRulesConfig) -> f64 {
    let int_value = intelligence.max(0) as f64;
    (rules.combat.analyze_base_crit
        + (rules.combat.analyze_intel_scale * (int_value + 1.0).ln() * 10.0))
        .floor()
}

pub fn stealth_duration(wisdom: i32, rules: &GameRulesConfig) -> u32 {
    let bonus = (rules.combat.stealth_scale_factor * ((wisdom.max(0) as f64) + 1.0).ln()) as u32;
    rules.combat.stealth_base_duration + bonus
}

pub fn resolve_defend(
    protector_endurance: i32,
    protector_defense: i32,
    incoming_damage: i32,
    rules: &GameRulesConfig,
    rng: &mut impl Rng,
) -> DefendResolution {
    let dice = rng.random_range(1..=3);
    let roll_value = protector_endurance.max(0) * dice;
    let diff = roll_value - incoming_damage;

    let (protector_damage, ally_damage, armor_ratio, outcome_label) =
        if diff >= rules.combat.defend_success_threshold {
            (
                incoming_damage,
                0,
                rules.combat.defend_success_reduction,
                "TOTAL SUCCESS",
            )
        } else if diff >= rules.combat.defend_partial_threshold {
            (
                incoming_damage / 2,
                incoming_damage / 2,
                rules.combat.defend_partial_reduction,
                "PARTIAL SUCCESS",
            )
        } else {
            (
                0,
                incoming_damage,
                rules.combat.defend_fail_reduction,
                "FAILED",
            )
        };

    let armor_block = ((protector_defense.max(0) as f64) * armor_ratio) as i32;

    DefendResolution {
        protector_damage: (protector_damage - armor_block).max(0),
        ally_damage,
        armor_block,
        roll_value,
        outcome_label,
    }
}

pub fn active_effect_value(target: &TacticalEntity, effect_type: EffectType) -> f64 {
    target
        .active_effects
        .as_ref()
        .map(|effects| {
            effects
                .iter()
                .filter(|effect| effect.effect_type == effect_type)
                .map(|effect| effect.value)
                .sum::<f64>()
        })
        .unwrap_or(0.0)
}

pub fn mark_just_applied(effect: &mut GameplayEffect) {
    effect.just_applied = Some(true);
}

pub fn value_to_i32(value: &Value) -> i32 {
    value
        .as_i64()
        .map(|number| number as i32)
        .or_else(|| value.as_f64().map(|number| number as i32))
        .unwrap_or(0)
}

fn equipped_weapon(entity: &TacticalEntity) -> Option<&Value> {
    entity
        .equipped
        .as_ref()
        .and_then(|equipped| equipped.get("mainHand"))
}

fn weapon_damage_value(entity: &TacticalEntity) -> Option<i32> {
    equipped_weapon(entity)
        .and_then(|weapon| weapon.get("effects"))
        .and_then(Value::as_array)
        .and_then(|effects| {
            effects.iter().find_map(|effect| {
                let effect_type = effect.get("type").and_then(Value::as_str);
                let target_key = effect.get("target").and_then(Value::as_str);
                if target_key == Some("damage")
                    || target_key == Some("physical_damage")
                    || effect_type == Some("COMBAT_BONUS")
                {
                    Some(effect.get("value").map(value_to_i32).unwrap_or(0))
                } else {
                    None
                }
            })
        })
}

fn uses_legacy_weapon_formula(skill: &Skill) -> bool {
    skill.id == "use-weapon" || has_weapon_damage_replacement(skill)
}

fn legacy_stat_bonus_bounds(
    caster: &TacticalEntity,
    skill: &Skill,
    rules: &GameRulesConfig,
    base_damage: i32,
) -> (f64, f64) {
    if skill.push_distance.unwrap_or(0) > 0 {
        let bonus = caster.strength as f64 * rules.combat.shove_push_damage_ratio;
        return (bonus, bonus);
    }

    match weapon_profile(caster) {
        WeaponProfile::Ranged => (0.0, 0.0),
        WeaponProfile::Melee => {
            let scaling_stat = caster.strength as f64;
            (
                (base_damage as f64 * rules.combat.strength_scaling_min * scaling_stat) / 10.0,
                (base_damage as f64 * rules.combat.strength_scaling_max * scaling_stat) / 10.0,
            )
        }
    }
}

fn legacy_stat_bonus_roll(
    caster: &TacticalEntity,
    skill: &Skill,
    rules: &GameRulesConfig,
    base_damage: i32,
    rng: &mut impl Rng,
) -> f64 {
    if skill.push_distance.unwrap_or(0) > 0 {
        return caster.strength as f64 * rules.combat.shove_push_damage_ratio;
    }

    match weapon_profile(caster) {
        WeaponProfile::Ranged => 0.0,
        WeaponProfile::Melee => {
            let factor = rules.combat.strength_scaling_min
                + rng.random::<f64>()
                    * (rules.combat.strength_scaling_max - rules.combat.strength_scaling_min);
            (base_damage as f64 * factor * caster.strength as f64) / 10.0
        }
    }
}

fn legacy_basic_attack_bonus_bounds(
    attacker: &TacticalEntity,
    rules: &GameRulesConfig,
    base_damage: i32,
) -> (f64, f64) {
    match weapon_profile(attacker) {
        WeaponProfile::Ranged => (0.0, 0.0),
        WeaponProfile::Melee => {
            let scaling_stat = attacker.strength as f64;
            (
                (base_damage as f64 * rules.combat.strength_scaling_min * scaling_stat) / 10.0,
                (base_damage as f64 * rules.combat.strength_scaling_max * scaling_stat) / 10.0,
            )
        }
    }
}

fn legacy_basic_attack_bonus_roll(
    attacker: &TacticalEntity,
    rules: &GameRulesConfig,
    base_damage: i32,
    rng: &mut impl Rng,
) -> f64 {
    match weapon_profile(attacker) {
        WeaponProfile::Ranged => 0.0,
        WeaponProfile::Melee => {
            let factor = rules.combat.strength_scaling_min
                + rng.random::<f64>()
                    * (rules.combat.strength_scaling_max - rules.combat.strength_scaling_min);
            (base_damage as f64 * factor * attacker.strength as f64) / 10.0
        }
    }
}

fn analyzed_bonus(target: &TacticalEntity) -> f64 {
    target
        .active_effects
        .as_ref()
        .map(|effects| {
            effects
                .iter()
                .filter(|effect| {
                    is_analyzed_effect(effect) || effect.effect_type == EffectType::Analyzed
                })
                .map(|effect| effect.value)
                .sum::<f64>()
        })
        .unwrap_or(0.0)
        / 100.0
}

fn mitigate_damage(damage: i32, target: &TacticalEntity, is_magical: bool) -> i32 {
    if is_magical {
        let resist_amount = (damage as f64 * target.resistance) as i32;
        (damage - resist_amount).max(1)
    } else {
        (damage - target.defense).max(1)
    }
}
