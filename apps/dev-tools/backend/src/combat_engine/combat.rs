// ═══════════════════════════════════════════════════════════
// combat_engine/combat.rs — Core combat mechanics
// Ported from useTacticalCombat.ts and useCombatEngine.ts
// ═══════════════════════════════════════════════════════════

use rand::Rng;
use std::collections::HashMap;

use super::grid::{
    clear_highlights, find_path, get_aoe_cells, get_attackable_cells, get_neighbors,
    get_reachable_cells, highlight_cells, move_entity_on_grid, place_entity, remove_entity,
};
use super::rules::GameRulesConfig;
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

    // ── Calculate Effective Stats ───────────────────────────

    pub fn calculate_effective_stats(base: &mut TacticalEntity, rules: &GameRulesConfig) {
        let mut hp_bonus = 0i32;
        let mut ap_bonus = 0i32;
        let mut mp_bonus = 0i32;
        let mut str_bonus = 0i32;
        let mut agi_bonus = 0i32;
        let mut int_bonus = 0i32;
        let mut wis_bonus = 0i32;
        let mut endu_bonus = 0i32;
        let mut cha_bonus = 0i32;
        let mut eva_bonus = 0i32;
        let mut def_bonus = 0i32;

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
                            let val = eff.value as i32;
                            match target.as_str() {
                                "hp" | "maxHp" => hp_bonus += val,
                                "ap" | "maxAp" => ap_bonus += val,
                                "mp" | "maxMp" => mp_bonus += val,
                                "strength" => str_bonus += val,
                                "agility" => agi_bonus += val,
                                "intelligence" => int_bonus += val,
                                "wisdom" => wis_bonus += val,
                                "endurance" => endu_bonus += val,
                                "charisma" => cha_bonus += val,
                                "evasion" => eva_bonus += val,
                                "defense" | "armor" => def_bonus += val,
                                _ => {}
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
                            let target = eff.get("target").and_then(|v| v.as_str()).unwrap_or("");
                            let val = eff.get("value").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                            if e_type == "STAT_MODIFIER" || e_type == "COMBAT_BONUS" {
                                match target {
                                    "hp" | "maxHp" => hp_bonus += val,
                                    "ap" | "maxAp" => ap_bonus += val,
                                    "mp" | "maxMp" => mp_bonus += val,
                                    "strength" => str_bonus += val,
                                    "agility" => agi_bonus += val,
                                    "intelligence" => int_bonus += val,
                                    "wisdom" => wis_bonus += val,
                                    "endurance" => endu_bonus += val,
                                    "charisma" => cha_bonus += val,
                                    "evasion" => eva_bonus += val,
                                    "defense" | "armor" => def_bonus += val,
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(effs) = &base.active_effects {
            for eff in effs {
                if eff.effect_type == EffectType::StatModifier {
                    if let Some(target) = &eff.target {
                        let val = eff.value as i32;
                        match target.as_str() {
                            "hp" | "maxHp" => hp_bonus += val,
                            "ap" | "maxAp" => ap_bonus += val,
                            "mp" | "maxMp" => mp_bonus += val,
                            "strength" => str_bonus += val,
                            "agility" => agi_bonus += val,
                            "intelligence" => int_bonus += val,
                            "wisdom" => wis_bonus += val,
                            "endurance" => endu_bonus += val,
                            "charisma" => cha_bonus += val,
                            "evasion" => eva_bonus += val,
                            "defense" | "armor" => def_bonus += val,
                            _ => {}
                        }
                    }
                }
            }
        }

        base.strength = (base.base_stats.strength + str_bonus).max(0);
        base.agility = (base.base_stats.agility + agi_bonus).max(0);
        base.intelligence = (base.base_stats.intelligence + int_bonus).max(0);
        base.wisdom = (base.base_stats.wisdom + wis_bonus).max(0);
        base.endurance = (base.base_stats.endurance + endu_bonus).max(0);
        base.charisma = (base.base_stats.charisma + cha_bonus).max(0);
        base.evasion = (base.base_stats.evasion + eva_bonus).max(0);

        let agi_scale = 2.5; // rules.core.armorAgiScale
        let endu_scale = 3.5; // rules.core.armorEnduScale
        let base_armor_log = (agi_scale * ((base.agility.max(0) as f64) + 1.0).ln()
            + endu_scale * ((base.endurance.max(0) as f64) + 1.0).ln())
            as i32;
        base.defense = base_armor_log + base.base_stats.defense + def_bonus;

        base.max_hp =
            1.max(base.endurance * rules.core.hp_per_endurance + rules.core.hp_base + hp_bonus);
        base.max_ap =
            1.max(rules.core.ap_base + base.agility / rules.core.ap_agility_divisor + ap_bonus);
        base.max_mp = 1.max(rules.core.mp_base + mp_bonus);

        if base.hp > base.max_hp {
            base.hp = base.max_hp;
        }
        if base.ap > base.max_ap {
            base.ap = base.max_ap;
        }
        if base.mp > base.max_mp {
            base.mp = base.max_mp;
        }

        base.crit_chance = base.intelligence as f64 * rules.core.crit_per_intelligence;
        base.resistance = base.wisdom as f64 * rules.core.resist_per_wisdom;
        base.social_bonus = base.charisma as f64 * rules.core.charisma_bonus_per_charisma;
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

        let (atk_name, atk_strength, atk_crit_chance, atk_ap) = match self.entities.get(attacker_id)
        {
            Some(a) => (a.name.clone(), a.strength, a.crit_chance, a.ap),
            None => return events,
        };

        let (def_name, def_evasion, def_defense, def_endurance, def_agility, def_hp) =
            match self.entities.get(defender_id) {
                Some(d) => (
                    d.name.clone(),
                    d.evasion,
                    d.defense,
                    d.endurance,
                    d.agility,
                    d.hp,
                ),
                None => return events,
            };

        if atk_ap < MELEE_ATTACK_COST {
            self.add_log(
                &format!("{atk_name} doesn't have enough AP to attack!"),
                LogType::Info,
            );
            return events;
        }

        // Deduct AP
        if let Some(attacker) = self.entities.get_mut(attacker_id) {
            attacker.ap -= MELEE_ATTACK_COST;
        }

        // Evasion check
        let hit_chance = 100 - def_evasion;
        let roll: i32 = rng.random_range(0..100);
        let is_miss = roll > hit_chance;

        if is_miss {
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

        // Crit check
        let is_crit = rng.random::<f64>() < atk_crit_chance;

        // Damage calc
        let variance = self.rules.combat.damage_variance_min
            + rng.random::<f64>()
                * (self.rules.combat.damage_variance_max - self.rules.combat.damage_variance_min);
        let mut raw_damage = (atk_strength as f64 * variance) as i32;
        if is_crit {
            raw_damage = (raw_damage as f64 * 1.5) as i32;
        }
        // Armor calculation
        let armor_endu_scale = 0.4; // default hardcoded for simplicity if rules don't have it
        let armor_agi_scale = 0.2;
        let endu_bonus = (def_endurance as f64 * armor_endu_scale) as i32;
        let agi_bonus = (def_agility as f64 * armor_agi_scale) as i32;
        let mut base_armor = 0;
        if let Some(eq) = self
            .entities
            .get(defender_id)
            .and_then(|e| e.equipped.as_ref())
        {
            if let Some(chest) = eq.get("chest") {
                if let Some(effs) = chest.get("effects").and_then(|e| e.as_array()) {
                    for e in effs {
                        if e.get("target").and_then(|v| v.as_str()) == Some("armor") {
                            base_armor +=
                                e.get("value").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        }
                    }
                }
            }
        }
        let total_armor = base_armor + endu_bonus + agi_bonus;
        let actual_damage = (raw_damage - (def_defense + total_armor)).max(1);

        // Stealth break check
        if let Some(defender) = self.entities.get_mut(defender_id) {
            let mut broke_stealth = false;
            if let Some(effs) = &mut defender.active_effects {
                let initial_len = effs.len();
                effs.retain(|e| e.effect_type != EffectType::Stealth);
                if effs.len() < initial_len && actual_damage > 0 {
                    broke_stealth = true;
                }
                if effs.is_empty() {
                    defender.active_effects = None;
                }
            }
            if broke_stealth {
                self.add_log(
                    &format!("👁️ {} was REVEALED by taking damage!", def_name),
                    LogType::Info,
                );
            }
        }

        // Protection check
        let mut final_defender_id = defender_id.to_string();
        if let Some(defender) = self.entities.get(defender_id) {
            if let Some(effs) = &defender.active_effects {
                if let Some(prot) = effs
                    .iter()
                    .find(|e| e.effect_type == EffectType::ProtectionStance)
                {
                    if let Some(ref prot_id) = prot.protector_id {
                        if self.entities.contains_key(prot_id) {
                            final_defender_id = prot_id.clone();
                            self.add_log(
                                &format!("🛡️ Attack redirected from {} to protector!", def_name),
                                LogType::Info,
                            );
                        }
                    }
                }
            }
        }

        self.add_log(
            &format!(
                "🗡️ {atk_name} strikes {} for {}{actual_damage} damage! (-{MELEE_ATTACK_COST} AP)",
                self.entities
                    .get(&final_defender_id)
                    .map(|e| e.name.as_str())
                    .unwrap_or("Unknown"),
                if is_crit { "CRITICAL " } else { "" }
            ),
            LogType::Damage,
        );

        let new_hp = (self.entities.get(&final_defender_id).unwrap().hp - actual_damage).max(0);
        if let Some(defender) = self.entities.get_mut(&final_defender_id) {
            defender.hp = new_hp;
        }

        events.push(CombatEvent::AttackResult {
            attacker_id: attacker_id.to_string(),
            defender_id: final_defender_id.clone(),
            damage: actual_damage,
            is_crit,
            is_miss: false,
        });

        if new_hp <= 0 {
            let def_name = self.entities.get(&final_defender_id).unwrap().name.clone();
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

        let skill = {
            let caster = match self.entities.get(caster_id) {
                Some(c) => c,
                None => return events,
            };
            match caster.skills.iter().find(|s| s.id == skill_id) {
                Some(s) => s.clone(),
                None => {
                    events.push(CombatEvent::Error {
                        message: format!("Skill {skill_id} not found"),
                    });
                    return events;
                }
            }
        };

        let (
            caster_name,
            caster_ap,
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
                c.ap,
                c.grid_pos.clone(),
                c.strength,
                c.wisdom,
                c.charisma,
                c.level,
                c.crit_chance,
                c.social_bonus,
            )
        };

        if caster_ap < skill.ap_cost {
            events.push(CombatEvent::Error {
                message: format!(
                    "Not enough AP for {} (need {}, have {caster_ap})",
                    skill.name, skill.ap_cost
                ),
            });
            return events;
        }

        // Calculate direction for line AoE
        let dr = target_row as i32 - caster_pos.row as i32;
        let dc = target_col as i32 - caster_pos.col as i32;
        let (dir_r, dir_c) = if skill.area_type == SkillAreaType::Line {
            if dr.abs() > dc.abs() {
                (if dr > 0 { 1 } else { -1 }, 0)
            } else if dc.abs() > dr.abs() {
                (0, if dc > 0 { 1 } else { -1 })
            } else {
                (if dr > 0 { 1 } else { -1 }, 0)
            }
        } else {
            (0, 0)
        };

        let affected_cells = get_aoe_cells(
            &self.grid,
            target_row,
            target_col,
            &skill.area_type,
            skill.area_size,
            dir_r,
            dir_c,
        );

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
                    let scale = 0.42;
                    let mp_reduction =
                        1 + (scale * ((caster_charisma.max(0) as f64) + 1.0).ln()) as i32;
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
                        icon: None,
                        protector_id: None,
                        last_known_position: None,
                        just_applied: Some(true),
                    };
                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let mut active_effs = t_ref.active_effects.take().unwrap_or_default();
                        active_effs.push(new_eff);
                        t_ref.active_effects = Some(active_effs);
                        t_ref.max_mp -= mp_reduction;
                        t_ref.mp = t_ref.mp.min(t_ref.max_mp);
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
                    let scale = 0.6;
                    let base_bonus = 30.0;
                    let c_int = self.entities.get(caster_id).unwrap().intelligence.max(0) as f64;
                    let crit_bonus = (base_bonus + (scale * (c_int + 1.0).ln() * 10.0)) as f64;
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
                        icon: None,
                        protector_id: None,
                        last_known_position: None,
                        just_applied: Some(true),
                    };
                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let mut active_effs = t_ref.active_effects.take().unwrap_or_default();
                        active_effs.push(new_eff);
                        t_ref.active_effects = Some(active_effs);
                    }
                    self.add_log(
                        &format!(
                            "🔍 {} identifies flaws in {}! +{}% Crit chance.",
                            caster_name, target.name, crit_bonus
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

            // ── Damage ──
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
                                    base_armor +=
                                        e.get("value").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
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

                // Stealth break check
                let mut broke_stealth = false;
                if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                    if let Some(effs) = &mut t_ref.active_effects {
                        let initial_len = effs.len();
                        effs.retain(|e| e.effect_type != EffectType::Stealth);
                        if effs.len() < initial_len && actual_damage > 0 {
                            broke_stealth = true;
                        }
                        if effs.is_empty() {
                            t_ref.active_effects = None;
                        }
                    }
                }
                if broke_stealth {
                    self.add_log(
                        &format!("👁️ {} was REVEALED by taking damage!", target.name),
                        LogType::Info,
                    );
                }

                // Protection check
                let mut final_defender_id = occupant_id.clone();
                if let Some(effs) = &target.active_effects {
                    if let Some(prot) = effs
                        .iter()
                        .find(|e| e.effect_type == EffectType::ProtectionStance)
                    {
                        if let Some(ref prot_id) = prot.protector_id {
                            if self.entities.contains_key(prot_id) {
                                final_defender_id = prot_id.clone();
                                self.add_log(
                                    &format!(
                                        "🛡️ Attack redirected from {} to protector!",
                                        target.name
                                    ),
                                    LogType::Info,
                                );
                            }
                        }
                    }
                }

                new_hp = (self.entities.get(&final_defender_id).unwrap().hp - actual_damage).max(0);
                target_damage = Some(actual_damage);

                let icon = skill.icon.as_deref().unwrap_or("✨");
                self.add_log(
                    &format!(
                        "{icon} {caster_name} uses {} on {} → {}{actual_damage} damage!",
                        skill.name,
                        self.entities
                            .get(&final_defender_id)
                            .map(|e| e.name.as_str())
                            .unwrap_or("Unknown"),
                        if is_crit { "CRITICAL " } else { "" }
                    ),
                    LogType::Damage,
                );

                // Apply HP change
                if let Some(t) = self.entities.get_mut(&final_defender_id) {
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

                        if current_row != target.grid_pos.row || current_col != target.grid_pos.col
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
                            let shock_pot = dist_remaining as f64 * (caster_strength as f64 * 0.3);
                            let shock_dmg = (shock_pot - target.endurance as f64).max(0.0) as i32;
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
                                &format!("🌬️ {} is pushed back {} cells.", target.name, push_dist),
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

            // Apply active effects (Buffs/Debuffs)
            if let Some(effs) = skill.effects.as_ref() {
                for eff in effs {
                    let mut new_eff = eff.clone();
                    if new_eff.effect_type == EffectType::ProtectionStance {
                        new_eff.protector_id = Some(caster_id.to_string());
                    } else if new_eff.effect_type == EffectType::Stealth {
                        let base_dur = 1;
                        let factor = 1.4;
                        let bonus = (factor * ((caster_wisdom.max(0) as f64) + 1.0).ln()) as u32;
                        new_eff.duration = Some(base_dur + bonus);
                        new_eff.last_known_position = Some(caster_pos.clone());
                        self.add_log(
                            &format!(
                                "👤 {} hides for {} turns!",
                                target.name,
                                new_eff.duration.unwrap_or(1)
                            ),
                            LogType::Info,
                        );
                    } else if new_eff.effect_type == EffectType::Analyzed {
                        self.add_log(
                            &format!("👁️ {} is now ANALYZED!", target.name),
                            LogType::Info,
                        );
                    }
                    new_eff.just_applied = Some(true);

                    if let Some(t_ref) = self.entities.get_mut(&occupant_id) {
                        let mut active_effs = t_ref.active_effects.take().unwrap_or_default();
                        active_effs.push(new_eff);
                        t_ref.active_effects = Some(active_effs);

                        // Recalculate stats immediately
                        let mut cloned_e = t_ref.clone();
                        Self::calculate_effective_stats(&mut cloned_e, &self.rules);
                        let diff_max_hp = cloned_e.max_hp - t_ref.max_hp;
                        let diff_max_ap = cloned_e.max_ap - t_ref.max_ap;
                        let diff_max_mp = cloned_e.max_mp - t_ref.max_mp;

                        t_ref.max_hp = cloned_e.max_hp;
                        t_ref.max_ap = cloned_e.max_ap;
                        t_ref.max_mp = cloned_e.max_mp;
                        t_ref.crit_chance = cloned_e.crit_chance;
                        t_ref.resistance = cloned_e.resistance;
                        t_ref.social_bonus = cloned_e.social_bonus;

                        // If stats increased, give immediate use
                        if diff_max_hp > 0 {
                            t_ref.hp = (t_ref.hp + diff_max_hp).min(t_ref.max_hp);
                        }
                        if diff_max_ap > 0 {
                            t_ref.ap = (t_ref.ap + diff_max_ap).min(t_ref.max_ap);
                        }
                        if diff_max_mp > 0 {
                            t_ref.mp = (t_ref.mp + diff_max_mp).min(t_ref.max_mp);
                        }

                        t_ref.hp = t_ref.hp.min(t_ref.max_hp);
                        t_ref.ap = t_ref.ap.min(t_ref.max_ap);
                        t_ref.mp = t_ref.mp.min(t_ref.max_mp);
                        new_hp = t_ref.hp;
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

        // Reset AP/MP and tick cooldowns for next entity
        let next_entity_id = self.turn_order[next_index].clone();
        if let Some(entity) = self.entities.get_mut(&next_entity_id) {
            entity.ap = entity.max_ap;
            entity.mp = entity.max_mp;
            // Tick cooldowns
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

            // Tick active effects
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
                        // Permanent effect
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

        self.active_entity_index = next_index;

        // Recalculate stats for the next entity
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
            charisma: 8,
            crit_chance: 0.1,
            resistance: 0.05,
            social_bonus: 0.03,
            evasion: 5,
            defense: 2,
            traits: vec![],
            skills: vec![],
            skill_cooldowns: HashMap::new(),
            ap: 6,
            max_ap: 6,
            mp: 3,
            max_mp: 3,
            grid_pos: GridPos { row, col },
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
}
