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
            players,
            enemies,
            grid,
            config,
        } => {
            info!(
                players = players.len(),
                enemies = enemies.len(),
                grid_rows = config.grid_rows,
                grid_cols = config.grid_cols,
                "Starting new combat session"
            );

            let rules = load_rules_from_file();
            let state = CombatState::new(players, enemies, grid, &config, rules);
            let snapshot = state.snapshot();
            *combat_state = Some(state);

            // Send initial highlight for reachable cells
            let mut events = vec![CombatEvent::StateSync { state: snapshot }];

            if let Some(state) = combat_state {
                let reachable = state.get_reachable_for_active();
                if !reachable.is_empty() {
                    events.push(CombatEvent::HighlightCells {
                        cells: reachable,
                        highlight_type: HighlightType::Move,
                    });
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
    }
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
