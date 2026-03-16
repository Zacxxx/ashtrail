use rand::Rng;
use std::collections::{HashMap, HashSet};

use super::types::{
    ExplorationChunk, ExplorationChunkSync, ExplorationManifestDescriptor, ExplorationObject,
    ExplorationPawn, ExplorationSessionEvent, ExplorationSessionSnapshot, ExplorationTile,
    ExplorationVisibilityState, PathNode, RouteNode,
};

pub const DEFAULT_SUBSCRIPTION_RADIUS: u32 = 1;
const EDGE_WANDER_RADIUS: i32 = 6;

#[derive(Debug, Clone)]
pub struct AdvanceResult {
    pub changed_pawn_ids: Vec<String>,
    pub visibility_changed: bool,
}

#[derive(Debug, Clone)]
pub struct InteractionResult {
    pub label: String,
    pub chunks_changed: bool,
    pub changed_pawn_ids: Vec<String>,
}

pub struct ExplorationSim {
    pub descriptor: ExplorationManifestDescriptor,
    pub chunks: HashMap<(u32, u32), ExplorationChunk>,
    pub objects: Vec<ExplorationObject>,
    pub pawns: Vec<ExplorationPawn>,
    pub selected_pawn_id: Option<String>,
    pub visibility: ExplorationVisibilityState,
    pub tick: u64,
    pub tick_rate_hz: u64,
    pub subscribed_center_row: u32,
    pub subscribed_center_col: u32,
    pub subscribed_radius: u32,
}

impl ExplorationSim {
    pub fn new(
        descriptor: ExplorationManifestDescriptor,
        chunks: HashMap<(u32, u32), ExplorationChunk>,
        pawns: Vec<ExplorationPawn>,
        selected_pawn_id: Option<String>,
        tick_rate_hz: u64,
    ) -> Self {
        let normalized_pawns = pawns
            .into_iter()
            .map(normalize_pawn_runtime)
            .collect::<Vec<_>>();
        let mut objects = chunks
            .values()
            .flat_map(|chunk| chunk.objects.iter().cloned())
            .collect::<Vec<_>>();
        objects.sort_by(|left, right| left.id.cmp(&right.id));
        objects.dedup_by(|left, right| left.id == right.id);
        let mut sim = Self {
            subscribed_center_row: descriptor.spawn.row,
            subscribed_center_col: descriptor.spawn.col,
            subscribed_radius: DEFAULT_SUBSCRIPTION_RADIUS,
            descriptor,
            chunks,
            objects,
            pawns: normalized_pawns,
            selected_pawn_id,
            visibility: ExplorationVisibilityState {
                revealed_interior_id: None,
                revealed_roof_group_ids: Vec::new(),
                opened_door_ids: Vec::new(),
            },
            tick: 0,
            tick_rate_hz: tick_rate_hz.max(1),
        };
        sim.refresh_visibility();
        sim
    }

    pub fn snapshot(&self) -> ExplorationSessionSnapshot {
        ExplorationSessionSnapshot {
            descriptor: self.descriptor.clone(),
            chunks: self.current_subscription_chunks(),
            pawns: self.pawns.clone(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            visibility: self.visibility.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    pub fn current_chunk_sync(&self) -> ExplorationSessionEvent {
        ExplorationSessionEvent::ChunkSync {
            sync: ExplorationChunkSync {
                descriptor_id: self.descriptor.id.clone(),
                chunks: self.current_subscription_chunks(),
            },
        }
    }

    pub fn chunk_delta(
        &self,
        chunks: Vec<ExplorationChunk>,
        removed_chunk_ids: Vec<String>,
    ) -> ExplorationSessionEvent {
        ExplorationSessionEvent::ChunkDelta {
            descriptor_id: self.descriptor.id.clone(),
            chunks,
            removed_chunk_ids,
        }
    }

    pub fn pawn_delta(&self, changed_pawn_ids: &[String]) -> ExplorationSessionEvent {
        let pawns = if changed_pawn_ids.is_empty() {
            Vec::new()
        } else {
            let changed = changed_pawn_ids.iter().cloned().collect::<HashSet<_>>();
            self.pawns
                .iter()
                .filter(|pawn| changed.contains(&pawn.id))
                .cloned()
                .collect::<Vec<_>>()
        };
        ExplorationSessionEvent::PawnDelta {
            pawns,
            removed_pawn_ids: Vec::new(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            visibility: self.visibility.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    pub fn pawn_sync(&self) -> ExplorationSessionEvent {
        ExplorationSessionEvent::PawnSync {
            pawns: self.pawns.clone(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            visibility: self.visibility.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    pub fn subscribe_view(
        &mut self,
        center_row: u32,
        center_col: u32,
        radius: u32,
    ) -> ExplorationSessionEvent {
        let previous_ids = self
            .current_subscription_chunks()
            .into_iter()
            .map(|chunk| chunk.id)
            .collect::<HashSet<_>>();

        self.subscribed_center_row = center_row.min(self.descriptor.height.saturating_sub(1));
        self.subscribed_center_col = center_col.min(self.descriptor.width.saturating_sub(1));
        self.subscribed_radius = radius.min(2);

        let next_chunks = self.current_subscription_chunks();
        let next_ids = next_chunks
            .iter()
            .map(|chunk| chunk.id.clone())
            .collect::<HashSet<_>>();
        let removed_chunk_ids = previous_ids
            .difference(&next_ids)
            .cloned()
            .collect::<Vec<_>>();
        self.chunk_delta(next_chunks, removed_chunk_ids)
    }

    pub fn current_subscription_chunks(&self) -> Vec<ExplorationChunk> {
        let chunk_size = self.descriptor.chunk_size.max(1);
        let center_chunk_row = self.subscribed_center_row / chunk_size;
        let center_chunk_col = self.subscribed_center_col / chunk_size;
        let min_row = center_chunk_row.saturating_sub(self.subscribed_radius);
        let min_col = center_chunk_col.saturating_sub(self.subscribed_radius);
        let max_row = center_chunk_row + self.subscribed_radius;
        let max_col = center_chunk_col + self.subscribed_radius;

        let mut chunks = self
            .chunks
            .iter()
            .filter_map(|((chunk_row, chunk_col), chunk)| {
                if *chunk_row >= min_row
                    && *chunk_row <= max_row
                    && *chunk_col >= min_col
                    && *chunk_col <= max_col
                {
                    Some(chunk.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        chunks.sort_by_key(|chunk| (chunk.chunk_row, chunk.chunk_col));
        chunks
    }

    pub fn set_selected_pawn(&mut self, pawn_id: Option<String>) -> bool {
        self.selected_pawn_id = pawn_id;
        self.refresh_visibility()
    }

    pub fn refresh_visibility(&mut self) -> bool {
        let selected_pawn = self
            .selected_pawn_id
            .as_ref()
            .and_then(|id| self.pawns.iter().find(|pawn| &pawn.id == id));
        let Some(selected_pawn) = selected_pawn else {
            let changed = self.visibility.revealed_interior_id.is_some()
                || !self.visibility.revealed_roof_group_ids.is_empty();
            self.visibility.revealed_interior_id = None;
            self.visibility.revealed_roof_group_ids.clear();
            return changed;
        };

        let (row, col) = resolve_pawn_navigation_origin(self, selected_pawn);
        let tile = get_tile(self, row, col);
        let revealed_interior_id = tile
            .and_then(|entry| entry.interior_id.clone())
            .or_else(|| adjacent_doorway_interior(self, row, col))
            .or_else(|| selected_pawn.home_interior_id.clone());
        let mut revealed_roof_group_ids = Vec::new();
        if let Some(interior_id) = revealed_interior_id.as_deref() {
            for object in &self.objects {
                if object.interior_id.as_deref() == Some(interior_id) {
                    if let Some(roof_group_id) = object.roof_group_id.clone() {
                        if !revealed_roof_group_ids.contains(&roof_group_id) {
                            revealed_roof_group_ids.push(roof_group_id);
                        }
                    }
                }
            }
        }

        let changed = self.visibility.revealed_interior_id != revealed_interior_id
            || self.visibility.revealed_roof_group_ids != revealed_roof_group_ids;
        self.visibility.revealed_interior_id = revealed_interior_id;
        self.visibility.revealed_roof_group_ids = revealed_roof_group_ids;
        changed
    }

    pub fn move_pawn(
        &mut self,
        pawn_id: &str,
        target_row: i32,
        target_col: i32,
        allow_partial: bool,
    ) -> Result<Vec<String>, String> {
        let Some(start_index) = self.pawns.iter().position(|entry| entry.id == pawn_id) else {
            return Err("Unknown pawn".to_string());
        };
        let (start_row, start_col) = resolve_pawn_navigation_origin(self, &self.pawns[start_index]);
        if start_row == target_row && start_col == target_col {
            let pawn = &mut self.pawns[start_index];
            clear_route_state(pawn);
            return Ok(vec![pawn_id.to_string()]);
        }

        let target_interior_id =
            get_tile(self, target_row, target_col).and_then(|tile| tile.interior_id);
        if let Some(interior_id) = target_interior_id.as_deref() {
            let _ = open_adjacent_interior_door(self, start_row, start_col, interior_id);
        }

        let path = find_path(
            self,
            Some(pawn_id),
            start_row,
            start_col,
            target_row,
            target_col,
        )
        .or_else(|| {
            target_interior_id.as_deref().and_then(|interior_id| {
                find_interior_entry_path(self, Some(pawn_id), start_row, start_col, &interior_id)
            })
        })
        .or_else(|| {
            if allow_partial {
                find_nearest_reachable_target(
                    self,
                    Some(pawn_id),
                    start_row,
                    start_col,
                    target_row,
                    target_col,
                )
            } else {
                None
            }
        })
        .ok_or_else(|| "No valid path to target".to_string())?;

        let pawn = &mut self.pawns[start_index];
        pawn.route = to_route_nodes(&path);
        pawn.route_index = 0;
        pawn.segment_progress = 0.0;
        pawn.moving = !pawn.route.is_empty();
        pawn.move_speed_tiles_per_second = pawn.speed.max(1.0);
        pawn.path = Some(path);
        update_route_targets(pawn);
        Ok(vec![pawn_id.to_string()])
    }

    pub fn handle_interaction(
        &mut self,
        row: Option<u32>,
        col: Option<u32>,
        object_id: Option<String>,
        actor_id: Option<String>,
    ) -> Result<InteractionResult, String> {
        if let Some(actor_id) = actor_id.as_deref() {
            if let Some(pawn) = self.pawns.iter().find(|entry| entry.id == actor_id) {
                return Ok(InteractionResult {
                    label: format!(
                        "{}: {}",
                        pawn.interaction_label.as_deref().unwrap_or("Talk"),
                        pawn.name
                    ),
                    chunks_changed: false,
                    changed_pawn_ids: Vec::new(),
                });
            }
        }

        let door_id = object_id
            .as_deref()
            .and_then(|id| self.objects.iter().find(|object| object.id == id))
            .and_then(|object| object.door_id.clone())
            .or_else(|| {
                row.zip(col)
                    .and_then(|(entry_row, entry_col)| {
                        get_tile(self, entry_row as i32, entry_col as i32)
                    })
                    .and_then(|tile| tile.door_id.clone())
            });

        if let Some(door_id) = door_id {
            if self.visibility.opened_door_ids.contains(&door_id) {
                return Ok(InteractionResult {
                    label: "Doorway".to_string(),
                    chunks_changed: false,
                    changed_pawn_ids: Vec::new(),
                });
            }
            if !self.selected_pawn_adjacent_to(row, col, &door_id) {
                return Ok(InteractionResult {
                    label: "Door is too far away".to_string(),
                    chunks_changed: false,
                    changed_pawn_ids: Vec::new(),
                });
            }
            self.visibility.opened_door_ids.push(door_id.clone());
            self.visibility.opened_door_ids.sort();
            self.visibility.opened_door_ids.dedup();
            self.refresh_visibility();
            return Ok(InteractionResult {
                label: format!("Opened {door_id}"),
                chunks_changed: true,
                changed_pawn_ids: Vec::new(),
            });
        }

        if let Some(object_id) = object_id.as_deref() {
            if let Some(object) = self.objects.iter().find(|entry| entry.id == object_id) {
                return Ok(InteractionResult {
                    label: object.r#type.replace('-', " "),
                    chunks_changed: false,
                    changed_pawn_ids: Vec::new(),
                });
            }
        }

        if let (Some(row), Some(col)) = (row, col) {
            if let Some(tile) = get_tile(self, row as i32, col as i32) {
                if let Some(interior_id) = tile.interior_id.as_deref() {
                    return Ok(InteractionResult {
                        label: format!("Interior {interior_id}"),
                        chunks_changed: false,
                        changed_pawn_ids: Vec::new(),
                    });
                }
            }
        }

        Ok(InteractionResult {
            label: "Inspect".to_string(),
            chunks_changed: false,
            changed_pawn_ids: Vec::new(),
        })
    }

    pub fn advance(&mut self, delta_seconds: f32) -> AdvanceResult {
        self.tick = self.tick.saturating_add(1);
        let mut changed_pawn_ids = self.assign_npc_behavior();

        let mut updated = Vec::with_capacity(self.pawns.len());
        for pawn in &self.pawns {
            let (next_pawn, pawn_changed) =
                advance_pawn(pawn, delta_seconds, self.tick, self.tick_rate_hz);
            if pawn_changed {
                changed_pawn_ids.push(next_pawn.id.clone());
            }
            updated.push(next_pawn);
        }
        self.pawns = updated;
        changed_pawn_ids.sort();
        changed_pawn_ids.dedup();
        let visibility_changed = self.refresh_visibility();
        AdvanceResult {
            changed_pawn_ids,
            visibility_changed,
        }
    }

    fn assign_npc_behavior(&mut self) -> Vec<String> {
        let mut changed = Vec::new();
        let mut rng = rand::rng();
        let pawn_count = self.pawns.len();
        for index in 0..pawn_count {
            let pawn = self.pawns[index].clone();
            if pawn.is_npc != Some(true) || pawn.moving {
                continue;
            }
            if pawn
                .next_decision_at_tick
                .is_some_and(|next_tick| next_tick > self.tick)
            {
                continue;
            }

            let (start_row, start_col) = resolve_pawn_navigation_origin(self, &pawn);
            let (anchor_row, anchor_col, intent, schedule_id) =
                if let Some(home_interior_id) = pawn.home_interior_id.as_deref() {
                    let (row, col) = first_tile_in_interior(self, home_interior_id)
                        .unwrap_or((start_row, start_col));
                    (
                        row,
                        col,
                        "walking_to_anchor".to_string(),
                        format!("resident:{home_interior_id}"),
                    )
                } else {
                    (
                        start_row,
                        start_col,
                        "wandering_local".to_string(),
                        "ambient:wander".to_string(),
                    )
                };

            let target_row = clamp_i32(
                anchor_row + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS),
                0,
                self.descriptor.height as i32 - 1,
            );
            let target_col = clamp_i32(
                anchor_col + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS),
                0,
                self.descriptor.width as i32 - 1,
            );
            if let Some(path) = find_path(
                self,
                Some(&pawn.id),
                start_row,
                start_col,
                target_row,
                target_col,
            ) {
                let next = &mut self.pawns[index];
                next.route = to_route_nodes(&path);
                next.route_index = 0;
                next.segment_progress = 0.0;
                next.moving = !next.route.is_empty();
                next.move_speed_tiles_per_second = next.speed.max(1.0);
                next.path = Some(path);
                next.schedule_id = Some(schedule_id);
                next.current_anchor_id = Some(format!("{anchor_row}:{anchor_col}"));
                next.current_intent = Some(intent);
                next.next_decision_at_tick = Some(self.tick + self.tick_rate_hz * 3);
                update_route_targets(next);
                changed.push(next.id.clone());
            } else {
                let next = &mut self.pawns[index];
                next.current_intent = Some("waiting".to_string());
                next.next_decision_at_tick = Some(self.tick + self.tick_rate_hz * 2);
            }
        }
        changed
    }

    fn selected_pawn_adjacent_to(&self, row: Option<u32>, col: Option<u32>, door_id: &str) -> bool {
        let selected = self
            .selected_pawn_id
            .as_ref()
            .and_then(|id| self.pawns.iter().find(|pawn| &pawn.id == id));
        let Some(selected) = selected else {
            return false;
        };
        let (pawn_row, pawn_col) = resolve_pawn_navigation_origin(self, selected);

        if let (Some(row), Some(col)) = (row, col) {
            return (pawn_row - row as i32).abs() <= 1 && (pawn_col - col as i32).abs() <= 1;
        }

        for object in &self.objects {
            if object.door_id.as_deref() == Some(door_id)
                && (pawn_row - object.y as i32).abs() <= 1
                && (pawn_col - object.x as i32).abs() <= 1
            {
                return true;
            }
        }
        false
    }

    pub fn all_objects(&self) -> Vec<ExplorationObject> {
        self.objects.clone()
    }
}

fn normalize_pawn_runtime(mut pawn: ExplorationPawn) -> ExplorationPawn {
    pawn.tile_row = pawn.y.round() as i32;
    pawn.tile_col = pawn.x.round() as i32;
    pawn.move_speed_tiles_per_second = if pawn.move_speed_tiles_per_second > 0.0 {
        pawn.move_speed_tiles_per_second
    } else if pawn.speed > 0.0 {
        pawn.speed
    } else {
        4.0
    };
    if pawn.route.is_empty() {
        pawn.route = pawn
            .path
            .clone()
            .unwrap_or_default()
            .into_iter()
            .map(|step| RouteNode {
                row: step.y,
                col: step.x,
            })
            .collect();
    }
    pawn.moving = pawn.moving || pawn.route_index < pawn.route.len();
    update_route_targets(&mut pawn);
    if pawn.is_npc == Some(true) && pawn.current_intent.is_none() {
        pawn.current_intent = Some("idle".to_string());
    }
    pawn
}

fn to_route_nodes(path: &[PathNode]) -> Vec<RouteNode> {
    path.iter()
        .map(|step| RouteNode {
            row: step.y,
            col: step.x,
        })
        .collect()
}

fn remaining_path_from_route(route: &[RouteNode], route_index: usize) -> Option<Vec<PathNode>> {
    let path = route
        .iter()
        .skip(route_index)
        .map(|step| PathNode {
            x: step.col,
            y: step.row,
        })
        .collect::<Vec<_>>();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn clear_route_state(pawn: &mut ExplorationPawn) {
    pawn.route.clear();
    pawn.route_index = 0;
    pawn.segment_progress = 0.0;
    pawn.moving = false;
    pawn.path = None;
    pawn.target_x = None;
    pawn.target_y = None;
}

fn update_route_targets(pawn: &mut ExplorationPawn) {
    pawn.path = remaining_path_from_route(&pawn.route, pawn.route_index);
    if let Some(target) = pawn.route.get(pawn.route_index) {
        pawn.target_x = Some(target.col as f32);
        pawn.target_y = Some(target.row as f32);
        pawn.moving = true;
    } else {
        pawn.target_x = None;
        pawn.target_y = None;
        pawn.moving = false;
    }
}

fn advance_pawn(
    pawn: &ExplorationPawn,
    delta_seconds: f32,
    tick: u64,
    tick_rate_hz: u64,
) -> (ExplorationPawn, bool) {
    let Some(target) = pawn.route.get(pawn.route_index) else {
        let mut next = pawn.clone();
        if next.moving || next.target_x.is_some() || next.target_y.is_some() || next.path.is_some()
        {
            clear_route_state(&mut next);
            next.tile_row = next.y.round() as i32;
            next.tile_col = next.x.round() as i32;
            if next.is_npc == Some(true) {
                next.current_intent = Some("waiting".to_string());
                next.next_decision_at_tick = Some(tick + tick_rate_hz);
            }
            return (next, true);
        }
        return (next, false);
    };

    let dx = target.col as f32 - pawn.x;
    let dy = target.row as f32 - pawn.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let step = pawn.move_speed_tiles_per_second.max(1.0) * delta_seconds;
    let facing = if dx.abs() >= dy.abs() {
        if dx >= 0.0 {
            "east"
        } else {
            "west"
        }
    } else if dy >= 0.0 {
        "south"
    } else {
        "north"
    };

    if distance <= step || distance < 0.001 {
        let mut next = pawn.clone();
        next.x = target.col as f32;
        next.y = target.row as f32;
        next.tile_row = target.row;
        next.tile_col = target.col;
        next.route_index = next.route_index.saturating_add(1);
        next.segment_progress = 0.0;
        next.facing = Some(facing.to_string());
        update_route_targets(&mut next);
        if !next.moving && next.is_npc == Some(true) {
            next.current_intent = Some("waiting".to_string());
            next.next_decision_at_tick = Some(tick + tick_rate_hz);
        }
        return (next, true);
    }

    let segment_length = if pawn.route_index == 0 {
        distance.max(1.0)
    } else {
        let previous = pawn.route.get(pawn.route_index - 1).unwrap_or(target);
        let dx = (target.col - previous.col) as f32;
        let dy = (target.row - previous.row) as f32;
        (dx * dx + dy * dy).sqrt().max(1.0)
    };

    let mut next = pawn.clone();
    next.x = pawn.x + (dx / distance) * step;
    next.y = pawn.y + (dy / distance) * step;
    next.tile_row = next.y.round() as i32;
    next.tile_col = next.x.round() as i32;
    next.segment_progress = (1.0
        - (((target.col as f32 - next.x).powi(2) + (target.row as f32 - next.y).powi(2)).sqrt()
            / segment_length))
        .clamp(0.0, 0.999);
    next.facing = Some(facing.to_string());
    update_route_targets(&mut next);
    (next, true)
}

fn adjacent_doorway_interior(session: &ExplorationSim, row: i32, col: i32) -> Option<String> {
    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let next_row = row + dr;
        let next_col = col + dc;
        let tile = get_tile(session, next_row, next_col)?;
        if tile.door_id.is_some() && tile.interior_id.is_some() {
            return tile.interior_id.clone();
        }
    }
    None
}

fn first_tile_in_interior(session: &ExplorationSim, interior_id: &str) -> Option<(i32, i32)> {
    for row in 0..session.descriptor.height as i32 {
        for col in 0..session.descriptor.width as i32 {
            let tile = get_tile(session, row, col)?;
            if tile.interior_id.as_deref() == Some(interior_id) && tile.walkable {
                return Some((row, col));
            }
        }
    }
    None
}

pub fn resolve_pawn_navigation_origin(
    session: &ExplorationSim,
    pawn: &ExplorationPawn,
) -> (i32, i32) {
    let rounded_row = pawn.y.round() as i32;
    let rounded_col = pawn.x.round() as i32;
    let floor_row = pawn.y.floor() as i32;
    let floor_col = pawn.x.floor() as i32;
    let ceil_row = pawn.y.ceil() as i32;
    let ceil_col = pawn.x.ceil() as i32;
    let mut candidates = vec![
        (pawn.tile_row, pawn.tile_col),
        (rounded_row, rounded_col),
        (floor_row, floor_col),
        (floor_row, ceil_col),
        (ceil_row, floor_col),
        (ceil_row, ceil_col),
    ];
    if let Some(target) = pawn.route.get(pawn.route_index) {
        candidates.push((target.row, target.col));
    }
    if let (Some(target_y), Some(target_x)) = (pawn.target_y, pawn.target_x) {
        candidates.push((target_y.round() as i32, target_x.round() as i32));
    }

    let mut best = None;
    for (row, col) in candidates {
        if row < 0
            || col < 0
            || row >= session.descriptor.height as i32
            || col >= session.descriptor.width as i32
        {
            continue;
        }
        let Some(tile) = get_tile(session, row, col) else {
            continue;
        };
        if !tile.walkable || get_cell_move_cost(session, row, col) <= 0.0 {
            continue;
        }
        let score = (pawn.y - row as f32).abs() + (pawn.x - col as f32).abs();
        match best {
            Some((_, _, best_score)) if score >= best_score => {}
            _ => best = Some((row, col, score)),
        }
    }

    best.map(|(row, col, _)| (row, col))
        .unwrap_or((rounded_row, rounded_col))
}

fn find_nearest_reachable_target(
    session: &ExplorationSim,
    selected_pawn_id: Option<&str>,
    start_row: i32,
    start_col: i32,
    target_row: i32,
    target_col: i32,
) -> Option<Vec<PathNode>> {
    for radius in 1..=4 {
        let mut candidates = Vec::new();
        for row in (target_row - radius)..=(target_row + radius) {
            for col in (target_col - radius)..=(target_col + radius) {
                if (row - target_row).abs() != radius && (col - target_col).abs() != radius {
                    continue;
                }
                if get_cell_move_cost(session, row, col) <= 0.0 {
                    continue;
                }
                candidates.push((
                    row,
                    col,
                    (row - target_row).abs() + (col - target_col).abs(),
                ));
            }
        }
        candidates.sort_by_key(|entry| entry.2);
        for (row, col, _) in candidates {
            if let Some(path) = find_path(session, selected_pawn_id, start_row, start_col, row, col)
            {
                return Some(path);
            }
        }
    }
    None
}

fn find_interior_entry_path(
    session: &ExplorationSim,
    selected_pawn_id: Option<&str>,
    start_row: i32,
    start_col: i32,
    interior_id: &str,
) -> Option<Vec<PathNode>> {
    let mut doorway_candidates = collect_interior_doorway_candidates(session, interior_id);
    doorway_candidates.sort_by(|left, right| {
        left.2
            .partial_cmp(&right.2)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for (row, col, _) in doorway_candidates {
        if let Some(path) = find_path(session, selected_pawn_id, start_row, start_col, row, col) {
            return Some(path);
        }
    }
    None
}

fn open_adjacent_interior_door(
    session: &mut ExplorationSim,
    start_row: i32,
    start_col: i32,
    interior_id: &str,
) -> bool {
    let mut door_ids_to_open = Vec::new();
    for object in &session.objects {
        if object.interior_id.as_deref() != Some(interior_id) {
            continue;
        }
        let Some(door_id) = object.door_id.as_deref() else {
            continue;
        };
        if session
            .visibility
            .opened_door_ids
            .iter()
            .any(|entry| entry == door_id)
        {
            continue;
        }
        if (object.y as i32 - start_row).abs() <= 1 && (object.x as i32 - start_col).abs() <= 1 {
            door_ids_to_open.push(door_id.to_string());
        }
    }

    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let row = start_row + dr;
        let col = start_col + dc;
        let Some(tile) = get_tile(session, row, col) else {
            continue;
        };
        if tile.interior_id.as_deref() != Some(interior_id) {
            continue;
        }
        let Some(door_id) = tile.door_id.as_deref() else {
            continue;
        };
        if !session
            .visibility
            .opened_door_ids
            .iter()
            .any(|entry| entry == door_id)
        {
            door_ids_to_open.push(door_id.to_string());
        }
    }

    if door_ids_to_open.is_empty() {
        return false;
    }
    session.visibility.opened_door_ids.extend(door_ids_to_open);
    session.visibility.opened_door_ids.sort();
    session.visibility.opened_door_ids.dedup();
    true
}

fn collect_interior_doorway_candidates(
    session: &ExplorationSim,
    interior_id: &str,
) -> Vec<(i32, i32, f32)> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    for object in &session.objects {
        if object.interior_id.as_deref() != Some(interior_id) || object.door_id.is_none() {
            continue;
        }
        let row = object.y as i32;
        let col = object.x as i32;
        collect_doorway_approaches(session, interior_id, row, col, &mut seen, &mut candidates);
    }

    for row in 0..session.descriptor.height as i32 {
        for col in 0..session.descriptor.width as i32 {
            let Some(tile) = get_tile(session, row, col) else {
                continue;
            };
            if tile.interior_id.as_deref() != Some(interior_id) || tile.door_id.is_none() {
                continue;
            }
            collect_doorway_approaches(session, interior_id, row, col, &mut seen, &mut candidates);
        }
    }

    candidates
}

fn collect_doorway_approaches(
    session: &ExplorationSim,
    interior_id: &str,
    door_row: i32,
    door_col: i32,
    seen: &mut HashSet<String>,
    candidates: &mut Vec<(i32, i32, f32)>,
) {
    if get_cell_move_cost(session, door_row, door_col) > 0.0 {
        let key = key(door_row, door_col);
        if seen.insert(key) {
            candidates.push((door_row, door_col, 1.0));
        }
    }

    let mut exterior_candidates = Vec::new();
    let mut interior_adjacent_candidates = Vec::new();
    for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let row = door_row + dr;
        let col = door_col + dc;
        if row < 0
            || col < 0
            || row >= session.descriptor.height as i32
            || col >= session.descriptor.width as i32
        {
            continue;
        }
        if get_cell_move_cost(session, row, col) <= 0.0 {
            continue;
        }
        let is_same_interior = get_tile(session, row, col)
            .and_then(|entry| entry.interior_id)
            .as_deref()
            == Some(interior_id);
        if is_same_interior {
            interior_adjacent_candidates.push((row, col, 4.0));
        } else {
            exterior_candidates.push((row, col, 0.0));
        }
    }

    for (row, col, priority) in exterior_candidates
        .into_iter()
        .chain(interior_adjacent_candidates.into_iter())
    {
        let candidate_key = key(row, col);
        if seen.insert(candidate_key) {
            let distance_from_door = ((row - door_row).abs() + (col - door_col).abs()) as f32;
            candidates.push((row, col, priority + distance_from_door));
        }
    }
}

fn find_path(
    session: &ExplorationSim,
    selected_pawn_id: Option<&str>,
    start_row: i32,
    start_col: i32,
    target_row: i32,
    target_col: i32,
) -> Option<Vec<PathNode>> {
    if start_row == target_row && start_col == target_col {
        return Some(Vec::new());
    }
    if target_row < 0
        || target_col < 0
        || target_row >= session.descriptor.height as i32
        || target_col >= session.descriptor.width as i32
    {
        return None;
    }
    if get_cell_move_cost(session, target_row, target_col) <= 0.0 {
        return None;
    }

    let occupied = build_occupied_set(session, selected_pawn_id);
    if occupied.contains(&key(target_row, target_col)) {
        return None;
    }

    const DIRS: [(i32, i32, f32); 8] = [
        (-1, 0, 1.0),
        (1, 0, 1.0),
        (0, -1, 1.0),
        (0, 1, 1.0),
        (-1, -1, std::f32::consts::SQRT_2),
        (-1, 1, std::f32::consts::SQRT_2),
        (1, -1, std::f32::consts::SQRT_2),
        (1, 1, std::f32::consts::SQRT_2),
    ];

    let mut open = vec![(
        start_row,
        start_col,
        0.0_f32,
        octile_heuristic(start_row, start_col, target_row, target_col),
    )];
    let mut came_from: HashMap<String, String> = HashMap::new();
    let mut g_scores = HashMap::<String, f32>::from([(key(start_row, start_col), 0.0)]);
    let mut closed = HashSet::<String>::new();

    while !open.is_empty() {
        open.sort_by(|left, right| {
            left.3
                .partial_cmp(&right.3)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let (row, col, g, _) = open.remove(0);
        let current_key = key(row, col);
        if closed.contains(&current_key) {
            continue;
        }
        closed.insert(current_key.clone());

        if row == target_row && col == target_col {
            let mut path = Vec::<PathNode>::new();
            let mut walk = current_key;
            while let Some(previous) = came_from.get(&walk).cloned() {
                let parts = walk.split(':').collect::<Vec<_>>();
                let walk_row = parts
                    .first()
                    .and_then(|entry| entry.parse::<i32>().ok())
                    .unwrap_or(0);
                let walk_col = parts
                    .get(1)
                    .and_then(|entry| entry.parse::<i32>().ok())
                    .unwrap_or(0);
                path.push(PathNode {
                    x: walk_col,
                    y: walk_row,
                });
                walk = previous;
            }
            path.reverse();
            return Some(path);
        }

        for (dr, dc, dir_cost) in DIRS {
            let next_row = row + dr;
            let next_col = col + dc;
            if next_row < 0
                || next_col < 0
                || next_row >= session.descriptor.height as i32
                || next_col >= session.descriptor.width as i32
            {
                continue;
            }
            let next_key = key(next_row, next_col);
            if closed.contains(&next_key) || occupied.contains(&next_key) {
                continue;
            }
            let move_cost = get_cell_move_cost(session, next_row, next_col);
            if move_cost <= 0.0 {
                continue;
            }
            if dr != 0 && dc != 0 {
                let horizontal = get_cell_move_cost(session, row, next_col);
                let vertical = get_cell_move_cost(session, next_row, col);
                if horizontal <= 0.0 || vertical <= 0.0 {
                    continue;
                }
            }

            let tentative_g = g + dir_cost * move_cost;
            if let Some(known) = g_scores.get(&next_key) {
                if tentative_g >= *known {
                    continue;
                }
            }

            came_from.insert(next_key.clone(), current_key.clone());
            g_scores.insert(next_key.clone(), tentative_g);
            open.push((
                next_row,
                next_col,
                tentative_g,
                tentative_g + octile_heuristic(next_row, next_col, target_row, target_col),
            ));
        }
    }

    None
}

fn build_occupied_set(session: &ExplorationSim, selected_pawn_id: Option<&str>) -> HashSet<String> {
    let mut occupied = HashSet::new();
    for pawn in &session.pawns {
        if selected_pawn_id == Some(pawn.id.as_str()) {
            continue;
        }
        occupied.insert(key(pawn.tile_row, pawn.tile_col));
    }
    occupied
}

fn get_cell_move_cost(session: &ExplorationSim, row: i32, col: i32) -> f32 {
    let Some(tile) = get_tile(session, row, col) else {
        return 0.0;
    };
    if !tile.walkable {
        return 0.0;
    }
    if tile.door_id.as_deref().is_some_and(|door_id| {
        !session
            .visibility
            .opened_door_ids
            .iter()
            .any(|entry| entry == door_id)
    }) {
        return 0.0;
    }

    let mut move_cost = if tile.move_cost > 0.0 {
        tile.move_cost
    } else {
        1.0
    };
    for object in &session.objects {
        if !object_footprint_contains(&object, row, col) {
            continue;
        }
        if object.door_id.as_deref().is_some_and(|door_id| {
            !session
                .visibility
                .opened_door_ids
                .iter()
                .any(|entry| entry == door_id)
        }) {
            return 0.0;
        }
        if !object.passable {
            return 0.0;
        }
        if let Some(object_move_cost) = object.move_cost.filter(|value| *value > 0.0) {
            move_cost = move_cost.max(object_move_cost);
        }
    }
    move_cost
}

fn object_footprint_contains(object: &ExplorationObject, row: i32, col: i32) -> bool {
    row >= object.y as i32
        && row < object.y as i32 + object.height as i32
        && col >= object.x as i32
        && col < object.x as i32 + object.width as i32
}

fn get_tile(session: &ExplorationSim, row: i32, col: i32) -> Option<ExplorationTile> {
    get_tile_from_chunks(&session.chunks, session.descriptor.chunk_size, row, col).cloned()
}

fn get_tile_from_chunks<'a>(
    chunks: &'a HashMap<(u32, u32), ExplorationChunk>,
    chunk_size: u32,
    row: i32,
    col: i32,
) -> Option<&'a ExplorationTile> {
    if row < 0 || col < 0 {
        return None;
    }
    let row = row as u32;
    let col = col as u32;
    let chunk_row = row / chunk_size.max(1);
    let chunk_col = col / chunk_size.max(1);
    let chunk = chunks.get(&(chunk_row, chunk_col))?;
    let local_row = row.saturating_sub(chunk.origin_row);
    let local_col = col.saturating_sub(chunk.origin_col);
    if local_row >= chunk.height || local_col >= chunk.width {
        return None;
    }
    chunk
        .tiles
        .get((local_row * chunk.width + local_col) as usize)
}

fn octile_heuristic(row: i32, col: i32, target_row: i32, target_col: i32) -> f32 {
    let dx = (target_col - col).abs() as f32;
    let dy = (target_row - row).abs() as f32;
    (dx + dy) + (std::f32::consts::SQRT_2 - 2.0) * dx.min(dy)
}

fn key(row: i32, col: i32) -> String {
    format!("{row}:{col}")
}

fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    value.clamp(min, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exploration_engine::types::{ExplorationSpawnPoint, ExplorationTile};

    fn sample_chunk() -> ExplorationChunk {
        let mut tiles = Vec::new();
        for row in 0..16 {
            for col in 0..16 {
                let is_building_perimeter = (4..=8).contains(&row)
                    && (4..=8).contains(&col)
                    && (row == 4 || row == 8 || col == 4 || col == 8);
                let is_door = row == 4 && col == 6;
                let is_wall = row == 0
                    || col == 0
                    || row == 15
                    || col == 15
                    || (is_building_perimeter && !is_door);
                tiles.push(ExplorationTile {
                    r#type: if is_wall && !is_door {
                        "wall".to_string()
                    } else if is_door {
                        "door".to_string()
                    } else {
                        "floor".to_string()
                    },
                    walkable: !is_wall || is_door,
                    move_cost: if is_wall && !is_door { 0.0 } else { 1.0 },
                    texture_url: None,
                    is_spawn_zone: None,
                    interior_id: if (4..=8).contains(&row) && (4..=8).contains(&col) {
                        Some("interior-a".to_string())
                    } else {
                        None
                    },
                    light_level: Some(0.8),
                    blocks_light: Some(is_wall),
                    door_id: if is_door {
                        Some("door-a".to_string())
                    } else {
                        None
                    },
                });
            }
        }
        ExplorationChunk {
            id: "chunk-0-0".to_string(),
            chunk_row: 0,
            chunk_col: 0,
            origin_row: 0,
            origin_col: 0,
            width: 16,
            height: 16,
            tiles,
            objects: vec![
                ExplorationObject {
                    id: "door-object".to_string(),
                    r#type: "door".to_string(),
                    x: 6,
                    y: 4,
                    width: 1,
                    height: 1,
                    passable: true,
                    texture_url: None,
                    is_natural: Some(false),
                    is_hidden: Some(false),
                    move_cost: None,
                    fertility: None,
                    door_id: Some("door-a".to_string()),
                    interior_id: Some("interior-a".to_string()),
                    roof_group_id: Some("roof-a".to_string()),
                    height_tiles: Some(2),
                    blocks_light: Some(false),
                },
                ExplorationObject {
                    id: "tree-1".to_string(),
                    r#type: "tree".to_string(),
                    x: 10,
                    y: 10,
                    width: 1,
                    height: 1,
                    passable: false,
                    texture_url: None,
                    is_natural: Some(true),
                    is_hidden: Some(false),
                    move_cost: None,
                    fertility: Some(1.0),
                    door_id: None,
                    interior_id: None,
                    roof_group_id: None,
                    height_tiles: Some(1),
                    blocks_light: Some(false),
                },
            ],
        }
    }

    fn sample_sim() -> ExplorationSim {
        let descriptor = ExplorationManifestDescriptor {
            id: "desc".to_string(),
            world_id: "world".to_string(),
            location_id: "loc".to_string(),
            name: "Location".to_string(),
            width: 16,
            height: 16,
            chunk_size: 16,
            version: 3,
            render_mode: "isometric".to_string(),
            ambient_light: 0.76,
            spawn: ExplorationSpawnPoint { row: 8, col: 8 },
            metadata: None,
        };
        ExplorationSim::new(
            descriptor,
            HashMap::from([((0, 0), sample_chunk())]),
            vec![
                ExplorationPawn {
                    id: "player".to_string(),
                    name: "Player".to_string(),
                    x: 8.0,
                    y: 8.0,
                    tile_row: 8,
                    tile_col: 8,
                    target_x: None,
                    target_y: None,
                    path: None,
                    route: Vec::new(),
                    route_index: 0,
                    segment_progress: 0.0,
                    moving: false,
                    move_speed_tiles_per_second: 4.0,
                    speed: 6.5,
                    faction_id: "player".to_string(),
                    r#type: "human".to_string(),
                    texture_url: None,
                    sprite: None,
                    facing: Some("south".to_string()),
                    is_npc: Some(false),
                    interaction_label: None,
                    home_interior_id: None,
                    schedule_id: None,
                    current_anchor_id: None,
                    current_intent: None,
                    next_decision_at_tick: None,
                },
                ExplorationPawn {
                    id: "npc".to_string(),
                    name: "NPC".to_string(),
                    x: 7.0,
                    y: 7.0,
                    tile_row: 7,
                    tile_col: 7,
                    target_x: None,
                    target_y: None,
                    path: None,
                    route: Vec::new(),
                    route_index: 0,
                    segment_progress: 0.0,
                    moving: false,
                    move_speed_tiles_per_second: 2.0,
                    speed: 2.0,
                    faction_id: "ambient".to_string(),
                    r#type: "human".to_string(),
                    texture_url: None,
                    sprite: None,
                    facing: Some("south".to_string()),
                    is_npc: Some(true),
                    interaction_label: Some("Talk".to_string()),
                    home_interior_id: Some("interior-a".to_string()),
                    schedule_id: None,
                    current_anchor_id: None,
                    current_intent: Some("idle".to_string()),
                    next_decision_at_tick: None,
                },
            ],
            Some("player".to_string()),
            10,
        )
    }

    #[test]
    fn closed_doors_block_path_until_opened() {
        let mut sim = sample_sim();
        assert!(find_path(&sim, Some("player"), 8, 8, 4, 6).is_none());
        sim.visibility.opened_door_ids.push("door-a".to_string());
        assert!(find_path(&sim, Some("player"), 8, 8, 4, 6).is_some());
    }

    #[test]
    fn solid_objects_block_pathing() {
        let sim = sample_sim();
        assert!(find_path(&sim, Some("player"), 8, 8, 10, 10).is_none());
    }

    #[test]
    fn interaction_opens_adjacent_door() {
        let mut sim = sample_sim();
        sim.pawns[0].x = 6.0;
        sim.pawns[0].y = 5.0;
        sim.pawns[0].tile_row = 5;
        sim.pawns[0].tile_col = 6;
        let result = sim
            .handle_interaction(Some(4), Some(6), Some("door-object".to_string()), None)
            .unwrap();
        assert_eq!(result.label, "Opened door-a");
        assert!(sim
            .visibility
            .opened_door_ids
            .contains(&"door-a".to_string()));
    }

    #[test]
    fn fractional_interior_position_resolves_to_walkable_origin() {
        let mut sim = sample_sim();
        sim.visibility.opened_door_ids.push("door-a".to_string());
        sim.pawns[0].x = 4.4;
        sim.pawns[0].y = 5.4;

        let result = sim.move_pawn("player", 7, 7, true);

        assert!(result.is_ok());
        assert!(!sim.pawns[0].route.is_empty());
    }

    #[test]
    fn clicking_interior_routes_to_nearest_doorway() {
        let mut sim = sample_sim();

        let result = sim.move_pawn("player", 6, 6, true);

        assert!(result.is_ok());
        let route = &sim.pawns[0].route;
        assert!(!route.is_empty());
        let last = route.last().expect("route should have an endpoint");
        assert_eq!((last.row, last.col), (3, 6));
    }

    #[test]
    fn doorway_click_inside_opens_door_and_paths_interior() {
        let mut sim = sample_sim();
        sim.pawns[0].x = 6.0;
        sim.pawns[0].y = 3.0;
        sim.pawns[0].tile_row = 3;
        sim.pawns[0].tile_col = 6;

        let result = sim.move_pawn("player", 6, 6, true);

        assert!(result.is_ok());
        assert!(sim
            .visibility
            .opened_door_ids
            .contains(&"door-a".to_string()));
        let route = &sim.pawns[0].route;
        assert!(!route.is_empty());
        let last = route.last().expect("route should have an endpoint");
        assert_eq!((last.row, last.col), (6, 6));
    }

    #[test]
    fn npc_wandering_starts_from_current_position() {
        let mut sim = sample_sim();
        sim.tick = sim.tick_rate_hz * 3;
        sim.visibility.opened_door_ids.push("door-a".to_string());
        sim.pawns[1].x = 11.0;
        sim.pawns[1].y = 11.0;
        sim.pawns[1].tile_row = 11;
        sim.pawns[1].tile_col = 11;
        let mut issued_route = false;
        for _ in 0..12 {
            sim.pawns[1].next_decision_at_tick = None;
            let changed = sim.assign_npc_behavior();
            if changed.contains(&"npc".to_string()) {
                issued_route = true;
                break;
            }
        }
        assert!(issued_route);
        if let Some(first) = sim.pawns[1].route.first() {
            assert!((first.col - 11).abs() <= EDGE_WANDER_RADIUS + 1);
            assert!((first.row - 11).abs() <= EDGE_WANDER_RADIUS + 1);
        }
    }

    #[test]
    fn subscription_returns_expected_chunks() {
        let mut sim = sample_sim();
        let event = sim.subscribe_view(8, 8, 1);
        match event {
            ExplorationSessionEvent::ChunkDelta { chunks, .. } => assert_eq!(chunks.len(), 1),
            _ => panic!("expected chunk delta"),
        }
    }
}
