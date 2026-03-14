use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tokio::task;
use tokio::time::{interval, Duration};
use tracing::{info, warn};

use crate::exploration_jobs::{ensure_test_exploration_location, TEST_EXPLORATION_LOCATION_ID};
use crate::AppState;

use super::{
    manifest::{load_all_chunks, load_storage_manifest},
    sim::ExplorationSim,
    types::{
        ExplorationChunk, ExplorationClientAction, ExplorationManifestDescriptor, ExplorationPawn,
        ExplorationSessionEvent,
    },
};

const DEFAULT_TICK_RATE_HZ: u64 = 10;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    info!("Exploration WebSocket connection request");
    ws.on_upgrade(move |socket| handle_socket(state, socket))
}

async fn handle_socket(state: AppState, mut socket: WebSocket) {
    info!("Exploration WebSocket connected");
    let mut session: Option<ExplorationSim> = None;
    let mut ticker = interval(Duration::from_millis(1000 / DEFAULT_TICK_RATE_HZ.max(1)));

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Some(active_session) = session.as_mut() {
                    let advance = active_session.advance(1.0 / active_session.tick_rate_hz as f32);
                    if (!advance.changed_pawn_ids.is_empty() || advance.visibility_changed)
                        && send_event(&mut socket, &active_session.pawn_delta(&advance.changed_pawn_ids)).await.is_err() {
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
                                info!(
                                    world_id = %world_id,
                                    location_id = %location_id,
                                    selected_character_count = selected_character_ids.len(),
                                    tick_rate_hz,
                                    "Exploration start_session requested"
                                );
                                let state_for_load = state.clone();
                                let world_id_for_load = world_id.clone();
                                let location_id_for_load = location_id.clone();
                                let selected_character_ids_for_load = selected_character_ids.clone();
                                session = match task::spawn_blocking(move || {
                                    load_simulation(
                                        &state_for_load,
                                        &world_id_for_load,
                                        &location_id_for_load,
                                        &selected_character_ids_for_load,
                                        tick_rate_hz as u64,
                                    )
                                }).await {
                                    Ok(Ok(active_session)) => {
                                        info!(
                                            world_id = %world_id,
                                            location_id = %location_id,
                                            chunk_count = active_session.chunks.len(),
                                            pawn_count = active_session.pawns.len(),
                                            "Exploration session loaded"
                                        );
                                        Some(active_session)
                                    }
                                    Ok(Err(message)) => {
                                        warn!(
                                            world_id = %world_id,
                                            location_id = %location_id,
                                            error = %message,
                                            "Exploration session failed to load"
                                        );
                                        if send_event(&mut socket, &ExplorationSessionEvent::Error { message }).await.is_err() {
                                            break;
                                        }
                                        None
                                    }
                                    Err(error) => {
                                        let message = format!("Exploration session task failed: {error}");
                                        warn!(
                                            world_id = %world_id,
                                            location_id = %location_id,
                                            error = %message,
                                            "Exploration session task join failed"
                                        );
                                        if send_event(&mut socket, &ExplorationSessionEvent::Error { message }).await.is_err() {
                                            break;
                                        }
                                        None
                                    }
                                };
                                if let Some(active_session) = session.as_ref() {
                                    ticker = interval(Duration::from_millis(1000 / active_session.tick_rate_hz.max(1)));
                                    if send_event(&mut socket, &ExplorationSessionEvent::SessionReady { state: active_session.snapshot() }).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            ExplorationClientAction::SubscribeView { center_row, center_col, radius } => {
                                let Some(active_session) = session.as_mut() else {
                                    continue;
                                };
                                let event = active_session.subscribe_view(center_row, center_col, radius);
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
                                match active_session.move_pawn(&pawn_id, target_row as i32, target_col as i32, true) {
                                    Ok(changed_pawn_ids) => {
                                        if send_event(&mut socket, &active_session.pawn_delta(&changed_pawn_ids)).await.is_err() {
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
                            ExplorationClientAction::SetSelectedPawn { pawn_id } => {
                                if let Some(active_session) = session.as_mut() {
                                    active_session.set_selected_pawn(pawn_id);
                                    if send_event(&mut socket, &active_session.pawn_delta(&[])).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            ExplorationClientAction::Interact { row, col, object_id, actor_id } => {
                                let Some(active_session) = session.as_mut() else {
                                    continue;
                                };
                                match active_session.handle_interaction(row, col, object_id.clone(), actor_id.clone()) {
                                    Ok(result) => {
                                        if result.chunks_changed {
                                            let event = active_session.chunk_delta(
                                                active_session.current_subscription_chunks(),
                                                Vec::new(),
                                            );
                                            if send_event(&mut socket, &event).await.is_err() {
                                                break;
                                            }
                                        }
                                        if !result.changed_pawn_ids.is_empty()
                                            && send_event(&mut socket, &active_session.pawn_delta(&result.changed_pawn_ids)).await.is_err() {
                                            break;
                                        }
                                        if send_event(&mut socket, &ExplorationSessionEvent::Interaction {
                                            label: result.label,
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

fn load_simulation(
    state: &AppState,
    world_id: &str,
    location_id: &str,
    selected_character_ids: &[String],
    tick_rate_hz: u64,
) -> Result<ExplorationSim, String> {
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

    Ok(ExplorationSim::new(
        storage.descriptor,
        chunks,
        pawns,
        selected_pawn_id,
        tick_rate_hz,
    ))
}

async fn send_event(socket: &mut WebSocket, event: &ExplorationSessionEvent) -> Result<(), ()> {
    let payload = serde_json::to_string(event).map_err(|_| ())?;
    socket
        .send(Message::Text(payload.into()))
        .await
        .map_err(|_| ())
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
                tile_row: position.0 as i32,
                tile_col: position.1 as i32,
                target_x: None,
                target_y: None,
                path: None,
                route: Vec::new(),
                route_index: 0,
                segment_progress: 0.0,
                moving: false,
                move_speed_tiles_per_second: 6.5,
                speed: 6.5,
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
                schedule_id: None,
                current_anchor_id: None,
                current_intent: None,
                next_decision_at_tick: None,
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
        name: value.get("name").and_then(Value::as_str).map(str::to_string),
        kind: value.get("type").and_then(Value::as_str).map(str::to_string),
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

fn get_tile_from_chunks<'a>(
    chunks: &'a HashMap<(u32, u32), ExplorationChunk>,
    chunk_size: u32,
    row: i32,
    col: i32,
) -> Option<&'a super::types::ExplorationTile> {
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
    chunk.tiles.get((local_row * chunk.width + local_col) as usize)
}
