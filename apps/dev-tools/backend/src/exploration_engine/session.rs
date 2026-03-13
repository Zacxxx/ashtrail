use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use rand::Rng;
use std::collections::{HashMap, HashSet};
use tokio::time::{interval, Duration};
use tracing::{info, warn};

use crate::AppState;

use super::manifest::migrate_manifest_value;
use super::types::{
    ExplorationClientAction, ExplorationMap, ExplorationObject, ExplorationPawn, ExplorationSessionEvent,
    ExplorationSessionSnapshot, ExplorationTile, PathNode,
};

const DEFAULT_TICK_RATE_HZ: u64 = 5;
const EDGE_WANDER_RADIUS: i32 = 6;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    info!("Exploration WebSocket connection request");
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
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
                            ExplorationClientAction::StartSession { map, selected_pawn_id, config } => {
                                let upgraded_value = serde_json::to_value(map)
                                    .ok()
                                    .map(migrate_manifest_value)
                                    .map(|(value, _)| value);
                                let upgraded_map = upgraded_value
                                    .and_then(|value| serde_json::from_value::<ExplorationMap>(value).ok());
                                let tick_rate_hz = config
                                    .and_then(|entry| entry.tick_rate_hz)
                                    .filter(|value| *value > 0)
                                    .unwrap_or(DEFAULT_TICK_RATE_HZ as u32);
                                session = upgraded_map.map(|map| ExplorationSession::new(map, selected_pawn_id, tick_rate_hz as u64));
                                if let Some(active_session) = session.as_ref() {
                                    if send_event(&mut socket, &ExplorationSessionEvent::StateSync { state: active_session.snapshot() }).await.is_err() {
                                        break;
                                    }
                                } else if send_event(&mut socket, &ExplorationSessionEvent::Error {
                                    message: "Failed to start exploration session".to_string(),
                                }).await.is_err() {
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
                                if let Err(message) = active_session.move_pawn(&pawn_id, target_row as i32, target_col as i32) {
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
                                    if send_event(&mut socket, &active_session.pawn_sync()).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            ExplorationClientAction::Interact { row, col, object_id, actor_id } => {
                                let Some(active_session) = session.as_ref() else {
                                    continue;
                                };
                                let label = active_session.describe_interaction(row, col, object_id.clone(), actor_id.clone());
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
    socket.send(Message::Text(payload.into())).await.map_err(|_| ())
}

struct ExplorationSession {
    map: ExplorationMap,
    selected_pawn_id: Option<String>,
    tick: u64,
    tick_rate_hz: u64,
}

impl ExplorationSession {
    fn new(map: ExplorationMap, selected_pawn_id: Option<String>, tick_rate_hz: u64) -> Self {
        Self {
            map,
            selected_pawn_id,
            tick: 0,
            tick_rate_hz: tick_rate_hz.max(1),
        }
    }

    fn snapshot(&self) -> ExplorationSessionSnapshot {
        ExplorationSessionSnapshot {
            map: self.map.clone(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    fn pawn_sync(&self) -> ExplorationSessionEvent {
        ExplorationSessionEvent::PawnSync {
            pawns: self.map.pawns.clone(),
            selected_pawn_id: self.selected_pawn_id.clone(),
            tick: self.tick,
            connection_state: "active".to_string(),
        }
    }

    fn describe_interaction(
        &self,
        row: Option<u32>,
        col: Option<u32>,
        object_id: Option<String>,
        actor_id: Option<String>,
    ) -> String {
        if let Some(actor_id) = actor_id.as_deref() {
            if let Some(pawn) = self.map.pawns.iter().find(|entry| entry.id == actor_id) {
                return format!("{}: {}", pawn.interaction_label.as_deref().unwrap_or("Talk"), pawn.name);
            }
        }
        if let Some(object_id) = object_id.as_deref() {
            if let Some(object) = self.map.objects.iter().find(|entry| entry.id == object_id) {
                return object.r#type.replace('-', " ");
            }
        }
        if let (Some(row), Some(col)) = (row, col) {
            if let Some(tile) = get_tile(&self.map, row as i32, col as i32) {
                if tile.r#type == "door" {
                    return "Doorway".to_string();
                }
                if let Some(interior_id) = tile.interior_id.as_deref() {
                    return format!("Interior {interior_id}");
                }
            }
        }
        "Inspect".to_string()
    }

    fn move_pawn(&mut self, pawn_id: &str, target_row: i32, target_col: i32) -> Result<(), String> {
        let Some(start_index) = self.map.pawns.iter().position(|entry| entry.id == pawn_id) else {
            return Err("Unknown pawn".to_string());
        };
        let start_row = self.map.pawns[start_index].y.round() as i32;
        let start_col = self.map.pawns[start_index].x.round() as i32;
        let path = find_path(&self.map, Some(pawn_id), start_row, start_col, target_row, target_col)
            .or_else(|| find_nearest_reachable_target(&self.map, Some(pawn_id), start_row, start_col, target_row, target_col))
            .ok_or_else(|| "No valid path to target".to_string())?;

        let pawn = &mut self.map.pawns[start_index];
        pawn.path = Some(path.clone());
        pawn.target_x = path.first().map(|step| step.x as f32);
        pawn.target_y = path.first().map(|step| step.y as f32);
        Ok(())
    }

    fn advance(&mut self, delta_seconds: f32) -> bool {
        self.tick = self.tick.saturating_add(1);
        let mut changed = self.assign_npc_paths();

        let mut updated = Vec::with_capacity(self.map.pawns.len());
        for pawn in &self.map.pawns {
            let (next_pawn, pawn_changed) = advance_pawn(pawn, delta_seconds);
            changed |= pawn_changed;
            updated.push(next_pawn);
        }
        self.map.pawns = updated;
        changed
    }

    fn assign_npc_paths(&mut self) -> bool {
        if self.tick % (self.tick_rate_hz * 2).max(1) != 0 {
            return false;
        }

        let mut changed = false;
        let mut rng = rand::rng();
        let pawn_count = self.map.pawns.len();
        for index in 0..pawn_count {
            let pawn = self.map.pawns[index].clone();
            if pawn.is_npc != Some(true) || pawn.path.as_ref().is_some_and(|path| !path.is_empty()) {
                continue;
            }

            let (home_row, home_col) = if let Some(home_interior_id) = pawn.home_interior_id.as_deref() {
                first_tile_in_interior(&self.map, home_interior_id)
                    .unwrap_or((pawn.y.round() as i32, pawn.x.round() as i32))
            } else {
                (pawn.y.round() as i32, pawn.x.round() as i32)
            };

            let target_row = clamp_i32(home_row + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS), 0, self.map.height as i32 - 1);
            let target_col = clamp_i32(home_col + rng.random_range(-EDGE_WANDER_RADIUS..=EDGE_WANDER_RADIUS), 0, self.map.width as i32 - 1);
            if let Some(path) = find_path(&self.map, Some(&pawn.id), home_row, home_col, target_row, target_col) {
                self.map.pawns[index].path = Some(path.clone());
                self.map.pawns[index].target_x = path.first().map(|step| step.x as f32);
                self.map.pawns[index].target_y = path.first().map(|step| step.y as f32);
                changed = true;
            }
        }
        changed
    }
}

fn first_tile_in_interior(map: &ExplorationMap, interior_id: &str) -> Option<(i32, i32)> {
    for row in 0..map.height as i32 {
        for col in 0..map.width as i32 {
            let tile = get_tile(map, row, col)?;
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
        if dx >= 0.0 { "east" } else { "west" }
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
        next.path = if remaining_path.is_empty() { None } else { Some(remaining_path.clone()) };
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
    map: &ExplorationMap,
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
                if get_cell_move_cost(map, row, col) <= 0.0 {
                    continue;
                }
                candidates.push((row, col, (row - target_row).abs() + (col - target_col).abs()));
            }
        }
        candidates.sort_by_key(|entry| entry.2);
        for (row, col, _) in candidates {
            if let Some(path) = find_path(map, selected_pawn_id, start_row, start_col, row, col) {
                return Some(path);
            }
        }
    }
    None
}

fn find_path(
    map: &ExplorationMap,
    selected_pawn_id: Option<&str>,
    start_row: i32,
    start_col: i32,
    target_row: i32,
    target_col: i32,
) -> Option<Vec<PathNode>> {
    if start_row == target_row && start_col == target_col {
        return Some(Vec::new());
    }
    if target_row < 0 || target_col < 0 || target_row >= map.height as i32 || target_col >= map.width as i32 {
        return None;
    }
    if get_cell_move_cost(map, target_row, target_col) <= 0.0 {
        return None;
    }

    let occupied = build_occupied_set(map, selected_pawn_id);
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

    let mut open = vec![(start_row, start_col, 0.0_f32, octile_heuristic(start_row, start_col, target_row, target_col))];
    let mut came_from: HashMap<String, String> = HashMap::new();
    let mut g_scores = HashMap::<String, f32>::from([(key(start_row, start_col), 0.0)]);
    let mut closed = HashSet::<String>::new();

    while !open.is_empty() {
        open.sort_by(|left, right| left.3.partial_cmp(&right.3).unwrap_or(std::cmp::Ordering::Equal));
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
                let walk_row = parts.first().and_then(|entry| entry.parse::<i32>().ok()).unwrap_or(0);
                let walk_col = parts.get(1).and_then(|entry| entry.parse::<i32>().ok()).unwrap_or(0);
                path.push(PathNode { x: walk_col, y: walk_row });
                walk = previous;
            }
            path.reverse();
            return Some(path);
        }

        for (dr, dc, dir_cost) in DIRS {
            let next_row = row + dr;
            let next_col = col + dc;
            if next_row < 0 || next_col < 0 || next_row >= map.height as i32 || next_col >= map.width as i32 {
                continue;
            }
            let next_key = key(next_row, next_col);
            if closed.contains(&next_key) || occupied.contains(&next_key) {
                continue;
            }
            let move_cost = get_cell_move_cost(map, next_row, next_col);
            if move_cost <= 0.0 {
                continue;
            }
            if dr != 0 && dc != 0 {
                let horizontal = get_cell_move_cost(map, row, next_col);
                let vertical = get_cell_move_cost(map, next_row, col);
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

fn build_occupied_set(map: &ExplorationMap, selected_pawn_id: Option<&str>) -> HashSet<String> {
    let mut occupied = HashSet::new();
    for pawn in &map.pawns {
        if selected_pawn_id == Some(pawn.id.as_str()) {
            continue;
        }
        occupied.insert(key(pawn.y.round() as i32, pawn.x.round() as i32));
    }
    occupied
}

fn get_cell_move_cost(map: &ExplorationMap, row: i32, col: i32) -> f32 {
    let Some(tile) = get_tile(map, row, col) else {
        return 0.0;
    };
    if !tile.walkable {
        return 0.0;
    }

    let mut move_cost = if tile.move_cost > 0.0 { tile.move_cost } else { 1.0 };
    for object in &map.objects {
        if !object_footprint_contains(object, row, col) {
            continue;
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

fn get_tile(map: &ExplorationMap, row: i32, col: i32) -> Option<&ExplorationTile> {
    if row < 0 || col < 0 || row >= map.height as i32 || col >= map.width as i32 {
        return None;
    }
    map.tiles.get(row as usize * map.width as usize + col as usize)
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
