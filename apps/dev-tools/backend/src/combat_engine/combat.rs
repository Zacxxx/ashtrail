// ═══════════════════════════════════════════════════════════
// combat_engine/combat.rs — Core combat mechanics
// Ported from useTacticalCombat.ts and useCombatEngine.ts
// ═══════════════════════════════════════════════════════════

use rand::Rng;
use std::collections::HashMap;

use super::grid::{
    clear_highlights, find_path, get_aoe_cells, get_attackable_cells, get_attackable_cells_split,
    get_neighbors, get_reachable_cells, highlight_cells, move_entity_on_grid, place_entity,
    remove_entity,
};
use super::modifiers::{
    canonicalize_effect_target, effect_blocks_action, effect_dispel_group, effect_is_buff, effect_is_debuff,
    effect_is_dispellable, effect_max_stacks, effect_stack_group, effect_stack_mode, effect_tags,
    is_damage_over_time_effect, is_heal_over_time_effect, is_protection_stance_effect,
    is_stealth_effect, status_immunity_blocks_effect, tick_phase_for_effect,
    Phase as ModifierPhase, StackMode,
};
use super::rules::GameRulesConfig;
use super::skill_basics::{
    analyze_crit_bonus, compute_basic_attack_preview, compute_basic_attack_roll,
    compute_skill_damage_preview, compute_skill_damage_roll, distract_mp_reduction,
    mark_just_applied, resolve_defend, stealth_duration, value_to_i32,
};
use super::types::*;

pub const MELEE_ATTACK_COST: i32 = 3;
pub const MELEE_RANGE: i32 = 1;

// ── CombatState ─────────────────────────────────────────────

pub struct CombatState {
    pub grid: Grid,
    pub entities: HashMap<String, TacticalEntity>,
    pub turn_order: Vec<String>,
    pub active_entity_index: usize,
    pub phase: CombatPhase,
    pub logs: Vec<CombatLogMessage>,
    pub turn_number: u32,
    pub rules: GameRulesConfig,
    log_counter: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct EffectApplyResult {
    applied: bool,
    blocked_by_immunity: bool,
    current_stacks: u32,
}

impl CombatState {
    /// Create a new combat from entities lists and optional grid.
    pub fn new(
        mut player_entities: Vec<TacticalEntity>,
        mut enemy_entities: Vec<TacticalEntity>,
        grid: Option<Grid>,
        config: &CombatConfig,
        rules: GameRulesConfig,
    ) -> Self {
        use rand::seq::SliceRandom;

        let mut g = grid.unwrap_or_else(|| {
            super::grid::generate_grid(config.grid_rows, config.grid_cols, 0.12)
        });

        let mut entities = HashMap::new();

        // Collect player spawn cells and shuffle
        let mut player_spawns: Vec<(usize, usize)> = g
            .iter()
            .flat_map(|row| row.iter())
            .filter(|c| {
                c.is_spawn_zone == Some(SpawnZone::Player) && c.walkable && c.occupant_id.is_none()
            })
            .map(|c| (c.row, c.col))
            .collect();
        player_spawns.shuffle(&mut rand::rng());

        for (i, entity) in player_entities.iter_mut().enumerate() {
            if i < player_spawns.len() {
                let (r, c) = player_spawns[i];
                place_entity(&mut g, &entity.id, r, c);
                entity.grid_pos = GridPos { row: r, col: c };
            }
            entities.insert(entity.id.clone(), entity.clone());
        }

        // Collect enemy spawn cells and shuffle
        let mut enemy_spawns: Vec<(usize, usize)> = g
            .iter()
            .flat_map(|row| row.iter())
            .filter(|c| {
                c.is_spawn_zone == Some(SpawnZone::Enemy) && c.walkable && c.occupant_id.is_none()
            })
            .map(|c| (c.row, c.col))
            .collect();
        enemy_spawns.shuffle(&mut rand::rng());

        for (i, entity) in enemy_entities.iter_mut().enumerate() {
            if i < enemy_spawns.len() {
                let (r, c) = enemy_spawns[i];
                place_entity(&mut g, &entity.id, r, c);
                entity.grid_pos = GridPos { row: r, col: c };
            }
            entities.insert(entity.id.clone(), entity.clone());
        }

        // Turn order: sorted by agility descending
        let mut all: Vec<&TacticalEntity> = entities.values().collect();
        all.sort_by(|a, b| b.agility.cmp(&a.agility));
        let turn_order: Vec<String> = all.iter().map(|e| e.id.clone()).collect();

        let mut state = CombatState {
            grid: g,
            entities,
            turn_order,
            active_entity_index: 0,
            phase: CombatPhase::Combat,
            logs: Vec::new(),
            turn_number: 1,
            rules,
            log_counter: 0,
        };

        state.add_log("⚔️ Tactical combat initiated!", LogType::System);
        if let Some(active) = state.get_active_entity() {
            let name = active.name.clone();
            let ap = active.ap;
            let mp = active.mp;
            state.add_log(
                &format!("{name}'s turn. AP: {ap} | MP: {mp}"),
                LogType::System,
            );
        }

        state
    }

    /// Test-only constructor for building CombatState from pre-configured fields.
    #[cfg(test)]
    pub fn new_for_test(
        grid: Grid,
        entities: HashMap<String, TacticalEntity>,
        turn_order: Vec<String>,
        active_entity_index: usize,
        rules: GameRulesConfig,
    ) -> Self {
        CombatState {
            grid,
            entities,
            turn_order,
            active_entity_index,
            phase: CombatPhase::Combat,
            logs: Vec::new(),
            turn_number: 1,
            rules,
            log_counter: 0,
        }
    }

    fn add_log(&mut self, message: &str, log_type: LogType) {
        self.log_counter += 1;
        self.logs.push(CombatLogMessage {
            id: format!("{}-{}", self.log_counter, rand::rng().random::<u32>()),
            message: message.to_string(),
            log_type,
        });
    }

    pub fn get_active_entity_id(&self) -> Option<&str> {
        self.turn_order
            .get(self.active_entity_index)
            .map(|s| s.as_str())
    }

    pub fn get_active_entity(&self) -> Option<&TacticalEntity> {
        self.get_active_entity_id()
            .and_then(|id| self.entities.get(id))
    }

    pub fn is_player_turn(&self) -> bool {
        self.get_active_entity()
            .map(|e| e.is_player)
            .unwrap_or(false)
    }

    pub fn snapshot(&self) -> CombatStateSnapshot {
        let active_id = self.get_active_entity_id().unwrap_or("").to_string();
        CombatStateSnapshot {
            grid: self.grid.clone(),
            entities: self.entities.clone(),
            turn_order: self.turn_order.clone(),
            active_entity_id: active_id,
            phase: self.phase.clone(),
            logs: self.logs.clone(),
            turn_number: self.turn_number,
        }
    }

    /// Returns reachable cell positions for the active entity
    pub fn get_reachable_for_active(&self) -> Vec<GridPos> {
        if let Some(entity) = self.get_active_entity() {
            get_reachable_cells(
                &self.grid,
                entity.grid_pos.row,
                entity.grid_pos.col,
                entity.mp,
            )
        } else {
            vec![]
        }
    }

    /// Returns attackable cell positions for a given skill
    pub fn get_attackable_for_skill(&self, skill: &Skill) -> Vec<GridPos> {
        if let Some(entity) = self.get_active_entity() {
            get_attackable_cells(
                &self.grid,
                entity.grid_pos.row,
                entity.grid_pos.col,
                skill.min_range,
                skill.max_range,
            )
        } else {
            vec![]
        }
    }

    fn basic_attack_range(entity: &TacticalEntity) -> i32 {
        entity
            .equipped
            .as_ref()
            .and_then(|equipped| equipped.get("mainHand"))
            .and_then(|weapon| weapon.get("weaponRange"))
            .and_then(|value| value.as_i64())
            .map(|value| value as i32)
            .unwrap_or(MELEE_RANGE)
            .max(1)
    }

    fn directional_area_vector(from: &GridPos, target_row: usize, target_col: usize) -> (i32, i32) {
        let dr = target_row as i32 - from.row as i32;
        let dc = target_col as i32 - from.col as i32;
        if dr.abs() > dc.abs() {
            (if dr > 0 { 1 } else { -1 }, 0)
        } else if dc.abs() > dr.abs() {
            (0, if dc > 0 { 1 } else { -1 })
        } else if dr != 0 {
            (if dr > 0 { 1 } else { -1 }, 0)
        } else if dc != 0 {
            (0, if dc > 0 { 1 } else { -1 })
        } else {
            (0, 0)
        }
    }

    fn validate_basic_attack(&self, attacker_id: &str, defender_id: &str) -> Result<(), String> {
        let Some(attacker) = self.entities.get(attacker_id) else {
            return Err("Attacker not found".to_string());
        };
        let Some(defender) = self.entities.get(defender_id) else {
            return Err("Target not found".to_string());
        };
        if attacker.hp <= 0 {
            return Err("Attacker is defeated".to_string());
        }
        if defender.hp <= 0 {
            return Err("Target is already defeated".to_string());
        }
        if attacker.is_player == defender.is_player {
            return Err("Basic attacks can only target enemies".to_string());
        }
        if attacker.ap < MELEE_ATTACK_COST {
            return Err(format!(
                "Not enough AP to attack (need {MELEE_ATTACK_COST}, have {})",
                attacker.ap
            ));
        }
        if Self::entity_has_action_lock(attacker, "attack") {
            return Err("Attack is blocked by an active effect".to_string());
        }

        let attack_range = Self::basic_attack_range(attacker);
        let (valid, blocked) = get_attackable_cells_split(
            &self.grid,
            attacker.grid_pos.row,
            attacker.grid_pos.col,
            1,
            attack_range,
            false,
        );
        let defender_pos = &defender.grid_pos;
        if valid
            .iter()
            .any(|cell| cell.row == defender_pos.row && cell.col == defender_pos.col)
        {
            return Ok(());
        }
        if blocked
            .iter()
            .any(|cell| cell.row == defender_pos.row && cell.col == defender_pos.col)
        {
            return Err("Line of sight blocked".to_string());
        }

        Err("Target out of range".to_string())
    }

    fn validate_skill_cast(
        &self,
        caster_id: &str,
        target_row: usize,
        target_col: usize,
        skill_id: &str,
    ) -> Result<Skill, String> {
        let Some(caster) = self.entities.get(caster_id) else {
            return Err("Caster not found".to_string());
        };
        let Some(row) = self.grid.get(target_row) else {
            return Err("Target out of bounds".to_string());
        };
        let Some(cell) = row.get(target_col) else {
            return Err("Target out of bounds".to_string());
        };
        let Some(skill) = caster.skills.iter().find(|skill| skill.id == skill_id) else {
            return Err(format!("Skill {skill_id} not found"));
        };

        if caster.ap < skill.ap_cost {
            return Err(format!(
                "Not enough AP for {} (need {}, have {})",
                skill.name, skill.ap_cost, caster.ap
            ));
        }
        if let Some(cooldown) = caster.skill_cooldowns.get(skill_id) {
            if *cooldown > 1 {
                return Err(format!("{} is on cooldown", skill.name));
            }
        }
        let action_key = if skill.id == "defend" {
            "defend"
        } else if matches!(skill.effect_type, Some(SkillEffectType::Physical)) {
            "attack"
        } else {
            "cast"
        };
        if Self::entity_has_action_lock(caster, action_key) {
            return Err(format!("{} is blocked by an active effect", skill.name));
        }
        if !cell.walkable {
            return Err("Cannot target obstacles.".to_string());
        }

        match skill.target_type {
            SkillTargetType::SelfTarget => {
                if caster.grid_pos.row != target_row || caster.grid_pos.col != target_col {
                    return Err("Self-target skills must target the caster".to_string());
                }
            }
            _ => {
                let (valid, blocked) = get_attackable_cells_split(
                    &self.grid,
                    caster.grid_pos.row,
                    caster.grid_pos.col,
                    skill.min_range,
                    skill.max_range,
                    false,
                );
                let is_valid = valid
                    .iter()
                    .any(|cell| cell.row == target_row && cell.col == target_col);
                if !is_valid {
                    let is_blocked = blocked
                        .iter()
                        .any(|cell| cell.row == target_row && cell.col == target_col);
                    return Err(if is_blocked {
                        "Line of sight blocked".to_string()
                    } else {
                        "Target out of range".to_string()
                    });
                }
            }
        }

        let has_valid_target = match skill.target_type {
            SkillTargetType::Cell => true,
            SkillTargetType::Enemy => cell
                .occupant_id
                .as_ref()
                .and_then(|occ_id| self.entities.get(occ_id))
                .map(|target| target.is_player != caster.is_player && target.hp > 0)
                .unwrap_or(false),
            SkillTargetType::Ally => cell
                .occupant_id
                .as_ref()
                .and_then(|occ_id| self.entities.get(occ_id))
                .map(|target| target.is_player == caster.is_player && target.hp > 0)
                .unwrap_or(false),
            SkillTargetType::SelfTarget => true,
        };

        if !has_valid_target {
            return Err(format!("Invalid target for {}", skill.name));
        }

        if skill.id == "analyze" {
            if let Some(target) = cell
                .occupant_id
                .as_ref()
                .and_then(|occ_id| self.entities.get(occ_id))
            {
                if target.level > caster.level + 5 {
                    return Err("Target too powerful to analyze".to_string());
                }
            }
        }

        Ok(skill.clone())
    }

    fn skill_affected_cells(
        &self,
        caster_pos: &GridPos,
        target_row: usize,
        target_col: usize,
        skill: &Skill,
    ) -> Vec<GridPos> {
        let (dir_r, dir_c) = if matches!(
            skill.area_type,
            SkillAreaType::Line | SkillAreaType::Cone | SkillAreaType::Perpendicular
        ) {
            Self::directional_area_vector(caster_pos, target_row, target_col)
        } else {
            (0, 0)
        };

        get_aoe_cells(
            &self.grid,
            target_row,
            target_col,
            &skill.area_type,
            skill.area_size,
            dir_r,
            dir_c,
        )
    }

    fn basic_attack_preview(
        &self,
        attacker: &TacticalEntity,
        defender: &TacticalEntity,
    ) -> DamagePreview {
        compute_basic_attack_preview(attacker, defender, &self.rules)
    }

    fn skill_damage_preview(
        &self,
        caster: &TacticalEntity,
        target: &TacticalEntity,
        skill: &Skill,
    ) -> Option<DamagePreview> {
        compute_skill_damage_preview(caster, target, skill, &self.rules)
    }

    fn apply_effect_to_entity(
        entity: &mut TacticalEntity,
        mut effect: GameplayEffect,
        rules: &GameRulesConfig,
        mark_as_just_applied: bool,
        source_entity_id: Option<&str>,
        applier_id: Option<&str>,
        skill_id: Option<&str>,
        item_id: Option<&str>,
        turn_number: u32,
    ) -> EffectApplyResult {
        if Self::is_effect_blocked_by_immunity(entity, &effect) {
            return EffectApplyResult {
                applied: false,
                blocked_by_immunity: true,
                current_stacks: 0,
            };
        }

        if mark_as_just_applied {
            mark_just_applied(&mut effect);
        }
        let mut effects = entity.active_effects.take().unwrap_or_default();
        effect.instance_id = effect.instance_id.or_else(|| {
            Some(format!(
                "{}:{}:{}",
                effect.id.clone().unwrap_or_else(|| "runtime-effect".to_string()),
                entity.id,
                effects.len()
            ))
        });
        effect.current_stacks = Some(effect.current_stacks.unwrap_or(1));
        effect.applied_turn = Some(effect.applied_turn.unwrap_or(turn_number));
        effect.source_entity_id = effect
            .source_entity_id
            .or_else(|| source_entity_id.map(ToString::to_string));
        effect.applier_id = effect
            .applier_id
            .or_else(|| applier_id.map(ToString::to_string));
        effect.skill_id = effect.skill_id.or_else(|| skill_id.map(ToString::to_string));
        effect.item_id = effect.item_id.or_else(|| item_id.map(ToString::to_string));
        effect.dispellable = Some(effect_is_dispellable(&effect));
        effect.dispel_group = effect.dispel_group.clone().or_else(|| effect_dispel_group(&effect));

        let stack_group = effect_stack_group(&effect);
        let stack_mode = effect_stack_mode(&effect);
        let max_stacks = effect_max_stacks(&effect).unwrap_or(u32::MAX);
        let matching_indices: Vec<usize> = stack_group
            .as_ref()
            .map(|group| {
                effects
                    .iter()
                    .enumerate()
                    .filter_map(|(index, existing)| {
                        if effect_stack_group(existing).as_deref() == Some(group.as_str()) {
                            Some(index)
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut result = EffectApplyResult {
            applied: true,
            blocked_by_immunity: false,
            current_stacks: effect.current_stacks.unwrap_or(1),
        };

        match stack_mode {
            Some(StackMode::Replace) if !matching_indices.is_empty() => {
                effects = effects
                    .into_iter()
                    .enumerate()
                    .filter_map(|(index, existing)| {
                        if matching_indices.contains(&index) {
                            None
                        } else {
                            Some(existing)
                        }
                    })
                    .collect();
                effects.push(effect);
            }
            Some(StackMode::RefreshDuration) | Some(StackMode::Stack) | Some(StackMode::MaxValue)
            | Some(StackMode::MinValue) if !matching_indices.is_empty() => {
                let first_index = matching_indices[0];
                let mut merged = effects[first_index].clone();
                for duplicate_index in matching_indices.iter().skip(1).rev() {
                    let duplicate = effects.remove(*duplicate_index);
                    if let Some(duration) = duplicate.duration {
                        merged.duration = Some(merged.duration.unwrap_or(duration).max(duration));
                    }
                    merged.current_stacks = Some(
                        merged
                            .current_stacks
                            .unwrap_or(1)
                            .saturating_add(duplicate.current_stacks.unwrap_or(1)),
                    );
                    if matches!(stack_mode, Some(StackMode::Stack)) {
                        merged.value += duplicate.value;
                    } else if matches!(stack_mode, Some(StackMode::MaxValue)) {
                        merged.value = merged.value.max(duplicate.value);
                    } else if matches!(stack_mode, Some(StackMode::MinValue)) {
                        merged.value = merged.value.min(duplicate.value);
                    }
                }

                match stack_mode {
                    Some(StackMode::RefreshDuration) => {
                        if let Some(duration) = effect.duration {
                            merged.duration = Some(merged.duration.unwrap_or(duration).max(duration));
                        }
                        if effect.value.abs() >= merged.value.abs() {
                            merged.value = effect.value;
                        }
                    }
                    Some(StackMode::Stack) => {
                        let current = merged.current_stacks.unwrap_or(1);
                        if current < max_stacks {
                            merged.current_stacks = Some((current + 1).min(max_stacks));
                            merged.value += effect.value;
                        } else if let Some(duration) = effect.duration {
                            merged.duration = Some(merged.duration.unwrap_or(duration).max(duration));
                        }
                    }
                    Some(StackMode::MaxValue) => {
                        merged.value = merged.value.max(effect.value);
                        if let Some(duration) = effect.duration {
                            merged.duration = Some(merged.duration.unwrap_or(duration).max(duration));
                        }
                    }
                    Some(StackMode::MinValue) => {
                        merged.value = merged.value.min(effect.value);
                        if let Some(duration) = effect.duration {
                            merged.duration = Some(merged.duration.unwrap_or(duration).max(duration));
                        }
                    }
                    _ => {}
                }

                merged.dispellable = Some(effect_is_dispellable(&merged));
                merged.dispel_group = merged.dispel_group.clone().or_else(|| effect_dispel_group(&merged));
                result.current_stacks = merged.current_stacks.unwrap_or(1);
                effects[first_index] = merged;
            }
            _ => {
                effects.push(effect.clone());
                result.current_stacks = effect.current_stacks.unwrap_or(1);
            }
        }

        entity.active_effects = if effects.is_empty() { None } else { Some(effects) };
        Self::refresh_entity_state(entity, rules, true);
        result
    }

    fn is_effect_blocked_by_immunity(entity: &TacticalEntity, incoming: &GameplayEffect) -> bool {
        entity
            .active_effects
            .as_ref()
            .is_some_and(|effects| {
                effects
                    .iter()
                    .any(|active| status_immunity_blocks_effect(active, incoming))
            })
    }

    fn entity_has_action_lock(entity: &TacticalEntity, action: &str) -> bool {
        entity
            .active_effects
            .as_ref()
            .is_some_and(|effects| effects.iter().any(|effect| effect_blocks_action(effect, action)))
    }

    fn refresh_entity_state(
        entity: &mut TacticalEntity,
        rules: &GameRulesConfig,
        grant_resource_diffs: bool,
    ) {
        let previous_max_hp = entity.max_hp;
        let previous_max_ap = entity.max_ap;
        let previous_max_mp = entity.max_mp;
        let previous_hp = entity.hp;
        let previous_ap = entity.ap;
        let previous_mp = entity.mp;

        let mut recalculated = entity.clone();
        Self::calculate_effective_stats(&mut recalculated, rules);

        entity.strength = recalculated.strength;
        entity.agility = recalculated.agility;
        entity.intelligence = recalculated.intelligence;
        entity.wisdom = recalculated.wisdom;
        entity.endurance = recalculated.endurance;
        entity.charisma = recalculated.charisma;
        entity.evasion = recalculated.evasion;
        entity.defense = recalculated.defense;
        entity.max_hp = recalculated.max_hp;
        entity.max_ap = recalculated.max_ap;
        entity.max_mp = recalculated.max_mp;
        entity.crit_chance = recalculated.crit_chance;
        entity.resistance = recalculated.resistance;
        entity.social_bonus = recalculated.social_bonus;

        if grant_resource_diffs {
            let hp_diff = entity.max_hp - previous_max_hp;
            let ap_diff = entity.max_ap - previous_max_ap;
            let mp_diff = entity.max_mp - previous_max_mp;

            entity.hp = (previous_hp + hp_diff.max(0)).min(entity.max_hp);
            entity.ap = (previous_ap + ap_diff.max(0)).min(entity.max_ap);
            entity.mp = (previous_mp + mp_diff.max(0)).min(entity.max_mp);
        } else {
            entity.hp = previous_hp.min(entity.max_hp);
            entity.ap = previous_ap.min(entity.max_ap);
            entity.mp = previous_mp.min(entity.max_mp);
        }
    }

    fn break_stealth(&mut self, entity_id: &str) -> bool {
        if let Some(entity) = self.entities.get_mut(entity_id) {
            if let Some(mut effects) = entity.active_effects.take() {
                let initial_len = effects.len();
                effects.retain(|effect| !is_stealth_effect(effect));
                let broke = effects.len() < initial_len;
                if effects.is_empty() {
                    entity.active_effects = None;
                } else {
                    entity.active_effects = Some(effects);
                }
                return broke;
            }
        }
        false
    }

    fn dispel_entity_effects_with_predicate<F>(
        &mut self,
        entity_id: &str,
        only_dispellable: bool,
        predicate: F,
    ) -> usize
    where
        F: Fn(&GameplayEffect) -> bool,
    {
        let mut removed = 0usize;
        if let Some(entity) = self.entities.get_mut(entity_id) {
            let mut effects = entity.active_effects.take().unwrap_or_default();
            effects.retain(|effect| {
                let should_remove = predicate(effect)
                    && (!only_dispellable || effect_is_dispellable(effect));
                if should_remove {
                    removed += 1;
                    false
                } else {
                    true
                }
            });
            entity.active_effects = if effects.is_empty() { None } else { Some(effects) };
            if removed > 0 {
                Self::refresh_entity_state(entity, &self.rules, false);
            }
        }
        removed
    }

    pub fn dispel_entity_buffs(&mut self, entity_id: &str, only_dispellable: bool) -> usize {
        self.dispel_entity_effects_with_predicate(entity_id, only_dispellable, effect_is_buff)
    }

    pub fn dispel_entity_debuffs(&mut self, entity_id: &str, only_dispellable: bool) -> usize {
        self.dispel_entity_effects_with_predicate(entity_id, only_dispellable, effect_is_debuff)
    }

    pub fn dispel_entity_effects_by_group(
        &mut self,
        entity_id: &str,
        group: &str,
        only_dispellable: bool,
    ) -> usize {
        self.dispel_entity_effects_with_predicate(entity_id, only_dispellable, |effect| {
            effect_dispel_group(effect).as_deref() == Some(group)
                || effect_stack_group(effect).as_deref() == Some(group)
        })
    }

    pub fn dispel_entity_effects_by_source(
        &mut self,
        entity_id: &str,
        source_entity_id: &str,
        only_dispellable: bool,
    ) -> usize {
        self.dispel_entity_effects_with_predicate(entity_id, only_dispellable, |effect| {
            effect.source_entity_id.as_deref() == Some(source_entity_id)
        })
    }

    pub fn dispel_entity_effects_by_tag(
        &mut self,
        entity_id: &str,
        tag: &str,
        only_dispellable: bool,
    ) -> usize {
        self.dispel_entity_effects_with_predicate(entity_id, only_dispellable, |effect| {
            effect_tags(effect).iter().any(|effect_tag| effect_tag == tag)
        })
    }

    fn apply_protection_to_target(
        &mut self,
        target_id: &str,
        incoming_damage: i32,
        rng: &mut impl rand::Rng,
    ) -> (i32, Vec<(String, GridPos, String)>) {
        let mut defeated = Vec::new();

        let Some(target) = self.entities.get(target_id).cloned() else {
            return (incoming_damage, defeated);
        };

        let Some(protection) = target.active_effects.as_ref().and_then(|effects| {
            effects
                .iter()
                .find(|effect| is_protection_stance_effect(effect))
        }) else {
            return (incoming_damage, defeated);
        };

        let Some(protector_id) = protection.protector_id.as_ref() else {
            return (incoming_damage, defeated);
        };

        let Some(protector) = self.entities.get(protector_id).cloned() else {
            return (incoming_damage, defeated);
        };

        if protector.hp <= 0 {
            return (incoming_damage, defeated);
        }

        let defend = resolve_defend(
            protector.endurance,
            protector.defense,
            incoming_damage,
            &self.rules,
            rng,
        );

        let mut protector_name = protector.name.clone();
        let mut protector_revealed = false;

        if let Some(protector_ref) = self.entities.get_mut(protector_id) {
            protector_ref.hp = (protector_ref.hp - defend.protector_damage).max(0);
            protector_name = protector_ref.name.clone();
            if protector_ref.hp <= 0 {
                defeated.push((
                    protector_ref.id.clone(),
                    protector_ref.grid_pos.clone(),
                    protector_ref.name.clone(),
                ));
            }
        }

        if defend.protector_damage > 0 {
            protector_revealed = self.break_stealth(protector_id);
        }

        if protector_revealed {
            self.add_log(
                &format!("{protector_name} was revealed by taking damage!"),
                LogType::Info,
            );
        }

        self.add_log(
            &format!(
                "🛡️ {} protects {} [{} vs {} | {} | block {}]. {} absorbs {}, {} takes {}.",
                protector.name,
                target.name,
                defend.roll_value,
                incoming_damage,
                defend.outcome_label,
                defend.armor_block,
                protector.name,
                defend.protector_damage,
                target.name,
                defend.ally_damage
            ),
            LogType::Info,
        );

        (defend.ally_damage, defeated)
    }

    fn process_periodic_effects_for_entity(
        &mut self,
        entity_id: &str,
        phase: ModifierPhase,
    ) -> Vec<(String, GridPos, String)> {
        let effects = self
            .entities
            .get(entity_id)
            .and_then(|entity| entity.active_effects.clone())
            .unwrap_or_default();

        let mut defeated = Vec::new();

        for effect in effects {
            if effect.just_applied.unwrap_or(false) {
                continue;
            }

            if tick_phase_for_effect(&effect) != Some(phase) {
                continue;
            }

            if is_damage_over_time_effect(&effect) {
                let damage = effect.value.max(0.0) as i32;
                if damage <= 0 {
                    continue;
                }

                let mut new_hp = 0;
                let mut name = String::new();
                if let Some(entity) = self.entities.get_mut(entity_id) {
                    entity.hp = (entity.hp - damage).max(0);
                    new_hp = entity.hp;
                    name = entity.name.clone();
                }

                self.add_log(
                    &format!(
                        "☠️ {} suffers {} damage from {}.",
                        name,
                        damage,
                        effect
                            .name
                            .clone()
                            .unwrap_or_else(|| "damage over time".to_string())
                    ),
                    LogType::Damage,
                );

                if damage > 0 && self.break_stealth(entity_id) {
                    self.add_log(
                        &format!("👁️ {} was REVEALED by periodic damage!", name),
                        LogType::Info,
                    );
                }

                if new_hp <= 0 {
                    if let Some(entity) = self.entities.get(entity_id) {
                        defeated.push((entity.id.clone(), entity.grid_pos.clone(), entity.name.clone()));
                    }
                }
            } else if is_heal_over_time_effect(&effect) {
                let mut actual_heal = 0;
                let mut name = String::new();
                if let Some(entity) = self.entities.get_mut(entity_id) {
                    let heal = effect.value.max(0.0) as i32;
                    actual_heal = heal.min(entity.max_hp - entity.hp);
                    entity.hp = (entity.hp + heal).min(entity.max_hp);
                    name = entity.name.clone();
                }

                if actual_heal > 0 {
                    self.add_log(
                        &format!(
                            "✨ {} recovers {} HP from {}.",
                            name,
                            actual_heal,
                            effect
                                .name
                                .clone()
                                .unwrap_or_else(|| "healing over time".to_string())
                        ),
                        LogType::Heal,
                    );
                }
            }
        }

        defeated
    }

    fn resolve_defeated_entities(
        &mut self,
        defeated_ids: &[(String, GridPos, String)],
        events: &mut Vec<CombatEvent>,
    ) {
        for (def_id, def_pos, def_name) in defeated_ids {
            self.add_log(
                &format!("💀 {def_name} has been defeated!"),
                LogType::System,
            );
            remove_entity(&mut self.grid, def_pos.row, def_pos.col);
            events.push(CombatEvent::EntityDefeated {
                entity_id: def_id.clone(),
            });
        }

        for (def_id, _, _) in defeated_ids {
            events.extend(self.check_win_loss(def_id));
        }
    }

    pub fn preview_move(
        &self,
        entity_id: &str,
        hover_row: Option<usize>,
        hover_col: Option<usize>,
    ) -> CombatPreviewState {
        let Some(entity) = self.entities.get(entity_id) else {
            return CombatPreviewState::default();
        };
        let reachable_cells = get_reachable_cells(
            &self.grid,
            entity.grid_pos.row,
            entity.grid_pos.col,
            entity.mp,
        );

        let mut preview = CombatPreviewState {
            mode: PreviewMode::Move,
            reachable_cells,
            ..CombatPreviewState::default()
        };

        if let (Some(row), Some(col)) = (hover_row, hover_col) {
            preview.hovered_cell = Some(GridPos { row, col });
            if let Some(path) = find_path(
                &self.grid,
                entity.grid_pos.row,
                entity.grid_pos.col,
                row,
                col,
            ) {
                if (path.len() as i32) <= entity.mp {
                    preview.path_cells = path;
                }
            }
        }

        preview
    }

    pub fn preview_basic_attack(
        &self,
        attacker_id: &str,
        hover_row: Option<usize>,
        hover_col: Option<usize>,
    ) -> CombatPreviewState {
        let Some(attacker) = self.entities.get(attacker_id) else {
            return CombatPreviewState::default();
        };
        let attack_range = Self::basic_attack_range(attacker);
        let (attackable_cells, blocked_cells) = get_attackable_cells_split(
            &self.grid,
            attacker.grid_pos.row,
            attacker.grid_pos.col,
            1,
            attack_range,
            false,
        );

        let mut preview = CombatPreviewState {
            mode: PreviewMode::Attack,
            attackable_cells,
            blocked_cells,
            ..CombatPreviewState::default()
        };

        if let (Some(row), Some(col)) = (hover_row, hover_col) {
            preview.hovered_cell = Some(GridPos { row, col });
            if let Some(cell) = self.grid.get(row).and_then(|grid_row| grid_row.get(col)) {
                if let Some(defender_id) = &cell.occupant_id {
                    match self.validate_basic_attack(attacker_id, defender_id) {
                        Ok(()) => {
                            if let Some(defender) = self.entities.get(defender_id) {
                                preview.target_previews.push(CombatTargetPreview {
                                    entity_id: defender_id.clone(),
                                    preview: self.basic_attack_preview(attacker, defender),
                                });
                            }
                        }
                        Err(message) => preview.hovered_error = Some(message),
                    }
                }
            }
        }

        preview
    }

    pub fn preview_skill(
        &self,
        caster_id: &str,
        skill_id: &str,
        hover_row: Option<usize>,
        hover_col: Option<usize>,
    ) -> CombatPreviewState {
        let Some(caster) = self.entities.get(caster_id) else {
            return CombatPreviewState::default();
        };
        let Some(skill) = caster.skills.iter().find(|skill| skill.id == skill_id) else {
            return CombatPreviewState::default();
        };

        let (attackable_cells, blocked_cells) = match skill.target_type {
            SkillTargetType::SelfTarget => (vec![caster.grid_pos.clone()], Vec::new()),
            _ => get_attackable_cells_split(
                &self.grid,
                caster.grid_pos.row,
                caster.grid_pos.col,
                skill.min_range,
                skill.max_range,
                false,
            ),
        };

        let mut preview = CombatPreviewState {
            mode: PreviewMode::Skill,
            attackable_cells,
            blocked_cells,
            ..CombatPreviewState::default()
        };

        if let (Some(row), Some(col)) = (hover_row, hover_col) {
            preview.hovered_cell = Some(GridPos { row, col });
            if let Some(cell) = self.grid.get(row).and_then(|grid_row| grid_row.get(col)) {
                if !cell.walkable {
                    preview.hovered_error = Some("Cannot target obstacles.".to_string());
                    return preview;
                }
            }

            match self.validate_skill_cast(caster_id, row, col, skill_id) {
                Ok(valid_skill) => {
                    preview.aoe_cells =
                        self.skill_affected_cells(&caster.grid_pos, row, col, &valid_skill);
                    for pos in &preview.aoe_cells {
                        if let Some(occupant_id) = self.grid[pos.row][pos.col].occupant_id.as_ref()
                        {
                            if let Some(target) = self.entities.get(occupant_id) {
                                if let Some(damage_preview) =
                                    self.skill_damage_preview(caster, target, &valid_skill)
                                {
                                    preview.target_previews.push(CombatTargetPreview {
                                        entity_id: occupant_id.clone(),
                                        preview: damage_preview,
                                    });
                                }
                            }
                        }
                    }
                }
                Err(message) => {
                    preview.hovered_error = Some(message);
                }
            }
        }

        preview
    }

    // ── Calculate Effective Stats ───────────────────────────

    pub fn calculate_effective_stats(base: &mut TacticalEntity, rules: &GameRulesConfig) {
        #[derive(Default, Clone, Copy)]
        struct NumericModifier {
            flat: f64,
            percent: f64,
        }

        impl NumericModifier {
            fn apply(&self, base_value: f64) -> f64 {
                (base_value + self.flat) * (1.0 + self.percent / 100.0)
            }
        }

        let mut hp_modifier = NumericModifier::default();
        let mut ap_modifier = NumericModifier::default();
        let mut mp_modifier = NumericModifier::default();
        let mut str_modifier = NumericModifier::default();
        let mut agi_modifier = NumericModifier::default();
        let mut int_modifier = NumericModifier::default();
        let mut wis_modifier = NumericModifier::default();
        let mut endu_modifier = NumericModifier::default();
        let mut cha_modifier = NumericModifier::default();
        let mut eva_modifier = NumericModifier::default();
        let mut def_modifier = NumericModifier::default();
        let mut crit_modifier = NumericModifier::default();
        let mut resist_modifier = NumericModifier::default();
        let mut social_modifier = NumericModifier::default();

        let apply_effect = |target: &str, value: f64, is_percentage: bool, modifier: &mut NumericModifier| {
            if is_percentage {
                modifier.percent += value;
            } else {
                modifier.flat += value;
            }
            let _ = target;
        };

        let mut collect_effect = |target: &str, value: f64, is_percentage: bool| {
            match target {
                "maxHp" => apply_effect(target, value, is_percentage, &mut hp_modifier),
                "maxAp" => apply_effect(target, value, is_percentage, &mut ap_modifier),
                "maxMp" => apply_effect(target, value, is_percentage, &mut mp_modifier),
                "strength" => apply_effect(target, value, is_percentage, &mut str_modifier),
                "agility" => apply_effect(target, value, is_percentage, &mut agi_modifier),
                "intelligence" => apply_effect(target, value, is_percentage, &mut int_modifier),
                "wisdom" => apply_effect(target, value, is_percentage, &mut wis_modifier),
                "endurance" => apply_effect(target, value, is_percentage, &mut endu_modifier),
                "charisma" => apply_effect(target, value, is_percentage, &mut cha_modifier),
                "evasion" => apply_effect(target, value, is_percentage, &mut eva_modifier),
                "defense" => apply_effect(target, value, is_percentage, &mut def_modifier),
                "critChance" => apply_effect(target, value, is_percentage, &mut crit_modifier),
                "resistance" => apply_effect(target, value, is_percentage, &mut resist_modifier),
                "socialBonus" => apply_effect(target, value, is_percentage, &mut social_modifier),
                _ => {}
            }
        };

        for tr in &base.traits {
            if let Some(effects) = &tr.effects {
                for eff in effects {
                    if eff.trigger != Some(EffectTrigger::Passive) {
                        continue;
                    }
                    if eff.effect_type == EffectType::StatModifier
                        || eff.effect_type == EffectType::CombatBonus
                    {
                        if let Some(target) = &eff.target {
                            if let Some(canonical_target) = canonicalize_effect_target(Some(target.as_str())) {
                                collect_effect(&canonical_target, eff.value, eff.is_percentage.unwrap_or(false));
                            }
                        }
                    }
                }
            }
        }

        if let Some(eq) = &base.equipped {
            if let Some(obj) = eq.as_object() {
                for item in obj.values() {
                    if item.is_null() {
                        continue;
                    }
                    if let Some(effs) = item.get("effects").and_then(|v| v.as_array()) {
                        for eff in effs {
                            let e_type = eff.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            let target = eff.get("target").and_then(|v| v.as_str());
                            let val = eff.get("value").map(value_to_i32).unwrap_or(0);
                            let is_percentage = eff
                                .get("isPercentage")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false)
                                || eff
                                    .get("stacking")
                                    .and_then(|v| v.as_str())
                                    == Some("multiplicative");
                            if e_type == "STAT_MODIFIER" || e_type == "COMBAT_BONUS" {
                                if let Some(canonical_target) = canonicalize_effect_target(target) {
                                    collect_effect(&canonical_target, val as f64, is_percentage);
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(effs) = &base.active_effects {
            for eff in effs {
                if eff.effect_type == EffectType::StatModifier
                    || eff.effect_type == EffectType::CombatBonus
                {
                    if let Some(target) = &eff.target {
                        if let Some(canonical_target) = canonicalize_effect_target(Some(target.as_str())) {
                            collect_effect(
                                &canonical_target,
                                eff.value,
                                eff.is_percentage.unwrap_or(false)
                                    || eff.stacking == Some(EffectStacking::Multiplicative),
                            );
                        }
                    }
                }
            }
        }

        base.strength = str_modifier.apply(base.base_stats.strength as f64).floor().max(0.0) as i32;
        base.agility = agi_modifier.apply(base.base_stats.agility as f64).floor().max(0.0) as i32;
        base.intelligence = int_modifier
            .apply(base.base_stats.intelligence as f64)
            .floor()
            .max(0.0) as i32;
        base.wisdom = wis_modifier.apply(base.base_stats.wisdom as f64).floor().max(0.0) as i32;
        base.endurance = endu_modifier
            .apply(base.base_stats.endurance as f64)
            .floor()
            .max(0.0) as i32;
        base.charisma = cha_modifier
            .apply(base.base_stats.charisma as f64)
            .floor()
            .max(0.0) as i32;
        base.evasion = eva_modifier.apply(base.base_stats.evasion as f64).floor().max(0.0) as i32;

        let agi_scale = rules.core.armor_agi_scale;
        let endu_scale = rules.core.armor_endu_scale;
        let base_armor_log = (agi_scale * ((base.agility.max(0) as f64) + 1.0).ln()
            + endu_scale * ((base.endurance.max(0) as f64) + 1.0).ln())
            as i32;
        base.defense = def_modifier
            .apply((base_armor_log + base.base_stats.defense) as f64)
            .floor()
            .max(0.0) as i32;

        base.max_hp = hp_modifier
            .apply((base.endurance * rules.core.hp_per_endurance + rules.core.hp_base) as f64)
            .floor()
            .max(1.0) as i32;
        base.max_ap = ap_modifier
            .apply((rules.core.ap_base + base.agility / rules.core.ap_agility_divisor) as f64)
            .floor()
            .max(1.0) as i32;
        base.max_mp = mp_modifier
            .apply(rules.core.mp_base as f64)
            .floor()
            .max(1.0) as i32;

        if base.hp > base.max_hp {
            base.hp = base.max_hp;
        }
        if base.ap > base.max_ap {
            base.ap = base.max_ap;
        }
        if base.mp > base.max_mp {
            base.mp = base.max_mp;
        }

        base.crit_chance =
            crit_modifier.apply(base.intelligence as f64 * rules.core.crit_per_intelligence);
        base.resistance =
            resist_modifier.apply(base.wisdom as f64 * rules.core.resist_per_wisdom);
        base.social_bonus = social_modifier
            .apply(base.charisma as f64 * rules.core.charisma_bonus_per_charisma);
    }

    // ── Tackle Cost ─────────────────────────────────────────

    pub fn calculate_tackle_cost(&self, entity_id: &str) -> i32 {
        let entity = match self.entities.get(entity_id) {
            Some(e) => e,
            None => return 0,
        };

        let neighbors = get_neighbors(&self.grid, entity.grid_pos.row, entity.grid_pos.col);
        let mut enemy_agility_sum = 0i32;
        let mut adjacent_enemies = 0;

        for (nr, nc) in &neighbors {
            if let Some(occ_id) = &self.grid[*nr][*nc].occupant_id {
                if let Some(occupant) = self.entities.get(occ_id) {
                    if occupant.hp > 0 && occupant.is_player != entity.is_player {
                        enemy_agility_sum += occupant.agility;
                        adjacent_enemies += 1;
                    }
                }
            }
        }

        if adjacent_enemies == 0 {
            return 0;
        }
        // If agility is 1.5x or more than sum, escape freely
        if (entity.agility as f64 * 1.5) >= enemy_agility_sum as f64 {
            return 0;
        }
        (enemy_agility_sum / entity.agility.max(1)).max(1)
    }

    // ── Move ────────────────────────────────────────────────

    pub fn perform_move(
        &mut self,
        entity_id: &str,
        to_row: usize,
        to_col: usize,
    ) -> Vec<CombatEvent> {
        let mut events = Vec::new();

        let (from, mp, ap, name) = match self.entities.get(entity_id) {
            Some(e) => (e.grid_pos.clone(), e.mp, e.ap, e.name.clone()),
            None => {
                events.push(CombatEvent::Error {
                    message: "Entity not found".to_string(),
                });
                return events;
            }
        };

        if self
            .entities
            .get(entity_id)
            .is_some_and(|entity| Self::entity_has_action_lock(entity, "move"))
        {
            events.push(CombatEvent::Error {
                message: "Movement is blocked by an active effect".to_string(),
            });
            return events;
        }

        let path = find_path(&self.grid, from.row, from.col, to_row, to_col);
        let path_len = match &path {
            Some(p) => p.len() as i32,
            None => {
                events.push(CombatEvent::Error {
                    message: "No valid path".to_string(),
                });
                return events;
            }
        };

        if path_len > mp {
            events.push(CombatEvent::Error {
                message: format!("Not enough MP (need {path_len}, have {mp})"),
            });
            return events;
        }

        let tackle_cost = self.calculate_tackle_cost(entity_id);
        if ap < tackle_cost {
            self.add_log(
                &format!("💢 {name} is tackled and needs {tackle_cost} AP to escape!"),
                LogType::Info,
            );
            events.push(CombatEvent::Error {
                message: format!("Need {tackle_cost} AP to break tackle"),
            });
            return events;
        }

        // Apply move
        move_entity_on_grid(
            &mut self.grid,
            entity_id,
            from.row,
            from.col,
            to_row,
            to_col,
        );

        if let Some(entity) = self.entities.get_mut(entity_id) {
            entity.grid_pos = GridPos {
                row: to_row,
                col: to_col,
            };
            entity.mp -= path_len;
            entity.ap -= tackle_cost;
        }

        if tackle_cost > 0 {
            self.add_log(
                &format!("💢 {name} breaks tackle (-{tackle_cost} AP) and moves (-{path_len} MP)"),
                LogType::Info,
            );
        } else {
            self.add_log(
                &format!("{name} moves to [{to_row}, {to_col}] (-{path_len} MP)"),
                LogType::Info,
            );
        }

        events.push(CombatEvent::EntityMoved {
            entity_id: entity_id.to_string(),
            from,
            to: GridPos {
                row: to_row,
                col: to_col,
            },
            mp_cost: path_len,
            tackle_cost,
        });

        // Highlight reachable cells after move
        if let Some(entity) = self.entities.get(entity_id) {
            let reachable = get_reachable_cells(&self.grid, to_row, to_col, entity.mp);
            highlight_cells(&mut self.grid, &reachable, HighlightType::Move);
            let cells: Vec<GridPos> = reachable;
            events.push(CombatEvent::HighlightCells {
                cells,
                highlight_type: HighlightType::Move,
            });
        }

        events
    }

    // ── Basic Attack ────────────────────────────────────────

    pub fn perform_attack(&mut self, attacker_id: &str, defender_id: &str) -> Vec<CombatEvent> {
        let mut events = Vec::new();
        let mut rng = rand::rng();

        if let Err(message) = self.validate_basic_attack(attacker_id, defender_id) {
            events.push(CombatEvent::Error { message });
            return events;
        }

        let atk_name = match self.entities.get(attacker_id) {
            Some(a) => a.name.clone(),
            None => return events,
        };

        let def_name = match self.entities.get(defender_id) {
            Some(d) => d.name.clone(),
            None => return events,
        };

        // Deduct AP
        if let Some(attacker) = self.entities.get_mut(attacker_id) {
            attacker.ap -= MELEE_ATTACK_COST;
        }

        let attacker = match self.entities.get(attacker_id) {
            Some(attacker) => attacker.clone(),
            None => return events,
        };
        let defender = match self.entities.get(defender_id) {
            Some(defender) => defender.clone(),
            None => return events,
        };
        let damage_roll = compute_basic_attack_roll(&attacker, &defender, &self.rules, &mut rng);

        if damage_roll.is_miss {
            self.add_log(
                &format!("{atk_name} missed {def_name}! (-{MELEE_ATTACK_COST} AP)"),
                LogType::Info,
            );
            events.push(CombatEvent::AttackResult {
                attacker_id: attacker_id.to_string(),
                defender_id: defender_id.to_string(),
                damage: 0,
                is_crit: false,
                is_miss: true,
            });
            return events;
        }
        let is_crit = damage_roll.is_crit;
        let actual_damage = damage_roll.actual_damage;

        let (final_damage, defeated_protectors) =
            self.apply_protection_to_target(defender_id, actual_damage, &mut rng);

        if final_damage > 0 && self.break_stealth(defender_id) {
            self.add_log(
                &format!("👁️ {} was REVEALED by taking damage!", def_name),
                LogType::Info,
            );
        }

        self.add_log(
            &format!(
                "🗡️ {atk_name} strikes {} for {}{final_damage} damage! (-{MELEE_ATTACK_COST} AP)",
                def_name,
                if is_crit { "CRITICAL " } else { "" }
            ),
            LogType::Damage,
        );

        let new_hp = (self.entities.get(defender_id).unwrap().hp - final_damage).max(0);
        if let Some(defender) = self.entities.get_mut(defender_id) {
            defender.hp = new_hp;
        }

        events.push(CombatEvent::AttackResult {
            attacker_id: attacker_id.to_string(),
            defender_id: defender_id.to_string(),
            damage: final_damage,
            is_crit,
            is_miss: false,
        });

        for (prot_id, prot_pos, prot_name) in defeated_protectors {
            self.add_log(
                &format!("💀 {prot_name} has been defeated!"),
                LogType::System,
            );
            remove_entity(&mut self.grid, prot_pos.row, prot_pos.col);
            events.push(CombatEvent::EntityDefeated {
                entity_id: prot_id.clone(),
            });
            events.extend(self.check_win_loss(&prot_id));
        }

        if new_hp <= 0 {
            let def_name = self.entities.get(defender_id).unwrap().name.clone();
            self.add_log(
                &format!("💀 {def_name} has been defeated!"),
                LogType::System,
            );
            if let Some(def) = self.entities.get(defender_id) {
                remove_entity(&mut self.grid, def.grid_pos.row, def.grid_pos.col);
            }
            events.push(CombatEvent::EntityDefeated {
                entity_id: defender_id.to_string(),
            });
            events.extend(self.check_win_loss(defender_id));
        }

        events
    }

    // ── Execute Skill ───────────────────────────────────────

    pub fn execute_skill(
        &mut self,
        caster_id: &str,
        target_row: usize,
        target_col: usize,
        skill_id: &str,
    ) -> Vec<CombatEvent> {
        let mut events = Vec::new();
        let mut rng = rand::rng();

        let skill = match self.validate_skill_cast(caster_id, target_row, target_col, skill_id) {
            Ok(skill) => skill,
            Err(message) => {
                events.push(CombatEvent::Error { message });
                return events;
            }
        };

        let (
            caster_name,
            caster_pos,
            caster_strength,
            caster_wisdom,
            caster_charisma,
            caster_level,
            caster_crit_chance,
            caster_social_bonus,
        ) = {
            let c = self.entities.get(caster_id).unwrap();
            (
                c.name.clone(),
                c.grid_pos.clone(),
                c.strength,
                c.wisdom,
                c.charisma,
                c.level,
                c.crit_chance,
                c.social_bonus,
            )
        };

        let affected_cells = self.skill_affected_cells(&caster_pos, target_row, target_col, &skill);

        // Deduct AP and set cooldown on caster
        if let Some(caster) = self.entities.get_mut(caster_id) {
            caster.ap -= skill.ap_cost;
            if skill.cooldown > 0 {
                caster
                    .skill_cooldowns
                    .insert(skill.id.clone(), skill.cooldown + 1);
            }
        }

        let mut skill_targets = Vec::new();
        let mut defeated_ids = Vec::new();

        for pos in &affected_cells {
            let occupant_id = match &self.grid[pos.row][pos.col].occupant_id {
                Some(id) => id.clone(),
                None => continue,
            };
            let mut target = match self.entities.get(&occupant_id) {
                Some(t) if t.hp > 0 => t.clone(),
                _ => continue,
            };

            // ── Distract (Charisma vs Wisdom) ──
            if skill.id == "distract" {
                if caster_charisma > target.wisdom {
                    let mp_reduction = distract_mp_reduction(caster_charisma, &self.rules);
                    let new_eff = GameplayEffect {
                        id: None,
                        name: Some("Distracted".to_string()),
                        description: None,
                        effect_type: EffectType::StatModifier,
                        target: Some("mp".to_string()),
                        value: -mp_reduction as f64,
                        is_percentage: Some(false),
                        duration: Some(1),
                        trigger: None,
                        scope: None,
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
                        last_known_position: None,
                        just_applied: None,
                    };
                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let _ = Self::apply_effect_to_entity(
                            t_ref,
                            new_eff,
                            &self.rules,
                            true,
                            Some(caster_id),
                            Some(caster_id),
                            Some(&skill.id),
                            None,
                            self.turn_number,
                        );
                    }
                    self.add_log(
                        &format!(
                            "🎭 {} bothers {}, they lose {} MP!",
                            caster_name, target.name, mp_reduction
                        ),
                        LogType::Info,
                    );
                } else {
                    self.add_log(
                        &format!(
                            "🛡️ {} is too wise to be distracted by {}.",
                            target.name, caster_name
                        ),
                        LogType::Info,
                    );
                }
                skill_targets.push(SkillTarget {
                    entity_id: occupant_id,
                    damage: None,
                    healing: None,
                    is_crit: false,
                    is_miss: false,
                    new_hp: target.hp,
                });
                continue;
            }

            // ── Analyze (Intelligence Scaling) ──
            if skill.id == "analyze" {
                if target.level > caster_level + 5 {
                    self.add_log(
                        &format!(
                            "⚠️ {} is too powerful to be analyzed by {}!",
                            target.name, caster_name
                        ),
                        LogType::Info,
                    );
                } else {
                    let caster_intelligence = self.entities.get(caster_id).unwrap().intelligence;
                    let crit_bonus = analyze_crit_bonus(caster_intelligence, &self.rules);
                    let new_eff = GameplayEffect {
                        id: None,
                        name: Some("Weakness Revealed".to_string()),
                        description: None,
                        effect_type: EffectType::Analyzed,
                        target: None,
                        value: crit_bonus,
                        is_percentage: Some(false),
                        duration: Some(2),
                        trigger: None,
                        scope: None,
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
                        last_known_position: None,
                        just_applied: None,
                    };
                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let _ = Self::apply_effect_to_entity(
                            t_ref,
                            new_eff,
                            &self.rules,
                            true,
                            Some(caster_id),
                            Some(caster_id),
                            Some(&skill.id),
                            None,
                            self.turn_number,
                        );
                    }
                    self.add_log(
                        &format!(
                            "🔍 {} identifies flaws in {}! +{}% Crit chance.",
                            caster_name, target.name, crit_bonus as i32
                        ),
                        LogType::Info,
                    );
                }
                skill_targets.push(SkillTarget {
                    entity_id: occupant_id,
                    damage: None,
                    healing: None,
                    is_crit: false,
                    is_miss: false,
                    new_hp: target.hp,
                });
                continue;
            }

            let mut target_damage: Option<i32> = None;
            let mut target_healing: Option<i32> = None;
            let mut is_crit = false;
            let mut is_miss = false;
            let mut new_hp = target.hp;

            // ── Healing ──
            if let Some(base_heal) = skill.healing {
                let variance = self.rules.combat.damage_variance_min
                    + rng.random::<f64>()
                        * (self.rules.combat.damage_variance_max
                            - self.rules.combat.damage_variance_min);
                let charisma_bonus = 1.0 + caster_social_bonus;
                let heal_amount = (base_heal as f64 * charisma_bonus * variance) as i32;
                let actual_heal = heal_amount.min(target.max_hp - target.hp);
                new_hp = (target.hp + heal_amount).min(target.max_hp);
                target_healing = Some(actual_heal);

                let icon = skill.icon.as_deref().unwrap_or("✨");
                self.add_log(
                    &format!(
                        "{icon} {caster_name} uses {} on {} → heals {actual_heal} HP!",
                        skill.name, target.name
                    ),
                    LogType::Heal,
                );
            }

            let handled_special_damage = skill.id == "use-weapon" || skill.id == "shove";
            if handled_special_damage {
                if let Some(caster) = self.entities.get(caster_id).cloned() {
                    if let Some(damage_roll) =
                        compute_skill_damage_roll(&caster, &target, &skill, &self.rules, &mut rng)
                    {
                        if damage_roll.is_miss {
                            is_miss = true;
                            let icon = skill.icon.as_deref().unwrap_or("hit");
                            self.add_log(
                                &format!("{icon} {} missed {}!", skill.name, target.name),
                                LogType::Info,
                            );
                            skill_targets.push(SkillTarget {
                                entity_id: occupant_id,
                                damage: Some(0),
                                healing: target_healing,
                                is_crit: false,
                                is_miss: true,
                                new_hp,
                            });
                            continue;
                        }

                        is_crit = damage_roll.is_crit;
                        let mut damage_to_target = damage_roll.actual_damage;

                        if let Some(protection) =
                            target.active_effects.as_ref().and_then(|effects| {
                                effects.iter().find(|effect| {
                                    is_protection_stance_effect(effect)
                                })
                            })
                        {
                            if let Some(protector_id) = protection.protector_id.as_ref() {
                                if let Some(protector) = self.entities.get(protector_id).cloned() {
                                    if protector.hp > 0 {
                                        let defend = resolve_defend(
                                            protector.endurance,
                                            protector.defense,
                                            damage_roll.actual_damage,
                                            &self.rules,
                                            &mut rng,
                                        );
                                        damage_to_target = defend.ally_damage;
                                        let mut protector_name: Option<String> = None;
                                        let mut protector_revealed = false;
                                        let mut defeated_protector: Option<(
                                            String,
                                            GridPos,
                                            String,
                                        )> = None;
                                        if let Some(protector_ref) =
                                            self.entities.get_mut(protector_id)
                                        {
                                            protector_ref.hp =
                                                (protector_ref.hp - defend.protector_damage).max(0);
                                            protector_name = Some(protector_ref.name.clone());
                                            if protector_ref.hp <= 0 {
                                                defeated_protector = Some((
                                                    protector_ref.id.clone(),
                                                    protector_ref.grid_pos.clone(),
                                                    protector_ref.name.clone(),
                                                ));
                                            }
                                        }
                                        if defend.protector_damage > 0 {
                                            protector_revealed = self.break_stealth(protector_id);
                                        }
                                        if protector_revealed {
                                            if let Some(name) = protector_name.as_ref() {
                                                self.add_log(
                                                    &format!(
                                                        "{} was revealed by taking damage!",
                                                        name
                                                    ),
                                                    LogType::Info,
                                                );
                                            }
                                        }
                                        if let Some(defeated) = defeated_protector {
                                            defeated_ids.push(defeated);
                                        }
                                        self.add_log(
                                            &format!(
                                                "Defend: {} protects {} [{} vs {} | {} | block {}].",
                                                protector.name,
                                                target.name,
                                                defend.roll_value,
                                                damage_roll.actual_damage,
                                                defend.outcome_label,
                                                defend.armor_block
                                            ),
                                            LogType::Info,
                                        );
                                    }
                                }
                            }
                        }

                        new_hp = (target.hp - damage_to_target).max(0);
                        target_damage = Some(damage_to_target);

                        if let Some(target_ref) = self.entities.get_mut(&occupant_id) {
                            target_ref.hp = new_hp;
                        }

                        if damage_to_target > 0 && self.break_stealth(&occupant_id) {
                            self.add_log(
                                &format!("{} was revealed by taking damage!", target.name),
                                LogType::Info,
                            );
                        }

                        let icon = skill.icon.as_deref().unwrap_or("hit");
                        self.add_log(
                            &format!(
                                "{icon} {caster_name} uses {} on {} -> {}{} damage!",
                                skill.name,
                                target.name,
                                if is_crit { "CRITICAL " } else { "" },
                                damage_to_target
                            ),
                            LogType::Damage,
                        );

                        if let Some(push_dist) = skill.push_distance {
                            if new_hp > 0 {
                                let row_diff = target.grid_pos.row as i32 - caster_pos.row as i32;
                                let col_diff = target.grid_pos.col as i32 - caster_pos.col as i32;
                                let dr = if row_diff > 0 {
                                    1
                                } else if row_diff < 0 {
                                    -1
                                } else {
                                    0
                                };
                                let dc = if col_diff > 0 {
                                    1
                                } else if col_diff < 0 {
                                    -1
                                } else {
                                    0
                                };
                                let mut dist_remaining = push_dist;
                                let mut current_row = target.grid_pos.row;
                                let mut current_col = target.grid_pos.col;
                                let mut hit_obstacle = false;

                                while dist_remaining > 0 && !hit_obstacle {
                                    let next_row = current_row as i32 + dr;
                                    let next_col = current_col as i32 + dc;

                                    if next_row < 0
                                        || next_row >= self.grid.len() as i32
                                        || next_col < 0
                                        || next_col >= self.grid[0].len() as i32
                                    {
                                        hit_obstacle = true;
                                        break;
                                    }

                                    let nr = next_row as usize;
                                    let nc = next_col as usize;
                                    if !self.grid[nr][nc].walkable
                                        || self.grid[nr][nc]
                                            .occupant_id
                                            .as_ref()
                                            .is_some_and(|id| id != &occupant_id)
                                    {
                                        hit_obstacle = true;
                                        break;
                                    }

                                    current_row = nr;
                                    current_col = nc;
                                    dist_remaining -= 1;
                                }

                                if current_row != target.grid_pos.row
                                    || current_col != target.grid_pos.col
                                {
                                    move_entity_on_grid(
                                        &mut self.grid,
                                        &occupant_id,
                                        target.grid_pos.row,
                                        target.grid_pos.col,
                                        current_row,
                                        current_col,
                                    );
                                    if let Some(target_ref) = self.entities.get_mut(&occupant_id) {
                                        target_ref.grid_pos = GridPos {
                                            row: current_row,
                                            col: current_col,
                                        };
                                    }
                                }

                                if hit_obstacle {
                                    let shock_pot = dist_remaining as f64
                                        * (caster_strength as f64
                                            * self.rules.combat.shove_shock_damage_ratio);
                                    let shock_damage =
                                        (shock_pot - target.endurance as f64).max(0.0) as i32;
                                    if shock_damage > 0 {
                                        if let Some(target_ref) =
                                            self.entities.get_mut(&occupant_id)
                                        {
                                            target_ref.hp = (target_ref.hp - shock_damage).max(0);
                                            new_hp = target_ref.hp;
                                        }
                                        target_damage =
                                            Some(target_damage.unwrap_or(0) + shock_damage);
                                        self.add_log(
                                            &format!(
                                                "{} hits an obstacle for {} shock damage!",
                                                target.name, shock_damage
                                            ),
                                            LogType::Damage,
                                        );
                                    }
                                } else {
                                    self.add_log(
                                        &format!(
                                            "{} is pushed back {} cells.",
                                            target.name, push_dist
                                        ),
                                        LogType::Info,
                                    );
                                }
                            }
                        }
                    }
                }
            }

            // ── Damage ──
            if !handled_special_damage {
                if let Some(base_damage) = skill.damage {
                    let is_physical = skill.effect_type == Some(SkillEffectType::Physical);
                    let is_magical = skill.effect_type == Some(SkillEffectType::Magical);

                    // Physical evasion check
                    if is_physical {
                        let hit_chance = 100 - target.evasion;
                        if rng.random_range(0..100) > hit_chance {
                            is_miss = true;
                            let icon = skill.icon.as_deref().unwrap_or("✨");
                            self.add_log(
                                &format!("{icon} {} missed {}!", skill.name, target.name),
                                LogType::Info,
                            );
                            skill_targets.push(SkillTarget {
                                entity_id: occupant_id,
                                damage: Some(0),
                                healing: target_healing,
                                is_crit: false,
                                is_miss: true,
                                new_hp,
                            });
                            continue;
                        }
                    }

                    // Crit check
                    is_crit = rng.random::<f64>() < caster_crit_chance;

                    let variance = self.rules.combat.damage_variance_min
                        + rng.random::<f64>()
                            * (self.rules.combat.damage_variance_max
                                - self.rules.combat.damage_variance_min);

                    let mut scaled_damage = ((base_damage as f64
                        + caster_strength as f64 * self.rules.combat.strength_to_power_ratio)
                        * variance) as i32;

                    if is_crit {
                        scaled_damage = (scaled_damage as f64 * 1.5) as i32;
                    }

                    // Resistance/Defense
                    // Armor calculation
                    let armor_endu_scale = 0.4;
                    let armor_agi_scale = 0.2;
                    let endu_bonus = (target.endurance as f64 * armor_endu_scale) as i32;
                    let agi_bonus = (target.agility as f64 * armor_agi_scale) as i32;
                    let mut base_armor = 0;
                    if let Some(eq) = target.equipped.as_ref() {
                        if let Some(chest) = eq.get("chest") {
                            if let Some(effs) = chest.get("effects").and_then(|e| e.as_array()) {
                                for e in effs {
                                    if e.get("target").and_then(|v| v.as_str()) == Some("armor") {
                                        base_armor += e.get("value").map(value_to_i32).unwrap_or(0);
                                    }
                                }
                            }
                        }
                    }
                    let total_armor = base_armor + endu_bonus + agi_bonus;

                    let actual_damage = if is_magical {
                        let resist_amount = (scaled_damage as f64 * target.resistance) as i32;
                        (scaled_damage - resist_amount).max(1)
                    } else {
                        (scaled_damage - (target.defense + total_armor)).max(1)
                    };

                    let (final_damage, defeated_protectors) =
                        self.apply_protection_to_target(&occupant_id, actual_damage, &mut rng);

                    if final_damage > 0 && self.break_stealth(&occupant_id) {
                        self.add_log(
                            &format!("👁️ {} was REVEALED by taking damage!", target.name),
                            LogType::Info,
                        );
                    }

                    new_hp = (self.entities.get(&occupant_id).unwrap().hp - final_damage).max(0);
                    target_damage = Some(final_damage);
                    defeated_ids.extend(defeated_protectors);

                    let icon = skill.icon.as_deref().unwrap_or("✨");
                    self.add_log(
                        &format!(
                            "{icon} {caster_name} uses {} on {} → {}{final_damage} damage!",
                            skill.name,
                            target.name,
                            if is_crit { "CRITICAL " } else { "" }
                        ),
                        LogType::Damage,
                    );

                    // Apply HP change
                    if let Some(t) = self.entities.get_mut(&occupant_id) {
                        t.hp = new_hp;
                    }

                    // Shove
                    if let Some(push_dist) = skill.push_distance {
                        if new_hp > 0 {
                            let row_diff = target.grid_pos.row as i32 - caster_pos.row as i32;
                            let col_diff = target.grid_pos.col as i32 - caster_pos.col as i32;
                            let dr = if row_diff > 0 {
                                1
                            } else if row_diff < 0 {
                                -1
                            } else {
                                0
                            };
                            let dc = if col_diff > 0 {
                                1
                            } else if col_diff < 0 {
                                -1
                            } else {
                                0
                            };

                            let mut dist_remaining = push_dist;
                            let mut current_row = target.grid_pos.row;
                            let mut current_col = target.grid_pos.col;
                            let mut hit_obstacle = false;

                            while dist_remaining > 0 && !hit_obstacle {
                                let next_row = current_row as i32 + dr;
                                let next_col = current_col as i32 + dc;

                                if next_row < 0
                                    || next_row >= self.grid.len() as i32
                                    || next_col < 0
                                    || next_col >= self.grid[0].len() as i32
                                {
                                    hit_obstacle = true;
                                    break;
                                }

                                let nr = next_row as usize;
                                let nc = next_col as usize;

                                if !self.grid[nr][nc].walkable
                                    || self.grid[nr][nc]
                                        .occupant_id
                                        .as_ref()
                                        .is_some_and(|id| id != &occupant_id)
                                {
                                    hit_obstacle = true;
                                    break;
                                }

                                current_row = nr;
                                current_col = nc;
                                dist_remaining -= 1;
                            }

                            if current_row != target.grid_pos.row
                                || current_col != target.grid_pos.col
                            {
                                move_entity_on_grid(
                                    &mut self.grid,
                                    &occupant_id,
                                    target.grid_pos.row,
                                    target.grid_pos.col,
                                    current_row,
                                    current_col,
                                );
                                if let Some(t) = self.entities.get_mut(&occupant_id) {
                                    t.grid_pos = GridPos {
                                        row: current_row,
                                        col: current_col,
                                    };
                                }
                            }

                            if hit_obstacle {
                                let shock_pot =
                                    dist_remaining as f64 * (caster_strength as f64 * 0.3);
                                let shock_dmg =
                                    (shock_pot - target.endurance as f64).max(0.0) as i32;
                                if shock_dmg > 0 {
                                    if let Some(t) = self.entities.get_mut(&occupant_id) {
                                        t.hp = (t.hp - shock_dmg).max(0);
                                        new_hp = t.hp;
                                    }
                                    self.add_log(
                                        &format!(
                                            "💥 {} hits an obstacle! +{} shock damage!",
                                            target.name, shock_dmg
                                        ),
                                        LogType::Damage,
                                    );
                                }
                            } else {
                                self.add_log(
                                    &format!(
                                        "🌬️ {} is pushed back {} cells.",
                                        target.name, push_dist
                                    ),
                                    LogType::Info,
                                );
                            }
                        }
                    }
                } else {
                    // Apply HP change if no damage (e.g. heal)
                    if let Some(t) = self.entities.get_mut(&occupant_id) {
                        t.hp = new_hp;
                    }
                }
            }

            // Apply active effects (Buffs/Debuffs)
            if let Some(effs) = skill.effects.as_ref() {
                for eff in effs {
                    let mut new_eff = eff.clone();
                    if is_protection_stance_effect(&new_eff) {
                        new_eff.protector_id = Some(caster_id.to_string());
                        self.add_log(
                            &format!(
                                "🛡️ {} is now protected by {} ({} turn).",
                                target.name,
                                caster_name,
                                new_eff.duration.unwrap_or(1)
                            ),
                            LogType::Info,
                        );
                    } else if is_stealth_effect(&new_eff) {
                        new_eff.duration = Some(stealth_duration(caster_wisdom, &self.rules));
                        new_eff.last_known_position = Some(caster_pos.clone());
                        self.add_log(
                            &format!(
                                "👤 {} hides for {} turns!",
                                target.name,
                                new_eff.duration.unwrap_or(1)
                            ),
                            LogType::Info,
                        );
                    } else if matches!(new_eff.effect_type, EffectType::Analyzed) {
                        self.add_log(
                            &format!("👁️ {} is now ANALYZED!", target.name),
                            LogType::Info,
                        );
                    }
                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let should_mark_just_applied = !(skill.id == "sprint"
                            && new_eff.effect_type == EffectType::StatModifier
                            && matches!(new_eff.target.as_deref(), Some("maxMp") | Some("mp")));
                        let apply_result = Self::apply_effect_to_entity(
                            t_ref,
                            new_eff,
                            &self.rules,
                            should_mark_just_applied,
                            Some(caster_id),
                            Some(caster_id),
                            Some(&skill.id),
                            None,
                            self.turn_number,
                        );
                        let updated_hp = t_ref.hp;
                        let blocked_by_immunity = apply_result.blocked_by_immunity;
                        let _ = t_ref;
                        if blocked_by_immunity {
                            self.add_log(
                                &format!("🛡️ {} resists {}.", target.name, eff.name.clone().unwrap_or_else(|| "the effect".to_string())),
                                LogType::Info,
                            );
                        }
                        new_hp = updated_hp;
                    }
                }
            }

            if new_hp <= 0 {
                defeated_ids.push((
                    occupant_id.clone(),
                    target.grid_pos.clone(),
                    target.name.clone(),
                ));
            }

            skill_targets.push(SkillTarget {
                entity_id: occupant_id,
                damage: target_damage,
                healing: target_healing,
                is_crit,
                is_miss,
                new_hp,
            });
        }

        events.push(CombatEvent::SkillUsed {
            caster_id: caster_id.to_string(),
            skill_id: skill_id.to_string(),
            targets: skill_targets,
        });

        // Handle defeated entities
        for (def_id, def_pos, def_name) in &defeated_ids {
            self.add_log(
                &format!("💀 {def_name} has been defeated!"),
                LogType::System,
            );
            remove_entity(&mut self.grid, def_pos.row, def_pos.col);
            events.push(CombatEvent::EntityDefeated {
                entity_id: def_id.clone(),
            });
        }

        // Check wins/losses after all defeats
        for (def_id, _, _) in &defeated_ids {
            events.extend(self.check_win_loss(def_id));
        }

        events
    }

    // ── End Turn ────────────────────────────────────────────

    pub fn end_turn(&mut self) -> Vec<CombatEvent> {
        let mut events = Vec::new();

        if self.phase != CombatPhase::Combat {
            return events;
        }

        if let Some(current_entity_id) = self.get_active_entity_id().map(str::to_string) {
            let defeated =
                self.process_periodic_effects_for_entity(&current_entity_id, ModifierPhase::EndTurn);
            if !defeated.is_empty() {
                self.resolve_defeated_entities(&defeated, &mut events);
                if self.phase != CombatPhase::Combat {
                    return events;
                }
            }
        }

        clear_highlights(&mut self.grid);

        // Find next alive entity
        let mut next_index = self.active_entity_index;
        let len = self.turn_order.len();
        let mut attempts = 0;

        loop {
            next_index = (next_index + 1) % len;
            attempts += 1;
            if let Some(entity) = self.entities.get(&self.turn_order[next_index]) {
                if entity.hp > 0 {
                    break;
                }
            }
            if attempts >= len {
                return events;
            }
        }

        // Check if we wrapped around = new round
        if next_index <= self.active_entity_index {
            self.turn_number += 1;
        }

        let mut next_entity_id = self.turn_order[next_index].clone();
        let mut start_turn_attempts = 0;
        loop {
            start_turn_attempts += 1;
            if start_turn_attempts > len {
                return events;
            }

            if let Some(entity) = self.entities.get_mut(&next_entity_id) {
                entity.ap = entity.max_ap;
                entity.mp = entity.max_mp;
                let new_cooldowns: HashMap<String, u32> = entity
                    .skill_cooldowns
                    .iter()
                    .filter_map(|(skill_id, cd)| {
                        if *cd > 1 {
                            Some((skill_id.clone(), cd - 1))
                        } else {
                            None
                        }
                    })
                    .collect();
                entity.skill_cooldowns = new_cooldowns;
            }

            let defeated =
                self.process_periodic_effects_for_entity(&next_entity_id, ModifierPhase::StartTurn);
            if !defeated.is_empty() {
                self.resolve_defeated_entities(&defeated, &mut events);
                if self.phase != CombatPhase::Combat {
                    return events;
                }
            }

            if self
                .entities
                .get(&next_entity_id)
                .map(|entity| entity.hp > 0)
                .unwrap_or(false)
            {
                if let Some(entity) = self.entities.get_mut(&next_entity_id) {
                    if let Some(effects) = &mut entity.active_effects {
                        let mut remaining_effects = Vec::new();
                        for mut eff in effects.drain(..) {
                            if eff.just_applied.unwrap_or(false) {
                                eff.just_applied = Some(false);
                                remaining_effects.push(eff);
                            } else if let Some(dur) = eff.duration {
                                if dur > 1 {
                                    eff.duration = Some(dur - 1);
                                    remaining_effects.push(eff);
                                }
                            } else {
                                remaining_effects.push(eff);
                            }
                        }

                        if remaining_effects.is_empty() {
                            entity.active_effects = None;
                        } else {
                            entity.active_effects = Some(remaining_effects);
                        }
                    }
                }
                break;
            }

            let mut found_replacement = false;
            for _ in 0..len {
                next_index = (next_index + 1) % len;
                if let Some(entity) = self.entities.get(&self.turn_order[next_index]) {
                    if entity.hp > 0 {
                        next_entity_id = self.turn_order[next_index].clone();
                        found_replacement = true;
                        break;
                    }
                }
            }

            if !found_replacement {
                return events;
            }
        }

        self.active_entity_index = next_index;

        if let Some(mut entity) = self.entities.get(&next_entity_id).cloned() {
            Self::calculate_effective_stats(&mut entity, &self.rules);
            if let Some(e) = self.entities.get_mut(&next_entity_id) {
                e.max_hp = entity.max_hp;
                e.max_ap = entity.max_ap;
                e.max_mp = entity.max_mp;
                e.crit_chance = entity.crit_chance;
                e.resistance = entity.resistance;
                e.social_bonus = entity.social_bonus;

                // Cap hp/ap/mp
                e.hp = e.hp.min(e.max_hp);
                e.ap = e.ap.min(e.max_ap);
                e.mp = e.mp.min(e.max_mp);
            }

            self.add_log(&format!("── {}'s turn ──", entity.name), LogType::System);
        }

        events.push(CombatEvent::TurnChanged {
            active_entity_id: next_entity_id,
            turn_number: self.turn_number,
        });

        events
    }

    // ── Win/Loss Check ──────────────────────────────────────

    fn check_win_loss(&mut self, _defeated_id: &str) -> Vec<CombatEvent> {
        let mut events = Vec::new();

        let players_alive = self
            .entities
            .values()
            .filter(|e| e.is_player && e.hp > 0)
            .count();
        let enemies_alive = self
            .entities
            .values()
            .filter(|e| !e.is_player && e.hp > 0)
            .count();

        if enemies_alive == 0 {
            self.add_log("🏆 VICTORY! All enemies defeated!", LogType::System);
            self.phase = CombatPhase::Victory;
            events.push(CombatEvent::CombatEnded {
                result: CombatResult::Victory,
            });
        } else if players_alive == 0 {
            self.add_log("💀 DEFEAT... All allies have fallen.", LogType::System);
            self.phase = CombatPhase::Defeat;
            events.push(CombatEvent::CombatEnded {
                result: CombatResult::Defeat,
            });
        }

        events
    }

    // ── Handle Cell Click (resolve player intent) ───────────

    pub fn handle_cell_click(
        &mut self,
        row: usize,
        col: usize,
        selected_skill_id: Option<&str>,
    ) -> Vec<CombatEvent> {
        if self.phase != CombatPhase::Combat {
            return vec![];
        }

        let active_id = match self.get_active_entity_id() {
            Some(id) => id.to_string(),
            None => return vec![],
        };

        let entity = match self.entities.get(&active_id) {
            Some(e) if e.is_player => e.clone(),
            _ => return vec![],
        };

        let cell = &self.grid[row][col];

        // ── Skill targeting ──
        if let Some(skill_id) = selected_skill_id {
            let skill = match entity.skills.iter().find(|s| s.id == skill_id) {
                Some(s) => s.clone(),
                None => return vec![],
            };

            if !cell.walkable {
                return vec![CombatEvent::Error {
                    message: "Cannot target obstacles.".to_string(),
                }];
            }

            let dist = (row as i32 - entity.grid_pos.row as i32).abs()
                + (col as i32 - entity.grid_pos.col as i32).abs();

            if dist < skill.min_range || dist > skill.max_range {
                return vec![CombatEvent::Error {
                    message: "Target out of range".to_string(),
                }];
            }

            // Valid target check
            let has_valid_target = match skill.target_type {
                SkillTargetType::Cell => true,
                SkillTargetType::Enemy => {
                    if let Some(occ_id) = &cell.occupant_id {
                        self.entities
                            .get(occ_id)
                            .map(|t| !t.is_player && t.hp > 0)
                            .unwrap_or(false)
                    } else {
                        false
                    }
                }
                SkillTargetType::Ally => {
                    if let Some(occ_id) = &cell.occupant_id {
                        self.entities
                            .get(occ_id)
                            .map(|t| t.is_player && t.hp > 0)
                            .unwrap_or(false)
                    } else {
                        false
                    }
                }
                SkillTargetType::SelfTarget => true,
            };

            if has_valid_target {
                return self.execute_skill(&active_id, row, col, &skill.id);
            } else {
                return vec![CombatEvent::Error {
                    message: format!("Invalid target for {}", skill.name),
                }];
            }
        }

        // ── Basic attack vs enemy ──
        if let Some(occ_id) = &cell.occupant_id {
            if occ_id != &active_id {
                if let Some(target) = self.entities.get(occ_id) {
                    if !target.is_player {
                        let dist = (row as i32 - entity.grid_pos.row as i32).abs()
                            + (col as i32 - entity.grid_pos.col as i32).abs();
                        if dist <= MELEE_RANGE && entity.ap >= MELEE_ATTACK_COST {
                            let defender_id = occ_id.clone();
                            return self.perform_attack(&active_id, &defender_id);
                        }
                    }
                }
            }
        }

        // ── Movement ──
        if cell.walkable && cell.occupant_id.is_none() && entity.mp > 0 {
            if let Some(path) = find_path(
                &self.grid,
                entity.grid_pos.row,
                entity.grid_pos.col,
                row,
                col,
            ) {
                if (path.len() as i32) <= entity.mp {
                    return self.perform_move(&active_id, row, col);
                }
            }
        }

        vec![]
    }
}

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat_engine::grid::generate_grid;
    use serde_json::json;

    fn weapon_replacement_effect() -> GameplayEffect {
        GameplayEffect {
            id: None,
            name: Some("Weapon Damage Replacement".to_string()),
            description: None,
            effect_type: EffectType::WeaponDamageReplacement,
            target: Some("mainHand".to_string()),
            value: 0.0,
            is_percentage: Some(false),
            duration: None,
            trigger: Some(EffectTrigger::Passive),
            scope: None,
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn sprint_effect() -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-sprint-mp".to_string()),
            name: Some("Sprint Bonus".to_string()),
            description: None,
            effect_type: EffectType::StatModifier,
            target: Some("mp".to_string()),
            value: 3.0,
            is_percentage: Some(false),
            duration: Some(1),
            trigger: Some(EffectTrigger::Passive),
            scope: None,
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn protection_effect() -> GameplayEffect {
        GameplayEffect {
            id: None,
            name: Some("Protection".to_string()),
            description: None,
            effect_type: EffectType::ProtectionStance,
            target: None,
            value: 0.0,
            is_percentage: Some(false),
            duration: Some(1),
            trigger: None,
            scope: None,
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn dot_effect(trigger: EffectTrigger) -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-dot".to_string()),
            name: Some("Poison".to_string()),
            description: None,
            effect_type: EffectType::DamageOverTime,
            target: Some("poison_damage".to_string()),
            value: 4.0,
            is_percentage: Some(false),
            duration: Some(2),
            trigger: Some(trigger),
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn hot_effect(trigger: EffectTrigger) -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-hot".to_string()),
            name: Some("Regeneration".to_string()),
            description: None,
            effect_type: EffectType::HealOverTime,
            target: Some("hp".to_string()),
            value: 3.0,
            is_percentage: Some(false),
            duration: Some(2),
            trigger: Some(trigger),
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn status_immunity_effect(target: &str) -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-immunity".to_string()),
            name: Some("Immunity".to_string()),
            description: None,
            effect_type: EffectType::StatusImmunity,
            target: Some(target.to_string()),
            value: 0.0,
            is_percentage: Some(false),
            duration: Some(2),
            trigger: Some(EffectTrigger::Passive),
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn action_lock_effect(target: &str) -> GameplayEffect {
        GameplayEffect {
            id: Some("effect-lock".to_string()),
            name: Some("Action Lock".to_string()),
            description: None,
            effect_type: EffectType::ActionModifier,
            target: Some(target.to_string()),
            value: 1.0,
            is_percentage: Some(false),
            duration: Some(1),
            trigger: Some(EffectTrigger::Passive),
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
            last_known_position: None,
            just_applied: None,
        }
    }

    fn make_test_entity(id: &str, is_player: bool, row: usize, col: usize) -> TacticalEntity {
        TacticalEntity {
            id: id.to_string(),
            is_player,
            name: if is_player {
                format!("Player_{id}")
            } else {
                format!("Enemy_{id}")
            },
            hp: 50,
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
            skills: vec![],
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
                endurance: 10,
                charisma: 8,
                evasion: 5,
                defense: 2,
            },
        }
    }

    fn make_combat_state() -> CombatState {
        let mut grid = generate_grid(12, 12, 0.0); // No obstacles for testing
        let player = make_test_entity("p1", true, 10, 1);
        let enemy = make_test_entity("e1", false, 1, 10);

        place_entity(&mut grid, "p1", 10, 1);
        place_entity(&mut grid, "e1", 1, 10);

        let mut entities = HashMap::new();
        entities.insert("p1".to_string(), player);
        entities.insert("e1".to_string(), enemy);

        CombatState {
            grid,
            entities,
            turn_order: vec!["p1".to_string(), "e1".to_string()],
            active_entity_index: 0,
            phase: CombatPhase::Combat,
            logs: Vec::new(),
            turn_number: 1,
            rules: GameRulesConfig::default(),
            log_counter: 0,
        }
    }

    fn make_skill(id: &str) -> Skill {
        match id {
            "use-weapon" => Skill {
                id: "use-weapon".to_string(),
                name: "Use Weapon".to_string(),
                description: "Attack with your weapon".to_string(),
                category: SkillCategory::Base,
                ap_cost: 3,
                min_range: 1,
                max_range: 1,
                area_type: SkillAreaType::Single,
                area_size: 0,
                target_type: SkillTargetType::Enemy,
                damage: Some(5),
                healing: None,
                cooldown: 0,
                effect_type: Some(SkillEffectType::Physical),
                push_distance: None,
                icon: None,
                effects: Some(vec![weapon_replacement_effect()]),
            },
            "sprint" => Skill {
                id: "sprint".to_string(),
                name: "Sprint".to_string(),
                description: "Gain movement".to_string(),
                category: SkillCategory::Base,
                ap_cost: 2,
                min_range: 0,
                max_range: 0,
                area_type: SkillAreaType::Single,
                area_size: 0,
                target_type: SkillTargetType::SelfTarget,
                damage: None,
                healing: None,
                cooldown: 2,
                effect_type: Some(SkillEffectType::Support),
                push_distance: None,
                icon: None,
                effects: Some(vec![sprint_effect()]),
            },
            "defend" => Skill {
                id: "defend".to_string(),
                name: "Defend".to_string(),
                description: "Protect an ally".to_string(),
                category: SkillCategory::Base,
                ap_cost: 4,
                min_range: 1,
                max_range: 2,
                area_type: SkillAreaType::Single,
                area_size: 0,
                target_type: SkillTargetType::Ally,
                damage: None,
                healing: None,
                cooldown: 3,
                effect_type: Some(SkillEffectType::Support),
                push_distance: None,
                icon: None,
                effects: Some(vec![protection_effect()]),
            },
            "hide" => Skill {
                id: "hide".to_string(),
                name: "Hide".to_string(),
                description: "Enter stealth".to_string(),
                category: SkillCategory::Base,
                ap_cost: 3,
                min_range: 0,
                max_range: 0,
                area_type: SkillAreaType::Single,
                area_size: 0,
                target_type: SkillTargetType::SelfTarget,
                damage: None,
                healing: None,
                cooldown: 4,
                effect_type: Some(SkillEffectType::Support),
                push_distance: None,
                icon: None,
                effects: Some(vec![GameplayEffect {
                    id: Some("effect-hide".to_string()),
                    name: Some("Stealth".to_string()),
                    description: None,
                    effect_type: EffectType::Stealth,
                    target: None,
                    value: 0.0,
                    is_percentage: Some(false),
                    duration: Some(1),
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
                    last_known_position: None,
                    just_applied: None,
                }]),
            },
            "analyze" => Skill {
                id: "analyze".to_string(),
                name: "Analyze".to_string(),
                description: "Reveal weaknesses".to_string(),
                category: SkillCategory::Base,
                ap_cost: 3,
                min_range: 1,
                max_range: 5,
                area_type: SkillAreaType::Single,
                area_size: 0,
                target_type: SkillTargetType::Enemy,
                damage: None,
                healing: None,
                cooldown: 4,
                effect_type: Some(SkillEffectType::Magical),
                push_distance: None,
                icon: None,
                effects: Some(vec![GameplayEffect {
                    id: Some("effect-analyze".to_string()),
                    name: Some("Weakness Revealed".to_string()),
                    description: None,
                    effect_type: EffectType::Analyzed,
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
                    last_known_position: None,
                    just_applied: None,
                }]),
            },
            _ => panic!("Unsupported test skill"),
        }
    }

    #[test]
    fn test_end_turn_advances() {
        let mut state = make_combat_state();
        assert_eq!(state.get_active_entity_id(), Some("p1"));

        state.end_turn();
        assert_eq!(state.get_active_entity_id(), Some("e1"));

        state.end_turn();
        assert_eq!(state.get_active_entity_id(), Some("p1"));
        assert_eq!(state.turn_number, 2);
    }

    #[test]
    fn test_perform_move() {
        let mut state = make_combat_state();
        let events = state.perform_move("p1", 9, 1);

        assert!(!events.is_empty());
        let entity = state.entities.get("p1").unwrap();
        assert_eq!(entity.grid_pos.row, 9);
        assert_eq!(entity.grid_pos.col, 1);
        assert_eq!(entity.mp, 2); // Used 1 MP
    }

    #[test]
    fn test_perform_attack() {
        let mut state = make_combat_state();
        // Move enemy adjacent to player for melee
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };

        let initial_hp = state.entities.get("e1").unwrap().hp;
        let events = state.perform_attack("p1", "e1");

        assert!(!events.is_empty());
        // AP should have decreased
        assert_eq!(state.entities.get("p1").unwrap().ap, 6 - MELEE_ATTACK_COST);
        // Enemy should have taken damage (or missed)
        let enemy_hp = state.entities.get("e1").unwrap().hp;
        assert!(enemy_hp <= initial_hp);
    }

    #[test]
    fn test_check_win_loss_victory() {
        let mut state = make_combat_state();
        // Kill the enemy
        state.entities.get_mut("e1").unwrap().hp = 0;
        let events = state.check_win_loss("e1");

        assert!(events.iter().any(|e| matches!(
            e,
            CombatEvent::CombatEnded {
                result: CombatResult::Victory
            }
        )));
        assert_eq!(state.phase, CombatPhase::Victory);
    }

    #[test]
    fn test_check_win_loss_defeat() {
        let mut state = make_combat_state();
        // Kill the player
        state.entities.get_mut("p1").unwrap().hp = 0;
        let events = state.check_win_loss("p1");

        assert!(events.iter().any(|e| matches!(
            e,
            CombatEvent::CombatEnded {
                result: CombatResult::Defeat
            }
        )));
        assert_eq!(state.phase, CombatPhase::Defeat);
    }

    #[test]
    fn test_calculate_tackle_cost_no_enemies() {
        let state = make_combat_state();
        // Player is at (10,1), enemy is at (1,10) — not adjacent
        assert_eq!(state.calculate_tackle_cost("p1"), 0);
    }

    #[test]
    fn test_use_weapon_uses_equipped_weapon_damage() {
        let mut state = make_combat_state();
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };
        state.entities.get_mut("e1").unwrap().defense = 0;
        state.entities.get_mut("e1").unwrap().evasion = 0;

        let attacker = state.entities.get_mut("p1").unwrap();
        attacker.crit_chance = 0.0;
        attacker.skills = vec![make_skill("use-weapon")];
        attacker.equipped = Some(json!({
            "mainHand": {
                "weaponType": "melee",
                "weaponRange": 1,
                "effects": [
                    { "type": "COMBAT_BONUS", "target": "damage", "value": 60 }
                ]
            }
        }));

        let initial_hp = state.entities.get("e1").unwrap().hp;
        state.execute_skill("p1", 10, 2, "use-weapon");
        let final_hp = state.entities.get("e1").unwrap().hp;

        assert!(initial_hp - final_hp >= 40);
    }

    #[test]
    fn test_use_weapon_preview_uses_equipped_weapon_damage() {
        let mut state = make_combat_state();
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };
        state.entities.get_mut("e1").unwrap().defense = 0;

        let attacker = state.entities.get_mut("p1").unwrap();
        attacker.skills = vec![make_skill("use-weapon")];
        attacker.equipped = Some(json!({
            "mainHand": {
                "weaponType": "melee",
                "weaponRange": 1,
                "effects": [
                    { "type": "COMBAT_BONUS", "target": "damage", "value": 25 }
                ]
            }
        }));

        let preview = state.preview_skill("p1", "use-weapon", Some(10), Some(2));
        let min_damage = preview
            .target_previews
            .first()
            .map(|entry| entry.preview.min)
            .unwrap_or(0);

        assert!(min_damage >= 20);
    }

    #[test]
    fn test_use_weapon_uses_float_serialized_weapon_damage() {
        let mut state = make_combat_state();
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };
        state.entities.get_mut("e1").unwrap().defense = 0;
        state.entities.get_mut("e1").unwrap().evasion = 0;

        let attacker = state.entities.get_mut("p1").unwrap();
        attacker.crit_chance = 0.0;
        attacker.skills = vec![make_skill("use-weapon")];
        attacker.equipped = Some(json!({
            "mainHand": {
                "weaponType": "ranged",
                "weaponRange": 5,
                "effects": [
                    { "type": "COMBAT_BONUS", "target": "damage", "value": 80.0 }
                ]
            }
        }));

        let initial_hp = state.entities.get("e1").unwrap().hp;
        state.execute_skill("p1", 10, 2, "use-weapon");
        let final_hp = state.entities.get("e1").unwrap().hp;

        assert!(initial_hp - final_hp >= 40);
    }

    #[test]
    fn test_calculate_effective_stats_reads_float_equipped_stat_modifiers() {
        let mut entity = make_test_entity("p1", true, 10, 1);
        entity.equipped = Some(json!({
            "mainHand": {
                "effects": [
                    { "type": "STAT_MODIFIER", "target": "strength", "value": 200.0 }
                ]
            }
        }));

        CombatState::calculate_effective_stats(&mut entity, &GameRulesConfig::default());

        assert_eq!(entity.strength, 212);
    }

    #[test]
    fn test_sprint_grants_immediate_mp() {
        let mut state = make_combat_state();
        let player = state.entities.get_mut("p1").unwrap();
        player.skills = vec![make_skill("sprint")];
        player.mp = 3;
        player.max_mp = 3;

        state.execute_skill("p1", 10, 1, "sprint");
        let player = state.entities.get("p1").unwrap();

        assert_eq!(player.max_mp, 6);
        assert_eq!(player.mp, 6);
    }

    #[test]
    fn test_sprint_expires_before_next_turn_starts() {
        let mut state = make_combat_state();
        let player = state.entities.get_mut("p1").unwrap();
        player.skills = vec![make_skill("sprint")];
        player.mp = 3;
        player.max_mp = 3;

        state.execute_skill("p1", 10, 1, "sprint");
        state.end_turn(); // enemy turn
        state.end_turn(); // player turn again

        let player = state.entities.get("p1").unwrap();
        assert_eq!(player.max_mp, 3);
        assert_eq!(player.mp, 3);
    }

    #[test]
    fn test_damage_over_time_ticks_on_start_turn() {
        let mut state = make_combat_state();
        state.entities.get_mut("e1").unwrap().active_effects = Some(vec![dot_effect(EffectTrigger::OnTurnStart)]);
        let initial_hp = state.entities.get("e1").unwrap().hp;

        state.end_turn();

        let enemy = state.entities.get("e1").unwrap();
        assert_eq!(enemy.hp, initial_hp - 4);
    }

    #[test]
    fn test_heal_over_time_ticks_on_start_turn() {
        let mut state = make_combat_state();
        let enemy = state.entities.get_mut("e1").unwrap();
        enemy.hp = 40;
        enemy.active_effects = Some(vec![hot_effect(EffectTrigger::OnTurnStart)]);

        state.end_turn();

        let enemy = state.entities.get("e1").unwrap();
        assert_eq!(enemy.hp, 43);
    }

    #[test]
    fn test_damage_over_time_ticks_on_end_turn_for_owner() {
        let mut state = make_combat_state();
        state.entities.get_mut("p1").unwrap().active_effects = Some(vec![dot_effect(EffectTrigger::OnTurnEnd)]);
        let initial_hp = state.entities.get("p1").unwrap().hp;

        state.end_turn();

        let player = state.entities.get("p1").unwrap();
        assert_eq!(player.hp, initial_hp - 4);
    }

    #[test]
    fn test_defend_logs_when_applied() {
        let mut state = make_combat_state();
        let protector_target = make_test_entity("p2", true, 10, 3);
        place_entity(&mut state.grid, "p2", 10, 3);
        state.entities.insert("p2".to_string(), protector_target);
        state.turn_order.push("p2".to_string());
        let player = state.entities.get_mut("p1").unwrap();
        player.skills = vec![make_skill("defend")];

        state.execute_skill("p1", 10, 3, "defend");

        assert!(state
            .logs
            .iter()
            .any(|entry| entry.message.contains("is now protected by")));
    }

    #[test]
    fn test_defend_absorbs_basic_attack_damage() {
        let mut state = make_combat_state();
        let protector = make_test_entity("p2", true, 10, 3);
        place_entity(&mut state.grid, "p2", 10, 3);
        state.entities.insert("p2".to_string(), protector);
        state.turn_order.push("p2".to_string());

        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };
        state.entities.get_mut("e1").unwrap().evasion = 0;
        state.entities.get_mut("p1").unwrap().evasion = 0;
        state.entities.get_mut("p1").unwrap().active_effects = Some(vec![GameplayEffect {
            protector_id: Some("p2".to_string()),
            ..protection_effect()
        }]);
        state.entities.get_mut("p2").unwrap().endurance = 100;
        state.entities.get_mut("p2").unwrap().defense = 0;

        let protected_hp = state.entities.get("p1").unwrap().hp;
        let protector_hp = state.entities.get("p2").unwrap().hp;

        state.perform_attack("e1", "p1");

        assert_eq!(state.entities.get("p1").unwrap().hp, protected_hp);
        assert!(state.entities.get("p2").unwrap().hp < protector_hp);
        assert!(state
            .logs
            .iter()
            .any(|entry| entry.message.contains("protects Player_p1")));
    }

    #[test]
    fn test_damage_over_time_stacks_with_cap() {
        let mut entity = make_test_entity("p1", true, 10, 1);
        let rules = GameRulesConfig::default();

        let first = CombatState::apply_effect_to_entity(
            &mut entity,
            dot_effect(EffectTrigger::OnTurnStart),
            &rules,
            false,
            Some("p2"),
            Some("p2"),
            Some("poison-strike"),
            None,
            3,
        );
        let second = CombatState::apply_effect_to_entity(
            &mut entity,
            dot_effect(EffectTrigger::OnTurnStart),
            &rules,
            false,
            Some("p2"),
            Some("p2"),
            Some("poison-strike"),
            None,
            3,
        );

        assert!(first.applied);
        assert!(second.applied);
        let effects = entity.active_effects.as_ref().unwrap();
        assert_eq!(effects.len(), 1);
        assert_eq!(effects[0].current_stacks, Some(2));
        assert_eq!(effects[0].value as i32, 8);

        for _ in 0..10 {
            CombatState::apply_effect_to_entity(
                &mut entity,
                dot_effect(EffectTrigger::OnTurnStart),
                &rules,
                false,
                Some("p2"),
                Some("p2"),
                Some("poison-strike"),
                None,
                3,
            );
        }

        let effect = &entity.active_effects.as_ref().unwrap()[0];
        assert_eq!(effect.current_stacks, Some(5));
    }

    #[test]
    fn test_stealth_replaces_existing_stealth() {
        let mut entity = make_test_entity("p1", true, 10, 1);
        let rules = GameRulesConfig::default();
        let mut stealth = make_skill("hide").effects.unwrap()[0].clone();
        stealth.duration = Some(2);

        CombatState::apply_effect_to_entity(
            &mut entity,
            stealth.clone(),
            &rules,
            false,
            Some("p1"),
            Some("p1"),
            Some("hide"),
            None,
            1,
        );
        CombatState::apply_effect_to_entity(
            &mut entity,
            stealth,
            &rules,
            false,
            Some("p1"),
            Some("p1"),
            Some("hide"),
            None,
            2,
        );

        let effects = entity.active_effects.as_ref().unwrap();
        assert_eq!(effects.len(), 1);
    }

    #[test]
    fn test_hot_refreshes_duration_instead_of_duplicate() {
        let mut entity = make_test_entity("p1", true, 10, 1);
        let rules = GameRulesConfig::default();
        let mut first = hot_effect(EffectTrigger::OnTurnStart);
        first.duration = Some(1);
        let mut second = hot_effect(EffectTrigger::OnTurnStart);
        second.duration = Some(3);

        CombatState::apply_effect_to_entity(
            &mut entity,
            first,
            &rules,
            false,
            Some("p1"),
            Some("p1"),
            Some("regen"),
            None,
            1,
        );
        CombatState::apply_effect_to_entity(
            &mut entity,
            second,
            &rules,
            false,
            Some("p1"),
            Some("p1"),
            Some("regen"),
            None,
            1,
        );

        let effects = entity.active_effects.as_ref().unwrap();
        assert_eq!(effects.len(), 1);
        assert_eq!(effects[0].duration, Some(3));
    }

    #[test]
    fn test_status_immunity_blocks_matching_dot_application() {
        let mut entity = make_test_entity("p1", true, 10, 1);
        entity.active_effects = Some(vec![status_immunity_effect("poison_damage")]);

        let result = CombatState::apply_effect_to_entity(
            &mut entity,
            dot_effect(EffectTrigger::OnTurnStart),
            &GameRulesConfig::default(),
            false,
            Some("e1"),
            Some("e1"),
            Some("venom"),
            None,
            1,
        );

        assert!(!result.applied);
        assert!(result.blocked_by_immunity);
        assert_eq!(entity.active_effects.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_dispel_helpers_remove_expected_effects() {
        let mut state = make_combat_state();
        state.entities.get_mut("p1").unwrap().active_effects = Some(vec![
            make_skill("hide").effects.unwrap()[0].clone(),
            dot_effect(EffectTrigger::OnTurnStart),
            hot_effect(EffectTrigger::OnTurnStart),
        ]);

        let removed_debuffs = state.dispel_entity_debuffs("p1", true);
        assert_eq!(removed_debuffs, 1);
        assert_eq!(state.entities.get("p1").unwrap().active_effects.as_ref().unwrap().len(), 2);

        let removed_stealth = state.dispel_entity_effects_by_tag("p1", "stealth", true);
        assert_eq!(removed_stealth, 1);

        let removed_group = state.dispel_entity_effects_by_group("p1", "hot:maxHp", true);
        assert_eq!(removed_group, 1);
        assert!(state.entities.get("p1").unwrap().active_effects.is_none());
    }

    #[test]
    fn test_effect_application_tracks_source_metadata() {
        let mut state = make_combat_state();
        state.entities.get_mut("p1").unwrap().skills = vec![make_skill("analyze")];
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };

        state.execute_skill("p1", 10, 2, "analyze");

        let effect = &state.entities.get("e1").unwrap().active_effects.as_ref().unwrap()[0];
        assert_eq!(effect.source_entity_id.as_deref(), Some("p1"));
        assert_eq!(effect.applier_id.as_deref(), Some("p1"));
        assert_eq!(effect.skill_id.as_deref(), Some("analyze"));
        assert!(effect.instance_id.is_some());
        assert_eq!(effect.current_stacks, Some(1));
        assert_eq!(effect.dispellable, Some(true));
    }

    #[test]
    fn test_action_lock_blocks_move_and_attack() {
        let mut state = make_combat_state();
        state.entities.get_mut("p1").unwrap().active_effects = Some(vec![action_lock_effect("cannotMove")]);

        let move_events = state.perform_move("p1", 9, 1);
        assert!(matches!(
            move_events.first(),
            Some(CombatEvent::Error { message }) if message.contains("Movement is blocked")
        ));

        state.entities.get_mut("p1").unwrap().active_effects = Some(vec![action_lock_effect("cannotAttack")]);
        move_entity_on_grid(&mut state.grid, "e1", 1, 10, 10, 2);
        state.entities.get_mut("e1").unwrap().grid_pos = GridPos { row: 10, col: 2 };
        state.entities.get_mut("e1").unwrap().evasion = 0;

        let attack_events = state.perform_attack("p1", "e1");
        assert!(matches!(
            attack_events.first(),
            Some(CombatEvent::Error { message }) if message.contains("blocked")
        ));
    }
}
