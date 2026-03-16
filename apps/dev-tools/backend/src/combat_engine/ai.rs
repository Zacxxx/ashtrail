// ============================================================================
// combat_engine/ai.rs - AI decision tree for enemy turns
// Ported from useTacticalCombat.ts lines 621-718
// ============================================================================

use super::combat::{CombatState, MELEE_RANGE};
use super::grid::{find_path, get_reachable_cells};
use super::modifiers::effect_tags;
use super::types::*;

#[derive(Debug, Clone)]
struct SearchAction {
    skill: Skill,
    target_pos: GridPos,
    score: i32,
    center_distance: i32,
    area_size: i32,
    damage: i32,
    ap_cost: i32,
}

const SEARCH_INTENT_TEMPLATES: [&str; 5] = [
    "{actor} scans [{row}, {col}] for signs of movement.",
    "{actor} closes in on [{row}, {col}], following faint intel.",
    "{actor} sweeps [{row}, {col}] looking for a hidden contact.",
    "{actor} narrows the search around [{row}, {col}].",
    "{actor} checks [{row}, {col}] for any trace of movement.",
];

const SEARCH_CAST_TEMPLATES: [&str; 5] = [
    "{actor} uses {skill} on [{row}, {col}] in hopes of flushing something out.",
    "{actor} fires {skill} into [{row}, {col}], chasing weak intel.",
    "{actor} probes [{row}, {col}] with {skill}, expecting hidden movement.",
    "{actor} commits {skill} to [{row}, {col}] to force out a contact.",
    "{actor} strikes [{row}, {col}] with {skill}, testing the silence.",
];

/// Run a complete AI turn for the currently active entity.
/// Returns all events generated during the AI's actions.
pub fn run_ai_turn(state: &mut CombatState) -> Vec<CombatEvent> {
    let mut events = Vec::new();

    let active_id = match state.get_active_entity_id() {
        Some(id) => id.to_string(),
        None => return events,
    };

    let ai = match state.entities.get(&active_id) {
        Some(entity) if !entity.is_player && entity.hp > 0 => entity.clone(),
        _ => {
            events.extend(state.end_turn());
            return events;
        }
    };

    let all_player_targets: Vec<TacticalEntity> = state
        .entities
        .values()
        .filter(|entity| entity.is_player && entity.hp > 0)
        .cloned()
        .collect();

    if all_player_targets.is_empty() {
        events.extend(state.end_turn());
        return events;
    }

    let visible_targets: Vec<TacticalEntity> = all_player_targets
        .iter()
        .filter(|entity| !entity_has_state_tag(entity, "stealth"))
        .cloned()
        .collect();

    let hidden_targets: Vec<TacticalEntity> = all_player_targets
        .iter()
        .filter(|entity| entity_has_state_tag(entity, "stealth"))
        .cloned()
        .collect();

    let is_searching = visible_targets.is_empty() && !hidden_targets.is_empty();

    let (target_pos, closest_dist, target_id) = if is_searching {
        let (closest_lkp, dist) = find_closest_lkp(&ai, &hidden_targets);
        (closest_lkp, dist, None)
    } else {
        let (closest_target, dist) = find_closest_target(&ai, &visible_targets);
        (
            closest_target.grid_pos.clone(),
            dist,
            Some(closest_target.id.clone()),
        )
    };

    if ai.hp < (ai.max_hp as f64 * 0.4) as i32 {
        if let Some(heal_skill) = find_self_heal(&ai) {
            events.extend(state.execute_skill(
                &active_id,
                ai.grid_pos.row,
                ai.grid_pos.col,
                &heal_skill.id,
            ));
            events.extend(state.end_turn());
            return events;
        }
    }

    if closest_dist > MELEE_RANGE && !is_searching {
        let updated_ai = state
            .entities
            .get(&active_id)
            .cloned()
            .unwrap_or_else(|| ai.clone());
        if let Some(ranged_skill) = find_ranged_skill(&updated_ai, closest_dist) {
            events.extend(state.execute_skill(
                &active_id,
                target_pos.row,
                target_pos.col,
                &ranged_skill.id,
            ));
            events.extend(state.end_turn());
            return events;
        }
    }

    if closest_dist > MELEE_RANGE {
        let updated_ai = state
            .entities
            .get(&active_id)
            .cloned()
            .unwrap_or_else(|| ai.clone());
        if updated_ai.mp > 0 {
            let tackle_cost = state.calculate_tackle_cost(&active_id);
            if updated_ai.ap >= tackle_cost {
                let reachable = get_reachable_cells(
                    &state.grid,
                    updated_ai.grid_pos.row,
                    updated_ai.grid_pos.col,
                    updated_ai.mp,
                );

                let mut best_cell: Option<GridPos> = None;
                let mut best_dist = closest_dist;

                for cell in &reachable {
                    let distance = manhattan_distance(cell, &target_pos);
                    if distance < best_dist {
                        best_dist = distance;
                        best_cell = Some(cell.clone());
                    }
                }

                if let Some(best) = best_cell {
                    let path = find_path(
                        &state.grid,
                        updated_ai.grid_pos.row,
                        updated_ai.grid_pos.col,
                        best.row,
                        best.col,
                    );
                    if path.is_some() {
                        events.extend(state.perform_move(&active_id, best.row, best.col));
                    }
                }
            }
        }
    }

    if is_searching {
        state.add_log(
            &format_search_entry_log(state.turn_number, &active_id, &ai.name, &target_pos),
            LogType::Info,
        );

        let updated_ai = match state.entities.get(&active_id) {
            Some(entity) if entity.hp > 0 => entity.clone(),
            _ => {
                events.extend(state.end_turn());
                return events;
            }
        };

        if let Some(search_action) = find_best_search_action(state, &updated_ai, &target_pos) {
            state.add_log(
                &format_search_cast_log(
                    state.turn_number,
                    &active_id,
                    &updated_ai.name,
                    &search_action.skill,
                    &search_action.target_pos,
                ),
                LogType::Info,
            );
            events.extend(state.execute_ai_search_skill(
                &active_id,
                search_action.target_pos.row,
                search_action.target_pos.col,
                &search_action.skill.id,
            ));
        }

        events.extend(state.end_turn());
        return events;
    }

    let updated_ai = match state.entities.get(&active_id) {
        Some(entity) if entity.hp > 0 => entity.clone(),
        _ => {
            events.extend(state.end_turn());
            return events;
        }
    };

    let new_dist = manhattan_distance(&updated_ai.grid_pos, &target_pos);

    if let Some(target_id) = target_id {
        let updated_target = state.entities.get(&target_id).cloned();

        if let Some(target) = updated_target {
            if target.hp > 0 && new_dist <= MELEE_RANGE {
                if let Some(melee_skill) = find_melee_skill(&updated_ai, new_dist) {
                    events.extend(state.execute_skill(
                        &active_id,
                        target.grid_pos.row,
                        target.grid_pos.col,
                        &melee_skill.id,
                    ));
                } else if updated_ai.ap >= super::combat::MELEE_ATTACK_COST {
                    events.extend(state.perform_attack(&active_id, &target_id));
                }
            }
        }
    }

    events.extend(state.end_turn());
    events
}

fn entity_has_state_tag(entity: &TacticalEntity, tag: &str) -> bool {
    entity.active_effects.as_ref().is_some_and(|effects| {
        effects.iter().any(|effect| {
            effect_tags(effect)
                .iter()
                .any(|effect_tag| effect_tag == tag)
        })
    })
}

fn format_search_entry_log(
    turn_number: u32,
    caster_id: &str,
    actor_name: &str,
    target_pos: &GridPos,
) -> String {
    let seed = build_search_seed("intent", turn_number, caster_id, target_pos, None);
    let variant = select_search_phrase_variant(seed, SEARCH_INTENT_TEMPLATES.len());
    render_search_template(
        SEARCH_INTENT_TEMPLATES[variant],
        actor_name,
        None,
        target_pos,
    )
}

fn format_search_cast_log(
    turn_number: u32,
    caster_id: &str,
    actor_name: &str,
    skill: &Skill,
    target_pos: &GridPos,
) -> String {
    let seed = build_search_seed("cast", turn_number, caster_id, target_pos, Some(&skill.id));
    let variant = select_search_phrase_variant(seed, SEARCH_CAST_TEMPLATES.len());
    render_search_template(
        SEARCH_CAST_TEMPLATES[variant],
        actor_name,
        Some(skill.name.as_str()),
        target_pos,
    )
}

fn build_search_seed(
    category: &str,
    turn_number: u32,
    caster_id: &str,
    target_pos: &GridPos,
    skill_id: Option<&str>,
) -> u64 {
    let mut seed = (turn_number as u64)
        .wrapping_mul(131)
        .wrapping_add((target_pos.row as u64).wrapping_mul(17))
        .wrapping_add((target_pos.col as u64).wrapping_mul(29));

    for (index, byte) in category.bytes().enumerate() {
        seed = seed.wrapping_add((byte as u64).wrapping_mul((index as u64) + 1));
    }
    for (index, byte) in caster_id.bytes().enumerate() {
        seed = seed.wrapping_add((byte as u64).wrapping_mul((index as u64) + 7));
    }
    if let Some(skill_id) = skill_id {
        for (index, byte) in skill_id.bytes().enumerate() {
            seed = seed.wrapping_add((byte as u64).wrapping_mul((index as u64) + 13));
        }
    }

    seed
}

fn select_search_phrase_variant(seed: u64, pool_len: usize) -> usize {
    if pool_len == 0 {
        return 0;
    }
    (seed % pool_len as u64) as usize
}

fn render_search_template(
    template: &str,
    actor_name: &str,
    skill_name: Option<&str>,
    target_pos: &GridPos,
) -> String {
    template
        .replace("{actor}", actor_name)
        .replace("{skill}", skill_name.unwrap_or(""))
        .replace("{row}", &target_pos.row.to_string())
        .replace("{col}", &target_pos.col.to_string())
}

fn find_closest_target(ai: &TacticalEntity, targets: &[TacticalEntity]) -> (TacticalEntity, i32) {
    let mut closest = targets[0].clone();
    let mut closest_dist = i32::MAX;

    for target in targets {
        let distance = manhattan_distance(&target.grid_pos, &ai.grid_pos);
        if distance < closest_dist {
            closest_dist = distance;
            closest = target.clone();
        }
    }

    (closest, closest_dist)
}

fn find_closest_lkp(ai: &TacticalEntity, hidden_targets: &[TacticalEntity]) -> (GridPos, i32) {
    let mut closest_lkp = find_stealth_lkp(&hidden_targets[0]);
    let mut closest_dist = i32::MAX;

    for target in hidden_targets {
        let lkp = find_stealth_lkp(target);
        let distance = manhattan_distance(&lkp, &ai.grid_pos);
        if distance < closest_dist {
            closest_dist = distance;
            closest_lkp = lkp;
        }
    }

    (closest_lkp, closest_dist)
}

fn find_stealth_lkp(target: &TacticalEntity) -> GridPos {
    target
        .active_effects
        .as_ref()
        .and_then(|effects| {
            effects.iter().find(|effect| {
                effect_tags(effect)
                    .iter()
                    .any(|effect_tag| effect_tag == "stealth")
            })
        })
        .and_then(|effect| effect.last_known_position.clone())
        .unwrap_or_else(|| target.grid_pos.clone())
}

fn find_self_heal(entity: &TacticalEntity) -> Option<&Skill> {
    entity.skills.iter().find(|skill| {
        skill.target_type == SkillTargetType::SelfTarget
            && skill.healing.is_some()
            && skill.ap_cost <= entity.ap
            && !has_cooldown(entity, &skill.id)
    })
}

fn find_ranged_skill(entity: &TacticalEntity, target_dist: i32) -> Option<&Skill> {
    entity.skills.iter().find(|skill| {
        skill.target_type == SkillTargetType::Enemy
            && skill.damage.is_some()
            && skill.max_range >= target_dist
            && skill.min_range <= target_dist
            && skill.ap_cost <= entity.ap
            && !has_cooldown(entity, &skill.id)
    })
}

fn find_melee_skill(entity: &TacticalEntity, dist: i32) -> Option<Skill> {
    let mut candidates: Vec<&Skill> = entity
        .skills
        .iter()
        .filter(|skill| {
            skill.target_type == SkillTargetType::Enemy
                && skill.damage.is_some()
                && skill.max_range >= dist
                && skill.min_range <= dist
                && skill.ap_cost <= entity.ap
                && !has_cooldown(entity, &skill.id)
        })
        .collect();

    candidates.sort_by(|left, right| right.damage.unwrap_or(0).cmp(&left.damage.unwrap_or(0)));
    candidates.first().map(|skill| (*skill).clone())
}

fn has_cooldown(entity: &TacticalEntity, skill_id: &str) -> bool {
    entity
        .skill_cooldowns
        .get(skill_id)
        .map(|cooldown| *cooldown > 0)
        .unwrap_or(false)
}

fn is_search_cast_compatible(skill: &Skill) -> bool {
    skill.damage.is_some()
        && (skill.target_type == SkillTargetType::Cell || skill.area_type != SkillAreaType::Single)
}

fn find_best_search_action(
    state: &CombatState,
    entity: &TacticalEntity,
    lkp: &GridPos,
) -> Option<SearchAction> {
    let mut best_action: Option<SearchAction> = None;

    for skill in entity.skills.iter().filter(|skill| {
        is_search_cast_compatible(skill)
            && skill.ap_cost <= entity.ap
            && !has_cooldown(entity, &skill.id)
    }) {
        for target_pos in collect_search_candidate_cells(state, entity, skill, lkp) {
            let center_distance = manhattan_distance(&target_pos, lkp);
            let affected_cells =
                state.skill_affected_cells(&entity.grid_pos, target_pos.row, target_pos.col, skill);
            let action = SearchAction {
                skill: skill.clone(),
                target_pos,
                score: score_search_target(&affected_cells, lkp, center_distance),
                center_distance,
                area_size: skill.area_size,
                damage: skill.damage.unwrap_or(0),
                ap_cost: skill.ap_cost,
            };

            if best_action
                .as_ref()
                .is_none_or(|current| is_better_search_action(&action, current))
            {
                best_action = Some(action);
            }
        }
    }

    best_action
}

fn collect_search_candidate_cells(
    state: &CombatState,
    entity: &TacticalEntity,
    skill: &Skill,
    lkp: &GridPos,
) -> Vec<GridPos> {
    let mut candidates = Vec::new();

    push_candidate_cell(&mut candidates, &state.grid, lkp.row as i32, lkp.col as i32);

    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        push_candidate_cell(
            &mut candidates,
            &state.grid,
            lkp.row as i32 + dr,
            lkp.col as i32 + dc,
        );
    }

    for (dr, dc) in [(-1, -1), (-1, 1), (1, -1), (1, 1)] {
        push_candidate_cell(
            &mut candidates,
            &state.grid,
            lkp.row as i32 + dr,
            lkp.col as i32 + dc,
        );
    }

    let mut fallback = Vec::new();
    for row in 0..state.grid.len() {
        for col in 0..state.grid[row].len() {
            if state.grid[row][col].walkable {
                fallback.push(GridPos { row, col });
            }
        }
    }

    fallback.sort_by(|left, right| {
        manhattan_distance(left, lkp)
            .cmp(&manhattan_distance(right, lkp))
            .then_with(|| left.row.cmp(&right.row))
            .then_with(|| left.col.cmp(&right.col))
    });

    for cell in fallback {
        if !candidates
            .iter()
            .any(|existing| existing.row == cell.row && existing.col == cell.col)
        {
            candidates.push(cell);
        }
    }

    candidates
        .into_iter()
        .filter(|cell| {
            state
                .validate_ai_search_skill_cast(&entity.id, cell.row, cell.col, &skill.id)
                .is_ok()
        })
        .collect()
}

fn push_candidate_cell(cells: &mut Vec<GridPos>, grid: &Grid, row: i32, col: i32) {
    if row < 0 || col < 0 {
        return;
    }

    let row = row as usize;
    let col = col as usize;
    let Some(grid_row) = grid.get(row) else {
        return;
    };
    let Some(cell) = grid_row.get(col) else {
        return;
    };
    if !cell.walkable {
        return;
    }
    if cells
        .iter()
        .any(|existing| existing.row == row && existing.col == col)
    {
        return;
    }
    cells.push(GridPos { row, col });
}

fn score_search_target(affected_cells: &[GridPos], lkp: &GridPos, center_distance: i32) -> i32 {
    let mut score = -center_distance;

    if affected_cells
        .iter()
        .any(|cell| cell.row == lkp.row && cell.col == lkp.col)
    {
        score += 100;
    }

    for (dr, dc, weight) in [
        (-1, 0, 20),
        (1, 0, 20),
        (0, -1, 20),
        (0, 1, 20),
        (-1, -1, 10),
        (-1, 1, 10),
        (1, -1, 10),
        (1, 1, 10),
    ] {
        let row = lkp.row as i32 + dr;
        let col = lkp.col as i32 + dc;
        if row < 0 || col < 0 {
            continue;
        }
        if affected_cells
            .iter()
            .any(|cell| cell.row == row as usize && cell.col == col as usize)
        {
            score += weight;
        }
    }

    score
}

fn is_better_search_action(candidate: &SearchAction, current: &SearchAction) -> bool {
    candidate
        .score
        .cmp(&current.score)
        .then_with(|| candidate.area_size.cmp(&current.area_size))
        .then_with(|| candidate.damage.cmp(&current.damage))
        .then_with(|| current.ap_cost.cmp(&candidate.ap_cost))
        .then_with(|| current.center_distance.cmp(&candidate.center_distance))
        .then_with(|| current.skill.id.cmp(&candidate.skill.id))
        .then_with(|| current.target_pos.row.cmp(&candidate.target_pos.row))
        .then_with(|| current.target_pos.col.cmp(&candidate.target_pos.col))
        .is_gt()
}

fn manhattan_distance(from: &GridPos, to: &GridPos) -> i32 {
    (from.row as i32 - to.row as i32).abs() + (from.col as i32 - to.col as i32).abs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat_engine::combat::CombatState;
    use crate::combat_engine::grid::{generate_grid, place_entity};
    use crate::combat_engine::rules::GameRulesConfig;
    use std::collections::HashMap;

    fn make_entity(
        id: &str,
        is_player: bool,
        row: usize,
        col: usize,
        hp: i32,
        skills: Vec<Skill>,
    ) -> TacticalEntity {
        TacticalEntity {
            id: id.to_string(),
            is_player,
            name: id.to_string(),
            hp,
            max_hp: 50,
            strength: 12,
            agility: 10,
            intelligence: 10,
            wisdom: 8,
            endurance: 10,
            charisma: 8,
            crit_chance: 0.1,
            resistance: 0.05,
            social_bonus: 0.03,
            evasion: 5,
            defense: 2,
            traits: vec![],
            skills,
            occupation: None,
            progression: None,
            skill_cooldowns: HashMap::new(),
            ap: 6,
            max_ap: 6,
            mp: 3,
            max_mp: 3,
            level: 1,
            grid_pos: GridPos { row, col },
            equipped: None,
            active_effects: None,
            base_stats: BaseStats {
                strength: 12,
                agility: 10,
                intelligence: 10,
                wisdom: 8,
                charisma: 8,
                endurance: 10,
                evasion: 5,
                defense: 2,
            },
        }
    }

    fn make_heal_skill() -> Skill {
        Skill {
            id: "self-heal".to_string(),
            name: "Self Heal".to_string(),
            description: "Heal self".to_string(),
            category: SkillCategory::Base,
            ap_cost: 3,
            min_range: 0,
            max_range: 0,
            area_type: SkillAreaType::Single,
            area_size: 0,
            target_type: SkillTargetType::SelfTarget,
            damage: None,
            healing: Some(15),
            cooldown: 0,
            effect_type: Some(SkillEffectType::Support),
            push_distance: None,
            icon: Some("heal".to_string()),
            effects: None,
        }
    }

    fn make_search_cell_skill(id: &str, damage: i32) -> Skill {
        Skill {
            id: id.to_string(),
            name: id.to_string(),
            description: "Blind fire".to_string(),
            category: SkillCategory::Base,
            ap_cost: 3,
            min_range: 1,
            max_range: 4,
            area_type: SkillAreaType::Single,
            area_size: 0,
            target_type: SkillTargetType::Cell,
            damage: Some(damage),
            healing: None,
            cooldown: 0,
            effect_type: Some(SkillEffectType::Physical),
            push_distance: None,
            icon: None,
            effects: None,
        }
    }

    fn make_search_aoe_skill(id: &str, damage: i32, area_size: i32) -> Skill {
        Skill {
            id: id.to_string(),
            name: id.to_string(),
            description: "Blind fire aoe".to_string(),
            category: SkillCategory::Base,
            ap_cost: 4,
            min_range: 1,
            max_range: 4,
            area_type: SkillAreaType::Circle,
            area_size,
            target_type: SkillTargetType::Enemy,
            damage: Some(damage),
            healing: None,
            cooldown: 0,
            effect_type: Some(SkillEffectType::Physical),
            push_distance: None,
            icon: None,
            effects: None,
        }
    }

    fn make_single_target_enemy_skill(id: &str, damage: i32) -> Skill {
        Skill {
            id: id.to_string(),
            name: id.to_string(),
            description: "Single target".to_string(),
            category: SkillCategory::Base,
            ap_cost: 3,
            min_range: 1,
            max_range: 4,
            area_type: SkillAreaType::Single,
            area_size: 0,
            target_type: SkillTargetType::Enemy,
            damage: Some(damage),
            healing: None,
            cooldown: 0,
            effect_type: Some(SkillEffectType::Physical),
            push_distance: None,
            icon: None,
            effects: None,
        }
    }

    fn stealth_effect_with_lkp(row: usize, col: usize) -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-hide".to_string()),
            name: Some("Stealth".to_string()),
            description: None,
            effect_type: EffectType::Stealth,
            target: None,
            value: 0.0,
            is_percentage: Some(false),
            duration: Some(2),
            trigger: None,
            scope: Some(EffectScope::Combat),
            stacking: None,
            condition: None,
            icon: None,
            instance_id: None,
            current_stacks: None,
            applied_turn: None,
            source_entity_id: None,
            applier_id: None,
            skill_id: None,
            item_id: None,
            dispellable: None,
            dispel_priority: None,
            dispel_group: None,
            protector_id: None,
            last_known_position: Some(GridPos { row, col }),
            just_applied: None,
        }
    }

    fn contains_message(logs: &[CombatLogMessage], needle: &str) -> bool {
        logs.iter().any(|entry| entry.message.contains(needle))
    }

    fn message_from_pool(
        message: &str,
        pool: &[&str],
        actor: &str,
        skill: Option<&str>,
        row: usize,
        col: usize,
    ) -> bool {
        pool.iter().any(|template| {
            render_search_template(template, actor, skill, &GridPos { row, col }) == message
        })
    }

    #[test]
    fn test_ai_heals_when_low_hp() {
        let heal_skill = make_heal_skill();
        let ai = make_entity("ai1", false, 1, 10, 15, vec![heal_skill]);
        let player = make_entity("p1", true, 10, 1, 50, vec![]);

        let mut grid = generate_grid(12, 12, 0.0);
        place_entity(&mut grid, "ai1", 1, 10);
        place_entity(&mut grid, "p1", 10, 1);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        let events = run_ai_turn(&mut state);

        assert!(events.iter().any(
            |event| matches!(event, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "self-heal")
        ));
        assert!(state.entities.get("ai1").unwrap().hp > 15);
    }

    #[test]
    fn test_ai_moves_toward_target() {
        let ai = make_entity("ai1", false, 0, 0, 50, vec![]);
        let player = make_entity("p1", true, 6, 0, 50, vec![]);

        let mut grid = generate_grid(12, 12, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 6, 0);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        run_ai_turn(&mut state);

        let ai_pos = &state.entities.get("ai1").unwrap().grid_pos;
        assert!(ai_pos.row > 0, "AI should have moved closer to the player");
    }

    #[test]
    fn test_ai_enters_search_when_all_targets_have_stealth_tag() {
        let ai = make_entity(
            "ai1",
            false,
            0,
            0,
            50,
            vec![make_search_cell_skill("ping", 8)],
        );
        let mut player = make_entity("p1", true, 4, 0, 50, vec![]);
        player.active_effects = Some(vec![stealth_effect_with_lkp(4, 0)]);

        let mut grid = generate_grid(8, 8, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 4, 0);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        let events = run_ai_turn(&mut state);

        assert!(events.iter().any(
            |event| matches!(event, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "ping")
        ));
        assert!(contains_message(&state.logs, "ai1"));
        assert!(contains_message(&state.logs, "[4, 0]"));
    }

    #[test]
    fn test_ai_uses_last_known_position_not_current_visibility() {
        let ai = make_entity(
            "ai1",
            false,
            0,
            0,
            50,
            vec![make_search_cell_skill("ping", 8)],
        );
        let mut player = make_entity("p1", true, 6, 6, 50, vec![]);
        player.active_effects = Some(vec![stealth_effect_with_lkp(3, 1)]);

        let mut grid = generate_grid(8, 8, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 6, 6);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        run_ai_turn(&mut state);

        assert!(contains_message(&state.logs, "[3, 1]"));
    }

    #[test]
    fn test_ai_prefers_visible_targets_over_search_mode_if_any_visible() {
        let ai = make_entity(
            "ai1",
            false,
            0,
            0,
            50,
            vec![make_search_cell_skill("ping", 8)],
        );
        let mut hidden_player = make_entity("p1", true, 6, 6, 50, vec![]);
        hidden_player.active_effects = Some(vec![stealth_effect_with_lkp(3, 1)]);
        let visible_player = make_entity("p2", true, 2, 0, 50, vec![]);

        let mut grid = generate_grid(8, 8, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 6, 6);
        place_entity(&mut grid, "p2", 2, 0);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), hidden_player);
        entities.insert("p2".to_string(), visible_player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string(), "p2".to_string()],
            0,
            GameRulesConfig::default(),
        );

        run_ai_turn(&mut state);

        assert!(!state
            .logs
            .iter()
            .any(|entry| entry.message.contains("hidden contact")
                || entry.message.contains("faint intel")
                || entry.message.contains("trace of movement")
                || entry.message.contains("narrows the search")
                || entry.message.contains("scans [")));
    }

    #[test]
    fn test_ai_selects_search_compatible_skill_only() {
        let ai = make_entity(
            "ai1",
            false,
            0,
            0,
            50,
            vec![
                make_single_target_enemy_skill("stab", 20),
                make_search_cell_skill("ping", 8),
            ],
        );
        let mut player = make_entity("p1", true, 3, 1, 50, vec![]);
        player.active_effects = Some(vec![stealth_effect_with_lkp(3, 1)]);

        let mut grid = generate_grid(8, 8, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 3, 1);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        let events = run_ai_turn(&mut state);

        assert!(events.iter().any(
            |event| matches!(event, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "ping")
        ));
        assert!(!events.iter().any(
            |event| matches!(event, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "stab")
        ));
    }

    #[test]
    fn test_ai_blind_fires_aoe_skill_around_lkp_when_legal() {
        let ai = make_entity(
            "ai1",
            false,
            0,
            0,
            50,
            vec![
                make_search_cell_skill("ping", 8),
                make_search_aoe_skill("quake", 12, 2),
            ],
        );
        let mut player = make_entity("p1", true, 4, 1, 50, vec![]);
        player.active_effects = Some(vec![stealth_effect_with_lkp(4, 1)]);

        let mut grid = generate_grid(8, 8, 0.0);
        place_entity(&mut grid, "ai1", 0, 0);
        place_entity(&mut grid, "p1", 4, 1);

        let mut entities = HashMap::new();
        entities.insert("ai1".to_string(), ai);
        entities.insert("p1".to_string(), player);

        let mut state = CombatState::new_for_test(
            grid,
            entities,
            vec!["ai1".to_string(), "p1".to_string()],
            0,
            GameRulesConfig::default(),
        );

        let events = run_ai_turn(&mut state);

        assert!(events.iter().any(
            |event| matches!(event, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "quake")
        ));
    }

    #[test]
    fn test_search_intent_log_contains_actor_and_cell() {
        let message = format_search_entry_log(3, "intel-1", "Intel", &GridPos { row: 4, col: 7 });

        assert!(message.contains("Intel"));
        assert!(message.contains("[4, 7]"));
    }

    #[test]
    fn test_search_cast_log_contains_actor_skill_and_cell() {
        let skill = make_search_aoe_skill("shockwave", 12, 2);
        let message =
            format_search_cast_log(5, "intel-1", "Intel", &skill, &GridPos { row: 3, col: 6 });

        assert!(message.contains("Intel"));
        assert!(message.contains("shockwave"));
        assert!(message.contains("[3, 6]"));
    }

    #[test]
    fn test_search_logs_are_english_templates_from_known_pool() {
        let entry = format_search_entry_log(2, "intel-1", "Intel", &GridPos { row: 4, col: 7 });
        let cast = format_search_cast_log(
            2,
            "intel-1",
            "Intel",
            &make_search_aoe_skill("shockwave", 12, 2),
            &GridPos { row: 4, col: 7 },
        );

        assert!(message_from_pool(
            &entry,
            &SEARCH_INTENT_TEMPLATES,
            "Intel",
            None,
            4,
            7
        ));
        assert!(message_from_pool(
            &cast,
            &SEARCH_CAST_TEMPLATES,
            "Intel",
            Some("shockwave"),
            4,
            7
        ));
    }

    #[test]
    fn test_search_logs_do_not_reveal_hidden_target_name() {
        let entry = format_search_entry_log(1, "intel-1", "Intel", &GridPos { row: 2, col: 3 });
        let cast = format_search_cast_log(
            1,
            "intel-1",
            "Intel",
            &make_search_cell_skill("tremor", 8),
            &GridPos { row: 2, col: 3 },
        );

        assert!(!entry.contains("Ghost"));
        assert!(!cast.contains("Ghost"));
    }

    #[test]
    fn test_search_log_variants_are_deterministic_for_same_context() {
        let first = format_search_entry_log(7, "intel-1", "Intel", &GridPos { row: 2, col: 5 });
        let second = format_search_entry_log(7, "intel-1", "Intel", &GridPos { row: 2, col: 5 });

        assert_eq!(first, second);
    }

    #[test]
    fn test_search_log_variants_can_differ_for_different_contexts() {
        let first = format_search_entry_log(1, "intel-1", "Intel", &GridPos { row: 2, col: 5 });
        let second = format_search_entry_log(2, "intel-1", "Intel", &GridPos { row: 2, col: 5 });

        assert_ne!(first, second);
    }
}
