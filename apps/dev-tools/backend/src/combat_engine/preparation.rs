use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use super::combat::CombatState;
use super::content_loader::{
    load_character, load_content_bundle, ContentBundle, RawCharacter, RawItem, RawTalentNode,
};
use super::rules::GameRulesConfig;
use super::types::*;

const DEFAULT_PLAYER_SKILL_IDS: &[&str] = &[
    "use-weapon",
    "first-aid",
    "fireball",
    "shove",
    "healing-pulse",
    "piercing-shot",
    "sprint",
    "defend",
    "hide",
    "distract",
    "analyze",
];

const DEFAULT_ENEMY_SKILL_IDS: &[&str] = &["use-weapon", "quick-shot", "power-strike", "war-cry"];

fn canonical_skill_id(skill_id: &str) -> &str {
    match skill_id {
        "slash" => "use-weapon",
        _ => skill_id,
    }
}

fn combat_skill_priority(skill_id: &str) -> usize {
    match skill_id {
        "use-weapon" => 0,
        "first-aid" => 1,
        _ => usize::MAX,
    }
}

#[derive(Clone)]
struct PreparedCombatant {
    team: CombatTeam,
    entity: TacticalEntity,
}

pub fn prepare_combatants(
    roster: &[CombatRosterEntry],
    rules: &GameRulesConfig,
) -> Result<(Vec<TacticalEntity>, Vec<TacticalEntity>), String> {
    let content = load_content_bundle()?;
    let mut prepared = Vec::with_capacity(roster.len());

    for entry in roster {
        let character = load_character(&entry.character_id)?;
        prepared.push(PreparedCombatant {
            team: entry.team.clone(),
            entity: build_tactical_entity(&content, &character, entry, rules)?,
        });
    }

    let mut players = Vec::new();
    let mut enemies = Vec::new();
    for combatant in prepared {
        match combatant.team {
            CombatTeam::Player => players.push(combatant.entity),
            CombatTeam::Enemy => enemies.push(combatant.entity),
        }
    }

    Ok((players, enemies))
}

fn build_tactical_entity(
    content: &ContentBundle,
    character: &RawCharacter,
    roster_entry: &CombatRosterEntry,
    rules: &GameRulesConfig,
) -> Result<TacticalEntity, String> {
    let primary_occupation_state = character.occupations.as_ref().and_then(|states| {
        states
            .iter()
            .find(|state| state.is_primary)
            .or_else(|| states.first())
    });
    let occupation = character
        .occupation
        .clone()
        .or_else(|| primary_occupation_state.and_then(|state| state.occupation.clone()))
        .or_else(|| {
            character
                .progression
                .as_ref()
                .and_then(|progression| progression.tree_occupation_id.as_ref())
                .and_then(|occupation_id| content.occupations.get(occupation_id).cloned())
        })
        .or_else(|| {
            primary_occupation_state
                .and_then(|state| content.occupations.get(&state.occupation_id).cloned())
        });

    let resolved_equipped = resolve_equipped(content, character)?;
    let main_hand_weapon = resolved_equipped
        .get("mainHand")
        .and_then(|value| value.as_ref())
        .cloned();

    let traits = build_combat_traits(content, character, occupation.as_ref());
    let mut skills = resolve_combat_skills(content, character, roster_entry.team.clone());
    patch_use_weapon_skill(&mut skills, main_hand_weapon.as_ref());

    let base_stats = BaseStats {
        strength: character.stats.strength,
        agility: character.stats.agility,
        intelligence: character.stats.intelligence,
        wisdom: character.stats.wisdom,
        endurance: character.stats.endurance,
        charisma: character.stats.charisma,
        evasion: character.stats.agility / 4,
        defense: character.stats.endurance / 2,
    };

    let mut entity = TacticalEntity {
        id: roster_entry.roster_id.clone(),
        is_player: roster_entry.team == CombatTeam::Player,
        name: character.name.clone(),
        hp: rules.core.hp_base + character.stats.endurance * rules.core.hp_per_endurance,
        max_hp: rules.core.hp_base + character.stats.endurance * rules.core.hp_per_endurance,
        strength: character.stats.strength,
        agility: character.stats.agility,
        intelligence: character.stats.intelligence,
        wisdom: character.stats.wisdom,
        endurance: character.stats.endurance,
        charisma: character.stats.charisma,
        crit_chance: character.stats.intelligence as f64 * rules.core.crit_per_intelligence,
        resistance: character.stats.wisdom as f64 * rules.core.resist_per_wisdom,
        social_bonus: character.stats.charisma as f64 * rules.core.charisma_bonus_per_charisma,
        evasion: base_stats.evasion,
        defense: base_stats.defense,
        traits,
        skills,
        occupation,
        progression: character.progression.clone(),
        skill_cooldowns: HashMap::new(),
        ap: rules.core.ap_base + character.stats.agility / rules.core.ap_agility_divisor,
        max_ap: rules.core.ap_base + character.stats.agility / rules.core.ap_agility_divisor,
        mp: rules.core.mp_base,
        max_mp: rules.core.mp_base,
        level: character.level.max(1),
        grid_pos: GridPos { row: 0, col: 0 },
        equipped: Some(equipped_map_to_value(resolved_equipped)?),
        active_effects: None,
        base_stats,
    };

    CombatState::calculate_effective_stats(&mut entity, rules);
    entity.hp = entity.max_hp;
    entity.ap = entity.max_ap;
    entity.mp = entity.max_mp;

    Ok(entity)
}

fn build_combat_traits(
    content: &ContentBundle,
    character: &RawCharacter,
    occupation: Option<&Occupation>,
) -> Vec<Trait> {
    let mut traits = character.traits.clone();

    if let Some(occupation) = occupation {
        if let Some(effects) = &occupation.effects {
            let combat_effects: Vec<GameplayEffect> = effects
                .iter()
                .filter(|effect| {
                    effect.scope.is_none()
                        || effect.scope == Some(EffectScope::Combat)
                        || effect.scope == Some(EffectScope::Global)
                })
                .cloned()
                .collect();
            if !combat_effects.is_empty() {
                traits.push(Trait {
                    id: format!("{}-combat-baseline", occupation.id),
                    name: format!("{} Baseline", occupation.name),
                    description: format!("Resolved occupation effects for {}.", occupation.name),
                    cost: 0,
                    trait_type: TraitType::Neutral,
                    impact: None,
                    effects: Some(combat_effects),
                    icon: None,
                });
            }
        }
    }

    for node in unlocked_nodes(content, character) {
        if node.effects.is_empty() {
            continue;
        }
        let combat_effects: Vec<GameplayEffect> = node
            .effects
            .iter()
            .filter(|effect| {
                effect.scope.is_none()
                    || effect.scope == Some(EffectScope::Combat)
                    || effect.scope == Some(EffectScope::Global)
            })
            .cloned()
            .collect();
        if combat_effects.is_empty() {
            continue;
        }
        traits.push(Trait {
            id: format!("{}-{}-resolved", character.id, node.id),
            name: node.name.clone(),
            description: node.description.clone(),
            cost: 0,
            trait_type: TraitType::Neutral,
            impact: None,
            effects: Some(combat_effects),
            icon: None,
        });
    }

    dedupe_traits(traits)
}

fn resolve_combat_skills(
    content: &ContentBundle,
    character: &RawCharacter,
    team: CombatTeam,
) -> Vec<Skill> {
    let mut skills = refresh_skills(content, &character.skills);

    let granted_skills = unlocked_nodes(content, character)
        .iter()
        .flat_map(|node| node.grants_skill_ids.iter())
        .filter_map(|skill_id| content.skills.get(canonical_skill_id(skill_id)).cloned())
        .collect::<Vec<_>>();
    skills.extend(granted_skills);
    skills = dedupe_skills(skills);

    if skills.is_empty() {
        let defaults = match team {
            CombatTeam::Player => DEFAULT_PLAYER_SKILL_IDS,
            CombatTeam::Enemy => DEFAULT_ENEMY_SKILL_IDS,
        };
        skills = defaults
            .iter()
            .filter_map(|skill_id| content.skills.get(*skill_id).cloned())
            .collect();
    }

    if team == CombatTeam::Player {
        skills.extend(
            content
                .skills
                .values()
                .filter(|skill| skill.category == SkillCategory::Base)
                .cloned(),
        );
    }

    prioritize_skills(dedupe_skills(skills))
}

fn refresh_skills(content: &ContentBundle, skills: &[Skill]) -> Vec<Skill> {
    skills
        .iter()
        .map(|skill| {
            let canonical_id = canonical_skill_id(&skill.id);
            content
                .skills
                .get(canonical_id)
                .cloned()
                .unwrap_or_else(|| {
                    if canonical_id == skill.id {
                        skill.clone()
                    } else {
                        let mut normalized = skill.clone();
                        normalized.id = canonical_id.to_string();
                        normalized
                    }
                })
        })
        .collect()
}

fn patch_use_weapon_skill(skills: &mut [Skill], main_hand_weapon: Option<&RawItem>) {
    for skill in skills.iter_mut() {
        if skill.id != "use-weapon" {
            continue;
        }

        if let Some(weapon) = main_hand_weapon {
            skill.max_range = weapon.weapon_range.unwrap_or(1);
            skill.min_range = 1;
            skill.area_type = weapon
                .weapon_area_type
                .as_deref()
                .and_then(parse_skill_area_type)
                .unwrap_or(SkillAreaType::Single);
            skill.area_size = weapon.weapon_area_size.unwrap_or(0);

            let type_label = weapon
                .weapon_type
                .as_deref()
                .unwrap_or("melee")
                .to_uppercase();
            let dmg_str = weapon
                .effects
                .as_ref()
                .and_then(|effects| {
                    effects
                        .iter()
                        .find(|effect| effect.target.as_deref() == Some("damage"))
                })
                .map(|effect| format!(" | Base DMG: {}", effect.value as i32))
                .unwrap_or_default();
            let scaling_str = if weapon.weapon_type.as_deref() == Some("ranged") {
                " [FIXED]"
            } else {
                " + STR"
            };
            let aoe_str = if skill.area_type != SkillAreaType::Single {
                format!(
                    " | AOE: {}({})",
                    skill_area_label(&skill.area_type),
                    skill.area_size
                )
            } else {
                String::new()
            };
            skill.description = format!(
                "Attack with {} [{}{}{}{}]",
                weapon.name, type_label, dmg_str, scaling_str, aoe_str
            );
        } else {
            skill.max_range = 1;
            skill.min_range = 1;
            skill.area_type = SkillAreaType::Single;
            skill.area_size = 0;
            skill.description = "Attack unarmed [MELEE + STR]".to_string();
        }
    }
}

fn resolve_equipped(
    content: &ContentBundle,
    character: &RawCharacter,
) -> Result<HashMap<String, Option<RawItem>>, String> {
    let mut resolved = HashMap::new();
    if let Some(equipped) = &character.equipped {
        for (slot, value) in equipped {
            let item = match value {
                Some(value) => resolve_item_reference(content, value)?,
                None => None,
            };
            resolved.insert(slot.clone(), item);
        }
    }
    Ok(resolved)
}

fn resolve_item_reference(
    content: &ContentBundle,
    value: &Value,
) -> Result<Option<RawItem>, String> {
    if value.is_null() {
        return Ok(None);
    }

    if let Some(id) = value.get("id").and_then(Value::as_str) {
        if let Some(item) = content.items.get(id) {
            return Ok(Some(item.clone()));
        }
    }

    serde_json::from_value::<RawItem>(value.clone())
        .map(Some)
        .map_err(|e| format!("parse embedded equipped item: {e}"))
}

fn equipped_map_to_value(equipped: HashMap<String, Option<RawItem>>) -> Result<Value, String> {
    let mut map = Map::new();
    for (slot, item) in equipped {
        let value = match item {
            Some(item) => serde_json::to_value(item)
                .map_err(|e| format!("serialize equipped item for slot {slot}: {e}"))?,
            None => Value::Null,
        };
        map.insert(slot, value);
    }
    Ok(Value::Object(map))
}

fn unlocked_nodes<'a>(
    content: &'a ContentBundle,
    character: &RawCharacter,
) -> Vec<&'a RawTalentNode> {
    let primary_occupation_state = character.occupations.as_ref().and_then(|states| {
        states
            .iter()
            .find(|state| state.is_primary)
            .or_else(|| states.first())
    });
    let occupation_id = character
        .progression
        .as_ref()
        .and_then(|progression| progression.tree_occupation_id.as_ref())
        .or_else(|| primary_occupation_state.map(|state| &state.occupation_id))
        .or_else(|| {
            character
                .occupation
                .as_ref()
                .map(|occupation| &occupation.id)
        });

    let unlocked_ids: HashSet<&str> = primary_occupation_state
        .map(|state| {
            state
                .unlocked_talent_node_ids
                .iter()
                .map(String::as_str)
                .collect()
        })
        .or_else(|| {
            character.progression.as_ref().map(|progression| {
                progression
                    .unlocked_talent_node_ids
                    .iter()
                    .map(String::as_str)
                    .collect()
            })
        })
        .unwrap_or_default();

    if let Some(occupation_id) = occupation_id {
        if let Some(tree) = content.talent_trees.get(occupation_id) {
            return tree
                .nodes
                .iter()
                .filter(|node| unlocked_ids.contains(node.id.as_str()))
                .collect();
        }
    }

    Vec::new()
}

fn dedupe_skills(skills: Vec<Skill>) -> Vec<Skill> {
    let mut seen = HashSet::new();
    skills
        .into_iter()
        .filter(|skill| seen.insert(skill.id.clone()))
        .collect()
}

fn prioritize_skills(mut skills: Vec<Skill>) -> Vec<Skill> {
    skills.sort_by_key(|skill| combat_skill_priority(&skill.id));
    skills
}

fn dedupe_traits(traits: Vec<Trait>) -> Vec<Trait> {
    let mut seen = HashSet::new();
    traits
        .into_iter()
        .filter(|trait_entry| seen.insert(trait_entry.id.clone()))
        .collect()
}

fn parse_skill_area_type(value: &str) -> Option<SkillAreaType> {
    match value {
        "single" => Some(SkillAreaType::Single),
        "cross" => Some(SkillAreaType::Cross),
        "circle" => Some(SkillAreaType::Circle),
        "splash" => Some(SkillAreaType::Splash),
        "line" => Some(SkillAreaType::Line),
        "cone" => Some(SkillAreaType::Cone),
        "perpendicular" => Some(SkillAreaType::Perpendicular),
        _ => None,
    }
}

fn skill_area_label(area_type: &SkillAreaType) -> &'static str {
    match area_type {
        SkillAreaType::Single => "single",
        SkillAreaType::Cross => "cross",
        SkillAreaType::Circle => "circle",
        SkillAreaType::Splash => "splash",
        SkillAreaType::Line => "line",
        SkillAreaType::Cone => "cone",
        SkillAreaType::Perpendicular => "perpendicular",
    }
}
