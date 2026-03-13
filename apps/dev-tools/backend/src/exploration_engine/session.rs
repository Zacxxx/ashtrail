use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use rand::Rng;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tokio::time::{interval, Duration};
use tracing::{info, warn};

use crate::exploration_jobs::{ensure_test_exploration_location, TEST_EXPLORATION_LOCATION_ID};
use crate::AppState;

use super::{
    manifest::{load_all_chunks, load_storage_manifest},
    types::{
        ExplorationChunk, ExplorationChunkSync, ExplorationClientAction,
        ExplorationManifestDescriptor, ExplorationObject, ExplorationPawn, ExplorationSessionEvent,
        ExplorationSessionSnapshot, ExplorationTile, ExplorationVisibilityState, PathNode,
    },
};

const DEFAULT_TICK_RATE_HZ: u64 = 10;
const DEFAULT_SUBSCRIPTION_RADIUS: u32 = 1;
const EDGE_WANDER_RADIUS: i32 = 6;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    info!("Exploration WebSocket connection request");
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: AppState, mut socket: WebSocket) {
    info!("Exploration WebSocket connected");
    let mut session: Option<ExplorationSession> = None;
    let mut ticker = interval(Duration::from_millis(1000 / DEFAULT_TICK_RATE_HZ.max(1)));

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Some(active_session) = session.as_mut() {
                    if active_session.advance(1.0 / active_session.tick_rate_hz as f32)
                        && send_event(&mut socket, &active_session.pawn_sync()).await.is_err() {
                        break;
                    }
                }
            }
            message = socket.recv() => {
                let Some(message) = message else {
                    break;
                };
                let message = match message {
                    Ok(value) => value,
                    Err(error) => {
                        warn!("Exploration websocket read error: {error}");
                        break;
                    }
                };

                match message {
                    Message::Text(text) => {
                        let action = match serde_json::from_str::<ExplorationClientAction>(&text) {
                            Ok(action) => action,
                            Err(error) => {
                                if send_event(&mut socket, &ExplorationSessionEvent::Error {
                                    message: format!("Invalid exploration action: {error}"),
                                }).await.is_err() {
                                    break;
                                }
                                continue;
                            }
                        };

                        match action {
                            ExplorationClientAction::StartSession { world_id, location_id, selected_character_ids, config } => {
                                let tick_rate_hz = config
                                    .and_then(|entry| entry.tick_rate_hz)
                                    .filter(|value| *value > 0)
                                    .unwrap_or(DEFAULT_TICK_RATE_HZ as u32);
                                session = match ExplorationSession::load(
                                    &state,
                                    &world_id,
                                    &location_id,
                                    &selected_character_ids,
                                    tick_rate_hz as u64,
                                ) {
                                    Ok(active_session) => Some(active_session),
                                    Err(message) => {
                                        if send_event(&mut socket, &ExplorationSessionEvent::Error { message }).await.is_err() {
                                            break;
                                        }
                                        None
                                    }
                                };
                                if let Some(active_session) = session.as_ref() {
                                    if send_event(&mut socket, &ExplorationSessionEvent::SessionReady { state: active_session.snapshot() }).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            ExplorationClientAction::SubscribeChunks { center_row, center_col, radius } => {
                                let Some(active_session) = session.as_mut() else {
                                    continue;
                                };
                                let event = active_session.subscribe(center_row, center_col, radius);
                                if send_event(&mut socket, &event).await.is_err() {
                                    break;
                                }
                            }
                            ExplorationClientAction::MoveTo { pawn_id, target_row, target_col } => {
                                let Some(active_session) = session.as_mut() else {
                                    if send_event(&mut socket, &ExplorationSessionEvent::Error {
                                        message: "No active exploration session".to_string(),
                                    }).await.is_err() {
                                        break;
                                    }
                                    continue;
                                };
                                if let Err(message) = active_session.move_pawn(&pawn_id, target_row as i32, target_col as i32, true) {
                                    if send_event(&mut socket, &ExplorationSessionEvent::Error { message }).await.is_err() {
                                        break;
                                    }
                                } else if send_event(&mut socket, &active_session.pawn_sync()).await.is_err() {
                                    break;
                                }
                            }
                            ExplorationClientAction::SetSelectedPawn { pawn_id } => {
                                if let Some(active_session) = session.as_mut() {
                                    active_session.selected_pawn_id = pawn_id;
                                    active_session.refresh_visibility();
                                    if send_event(&mut socket, &active_session.pawn_sync()).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            ExplorationClientAction::Interact { row, col, object_id, actor_id } => {
                                let Some(active_session) = session.as_mut() else {
                                    continue;
                                };
                                match active_session.handle_interaction(row, col, object_id.clone(), actor_id.clone()) {
                                    Ok((label, chunks_changed, pawns_changed)) => {
                                        if chunks_changed {
                                            let event = active_session.current_chunk_sync();
                                            if send_event(&mut socket, &event).await.is_err() {
                                                break;
                                            }
                                        }
                                        if pawns_changed && send_event(&mut socket, &active_session.pawn_sync()).await.is_err() {
                                            break;
                                        }
                                        if send_event(&mut socket, &ExplorationSessionEvent::Interaction {
                                            label,
                                            row,
                                            col,
                                            object_id,
                                            actor_id,
                                        }).await.is_err() {
                                            break;
                                        }
                                    }
                                    Err(message) => {
                                        if send_event(&mut socket, &ExplorationSessionEvent::Error { message }).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                            }
                            ExplorationClientAction::Ping => {
                                let tick = session.as_ref().map(|entry| entry.tick).unwrap_or(0);
                                if send_event(&mut socket, &ExplorationSessionEvent::Pong { tick }).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Message::Close(_) => {
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    info!("Exploration WebSocket disconnected");
}

async fn send_event(socket: &mut WebSocket, event: &ExplorationSessionEvent) -> Result<(), ()> {
    let payload = serde_json::to_string(event).map_err(|_| ())?;
    socket
        .send(Message::Text(payload.into()))
        .await
        .map_err(|_| ())
}

struct ExplorationSession {
    descriptor: ExplorationManifestDescriptor,
    chunks: HashMap<(u32, u32), ExplorationChunk>,
    pawns: Vec<ExplorationPawn>,
    selected_pawn_id: Option<String>,
    visibility: ExplorationVisibilityState,
    tick: u64,
    tick_rate_hz: u64,
    subscribed_center_row: u32,
    subscribed_center_col: u32,
    subscribed_radius: u32,
}

impl ExplorationSession {
    fn load(
        state: &AppState,
        world_id: &str,
        location_id: &str,
        selected_character_ids: &[String],
        tick_rate_hz: u64,
    ) -> Result<Self, String> {
        if location_id == TEST_EXPLORATION_LOCATION_ID {
            ensure_test_exploration_location(&state.planets_dir, world_id)?;
        }
        let storage = load_storage_manifest(&state.planets_dir, world_id, location_id)?;
        let chunks = load_all_chunks(&state.planets_dir, world_id, location_id)?
            .into_iter()
            .map(|chunk| ((chunk.chunk_row, chunk.chunk_col), chunk))
            .collect::<HashMap<_, _>>();

        let player_pawns = spawn_player_pawns(
            &state.characters_dir,
            selected_character_ids,
            &storage.descriptor,
            &chunks,
            &storage.pawns,
        );
        let mut pawns = player_pawns;
        pawns.extend(storage.pawns);

        let selected_pawn_id = pawns
            .iter()
            .find(|pawn| pawn.faction_id == "player")
            .map(|pawn| pawn.id.clone())
            .or_else(|| pawns.first().map(|pawn| pawn.id.clone()));

        let mut session = Self {
            subscribed_center_row: storage.descriptor.spawn.row,
            subscribed_center_col: storage.descriptor.spawn.col,
            subscribed_radius: DEFAULT_SUBSCRIPTION_RADIUS,
            descriptor: storage.descriptor,
            chunks,
            pawns,
            selected_pawn_id,
            visibility: ExplorationVisibilityState {
                revealed_interior_id: None,
                revealed_roof_group_ids: Vec::new(),
                opened_door_ids: Vec::new(),
            },
            tick: 0,
            tick_rate_hz: tick_rate_hz.max(1),
        };
        session.refresh_visibility();
        Ok(session)
    }

    fn snapshot(&self) -> ExplorationSessionSnapshot {
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

    fn current_chunk_sync(&self) -> ExplorationSessionEvent {
        ExplorationSessionEvent::ChunkSync {
            sync: ExplorationChunkSync {
                descriptor_id: self.descriptor.id.clone(),
                chunks: self.current_subscription_chunks(),
            },
        }
    }

    fn pawn_sync(&self) -> ExplorationSessionEvent {
        ExplorationSessionEvent::PawnSync {
            pawns: self.pawns.clone(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            visibility: self.visibility.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    fn subscribe(
        &mut self,
        center_row: u32,
        center_col: u32,
        radius: u32,
    ) -> ExplorationSessionEvent {
        self.subscribed_center_row = center_row.min(self.descriptor.height.saturating_sub(1));
        self.subscribed_center_col = center_col.min(self.descriptor.width.saturating_sub(1));
        self.subscribed_radius = radius.min(2);
        self.current_chunk_sync()
    }

    fn current_subscription_chunks(&self) -> Vec<ExplorationChunk> {
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

    fn refresh_visibility(&mut self) -> bool {
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

        let row = selected_pawn.y.round() as i32;
        let col = selected_pawn.x.round() as i32;
        let tile = get_tile(self, row, col);
        let revealed_interior_id = tile
            .and_then(|entry| entry.interior_id.clone())
            .or_else(|| selected_pawn.home_interior_id.clone());
        let mut revealed_roof_group_ids = Vec::new();
        if let Some(interior_id) = revealed_interior_id.as_deref() {
            for object in self.all_objects() {
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

    fn move_pawn(
        &mut self,
        pawn_id: &str,
        target_row: i32,
        target_col: i32,
        allow_partial: bool,
    ) -> Result<(), String> {
        let Some(start_index) = self.pawns.iter().position(|entry| entry.id == pawn_id) else {
            return Err("Unknown pawn".to_string());
        };
        let start_row = self.pawns[start_index].y.round() as i32;
        let start_col = self.pawns[start_index].x.round() as i32;
        let path = find_path(
            self,
            Some(pawn_id),
            start_row,
            start_col,
            target_row,
            target_col,
        )
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
        pawn.path = Some(path.clone());
        pawn.target_x = path.first().map(|step| step.x as f32);
        pawn.target_y = path.first().map(|step| step.y as f32);
        Ok(())
    }

    fn handle_interaction(
        &mut self,
        row: Option<u32>,
        col: Option<u32>,
        object_id: Option<String>,
        actor_id: Option<String>,
    ) -> Result<(String, bool, bool), String> {
        if let Some(actor_id) = actor_id.as_deref() {
            if let Some(pawn) = self.pawns.iter().find(|entry| entry.id == actor_id) {
                return Ok((
                    format!(
                        "{}: {}",
                        pawn.interaction_label.as_deref().unwrap_or("Talk"),
                        pawn.name
                    ),
                    false,
                    false,
                ));
            }
        }

        let door_id = object_id
            .as_deref()
            .and_then(|id| {
                self.all_objects()
                    .into_iter()
                    .find(|object| object.id == id)
            })
            .and_then(|object| object.door_id.clone())
            .or_else(|| {
                row.zip(col)
                    .and_then(|(row, col)| get_tile(self, row as i32, col as i32))
                    .and_then(|tile| tile.door_id.clone())
            });

        if let Some(door_id) = door_id {
            if self.visibility.opened_door_ids.contains(&door_id) {
                return Ok(("Doorway".to_string(), false, false));
            }
            if !self.selected_pawn_adjacent_to(row, col, &door_id) {
                return Ok(("Door is too far away".to_string(), false, false));
            }
            self.visibility.opened_door_ids.push(door_id.clone());
            self.visibility.opened_door_ids.sort();
            self.visibility.opened_door_ids.dedup();
            let visibility_changed = self.refresh_visibility();
            return Ok((format!("Opened {door_id}"), true, visibility_changed));
        }

        if let Some(object_id) = object_id.as_deref() {
            if let Some(object) = self
                .all_objects()
                .into_iter()
                .find(|entry| entry.id == object_id)
            {
                return Ok((object.r#type.replace('-', " "), false, false));
            }
        }

        if let (Some(row), Some(col)) = (row, col) {
            if let Some(tile) = get_tile(self, row as i32, col as i32) {
                if let Some(interior_id) = tile.interior_id.as_deref() {
                    return Ok((format!("Interior {interior_id}"), false, false));
                }
            }
        }

        Ok(("Inspect".to_string(), false, false))
    }

    fn selected_pawn_adjacent_to(&self, row: Option<u32>, col: Option<u32>, door_id: &str) -> bool {
        let selected = self
            .selected_pawn_id
            .as_ref()
            .and_then(|id| self.pawns.iter().find(|pawn| &pawn.id == id));
        let Some(selected) = selected else {
            return false;
        };
        let pawn_row = selected.y.round() as i32;
        let pawn_col = selected.x.round() as i32;

        if let (Some(row), Some(col)) = (row, col) {
            return (pawn_row - row as i32).abs() <= 1 && (pawn_col - col as i32).abs() <= 1;
        }

        for object in self.all_objects() {
            if object.door_id.as_deref() == Some(door_id)
                && (pawn_row - object.y as i32).abs() <= 1
                && (pawn_col - object.x as i32).abs() <= 1
            {
                return true;
            }
        }
        false
    }

    fn advance(&mut self, delta_seconds: f32) -> bool {
        self.tick = self.tick.saturating_add(1);
        let mut changed = self.assign_npc_paths();

        let mut updated = Vec::with_capacity(self.pawns.len());
        for pawn in &self.pawns {
            let (next_pawn, pawn_changed) = advance_pawn(pawn, delta_seconds);
            changed |= pawn_changed;
            updated.push(next_pawn);
        }
        self.pawns = updated;
        changed |= self.refresh_visibility();
        changed
    }

    fn assign_npc_paths(&mut self) -> bool {
        if self.tick % (self.tick_rate_hz * 2).max(1) != 0 {
            return false;
        }

        let mut changed = false;
        let mut rng = rand::rng();
        let pawn_count = self.pawns.len();
        for index in 0..pawn_count {
            let pawn = self.pawns[index].clone();
            if pawn.is_npc != Some(true) || pawn.path.as_ref().is_some_and(|path| !path.is_empty())
            {
                continue;
            }

            let start_row = pawn.y.round() as i32;
            let start_col = pawn.x.round() as i32;
            let (home_row, home_col) =
                if let Some(home_interior_id) = pawn.home_interior_id.as_deref() {
                    first_tile_in_interior(self, home_interior_id).unwrap_or((start_row, start_col))
                } else {
                    (start_row, start_col)
                };

            let target_row = clamp_i32(
                home_row + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS),
                0,
                self.descriptor.height as i32 - 1,
            );
            let target_col = clamp_i32(
                home_col + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS),
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
                self.pawns[index].path = Some(path.clone());
                self.pawns[index].target_x = path.first().map(|step| step.x as f32);
                self.pawns[index].target_y = path.first().map(|step| step.y as f32);
                changed = true;
            }
        }
        changed
    }

    fn all_objects(&self) -> Vec<ExplorationObject> {
        let mut objects = self
            .chunks
            .values()
            .flat_map(|chunk| chunk.objects.iter().cloned())
            .collect::<Vec<_>>();
        objects.sort_by(|left, right| left.id.cmp(&right.id));
        objects.dedup_by(|left, right| left.id == right.id);
        objects
    }
}

fn spawn_player_pawns(
    characters_dir: &std::path::Path,
    selected_character_ids: &[String],
    descriptor: &ExplorationManifestDescriptor,
    chunks: &HashMap<(u32, u32), ExplorationChunk>,
    existing_pawns: &[ExplorationPawn],
) -> Vec<ExplorationPawn> {
    let positions = find_spawn_positions(
        descriptor,
        chunks,
        existing_pawns,
        selected_character_ids.len().max(1),
    );

    selected_character_ids
        .iter()
        .enumerate()
        .map(|(index, character_id)| {
            let character = load_character_summary(characters_dir, character_id);
            let position = positions
                .get(index)
                .copied()
                .unwrap_or((descriptor.spawn.row, descriptor.spawn.col));
            ExplorationPawn {
                id: character
                    .as_ref()
                    .and_then(|entry| entry.id.clone())
                    .unwrap_or_else(|| character_id.clone()),
                name: character
                    .as_ref()
                    .and_then(|entry| entry.name.clone())
                    .unwrap_or_else(|| "Colonist".to_string()),
                x: position.1 as f32,
                y: position.0 as f32,
                target_x: None,
                target_y: None,
                path: None,
                speed: 4.5,
                faction_id: "player".to_string(),
                r#type: character
                    .as_ref()
                    .map(CharacterSummary::pawn_type)
                    .unwrap_or_else(|| "human".to_string()),
                texture_url: None,
                sprite: character.and_then(|entry| entry.sprite),
                facing: Some("south".to_string()),
                is_npc: Some(false),
                interaction_label: None,
                home_interior_id: None,
            }
        })
        .collect()
}

#[derive(Default)]
struct CharacterSummary {
    id: Option<String>,
    name: Option<String>,
    kind: Option<String>,
    sprite: Option<Value>,
}

impl CharacterSummary {
    fn pawn_type(&self) -> String {
        match self.kind.as_deref() {
            Some("Animal") | Some("animal") => "animal".to_string(),
            Some("Construct") | Some("construct") => "mechanoid".to_string(),
            _ => "human".to_string(),
        }
    }
}

fn load_character_summary(
    characters_dir: &std::path::Path,
    character_id: &str,
) -> Option<CharacterSummary> {
    let path = characters_dir.join(format!("{character_id}.json"));
    let value = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())?;
    Some(CharacterSummary {
        id: value.get("id").and_then(Value::as_str).map(str::to_string),
        name: value
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        kind: value
            .get("type")
            .and_then(Value::as_str)
            .map(str::to_string),
        sprite: value.get("explorationSprite").cloned(),
    })
}

fn find_spawn_positions(
    descriptor: &ExplorationManifestDescriptor,
    chunks: &HashMap<(u32, u32), ExplorationChunk>,
    existing_pawns: &[ExplorationPawn],
    count: usize,
) -> Vec<(u32, u32)> {
    let mut candidates = Vec::new();
    let mut occupied = existing_pawns
        .iter()
        .map(|pawn| format!("{}:{}", pawn.y.round() as i32, pawn.x.round() as i32))
        .collect::<HashSet<_>>();

    let center_row = descriptor.spawn.row;
    let center_col = descriptor.spawn.col;
    for radius in 0..descriptor.width.max(descriptor.height) {
        let min_row = center_row.saturating_sub(radius);
        let min_col = center_col.saturating_sub(radius);
        let max_row = (center_row + radius).min(descriptor.height.saturating_sub(1));
        let max_col = (center_col + radius).min(descriptor.width.saturating_sub(1));
        for row in min_row..=max_row {
            for col in min_col..=max_col {
                let key = format!("{row}:{col}");
                if occupied.contains(&key) {
                    continue;
                }
                if get_tile_from_chunks(chunks, descriptor.chunk_size, row as i32, col as i32)
                    .is_some_and(|tile| tile.walkable)
                {
                    occupied.insert(key);
                    candidates.push((row, col));
                    if candidates.len() >= count {
                        return candidates;
                    }
                }
            }
        }
    }

    if candidates.is_empty() {
        candidates.push((center_row, center_col));
    }
    while candidates.len() < count {
        candidates.push(*candidates.last().unwrap_or(&(center_row, center_col)));
    }
    candidates
}

fn first_tile_in_interior(session: &ExplorationSession, interior_id: &str) -> Option<(i32, i32)> {
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

fn advance_pawn(pawn: &ExplorationPawn, delta_seconds: f32) -> (ExplorationPawn, bool) {
    let Some(path) = pawn.path.as_ref() else {
        return (pawn.clone(), false);
    };
    let Some(target) = path.first() else {
        let mut next = pawn.clone();
        next.path = None;
        next.target_x = None;
        next.target_y = None;
        return (next, true);
    };

    let dx = target.x as f32 - pawn.x;
    let dy = target.y as f32 - pawn.y;
    let distance = (dx * dx + dy * dy).sqrt();
    let step = pawn.speed * delta_seconds;
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
        let remaining_path = path.iter().skip(1).cloned().collect::<Vec<_>>();
        let mut next = pawn.clone();
        next.x = target.x as f32;
        next.y = target.y as f32;
        next.path = if remaining_path.is_empty() {
            None
        } else {
            Some(remaining_path.clone())
        };
        next.target_x = remaining_path.first().map(|step| step.x as f32);
        next.target_y = remaining_path.first().map(|step| step.y as f32);
        next.facing = Some(facing.to_string());
        return (next, true);
    }

    let mut next = pawn.clone();
    next.x = pawn.x + (dx / distance) * step;
    next.y = pawn.y + (dy / distance) * step;
    next.target_x = Some(target.x as f32);
    next.target_y = Some(target.y as f32);
    next.facing = Some(facing.to_string());
    (next, true)
}

fn find_nearest_reachable_target(
    session: &ExplorationSession,
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

fn find_path(
    session: &ExplorationSession,
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

fn build_occupied_set(
    session: &ExplorationSession,
    selected_pawn_id: Option<&str>,
) -> HashSet<String> {
    let mut occupied = HashSet::new();
    for pawn in &session.pawns {
        if selected_pawn_id == Some(pawn.id.as_str()) {
            continue;
        }
        occupied.insert(key(pawn.y.round() as i32, pawn.x.round() as i32));
    }
    occupied
}

fn get_cell_move_cost(session: &ExplorationSession, row: i32, col: i32) -> f32 {
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
    for object in session.all_objects() {
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

fn get_tile(session: &ExplorationSession, row: i32, col: i32) -> Option<ExplorationTile> {
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
                let is_wall = row == 0 || col == 0 || row == 15 || col == 15;
                let is_door = row == 4 && col == 6;
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

    fn sample_session() -> ExplorationSession {
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
        let chunk = sample_chunk();
        let mut session = ExplorationSession {
            descriptor,
            chunks: HashMap::from([((0, 0), chunk)]),
            pawns: vec![
                ExplorationPawn {
                    id: "player".to_string(),
                    name: "Player".to_string(),
                    x: 8.0,
                    y: 8.0,
                    target_x: None,
                    target_y: None,
                    path: None,
                    speed: 4.0,
                    faction_id: "player".to_string(),
                    r#type: "human".to_string(),
                    texture_url: None,
                    sprite: None,
                    facing: Some("south".to_string()),
                    is_npc: Some(false),
                    interaction_label: None,
                    home_interior_id: None,
                },
                ExplorationPawn {
                    id: "npc".to_string(),
                    name: "NPC".to_string(),
                    x: 7.0,
                    y: 7.0,
                    target_x: None,
                    target_y: None,
                    path: None,
                    speed: 2.0,
                    faction_id: "ambient".to_string(),
                    r#type: "human".to_string(),
                    texture_url: None,
                    sprite: None,
                    facing: Some("south".to_string()),
                    is_npc: Some(true),
                    interaction_label: Some("Talk".to_string()),
                    home_interior_id: Some("interior-a".to_string()),
                },
            ],
            selected_pawn_id: Some("player".to_string()),
            visibility: ExplorationVisibilityState {
                revealed_interior_id: None,
                revealed_roof_group_ids: Vec::new(),
                opened_door_ids: Vec::new(),
            },
            tick: 0,
            tick_rate_hz: 10,
            subscribed_center_row: 8,
            subscribed_center_col: 8,
            subscribed_radius: 1,
        };
        session.refresh_visibility();
        session
    }

    #[test]
    fn closed_doors_block_path_until_opened() {
        let mut session = sample_session();
        assert!(find_path(&session, Some("player"), 8, 8, 4, 6).is_none());
        session
            .visibility
            .opened_door_ids
            .push("door-a".to_string());
        assert!(find_path(&session, Some("player"), 8, 8, 4, 6).is_some());
    }

    #[test]
    fn solid_objects_block_pathing() {
        let session = sample_session();
        assert!(find_path(&session, Some("player"), 8, 8, 10, 10).is_none());
    }

    #[test]
    fn interaction_opens_adjacent_door() {
        let mut session = sample_session();
        session.pawns[0].x = 6.0;
        session.pawns[0].y = 5.0;
        let result = session
            .handle_interaction(Some(4), Some(6), Some("door-object".to_string()), None)
            .unwrap();
        assert_eq!(result.0, "Opened door-a");
        assert!(session
            .visibility
            .opened_door_ids
            .contains(&"door-a".to_string()));
    }

    #[test]
    fn npc_wandering_starts_from_current_position() {
        let mut session = sample_session();
        session.tick = session.tick_rate_hz * 2;
        session.pawns[1].x = 11.0;
        session.pawns[1].y = 11.0;
        let _ = session.assign_npc_paths();
        if let Some(path) = session.pawns[1].path.as_ref() {
            if let Some(first) = path.first() {
                assert!((first.x - 11).abs() <= EDGE_WANDER_RADIUS + 1);
                assert!((first.y - 11).abs() <= EDGE_WANDER_RADIUS + 1);
            }
        }
    }

    #[test]
    fn subscription_returns_expected_chunks() {
        let mut session = sample_session();
        let event = session.subscribe(8, 8, 1);
        match event {
            ExplorationSessionEvent::ChunkSync { sync } => assert_eq!(sync.chunks.len(), 1),
            _ => panic!("expected chunk sync"),
        }
    }
}
