// ═══════════════════════════════════════════════════════════
// combat_engine/ai.rs — AI decision tree for enemy turns
// Ported from useTacticalCombat.ts lines 621-718
// ═══════════════════════════════════════════════════════════

use super::combat::{CombatState, MELEE_RANGE};
use super::grid::{find_path, get_reachable_cells};
use super::types::*;

/// Run a complete AI turn for the currently active entity.
/// Returns all events generated during the AI's actions.
pub fn run_ai_turn(state: &mut CombatState) -> Vec<CombatEvent> {
    let mut events = Vec::new();

    let active_id = match state.get_active_entity_id() {
        Some(id) => id.to_string(),
        None => return events,
    };

    let ai = match state.entities.get(&active_id) {
        Some(e) if !e.is_player && e.hp > 0 => e.clone(),
        _ => {
            events.extend(state.end_turn());
            return events;
        }
    };

    // Find closest player target
    let player_targets: Vec<TacticalEntity> = state
        .entities
        .values()
        .filter(|e| e.is_player && e.hp > 0)
        .cloned()
        .collect();

    if player_targets.is_empty() {
        events.extend(state.end_turn());
        return events;
    }

    let (closest_target, closest_dist) = find_closest_target(&ai, &player_targets);

    // ── 1. If low HP and has self-heal, use it ──
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

    // ── 2. Try a ranged skill if target is far ──
    if closest_dist > MELEE_RANGE {
        let updated_ai = state
            .entities
            .get(&active_id)
            .cloned()
            .unwrap_or(ai.clone());
        if let Some(ranged_skill) = find_ranged_skill(&updated_ai, closest_dist) {
            events.extend(state.execute_skill(
                &active_id,
                closest_target.grid_pos.row,
                closest_target.grid_pos.col,
                &ranged_skill.id,
            ));
            events.extend(state.end_turn());
            return events;
        }
    }

    // ── 3. Move closer if needed ──
    let mut moved = false;
    if closest_dist > MELEE_RANGE {
        let updated_ai = state
            .entities
            .get(&active_id)
            .cloned()
            .unwrap_or(ai.clone());
        if updated_ai.mp > 0 {
            let tackle_cost = state.calculate_tackle_cost(&active_id);
            if updated_ai.ap >= tackle_cost {
                let reachable = get_reachable_cells(
                    &state.grid,
                    updated_ai.grid_pos.row,
                    updated_ai.grid_pos.col,
                    updated_ai.mp,
                );

                // Find cell closest to target
                let mut best_cell: Option<GridPos> = None;
                let mut best_dist = closest_dist;

                for cell in &reachable {
                    let d = (cell.row as i32 - closest_target.grid_pos.row as i32).abs()
                        + (cell.col as i32 - closest_target.grid_pos.col as i32).abs();
                    if d < best_dist {
                        best_dist = d;
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
                        moved = true;
                    }
                }
            }
        }
    }

    // ── 4. Melee skill or basic attack after moving ──
    let updated_ai = match state.entities.get(&active_id) {
        Some(e) if e.hp > 0 => e.clone(),
        _ => {
            events.extend(state.end_turn());
            return events;
        }
    };

    // Recalculate distance after move
    let new_dist = (updated_ai.grid_pos.row as i32 - closest_target.grid_pos.row as i32).abs()
        + (updated_ai.grid_pos.col as i32 - closest_target.grid_pos.col as i32).abs();

    // Refresh target in case it moved or was affected
    let updated_target = state
        .entities
        .get(&closest_target.id)
        .cloned()
        .unwrap_or(closest_target.clone());

    if updated_target.hp > 0 && new_dist <= MELEE_RANGE {
        // Try melee skill first (best damage)
        if let Some(melee_skill) = find_melee_skill(&updated_ai, new_dist) {
            events.extend(state.execute_skill(
                &active_id,
                updated_target.grid_pos.row,
                updated_target.grid_pos.col,
                &melee_skill.id,
            ));
        } else if updated_ai.ap >= super::combat::MELEE_ATTACK_COST {
            // Fallback to basic attack
            let target_id = updated_target.id.clone();
            events.extend(state.perform_attack(&active_id, &target_id));
        }
    }

    events.extend(state.end_turn());
    events
}

// ── Helper functions ────────────────────────────────────────

fn find_closest_target(ai: &TacticalEntity, targets: &[TacticalEntity]) -> (TacticalEntity, i32) {
    let mut closest = targets[0].clone();
    let mut closest_dist = i32::MAX;

    for target in targets {
        let d = (target.grid_pos.row as i32 - ai.grid_pos.row as i32).abs()
            + (target.grid_pos.col as i32 - ai.grid_pos.col as i32).abs();
        if d < closest_dist {
            closest_dist = d;
            closest = target.clone();
        }
    }

    (closest, closest_dist)
}

fn find_self_heal(entity: &TacticalEntity) -> Option<&Skill> {
    entity.skills.iter().find(|s| {
        s.target_type == SkillTargetType::SelfTarget
            && s.healing.is_some()
            && s.ap_cost <= entity.ap
            && !has_cooldown(entity, &s.id)
    })
}

fn find_ranged_skill(entity: &TacticalEntity, target_dist: i32) -> Option<&Skill> {
    entity.skills.iter().find(|s| {
        s.target_type == SkillTargetType::Enemy
            && s.damage.is_some()
            && s.max_range >= target_dist
            && s.min_range <= target_dist
            && s.ap_cost <= entity.ap
            && !has_cooldown(entity, &s.id)
    })
}

fn find_melee_skill(entity: &TacticalEntity, dist: i32) -> Option<Skill> {
    let mut candidates: Vec<&Skill> = entity
        .skills
        .iter()
        .filter(|s| {
            s.target_type == SkillTargetType::Enemy
                && s.damage.is_some()
                && s.max_range >= dist
                && s.min_range <= dist
                && s.ap_cost <= entity.ap
                && !has_cooldown(entity, &s.id)
        })
        .collect();

    // Sort by damage descending
    candidates.sort_by(|a, b| b.damage.unwrap_or(0).cmp(&a.damage.unwrap_or(0)));

    candidates.first().map(|s| (*s).clone())
}

fn has_cooldown(entity: &TacticalEntity, skill_id: &str) -> bool {
    entity
        .skill_cooldowns
        .get(skill_id)
        .map(|cd| *cd > 0)
        .unwrap_or(false)
}

// ── Tests ───────────────────────────────────────────────────

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
            charisma: 8,
            crit_chance: 0.1,
            resistance: 0.05,
            social_bonus: 0.03,
            evasion: 5,
            defense: 2,
            traits: vec![],
            skills,
            skill_cooldowns: HashMap::new(),
            ap: 6,
            max_ap: 6,
            mp: 3,
            max_mp: 3,
            grid_pos: GridPos { row, col },
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
            icon: Some("💚".to_string()),
            effects: None,
        }
    }

    #[test]
    fn test_ai_heals_when_low_hp() {
        let heal_skill = make_heal_skill();
        let ai = make_entity("ai1", false, 1, 10, 15, vec![heal_skill]); // 15/50 = 30% HP
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

        // Should have used the heal skill
        assert!(events.iter().any(
            |e| matches!(e, CombatEvent::SkillUsed { skill_id, .. } if skill_id == "self-heal")
        ));
        // HP should have increased
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

        let events = run_ai_turn(&mut state);

        // Should have moved closer
        let ai_pos = &state.entities.get("ai1").unwrap().grid_pos;
        assert!(ai_pos.row > 0, "AI should have moved closer to the player");
    }
}
