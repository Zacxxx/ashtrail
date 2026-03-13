// ═══════════════════════════════════════════════════════════
// combat_engine/session.rs — WebSocket combat session manager
// Handles client connections and combat lifecycle over WS.
// ═══════════════════════════════════════════════════════════

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
};
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

use super::ai::run_ai_turn;
use super::combat::CombatState;
use super::preparation::prepare_combatants;
use super::rules::load_rules_from_file;
use super::types::*;

/// Axum handler for WebSocket upgrade
pub async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    info!("Combat WebSocket connection request");
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    info!("Combat WebSocket connected");

    let mut combat_state: Option<CombatState> = None;

    while let Some(msg) = socket.recv().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!("WebSocket read error: {e}");
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let action: CombatAction = match serde_json::from_str(&text) {
                    Ok(a) => a,
                    Err(e) => {
                        let err = CombatEvent::Error {
                            message: format!("Invalid action: {e}"),
                        };
                        if send_event(&mut socket, &err).await.is_err() {
                            break;
                        }
                        continue;
                    }
                };

                let events = process_action(&mut combat_state, action);

                for event in &events {
                    if send_event(&mut socket, event).await.is_err() {
                        return;
                    }
                }

                // After processing a player action, check if it's now an AI turn
                // and auto-process the AI
                if let Some(state) = &mut combat_state {
                    while state.phase == CombatPhase::Combat && !state.is_player_turn() {
                        // Small delay for animation feel
                        sleep(Duration::from_millis(600)).await;

                        let ai_events = run_ai_turn(state);
                        for event in &ai_events {
                            if send_event(&mut socket, event).await.is_err() {
                                return;
                            }
                            // Small delay between AI actions for readability
                            sleep(Duration::from_millis(200)).await;
                        }

                        // Send updated state after AI turn
                        let sync = CombatEvent::StateSync {
                            state: state.snapshot(),
                        };
                        if send_event(&mut socket, &sync).await.is_err() {
                            return;
                        }
                    }
                }
            }
            Message::Close(_) => {
                info!("Combat WebSocket closed by client");
                break;
            }
            _ => {}
        }
    }

    info!("Combat WebSocket disconnected");
}

fn process_action(
    combat_state: &mut Option<CombatState>,
    action: CombatAction,
) -> Vec<CombatEvent> {
    match action {
        CombatAction::StartCombat {
            roster,
            players,
            enemies,
            grid,
            config,
        } => {
            let sanitized_grid = sanitize_grid(grid, &config);
            info!(
                roster = roster.as_ref().map(|entries| entries.len()).unwrap_or(0),
                players = players.as_ref().map(|entries| entries.len()).unwrap_or(0),
                enemies = enemies.as_ref().map(|entries| entries.len()).unwrap_or(0),
                grid_rows = config.grid_rows,
                grid_cols = config.grid_cols,
                "Starting new combat session"
            );

            let rules = load_rules_from_file();
            let (players, enemies) = if let Some(roster) = roster.as_ref() {
                match prepare_combatants(roster, &rules) {
                    Ok(prepared) => prepared,
                    Err(message) => {
                        return vec![CombatEvent::Error { message }];
                    }
                }
            } else {
                (
                    players.unwrap_or_default(),
                    enemies.unwrap_or_default(),
                )
            };

            let state = CombatState::new(players, enemies, sanitized_grid, &config, rules);
            let snapshot = state.snapshot();
            *combat_state = Some(state);

            let mut events = vec![CombatEvent::StateSync { state: snapshot }];

            if let Some(state) = combat_state.as_ref() {
                if let Some(active_id) = state.get_active_entity_id() {
                    let preview = state.preview_move(active_id, None, None);
                    if !preview.reachable_cells.is_empty() {
                        events.push(CombatEvent::PreviewState { preview: preview.clone() });
                        events.push(CombatEvent::HighlightCells {
                            cells: preview.reachable_cells,
                            highlight_type: HighlightType::Move,
                        });
                    }
                }
            }

            events
        }

        CombatAction::Move {
            entity_id,
            target_row,
            target_col,
        } => {
            let state = match combat_state.as_mut() {
                Some(s) => s,
                None => {
                    return vec![CombatEvent::Error {
                        message: "No active combat".to_string(),
                    }]
                }
            };

            // Validate it's this entity's turn
            if state.get_active_entity_id() != Some(&entity_id) {
                return vec![CombatEvent::Error {
                    message: "Not your turn".to_string(),
                }];
            }

            let mut events = state.perform_move(&entity_id, target_row, target_col);
            events.push(CombatEvent::StateSync {
                state: state.snapshot(),
            });
            events
        }

        CombatAction::Attack {
            attacker_id,
            defender_id,
        } => {
            let state = match combat_state.as_mut() {
                Some(s) => s,
                None => {
                    return vec![CombatEvent::Error {
                        message: "No active combat".to_string(),
                    }]
                }
            };

            if state.get_active_entity_id() != Some(&attacker_id) {
                return vec![CombatEvent::Error {
                    message: "Not your turn".to_string(),
                }];
            }

            let mut events = state.perform_attack(&attacker_id, &defender_id);
            events.push(CombatEvent::StateSync {
                state: state.snapshot(),
            });
            events
        }

        CombatAction::UseSkill {
            caster_id,
            skill_id,
            target_row,
            target_col,
        } => {
            let state = match combat_state.as_mut() {
                Some(s) => s,
                None => {
                    return vec![CombatEvent::Error {
                        message: "No active combat".to_string(),
                    }]
                }
            };

            if state.get_active_entity_id() != Some(&caster_id) {
                return vec![CombatEvent::Error {
                    message: "Not your turn".to_string(),
                }];
            }

            let mut events = state.execute_skill(&caster_id, target_row, target_col, &skill_id);
            events.push(CombatEvent::StateSync {
                state: state.snapshot(),
            });
            events
        }

        CombatAction::EndTurn => {
            let state = match combat_state.as_mut() {
                Some(s) => s,
                None => {
                    return vec![CombatEvent::Error {
                        message: "No active combat".to_string(),
                    }]
                }
            };

            let mut events = state.end_turn();
            events.push(CombatEvent::StateSync {
                state: state.snapshot(),
            });
            events
        }

        CombatAction::PreviewMove {
            entity_id,
            hover_row,
            hover_col,
        } => {
            let Some(state) = combat_state.as_ref() else {
                return vec![CombatEvent::Error {
                    message: "No active combat".to_string(),
                }];
            };
            vec![CombatEvent::PreviewState {
                preview: state.preview_move(&entity_id, hover_row, hover_col),
            }]
        }

        CombatAction::PreviewBasicAttack {
            attacker_id,
            hover_row,
            hover_col,
        } => {
            let Some(state) = combat_state.as_ref() else {
                return vec![CombatEvent::Error {
                    message: "No active combat".to_string(),
                }];
            };
            vec![CombatEvent::PreviewState {
                preview: state.preview_basic_attack(&attacker_id, hover_row, hover_col),
            }]
        }

        CombatAction::PreviewSkill {
            caster_id,
            skill_id,
            hover_row,
            hover_col,
        } => {
            let Some(state) = combat_state.as_ref() else {
                return vec![CombatEvent::Error {
                    message: "No active combat".to_string(),
                }];
            };
            vec![CombatEvent::PreviewState {
                preview: state.preview_skill(&caster_id, &skill_id, hover_row, hover_col),
            }]
        }

        CombatAction::ClearPreview => vec![CombatEvent::PreviewState {
            preview: CombatPreviewState::default(),
        }],
    }
}

fn sanitize_grid(grid: Option<Grid>, config: &CombatConfig) -> Option<Grid> {
    let mut grid = grid?;
    if grid.len() != config.grid_rows {
        return None;
    }

    let mut sanitized = Vec::with_capacity(config.grid_rows);
    for (row_index, row) in grid.drain(..).enumerate() {
        if row.len() != config.grid_cols {
            return None;
        }

        let mut sanitized_row = Vec::with_capacity(config.grid_cols);
        for (col_index, cell) in row.into_iter().enumerate() {
            sanitized_row.push(GridCell {
                row: row_index,
                col: col_index,
                walkable: cell.walkable,
                occupant_id: None,
                is_spawn_zone: cell.is_spawn_zone,
                highlight: None,
                texture_url: cell.texture_url,
            });
        }
        sanitized.push(sanitized_row);
    }

    Some(sanitized)
}

async fn send_event(socket: &mut WebSocket, event: &CombatEvent) -> Result<(), ()> {
    match serde_json::to_string(event) {
        Ok(json) => {
            if let Err(e) = socket.send(Message::Text(json.into())).await {
                error!("Failed to send WS message: {e}");
                Err(())
            } else {
                Ok(())
            }
        }
        Err(e) => {
            error!("Failed to serialize event: {e}");
            Err(())
        }
    }
}
