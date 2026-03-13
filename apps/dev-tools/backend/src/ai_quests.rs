use crate::gemini::{generate_image_bytes, generate_text};
use crate::quest_ai::{
    try_reserve_capacity, QuestAiWorkKind, QuestJobAcceptedResponse, QuestJobKind, QuestJobStatus,
};
use crate::AppState;
use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::warn;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestRunRequest {
    pub world_id: String,
    pub seed: Value,
    #[serde(default)]
    pub party_character_ids: Vec<String>,
    #[serde(default)]
    pub party: Value,
    #[serde(default)]
    pub gm_context: Value,
    #[serde(default)]
    pub factions: Value,
    #[serde(default)]
    pub locations: Value,
    #[serde(default)]
    pub ecology: Value,
    #[serde(default)]
    pub history_characters: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceQuestRequest {
    #[serde(default)]
    pub world_id: Option<String>,
    #[serde(default)]
    pub run_id: Option<String>,
    #[serde(default)]
    pub run: Value,
    #[serde(default)]
    pub party: Value,
    #[serde(default)]
    pub gm_context: Value,
    #[serde(default)]
    pub factions: Value,
    #[serde(default)]
    pub locations: Value,
    #[serde(default)]
    pub ecology: Value,
    #[serde(default)]
    pub history_characters: Value,
    pub chosen_action: Option<String>,
    pub freeform_action: Option<String>,
    pub combat_resolution: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestGenerationResponse {
    pub run: Value,
    pub materialized_characters: Vec<Value>,
    pub restored_characters: Vec<Value>,
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestAdvanceResponse {
    pub run: Value,
    pub party_updates: Vec<Value>,
    pub materialized_characters: Vec<Value>,
    pub restored_characters: Vec<Value>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestGlossaryQuery {
    pub term: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertGlossaryEntryRequest {
    pub term: String,
    pub short_label: Option<String>,
    pub flavor_text: Option<String>,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
    #[serde(default)]
    pub related_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhanceAppearancePromptRequest {
    pub params: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateQuestPortraitRequest {
    pub prompt: String,
}

#[derive(Clone)]
struct QuestContextDigest {
    world_summary: String,
    lore_summary: String,
    anchor_summary: String,
    party_summary: String,
    npc_candidate_summary: String,
    fauna_candidates: String,
    chain_summary: String,
}

#[derive(Clone)]
struct QuestContextBundle {
    digest: QuestContextDigest,
    gm_context: Value,
    factions: Value,
    locations: Value,
    ecology: Value,
    history_characters: Value,
}

pub async fn get_quest_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    match state.quest_runtime.get_job(&job_id) {
        Ok(Some(job)) => (StatusCode::OK, Json(json!(job))).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Quest job not found".to_string()).into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}

pub async fn cancel_quest_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    match state.quest_runtime.cancel_job(&job_id) {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err((status, message)) => (status, message).into_response(),
    }
}

async fn start_generate_quest_job(
    state: AppState,
    payload: GenerateQuestRunRequest,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let Some(reservation) = try_reserve_capacity(&state.quest_runtime.text_limiter) else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Quest generation queue full. Please wait for running jobs to finish.".to_string(),
        ));
    };
    let job_id =
        state
            .quest_runtime
            .create_job(QuestJobKind::GenerateRun, &payload.world_id, None)?;
    let spawned_state = state.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        let _reservation = reservation;
        run_generate_quest_job(spawned_state, payload, spawned_job_id).await;
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(QuestJobAcceptedResponse {
            job_id,
            kind: QuestJobKind::GenerateRun,
        }),
    ))
}

async fn start_advance_quest_job(
    state: AppState,
    payload: AdvanceQuestRequest,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let world_id = payload
        .world_id
        .clone()
        .or_else(|| {
            payload
                .run
                .get("worldId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Quest advance request is missing worldId".to_string(),
        ))?;
    let run_id = payload
        .run_id
        .clone()
        .or_else(|| {
            payload
                .run
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Quest advance request is missing runId".to_string(),
        ))?;
    let Some(reservation) = try_reserve_capacity(&state.quest_runtime.text_limiter) else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Quest generation queue full. Please wait for running jobs to finish.".to_string(),
        ));
    };
    let job_id = state.quest_runtime.create_job(
        QuestJobKind::AdvanceRun,
        &world_id,
        Some(run_id.clone()),
    )?;
    let spawned_state = state.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        let _reservation = reservation;
        run_advance_quest_job(spawned_state, payload, spawned_job_id).await;
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(QuestJobAcceptedResponse {
            job_id,
            kind: QuestJobKind::AdvanceRun,
        }),
    ))
}

async fn run_generate_quest_job(state: AppState, payload: GenerateQuestRunRequest, job_id: String) {
    let runtime = state.quest_runtime.clone();
    let Ok((_global_permit, _text_permit)) = runtime.wait_for_text_permits(&job_id).await else {
        if !runtime.is_cancel_requested(&job_id) {
            runtime.update_job(
                &job_id,
                QuestJobStatus::Failed,
                0.0,
                "Failed",
                None,
                Some("Quest text capacity unavailable.".to_string()),
            );
        }
        return;
    };

    if runtime.is_cancel_requested(&job_id) {
        runtime.update_job(
            &job_id,
            QuestJobStatus::Cancelled,
            0.0,
            "Cancelled",
            None,
            None,
        );
        return;
    }

    runtime.update_job(
        &job_id,
        QuestJobStatus::Running,
        5.0,
        "Compiling context",
        None,
        None,
    );

    match execute_generate_quest_v2(&state, &payload, &job_id).await {
        Ok(result) => runtime.update_job(
            &job_id,
            QuestJobStatus::Completed,
            100.0,
            "Completed",
            Some(result),
            None,
        ),
        Err((status, message)) if runtime.is_cancel_requested(&job_id) => runtime.update_job(
            &job_id,
            QuestJobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some(format!("{status}: {message}")),
        ),
        Err((_status, message)) => runtime.update_job(
            &job_id,
            QuestJobStatus::Failed,
            100.0,
            "Failed",
            None,
            Some(message),
        ),
    }
}

async fn run_advance_quest_job(state: AppState, payload: AdvanceQuestRequest, job_id: String) {
    let runtime = state.quest_runtime.clone();
    let Ok((_global_permit, _text_permit)) = runtime.wait_for_text_permits(&job_id).await else {
        if !runtime.is_cancel_requested(&job_id) {
            runtime.update_job(
                &job_id,
                QuestJobStatus::Failed,
                0.0,
                "Failed",
                None,
                Some("Quest text capacity unavailable.".to_string()),
            );
        }
        return;
    };

    if runtime.is_cancel_requested(&job_id) {
        runtime.update_job(
            &job_id,
            QuestJobStatus::Cancelled,
            0.0,
            "Cancelled",
            None,
            None,
        );
        return;
    }

    runtime.update_job(
        &job_id,
        QuestJobStatus::Running,
        5.0,
        "Compiling context",
        None,
        None,
    );

    match execute_advance_quest_v2(&state, &payload, &job_id).await {
        Ok(result) => runtime.update_job(
            &job_id,
            QuestJobStatus::Completed,
            100.0,
            "Completed",
            Some(result),
            None,
        ),
        Err((status, message)) if runtime.is_cancel_requested(&job_id) => runtime.update_job(
            &job_id,
            QuestJobStatus::Cancelled,
            100.0,
            "Cancelled",
            None,
            Some(format!("{status}: {message}")),
        ),
        Err((_status, message)) => runtime.update_job(
            &job_id,
            QuestJobStatus::Failed,
            100.0,
            "Failed",
            None,
            Some(message),
        ),
    }
}

async fn execute_generate_quest_v2(
    state: &AppState,
    payload: &GenerateQuestRunRequest,
    _job_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let mut warnings = Vec::new();
    let run_id = format!("quest-{}", Uuid::new_v4());
    let timestamp = now_ms();
    let mut chain = load_or_create_active_chain(&state.planets_dir, &payload.world_id, &payload.seed);
    let max_node_count = run_length_to_node_count(
        payload
            .seed
            .get("runLength")
            .and_then(Value::as_str)
            .unwrap_or("medium"),
    );
    let selected_influences = collect_selected_influences(
        &payload.seed,
        &payload.factions,
        &payload.locations,
        &payload.ecology,
    );

    let generated =
        match parse_json_with_retry(&build_generate_prompt(&payload, Some(&chain))).await {
            Ok(value) => value,
            Err(err) => {
                warnings.push(err);
                fallback_generation_payload(&payload)
            }
        };

    let arc = normalize_arc(&generated, &payload.seed);
    let mut current_node = normalize_node(
        generated.get("currentNode"),
        1,
        1,
        max_node_count,
        &selected_influences,
    );

    let (materialized_characters, npc_entries, enemy_ids, npc_warnings) =
        materialize_node_characters(
            &run_id,
            &payload.world_id,
            &current_node,
            &payload.history_characters,
            &payload.seed,
            &payload.ecology,
        )?;
    warnings.extend(npc_warnings);
    if let Some(node_obj) = current_node.as_object_mut() {
        node_obj.insert("npcs".to_string(), Value::Array(npc_entries));
        if let Some(pending) = node_obj
            .get_mut("pendingCombat")
            .and_then(Value::as_object_mut)
        {
            pending.insert("enemyIds".to_string(), Value::Array(enemy_ids));
        }
    }

    let title = generated
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            arc.get("title")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Quest")
        });
    let summary = generated
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            format!(
                "{} {}",
                payload
                    .seed
                    .get("objective")
                    .and_then(Value::as_str)
                    .unwrap_or("Pursue the quest objective."),
                payload
                    .seed
                    .get("stakes")
                    .and_then(Value::as_str)
                    .unwrap_or("The world will not wait.")
            )
        });

    let introduced_npc_ids = current_node
        .get("npcs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|npc| npc.get("id").and_then(Value::as_str).map(str::to_string))
        .collect::<Vec<_>>();

    let illustration_id = attach_node_metadata(
        &mut current_node,
        &state,
        &payload.world_id,
        &run_id,
        title,
        &payload.gm_context,
    )?;
    let key_beat_ids = illustration_id
        .map(|id| vec![Value::String(id)])
        .unwrap_or_default();
    let world_consequences = build_world_consequences(
        &run_id,
        &current_node,
        &Value::Array(
            introduced_npc_ids
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
        &Vec::<Value>::new(),
        &Vec::<Value>::new(),
    );

    let mut run = json!({
        "id": run_id,
        "worldId": payload.world_id,
        "status": "active",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "title": title,
        "summary": summary.trim(),
        "partyCharacterIds": party_ids(&payload.party),
        "seed": payload.seed,
        "arc": arc,
        "currentNode": current_node,
        "nodeCount": 1,
        "maxNodeCount": max_node_count,
        "flags": Value::Array(vec![]),
        "log": Value::Array(vec![log_entry(
            "node",
            "Quest Initialized",
            generated
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("The quest has been initialized."),
            vec![],
            Some("node-1".to_string()),
        )]),
        "currentEffects": Value::Array(vec![]),
        "pendingCombat": current_node.get("pendingCombat").cloned().unwrap_or(Value::Null),
        "lastOutcomeText": Value::Null,
        "selectedInfluences": Value::Array(selected_influences),
        "chainId": chain.get("id").cloned().unwrap_or(Value::Null),
        "retrySnapshotId": Value::Null,
        "worldConsequences": Value::Array(world_consequences),
        "introducedNpcIds": Value::Array(introduced_npc_ids.iter().cloned().map(Value::String).collect()),
        "keyBeatIds": Value::Array(key_beat_ids),
    });

    let retry_snapshot_id = create_retry_snapshot(
        &state.planets_dir,
        &payload.world_id,
        run.get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-run"),
        &payload.party,
        &run,
    )?;
    if let Some(run_obj) = run.as_object_mut() {
        run_obj.insert(
            "retrySnapshotId".to_string(),
            Value::String(retry_snapshot_id.clone()),
        );
    }
    update_chain_with_active_run(
        &mut chain,
        run.get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-run"),
        &introduced_npc_ids,
        extract_referenced_faction_ids(&current_node),
    );
    persist_chain(&state.planets_dir, &payload.world_id, &chain)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    Ok(json!(QuestGenerationResponse {
        run,
        materialized_characters,
        restored_characters: vec![],
        warnings,
    }))
}

async fn execute_advance_quest_v2(
    state: &AppState,
    payload: &AdvanceQuestRequest,
    _job_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let mut warnings = Vec::new();
    let current_run = payload.run.clone();
    let world_id = current_run.get("worldId").and_then(Value::as_str).ok_or((
        StatusCode::BAD_REQUEST,
        "Quest run is missing worldId".to_string(),
    ))?;
    let run_id = current_run.get("id").and_then(Value::as_str).ok_or((
        StatusCode::BAD_REQUEST,
        "Quest run is missing id".to_string(),
    ))?;
    let next_index = current_run
        .get("nodeCount")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        + 1;
    let max_node_count = current_run
        .get("maxNodeCount")
        .and_then(Value::as_u64)
        .unwrap_or(8);
    let selected_influences = current_run
        .get("selectedInfluences")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut chain =
        load_chain_for_run(&state.planets_dir, world_id, &current_run).unwrap_or_else(|| {
            load_or_create_active_chain(
                &state.planets_dir,
                world_id,
                current_run.get("seed").unwrap_or(&Value::Null),
            )
        });

    let generated = match parse_json_with_retry(&build_advance_prompt(&payload)).await {
        Ok(value) => value,
        Err(err) => {
            warnings.push(err);
            fallback_advance_payload(&payload)
        }
    };

    let effect_summaries = generated
        .get("effectSummaries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let new_flags = generated
        .get("newFlags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let party_updates = normalize_party_updates(
        generated.get("partyUpdates"),
        &payload.party,
        effect_summaries.clone(),
    );
    let mut next_node = generated.get("nextNode").cloned().unwrap_or(Value::Null);
    let mut status = generated
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();
    let combat_outcome = payload
        .combat_resolution
        .as_ref()
        .and_then(|resolution| resolution.get("outcome"))
        .and_then(Value::as_str);
    if combat_outcome == Some("defeat") {
        status = "failed".to_string();
    }

    if status == "active" {
        if next_node.is_null() {
            next_node = fallback_ending_node(
                next_index,
                act_for_index(next_index, max_node_count),
                generated
                    .get("lastOutcomeText")
                    .and_then(Value::as_str)
                    .unwrap_or("The dust settles, and the road closes behind you."),
                current_run
                    .get("arc")
                    .and_then(|arc| arc.get("endingTracks"))
                    .and_then(Value::as_array)
                    .and_then(|tracks| tracks.first())
                    .and_then(|track| track.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or("ending-1"),
            );
            status = "completed".to_string();
        } else {
            next_node = normalize_node(
                Some(&next_node),
                next_index,
                act_for_index(next_index, max_node_count),
                max_node_count,
                &selected_influences,
            );
            if next_index >= max_node_count
                && next_node
                    .get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or("scene")
                    != "ending"
            {
                next_node = fallback_ending_node(
                    next_index,
                    3,
                    generated
                        .get("lastOutcomeText")
                        .and_then(Value::as_str)
                        .unwrap_or("The quest reaches its final reckoning."),
                    generated
                        .get("endingReached")
                        .and_then(Value::as_str)
                        .unwrap_or("ending-1"),
                );
                status = "completed".to_string();
            }
        }
    }

    let mut materialized_characters = Vec::new();
    let mut restored_characters = Vec::new();
    if !next_node.is_null() {
        let (characters, npc_entries, enemy_ids, npc_warnings) = materialize_node_characters(
            run_id,
            world_id,
            &next_node,
            &payload.history_characters,
            current_run.get("seed").unwrap_or(&Value::Null),
            &payload.ecology,
        )?;
        materialized_characters = characters;
        warnings.extend(npc_warnings);
        if let Some(node_obj) = next_node.as_object_mut() {
            node_obj.insert("npcs".to_string(), Value::Array(npc_entries));
            if let Some(pending) = node_obj
                .get_mut("pendingCombat")
                .and_then(Value::as_object_mut)
            {
                pending.insert("enemyIds".to_string(), Value::Array(enemy_ids));
            }
        }
        attach_node_metadata(
            &mut next_node,
            &state,
            world_id,
            run_id,
            current_run
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Quest"),
            &payload.gm_context,
        )?;
    }

    let timestamp = now_ms();
    let mut flags = current_run
        .get("flags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for flag in &new_flags {
        if !flags.iter().any(|existing| existing == flag) {
            flags.push(flag.clone());
        }
    }
    if let Some(clear_flags) = generated.get("clearFlags").and_then(Value::as_array) {
        flags.retain(|flag| !clear_flags.iter().any(|clear_flag| clear_flag == flag));
    }

    let mut log_entries = current_run
        .get("log")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(current_node) = current_run.get("currentNode") {
        let node_title = current_node
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Quest Node");
        let action_text = payload
            .chosen_action
            .clone()
            .or(payload.freeform_action.clone())
            .or_else(|| {
                payload
                    .combat_resolution
                    .as_ref()
                    .and_then(|resolution| resolution.get("outcome"))
                    .and_then(Value::as_str)
                    .map(|outcome| format!("Combat resolved with {outcome}."))
            })
            .unwrap_or_else(|| "Advanced the quest.".to_string());
        log_entries.push(log_entry(
            "choice",
            format!("Action at {node_title}").as_str(),
            &action_text,
            vec![],
            current_node
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string),
        ));
    }
    let last_outcome_text = generated
        .get("lastOutcomeText")
        .and_then(Value::as_str)
        .unwrap_or("The quest shifts in response to your choice.");
    log_entries.push(log_entry(
        "outcome",
        "Outcome",
        last_outcome_text,
        effect_summaries
            .iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect(),
        next_node
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string),
    ));
    if status != "active" {
        log_entries.push(log_entry(
            "ending",
            "Quest Ended",
            generated
                .get("endingSummary")
                .and_then(Value::as_str)
                .unwrap_or(last_outcome_text),
            vec![],
            next_node
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string),
        ));
    }

    let completed_at = if status == "completed" || status == "failed" {
        Value::Number(timestamp.into())
    } else {
        current_run
            .get("completedAt")
            .cloned()
            .unwrap_or(Value::Null)
    };

    let ending_reached = if status == "completed" || status == "failed" {
        generated
            .get("endingReached")
            .cloned()
            .or_else(|| next_node.get("endingId").cloned())
            .unwrap_or(Value::Null)
    } else {
        current_run
            .get("endingReached")
            .cloned()
            .unwrap_or(Value::Null)
    };

    let introduced_npc_ids = merge_string_ids(
        current_run
            .get("introducedNpcIds")
            .and_then(Value::as_array),
        next_node.get("npcs").and_then(Value::as_array),
        "id",
    );
    let mut key_beat_ids = current_run
        .get("keyBeatIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(illustration_id) = next_node
        .get("illustrationId")
        .and_then(Value::as_str)
        .map(str::to_string)
    {
        if !key_beat_ids
            .iter()
            .any(|item| item.as_str() == Some(illustration_id.as_str()))
        {
            key_beat_ids.push(Value::String(illustration_id));
        }
    }
    let world_consequences = build_world_consequences(
        run_id,
        &next_node,
        &Value::Array(
            introduced_npc_ids
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        ),
        &effect_summaries,
        &new_flags,
    );

    if status == "failed" {
        if let Some(snapshot) = load_retry_snapshot(
            &state.planets_dir,
            world_id,
            current_run
                .get("retrySnapshotId")
                .and_then(Value::as_str)
                .unwrap_or(""),
        ) {
            restored_characters = snapshot
                .get("party")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut reset_run = snapshot
                .get("runState")
                .cloned()
                .unwrap_or_else(|| current_run.clone());
            if let Some(run_obj) = reset_run.as_object_mut() {
                run_obj.insert("updatedAt".to_string(), Value::Number(timestamp.into()));
                run_obj.insert("status".to_string(), Value::String("active".to_string()));
                run_obj.insert("completedAt".to_string(), Value::Null);
                run_obj.insert(
                    "lastOutcomeText".to_string(),
                    Value::String(last_outcome_text.to_string()),
                );
            }
            warnings.push(format!(
                "Quest failure reset the run to its opening state. {}",
                generated
                    .get("endingSummary")
                    .and_then(Value::as_str)
                    .unwrap_or("The party pulls back and can try again.")
            ));
            return Ok(json!(QuestAdvanceResponse {
                run: reset_run,
                party_updates: vec![],
                materialized_characters: vec![],
                restored_characters,
                warnings,
            }));
        }
    }

    let pending_combat = next_node
        .get("pendingCombat")
        .cloned()
        .unwrap_or(Value::Null);
    let updated_run = json!({
        "id": run_id,
        "worldId": world_id,
        "status": status,
        "createdAt": current_run.get("createdAt").cloned().unwrap_or(Value::Number(timestamp.into())),
        "updatedAt": timestamp,
        "completedAt": completed_at,
        "title": current_run.get("title").cloned().unwrap_or(Value::String("Untitled Quest".to_string())),
        "summary": current_run.get("summary").cloned().unwrap_or(Value::String("Quest run".to_string())),
        "partyCharacterIds": current_run.get("partyCharacterIds").cloned().unwrap_or(Value::Array(vec![])),
        "seed": current_run.get("seed").cloned().unwrap_or(Value::Null),
        "arc": current_run.get("arc").cloned().unwrap_or(Value::Null),
        "currentNode": next_node,
        "nodeCount": next_index,
        "maxNodeCount": max_node_count,
        "flags": Value::Array(flags),
        "endingReached": ending_reached,
        "log": Value::Array(log_entries),
        "currentEffects": Value::Array(effect_summaries.clone()),
        "pendingCombat": pending_combat,
        "lastOutcomeText": last_outcome_text,
        "selectedInfluences": Value::Array(selected_influences),
        "chainId": current_run.get("chainId").cloned().unwrap_or(chain.get("id").cloned().unwrap_or(Value::Null)),
        "retrySnapshotId": current_run.get("retrySnapshotId").cloned().unwrap_or(Value::Null),
        "worldConsequences": Value::Array(world_consequences.clone()),
        "introducedNpcIds": Value::Array(introduced_npc_ids.iter().cloned().map(Value::String).collect()),
        "keyBeatIds": Value::Array(key_beat_ids.clone()),
    });

    if status == "completed" {
        update_chain_on_completion(
            &mut chain,
            run_id,
            current_run
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Quest"),
            &world_consequences,
            &introduced_npc_ids,
            extract_referenced_faction_ids(&next_node),
        );
    } else {
        update_chain_with_active_run(
            &mut chain,
            run_id,
            &introduced_npc_ids,
            extract_referenced_faction_ids(&next_node),
        );
    }
    persist_chain(&state.planets_dir, world_id, &chain)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    Ok(json!(QuestAdvanceResponse {
        run: updated_run,
        party_updates,
        materialized_characters,
        restored_characters,
        warnings,
    }))
}

pub async fn generate_quest_run_handler(
    State(state): State<AppState>,
    Json(payload): Json<GenerateQuestRunRequest>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    if state.quest_runtime.enabled {
        return start_generate_quest_job(state, payload)
            .await
            .map(IntoResponse::into_response);
    }

    execute_generate_quest_v2(&state, &payload, "direct")
        .await
        .map(|value| Json(value).into_response())
}

pub async fn advance_quest_handler(
    State(state): State<AppState>,
    Json(payload): Json<AdvanceQuestRequest>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    if state.quest_runtime.enabled {
        return start_advance_quest_job(state, payload)
            .await
            .map(IntoResponse::into_response);
    }

    execute_advance_quest_v2(&state, &payload, "direct")
        .await
        .map(|value| Json(value).into_response())
}

pub async fn list_quest_runs(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> impl IntoResponse {
    let dir = quest_dir(&state.planets_dir, &world_id);
    if !dir.exists() {
        return (StatusCode::OK, Json(Value::Array(vec![]))).into_response();
    }

    let mut summaries = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(run) = serde_json::from_str::<Value>(&raw) {
                    summaries.push(summarize_run(&run));
                }
            }
        }
    }

    summaries.sort_by(|a, b| {
        b.get("updatedAt")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .cmp(&a.get("updatedAt").and_then(Value::as_u64).unwrap_or(0))
    });

    (StatusCode::OK, Json(Value::Array(summaries))).into_response()
}

pub async fn get_quest_run(
    State(state): State<AppState>,
    Path((world_id, run_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = quest_dir(&state.planets_dir, &world_id).join(format!("{run_id}.json"));
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
        },
        Err(_) => (StatusCode::NOT_FOUND, "Quest run not found".to_string()).into_response(),
    }
}

pub async fn save_quest_run(
    State(state): State<AppState>,
    Path((world_id, run_id)): Path<(String, String)>,
    Json(run): Json<Value>,
) -> impl IntoResponse {
    let dir = quest_dir(&state.planets_dir, &world_id);
    if let Err(err) = fs::create_dir_all(&dir) {
        return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response();
    }
    let path = dir.join(format!("{run_id}.json"));
    match fs::write(
        path,
        serde_json::to_string_pretty(&run).unwrap_or_else(|_| "{}".to_string()),
    ) {
        Ok(_) => (StatusCode::OK, Json(run)).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn delete_quest_run(
    State(state): State<AppState>,
    Path((world_id, run_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = quest_dir(&state.planets_dir, &world_id).join(format!("{run_id}.json"));
    match fs::remove_file(path) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NO_CONTENT.into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn list_quest_chains(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> impl IntoResponse {
    let dir = chain_dir(&state.planets_dir, &world_id);
    let mut chains = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    chains.push(value);
                }
            }
        }
    }
    chains.sort_by(|a, b| {
        b.get("updatedAt")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .cmp(&a.get("updatedAt").and_then(Value::as_u64).unwrap_or(0))
    });
    (StatusCode::OK, Json(Value::Array(chains))).into_response()
}

pub async fn get_quest_chain(
    State(state): State<AppState>,
    Path((world_id, chain_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = chain_dir(&state.planets_dir, &world_id).join(format!("{chain_id}.json"));
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
        },
        Err(_) => (StatusCode::NOT_FOUND, "Quest chain not found".to_string()).into_response(),
    }
}

pub async fn get_quest_glossary(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Query(query): Query<QuestGlossaryQuery>,
) -> impl IntoResponse {
    if let Some(term) = query.term {
        match load_or_generate_glossary_entry(&state.planets_dir, &world_id, &term).await {
            Ok(entry) => (StatusCode::OK, Json(entry)).into_response(),
            Err((code, message)) => (code, message).into_response(),
        }
    } else {
        let entries = load_all_glossary_entries(&state.planets_dir, &world_id);
        (StatusCode::OK, Json(Value::Array(entries))).into_response()
    }
}

pub async fn upsert_quest_glossary_entry(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(payload): Json<UpsertGlossaryEntryRequest>,
) -> impl IntoResponse {
    let term = payload.term.clone();
    let slug = slugify_term(term.as_str());
    let short_label = payload.short_label.unwrap_or(term.clone());
    let entry = json!({
        "worldId": world_id,
        "term": term,
        "slug": slug,
        "shortLabel": short_label,
        "flavorText": payload.flavor_text.unwrap_or_else(|| "No flavor text written yet.".to_string()),
        "sourceType": payload.source_type.unwrap_or_else(|| "system".to_string()),
        "sourceId": payload.source_id,
        "relatedIds": payload.related_ids,
        "updatedAt": now_ms(),
        "createdAt": now_ms(),
    });
    match persist_glossary_entry(&state.planets_dir, &world_id, &entry) {
        Ok(_) => (StatusCode::OK, Json(entry)).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn get_quest_illustration(
    State(state): State<AppState>,
    Path((world_id, illustration_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = illustration_record_dir(&state.planets_dir, &world_id)
        .join(format!("{illustration_id}.json"));
    match fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
        },
        Err(_) => (
            StatusCode::NOT_FOUND,
            "Quest illustration not found".to_string(),
        )
            .into_response(),
    }
}

pub async fn get_quest_illustration_image(
    State(state): State<AppState>,
    Path((world_id, illustration_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let path = illustration_image_dir(&state.planets_dir, &world_id)
        .join(format!("{illustration_id}.png"));
    match fs::read(path) {
        Ok(bytes) => (StatusCode::OK, [(header::CONTENT_TYPE, "image/png")], bytes).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            "Quest illustration image not found".to_string(),
        )
            .into_response(),
    }
}

pub async fn generate_character_portrait_handler(
    Json(payload): Json<GenerateQuestPortraitRequest>,
) -> impl IntoResponse {
    let wrapped_prompt = format!(
        "A gritty, high-detail post-apocalyptic character portrait. Style: Realistic, atmospheric, cinematic lighting. Key Subject: {}",
        payload.prompt.trim()
    );
    match generate_image_bytes(&wrapped_prompt, Some(0.7), 512, 512, Some("1:1")).await {
        Ok(bytes) => {
            let encoded = {
                use base64::Engine as _;
                base64::engine::general_purpose::STANDARD.encode(bytes)
            };
            (
                StatusCode::OK,
                Json(json!({ "dataUrl": format!("data:image/png;base64,{encoded}") })),
            )
                .into_response()
        }
        Err((code, message)) => (code, message).into_response(),
    }
}

pub async fn enhance_appearance_prompt_handler(
    Json(payload): Json<EnhanceAppearancePromptRequest>,
) -> impl IntoResponse {
    if payload.params.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Missing appearance params".to_string(),
        )
            .into_response();
    }

    let gender = payload.params.get("gender").cloned().unwrap_or_default();
    let age = payload.params.get("age").cloned().unwrap_or_default();
    let physical_parameters = payload
        .params
        .iter()
        .filter(|(key, _)| key.as_str() != "gender" && key.as_str() != "age")
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join(", ");

    let prompt = format!(
        "You are a creative writer. Turn technical character attributes into immersive prose. Ensure gender and age are reflected in tone and vocabulary.\n\n\
Transform character appearance parameters into a gritty, atmospheric 2-sentence worded description for a post-apocalyptic survivor.\n\n\
Context:\n\
Gender: {gender}\n\
Age: {age}\n\n\
Physical Parameters:\n\
{physical_parameters}\n\n\
Return ONLY the description text. Focus on how the ash-filled world has weathered their specific features."
    );

    match generate_text(&prompt).await {
        Ok(text) => (StatusCode::OK, Json(json!({ "text": text }))).into_response(),
        Err((code, message)) => (code, message).into_response(),
    }
}

fn build_generate_prompt(payload: &GenerateQuestRunRequest, chain: Option<&Value>) -> String {
    let context_fauna_candidates = context_fauna_summary(&payload.ecology, &payload.seed, None);
    format!(
        "You are the Ashtrail Quest Architect.\n\
Create a world-scoped, choice-based roguelike quest run.\n\
This is a hybrid arc: define the broad multi-ending structure upfront, but only generate the first playable node.\n\
\n\
Quest Seed:\n{}\n\
\n\
Party:\n{}\n\
\n\
Compiled World Context:\n{}\n\
\n\
Factions:\n{}\n\
\n\
Locations:\n{}\n\
\n\
Ecology Summary:\n{}\n\
\n\
Context Fauna Candidates:\n{}\n\
\n\
History Characters:\n{}\n\
\n\
Quest Chain State:\n{}\n\
\n\
Rules:\n\
- The quest must fit the canon and not rewrite world history.\n\
- The run must feel interactive, dangerous, and open-ended.\n\
- Produce 3 acts and at least 3 ending tracks.\n\
- The first node must have exactly 4 meaningful player choices unless it is a discussion node.\n\
- Any node can introduce new quest NPCs; include 1-3 concrete NPCs whenever other actors are present.\n\
- If the first node naturally implies combat, include hostile NPCs in npcs and exact matching pendingCombat.enemyNpcNames.\n\
- When ecology context includes biome-linked fauna, prefer exact fauna names from that ecology data for wilderness encounters.\n\
- If Context Fauna Candidates is not empty and the encounter is a wilderness or biome-driven threat, use only exact fauna names from that candidate list for pendingCombat.enemyNpcNames. Do not invent alternate animal names.\n\
- Use kind \"discussion\" for lightweight conversations that should be answered with a typed reply instead of a large choice grid.\n\
- NPCs should reference history characters when appropriate.\n\
\n\
Return raw JSON only. No markdown fences.\n\
Schema:\n\
{{\n  \"title\": \"string\",\n  \"summary\": \"string\",\n  \"arc\": {{\n    \"title\": \"string\",\n    \"premise\": \"string\",\n    \"acts\": [\"string\", \"string\", \"string\"],\n    \"recurringTensions\": [\"string\"],\n    \"endingTracks\": [{{\"id\":\"string\",\"title\":\"string\",\"description\":\"string\"}}],\n    \"likelyNpcRoles\": [\"string\"]\n  }},\n  \"currentNode\": {{\n    \"kind\": \"scene|dialogue|discussion|decision|combat\",\n    \"title\": \"string\",\n    \"text\": \"string\",\n    \"choices\": [{{\"id\":\"string\",\"label\":\"string\",\"intent\":\"string\",\"risk\":\"low|medium|high\",\"tags\":[\"string\"]}}],\n    \"npcs\": [{{\"name\":\"string\",\"role\":\"string\",\"isHostile\":false,\"sourceHistoryCharacterId\":\"optional string\",\"faction\":\"optional string\",\"lore\":\"optional string\"}}],\n    \"contextRefs\": [{{\"kind\":\"faction|location|ecology|history|character\",\"id\":\"string\",\"label\":\"string\"}}],\n    \"flags\": [\"string\"],\n    \"pendingCombat\": {{\"encounterLabel\":\"string\",\"stakes\":\"string\",\"enemyNpcNames\":[\"string\"]}}\n  }}\n}}",
        pretty(&payload.seed),
        pretty(&payload.party),
        pretty(&payload.gm_context),
        pretty(&payload.factions),
        pretty(&payload.locations),
        pretty(&payload.ecology),
        context_fauna_candidates,
        pretty(&payload.history_characters),
        pretty(chain.unwrap_or(&Value::Null)),
    )
}

fn build_advance_prompt(payload: &AdvanceQuestRequest) -> String {
    let context_fauna_candidates = context_fauna_summary(
        &payload.ecology,
        payload.run.get("seed").unwrap_or(&Value::Null),
        payload.run.get("currentNode"),
    );
    let current_action = payload
        .chosen_action
        .clone()
        .or(payload.freeform_action.clone())
        .or_else(|| {
            payload
                .combat_resolution
                .as_ref()
                .map(|resolution| format!("Combat resolution: {}", pretty(resolution)))
        })
        .unwrap_or_else(|| "Advance the quest.".to_string());
    format!(
        "You are the Ashtrail Quest Director.\n\
Advance the quest by exactly one node after resolving the player's action.\n\
\n\
Current Run:\n{}\n\
\n\
Party Snapshot:\n{}\n\
\n\
Compiled World Context:\n{}\n\
\n\
Factions:\n{}\n\
\n\
Locations:\n{}\n\
\n\
Ecology Summary:\n{}\n\
\n\
Context Fauna Candidates:\n{}\n\
\n\
History Characters:\n{}\n\
\n\
Player Action:\n{}\n\
\n\
Rules:\n\
- Respect the existing quest arc and world canon.\n\
- Keep the quest run branching and choice-driven.\n\
- When the run nears its max node count, move decisively toward an ending.\n\
- Provide structured party consequences when justified.\n\
- Only output one next node.\n\
- Use kind \"discussion\" for lightweight social exchanges that should be answered via a typed reply.\n\
- Introduce new quest NPCs whenever the next beat needs fresh actors, witnesses, rivals, or enemies.\n\
- Combat nodes must include hostile NPCs in npcs and exact matching pendingCombat.enemyNpcNames.\n\
- When ecology context includes biome-linked fauna, prefer exact fauna names from that ecology data for wilderness encounters.\n\
- If Context Fauna Candidates is not empty and the encounter is a wilderness or biome-driven threat, use only exact fauna names from that candidate list for pendingCombat.enemyNpcNames. Do not invent alternate animal names.\n\
- Use current history characters for NPCs when appropriate.\n\
\n\
Return raw JSON only. No markdown fences.\n\
Schema:\n\
{{\n  \"status\": \"active|completed|failed\",\n  \"lastOutcomeText\": \"string\",\n  \"endingSummary\": \"string optional\",\n  \"endingReached\": \"string optional\",\n  \"effectSummaries\": [\"string\"],\n  \"newFlags\": [\"string\"],\n  \"clearFlags\": [\"string\"],\n  \"partyUpdates\": [{{\n    \"characterId\": \"party character id or empty\",\n    \"characterName\": \"party character name\",\n    \"summary\": \"string\",\n    \"statChanges\": [{{\"target\":\"hp|maxHp|strength|agility|intelligence|wisdom|endurance|charisma\",\"value\":0}}],\n    \"addTraitNames\": [\"string\"],\n    \"removeTraitNames\": [\"string\"],\n    \"addItems\": [{{\"name\":\"string\",\"category\":\"weapon|armor|consumable|resource|junk\",\"rarity\":\"salvaged|reinforced|pre-ash|specialized|relic|ashmarked\",\"description\":\"string\"}}],\n    \"addSkills\": [{{\"name\":\"string\",\"description\":\"string\",\"category\":\"base|occupation|unique|equipment\"}}],\n    \"relationshipChanges\": [{{\"characterName\":\"string\",\"change\":0}}]\n  }}],\n  \"nextNode\": {{\n    \"kind\": \"scene|dialogue|discussion|decision|combat|ending\",\n    \"title\": \"string\",\n    \"text\": \"string\",\n    \"choices\": [{{\"id\":\"string\",\"label\":\"string\",\"intent\":\"string\",\"risk\":\"low|medium|high\",\"tags\":[\"string\"]}}],\n    \"npcs\": [{{\"name\":\"string\",\"role\":\"string\",\"isHostile\":false,\"sourceHistoryCharacterId\":\"optional string\",\"faction\":\"optional string\",\"lore\":\"optional string\"}}],\n    \"contextRefs\": [{{\"kind\":\"faction|location|ecology|history|character\",\"id\":\"string\",\"label\":\"string\"}}],\n    \"flags\": [\"string\"],\n    \"endingId\": \"string optional\",\n    \"pendingCombat\": {{\"encounterLabel\":\"string\",\"stakes\":\"string\",\"enemyNpcNames\":[\"string\"]}}\n  }}\n}}",
        pretty(&payload.run),
        pretty(&payload.party),
        pretty(&payload.gm_context),
        pretty(&payload.factions),
        pretty(&payload.locations),
        pretty(&payload.ecology),
        context_fauna_candidates,
        pretty(&payload.history_characters),
        current_action,
    )
}

async fn parse_json_with_retry(prompt: &str) -> Result<Value, String> {
    let first = generate_text(prompt)
        .await
        .map_err(|err| format!("Quest generation failed: {:?}", err))?;
    if let Ok(parsed) = parse_json_value(&first) {
        return Ok(parsed);
    }

    let retry_prompt = format!(
        "{prompt}\n\nThe previous answer was invalid JSON. Repeat the answer as valid raw JSON only."
    );
    let second = generate_text(&retry_prompt)
        .await
        .map_err(|err| format!("Quest retry failed: {:?}", err))?;
    parse_json_value(&second)
}

async fn parse_text_with_retry(prompt: &str) -> Result<String, String> {
    let first = generate_text(prompt)
        .await
        .map_err(|err| format!("Quest text generation failed: {:?}", err))?;
    let cleaned = first.trim();
    if !cleaned.is_empty() {
        return Ok(cleaned.to_string());
    }

    let retry_prompt =
        format!("{prompt}\n\nThe previous answer was empty. Reply with plain text only.");
    let second = generate_text(&retry_prompt)
        .await
        .map_err(|err| format!("Quest text retry failed: {:?}", err))?;
    let cleaned_second = second.trim();
    if cleaned_second.is_empty() {
        Err("Generated text was empty".to_string())
    } else {
        Ok(cleaned_second.to_string())
    }
}

fn parse_json_value(input: &str) -> Result<Value, String> {
    let cleaned = clean_json_payload(input);
    serde_json::from_str::<Value>(&cleaned)
        .map_err(|err| format!("Failed to parse quest JSON: {err}. Cleaned payload: {cleaned}"))
}

fn clean_json_payload(input: &str) -> String {
    let mut cleaned = input.trim().to_string();
    if cleaned.starts_with("```json") {
        cleaned = cleaned.replacen("```json", "", 1);
    } else if cleaned.starts_with("```") {
        cleaned = cleaned.replacen("```", "", 1);
    }
    if cleaned.ends_with("```") {
        cleaned.truncate(cleaned.len().saturating_sub(3));
    }
    let trimmed = cleaned.trim();
    let start = trimmed.find(['{', '[']).unwrap_or(0);
    let end = trimmed
        .rfind(['}', ']'])
        .map(|index| index + 1)
        .unwrap_or(trimmed.len());
    trimmed[start..end].trim().to_string()
}

fn fallback_generation_payload(payload: &GenerateQuestRunRequest) -> Value {
    let title = format!(
        "Quest: {}",
        payload
            .seed
            .get("objective")
            .and_then(Value::as_str)
            .unwrap_or("Unknown Objective")
    );
    json!({
        "title": title,
        "summary": "A volatile quest run emerges from the world's pressure points.",
        "arc": {
            "title": title,
            "premise": payload.seed.get("premise").and_then(Value::as_str).unwrap_or("Survive the unfolding crisis."),
            "acts": [
                "Enter the unstable situation and identify the fracture point.",
                "Escalate through hard tradeoffs, fragile alliances, and rising danger.",
                "Force a final resolution that permanently defines the party's legacy."
            ],
            "recurringTensions": [
                "Scarcity versus mercy",
                "Truth versus survival",
                "Faction leverage versus personal loyalty"
            ],
            "endingTracks": [
                { "id": "ending-triumph", "title": "Hard-Won Triumph", "description": "The party secures the objective at a cost." },
                { "id": "ending-compromise", "title": "Compromise", "description": "The party survives, but the world remains unstable." },
                { "id": "ending-ruin", "title": "Ruin", "description": "The run collapses into loss, betrayal, or sacrifice." }
            ],
            "likelyNpcRoles": ["Fixer", "Witness", "Hunter"]
        },
        "currentNode": {
            "kind": "decision",
            "title": "The First Fracture",
            "text": "Your party arrives at the edge of a crisis. The world is already moving, and waiting will be its own decision.",
            "choices": [
                { "id": "choice-1", "label": "Push directly toward the objective.", "intent": "aggressive", "risk": "high", "tags": ["objective"] },
                { "id": "choice-2", "label": "Seek a local faction before moving.", "intent": "diplomatic", "risk": "medium", "tags": ["faction"] },
                { "id": "choice-3", "label": "Scout the surrounding ground for leverage.", "intent": "careful", "risk": "low", "tags": ["exploration"] },
                { "id": "choice-4", "label": "Wait and study who makes the first move.", "intent": "observant", "risk": "medium", "tags": ["history"] }
            ],
            "npcs": [],
            "contextRefs": [],
            "flags": ["quest_initialized"]
        }
    })
}

fn fallback_advance_payload(payload: &AdvanceQuestRequest) -> Value {
    let next_node_index = payload
        .run
        .get("nodeCount")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        + 1;
    let max_node_count = payload
        .run
        .get("maxNodeCount")
        .and_then(Value::as_u64)
        .unwrap_or(8);
    let should_end = next_node_index >= max_node_count;
    json!({
        "status": if should_end { "completed" } else { "active" },
        "lastOutcomeText": "The world reacts to your action, and the quest lurches into its next shape.",
        "endingSummary": if should_end { Value::String("The run closes on a hard, imperfect ending.".to_string()) } else { Value::Null },
        "endingReached": if should_end { Value::String("ending-1".to_string()) } else { Value::Null },
        "effectSummaries": ["Momentum shifts around the party."],
        "newFlags": [],
        "clearFlags": [],
        "partyUpdates": [],
        "nextNode": if should_end {
            fallback_ending_node(next_node_index, 3, "The final consequences arrive.", "ending-1")
        } else {
            json!({
                "kind": "decision",
                "title": "Pressure Builds",
                "text": "The last move echoes outward. New risks open while old costs remain unpaid.",
                "choices": [
                    { "id": "choice-1", "label": "Press the advantage before it disappears.", "intent": "aggressive", "risk": "high", "tags": ["momentum"] },
                    { "id": "choice-2", "label": "Stabilize the party and reassess.", "intent": "careful", "risk": "low", "tags": ["recovery"] },
                    { "id": "choice-3", "label": "Negotiate with the most dangerous actor on the field.", "intent": "social", "risk": "medium", "tags": ["faction"] },
                    { "id": "choice-4", "label": "Break away and pursue a quieter path to the objective.", "intent": "subtle", "risk": "medium", "tags": ["alternate-route"] }
                ],
                "npcs": [],
                "contextRefs": [],
                "flags": []
            })
        }
    })
}

fn normalize_arc(generated: &Value, seed: &Value) -> Value {
    let arc = generated.get("arc").cloned().unwrap_or(Value::Null);
    let title = generated
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| arc.get("title").and_then(Value::as_str))
        .unwrap_or("Untitled Quest");
    let premise = arc
        .get("premise")
        .and_then(Value::as_str)
        .or_else(|| seed.get("premise").and_then(Value::as_str))
        .unwrap_or("Survive the moving pressures of the world.");
    let acts = take_string_array(arc.get("acts"), 3, || {
        vec![
            "Enter the problem.".to_string(),
            "Escalate through instability.".to_string(),
            "Face the final reckoning.".to_string(),
        ]
    });
    let recurring_tensions = take_string_array(arc.get("recurringTensions"), 3, || {
        vec![
            "Scarcity".to_string(),
            "Loyalty".to_string(),
            "Violence".to_string(),
        ]
    });
    let likely_npc_roles = take_string_array(arc.get("likelyNpcRoles"), 3, || {
        vec![
            "Witness".to_string(),
            "Broker".to_string(),
            "Hunter".to_string(),
        ]
    });
    let ending_tracks = arc
        .get("endingTracks")
        .and_then(Value::as_array)
        .filter(|tracks| !tracks.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            vec![
                json!({ "id": "ending-1", "title": "Triumph", "description": "The objective is secured, but the cost remains." }),
                json!({ "id": "ending-2", "title": "Compromise", "description": "The party survives through uneasy concessions." }),
                json!({ "id": "ending-3", "title": "Ruin", "description": "The run ends in loss, betrayal, or collapse." }),
            ]
        });
    json!({
        "title": title,
        "premise": premise,
        "acts": acts,
        "recurringTensions": recurring_tensions,
        "endingTracks": ending_tracks,
        "likelyNpcRoles": likely_npc_roles,
    })
}

fn normalize_node(
    raw_node: Option<&Value>,
    index: u64,
    act: u64,
    max_node_count: u64,
    selected_influences: &[Value],
) -> Value {
    let raw = raw_node.cloned().unwrap_or_else(|| {
        json!({
            "kind": if index >= max_node_count { "ending" } else { "decision" },
            "title": "Unnamed Node",
            "text": "The quest continues.",
            "choices": [],
            "npcs": [],
            "contextRefs": [],
            "flags": [],
        })
    });
    let kind = match raw
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("decision")
    {
        "dialogue" | "discussion" => "discussion",
        "scene" => "scene",
        "combat" => "combat",
        "ending" => "ending",
        _ => "decision",
    };
    let title = raw
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Unnamed Node");
    let text = raw
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("The quest continues.");
    let mut choices = raw
        .get("choices")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if kind == "discussion" {
        if choices.len() > 3 {
            choices.truncate(3);
        }
    } else if kind != "ending" && choices.len() < 4 {
        while choices.len() < 4 {
            let choice_number = choices.len() + 1;
            choices.push(json!({
                "id": format!("choice-{choice_number}"),
                "label": format!("Take option {choice_number}."),
                "intent": "adaptive",
                "risk": "medium",
                "tags": ["fallback"],
            }));
        }
    } else if kind == "ending" {
        choices.clear();
    }

    let context_refs = raw
        .get("contextRefs")
        .and_then(Value::as_array)
        .filter(|refs| !refs.is_empty())
        .cloned()
        .unwrap_or_else(|| selected_influences.to_vec());
    let flags = raw
        .get("flags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let pending_combat = if kind == "combat" || raw.get("pendingCombat").is_some() {
        let pending = raw.get("pendingCombat").cloned().unwrap_or_else(|| {
            json!({
                "encounterLabel": title,
                "stakes": "The node escalates into violence.",
                "enemyNpcNames": [],
            })
        });
        let encounter_label = pending
            .get("encounterLabel")
            .and_then(Value::as_str)
            .unwrap_or(title);
        let stakes = pending
            .get("stakes")
            .and_then(Value::as_str)
            .unwrap_or("Violence will decide the next step.");
        let enemy_names = pending
            .get("enemyNpcNames")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        json!({
            "encounterLabel": encounter_label,
            "stakes": stakes,
            "enemyNpcNames": enemy_names,
        })
    } else {
        Value::Null
    };

    json!({
        "id": format!("node-{index}"),
        "act": act,
        "index": index,
        "kind": kind,
        "title": title,
        "text": text,
        "choices": choices,
        "npcs": raw.get("npcs").cloned().unwrap_or(Value::Array(vec![])),
        "contextRefs": context_refs,
        "flags": flags,
        "pendingCombat": pending_combat,
        "endingId": raw.get("endingId").cloned().unwrap_or(Value::Null),
    })
}

fn fallback_ending_node(index: u64, act: u64, text: &str, ending_id: &str) -> Value {
    json!({
        "id": format!("node-{index}"),
        "act": act,
        "index": index,
        "kind": "ending",
        "title": "End of the Run",
        "text": text,
        "choices": [],
        "npcs": [],
        "contextRefs": [],
        "flags": [],
        "pendingCombat": Value::Null,
        "endingId": ending_id,
    })
}

fn party_ids(party: &Value) -> Vec<String> {
    party
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn take_string_array<F>(value: Option<&Value>, min_len: usize, fallback: F) -> Vec<String>
where
    F: Fn() -> Vec<String>,
{
    let mut items = value
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if items.len() < min_len {
        items = fallback();
    }
    items
}

fn collect_selected_influences(
    seed: &Value,
    factions: &Value,
    locations: &Value,
    ecology: &Value,
) -> Vec<Value> {
    let mut influences = Vec::new();
    let faction_ids = seed
        .get("factionAnchorIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let location_ids = seed
        .get("locationAnchorIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ecology_ids = seed
        .get("ecologyAnchorIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for faction_id in faction_ids {
        if let Some(id) = faction_id.as_str() {
            if let Some(faction) = factions.as_array().and_then(|items| {
                items
                    .iter()
                    .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
            }) {
                influences.push(json!({
                    "kind": "faction",
                    "id": id,
                    "label": faction.get("name").and_then(Value::as_str).unwrap_or(id),
                }));
            }
        }
    }

    for location_id in location_ids {
        if let Some(id) = location_id.as_str() {
            if let Some(location) = locations.as_array().and_then(|items| {
                items
                    .iter()
                    .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
            }) {
                influences.push(json!({
                    "kind": "location",
                    "id": id,
                    "label": location.get("name").and_then(Value::as_str).unwrap_or(id),
                }));
            }
        }
    }

    for ecology_id in ecology_ids {
        if let Some(id) = ecology_id.as_str() {
            if let Some(option) =
                ecology
                    .get("options")
                    .and_then(Value::as_array)
                    .and_then(|items| {
                        items
                            .iter()
                            .find(|item| item.get("id").and_then(Value::as_str) == Some(id))
                    })
            {
                influences.push(json!({
                    "kind": "ecology",
                    "id": id,
                    "label": option.get("label").and_then(Value::as_str).unwrap_or(id),
                }));
            }
        }
    }

    influences
}

fn selected_ecology_context_ids(seed: &Value, node: &Value) -> Vec<String> {
    let mut ids = seed
        .get("ecologyAnchorIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    ids.extend(
        node.get("contextRefs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|entry| entry.get("kind").and_then(Value::as_str) == Some("ecology"))
            .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_string)),
    );
    ids
}

fn context_fauna_candidates<'a>(ecology: &'a Value, selected_ids: &[String]) -> Vec<&'a Value> {
    let explicit_fauna_ids = selected_ids
        .iter()
        .filter_map(|id| id.strip_prefix("fauna:").map(str::to_string))
        .collect::<HashSet<_>>();
    let biome_ids = selected_ids
        .iter()
        .filter_map(|id| id.strip_prefix("biome:").map(str::to_string))
        .collect::<HashSet<_>>();

    ecology
        .get("faunaCatalog")
        .and_then(Value::as_array)
        .map(|catalog| {
            catalog
                .iter()
                .filter(|entry| {
                    let fauna_id = entry.get("id").and_then(Value::as_str).unwrap_or("");
                    if explicit_fauna_ids.contains(fauna_id) {
                        return true;
                    }
                    if biome_ids.is_empty() {
                        return explicit_fauna_ids.is_empty();
                    }
                    entry
                        .get("biomeIds")
                        .and_then(Value::as_array)
                        .map(|items| {
                            items.iter().any(|item| {
                                item.as_str()
                                    .map(|biome_id| biome_ids.contains(biome_id))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn context_fauna_summary(ecology: &Value, seed: &Value, node: Option<&Value>) -> String {
    let selected_ids = if let Some(node) = node {
        selected_ecology_context_ids(seed, node)
    } else {
        seed.get("ecologyAnchorIds")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect::<Vec<_>>()
    };
    let candidates = context_fauna_candidates(ecology, &selected_ids);
    if candidates.is_empty() {
        return "none".to_string();
    }

    candidates
        .into_iter()
        .map(|entry| {
            let name = entry.get("name").and_then(Value::as_str).unwrap_or("Unknown Fauna");
            let size = entry
                .get("sizeClass")
                .and_then(Value::as_str)
                .unwrap_or("unknown-size");
            let temperament = entry
                .get("temperament")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let danger_level = entry
                .get("dangerLevel")
                .and_then(Value::as_u64)
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string());
            let biome_list = entry
                .get("biomeIds")
                .and_then(Value::as_array)
                .map(|items| {
                    items.iter()
                        .filter_map(|item| item.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "unscoped".to_string());
            format!(
                "- {name} | size={size} | temperament={temperament} | danger={danger_level} | biomes={biome_list}"
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn find_matching_biome_fauna<'a>(
    ecology: &'a Value,
    seed: &Value,
    node: &Value,
    enemy_name: &str,
) -> Option<&'a Value> {
    let selected_ids = selected_ecology_context_ids(seed, node);
    let normalized_name = enemy_name.trim().to_lowercase();
    context_fauna_candidates(ecology, &selected_ids)
        .into_iter()
        .find(|entry| {
            let Some(entry_name) = entry.get("name").and_then(Value::as_str) else {
                return false;
            };
            if entry_name.trim().to_lowercase() != normalized_name {
                return false;
            }
            true
        })
}

fn materialize_node_characters(
    run_id: &str,
    world_id: &str,
    node: &Value,
    history_characters: &Value,
    seed: &Value,
    ecology: &Value,
) -> Result<(Vec<Value>, Vec<Value>, Vec<Value>, Vec<String>), (StatusCode, String)> {
    let mut warnings = Vec::new();
    let mut materialized = Vec::new();
    let mut npc_entries = Vec::new();
    let mut enemy_ids = Vec::new();
    let combat_enemy_specs = node
        .get("pendingCombat")
        .and_then(|pending| pending.get("enemyNpcNames"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    let combat_enemy_names = combat_enemy_specs
        .iter()
        .map(|item| item.to_lowercase())
        .collect::<Vec<_>>();

    let existing_characters = load_existing_builder_characters();
    let history_list = history_characters.as_array().cloned().unwrap_or_default();
    let difficulty = seed
        .get("difficulty")
        .and_then(Value::as_str)
        .unwrap_or("medium");
    let mut npc_hints = node
        .get("npcs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut known_npc_names = npc_hints
        .iter()
        .filter_map(|npc| {
            npc.get("name")
                .and_then(Value::as_str)
                .map(|name| name.to_lowercase())
        })
        .collect::<Vec<_>>();
    let combat_stakes = node
        .get("pendingCombat")
        .and_then(|pending| pending.get("stakes"))
        .and_then(Value::as_str)
        .unwrap_or("A hostile force is pushing into the quest.");

    for enemy_name in &combat_enemy_specs {
        let normalized = enemy_name.to_lowercase();
        if known_npc_names.iter().any(|name| name == &normalized) {
            continue;
        }
        npc_hints.push(json!({
            "name": enemy_name,
            "role": "Enemy",
            "isHostile": true,
            "lore": combat_stakes,
        }));
        known_npc_names.push(normalized);
    }

    for npc in npc_hints {
        let npc_name = npc
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Unknown Figure")
            .to_string();
        let is_named_enemy = combat_enemy_names
            .iter()
            .any(|name| name == &npc_name.to_lowercase());
        let is_hostile = npc
            .get("isHostile")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || is_named_enemy;
        if is_hostile {
            if let Some(fauna_entry) = find_matching_biome_fauna(ecology, seed, node, &npc_name) {
                let fauna_id = fauna_entry
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown-fauna");
                let fauna_name = fauna_entry
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(&npc_name);
                let combat_id = format!("fauna:{fauna_id}");
                enemy_ids.push(Value::String(combat_id.clone()));
                npc_entries.push(json!({
                    "id": combat_id,
                    "name": fauna_name,
                    "role": npc.get("role").and_then(Value::as_str).unwrap_or("Fauna"),
                    "isHostile": true,
                    "sourceType": "ecology",
                    "sourceId": format!("fauna:{fauna_id}"),
                }));
                continue;
            }
        }
        let hinted_source_id = npc
            .get("sourceHistoryCharacterId")
            .and_then(Value::as_str)
            .map(str::to_string);
        let matched_history = hinted_source_id
            .as_ref()
            .and_then(|source_id| {
                history_list.iter().find(|entry| {
                    entry.get("id").and_then(Value::as_str) == Some(source_id.as_str())
                })
            })
            .or_else(|| {
                history_list.iter().find(|entry| {
                    entry
                        .get("name")
                        .and_then(Value::as_str)
                        .map(|name| name.eq_ignore_ascii_case(&npc_name))
                        .unwrap_or(false)
                })
            });

        let existing = find_reusable_npc(
            &existing_characters,
            world_id,
            hinted_source_id.as_deref(),
            &npc_name,
        );
        let character_value = if let Some(existing_character) = existing {
            existing_character.clone()
        } else {
            let generated =
                build_materialized_character(run_id, world_id, &npc, matched_history, difficulty);
            persist_builder_character(&generated)
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
            materialized.push(generated.clone());
            generated
        };

        let character_id = character_value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-npc")
            .to_string();
        if is_hostile {
            enemy_ids.push(Value::String(character_id.clone()));
        }

        npc_entries.push(json!({
            "id": character_id,
            "name": character_value.get("name").and_then(Value::as_str).unwrap_or(&npc_name),
            "role": npc.get("role").and_then(Value::as_str).or_else(|| matched_history.and_then(|entry| entry.get("role").and_then(Value::as_str))).unwrap_or("NPC"),
            "isHostile": is_hostile,
            "sourceType": if matched_history.is_some() { "history" } else { "quest" },
            "sourceId": hinted_source_id.or_else(|| matched_history.and_then(|entry| entry.get("id").and_then(Value::as_str).map(str::to_string))),
        }));
    }

    if node
        .get("pendingCombat")
        .and_then(Value::as_object)
        .is_some()
        && enemy_ids.is_empty()
    {
        warnings.push("Combat node generated without hostile NPCs; quest combat will be skipped unless enemies are added.".to_string());
    }

    Ok((materialized, npc_entries, enemy_ids, warnings))
}

fn build_materialized_character(
    run_id: &str,
    world_id: &str,
    npc_hint: &Value,
    history_character: Option<&Value>,
    difficulty: &str,
) -> Value {
    let name = npc_hint
        .get("name")
        .and_then(Value::as_str)
        .or_else(|| history_character.and_then(|entry| entry.get("name").and_then(Value::as_str)))
        .unwrap_or("Unknown Figure");
    let role = npc_hint
        .get("role")
        .and_then(Value::as_str)
        .or_else(|| history_character.and_then(|entry| entry.get("role").and_then(Value::as_str)))
        .unwrap_or("Other");
    let lore = npc_hint
        .get("lore")
        .and_then(Value::as_str)
        .or_else(|| history_character.and_then(|entry| entry.get("lore").and_then(Value::as_str)))
        .unwrap_or("A figure shaped by the pressure of this world.");
    let affiliation = npc_hint
        .get("faction")
        .and_then(Value::as_str)
        .or_else(|| {
            history_character.and_then(|entry| entry.get("affiliation").and_then(Value::as_str))
        })
        .unwrap_or("");
    let (base_stat, level) = match difficulty {
        "low" => (3, 1),
        "high" => (6, 4),
        "deadly" => (8, 6),
        _ => (4, 2),
    };
    let endurance = base_stat
        + if npc_hint
            .get("isHostile")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
    let hp = 10 + endurance * 5;
    json!({
        "id": format!("char-{}", Uuid::new_v4()),
        "isNPC": true,
        "type": "Human",
        "worldId": world_id,
        "name": name,
        "age": 30,
        "gender": "Unknown",
        "history": lore,
        "appearancePrompt": format!("{role} forged by the quest."),
        "stats": {
            "strength": base_stat,
            "agility": base_stat,
            "intelligence": base_stat,
            "wisdom": base_stat,
            "endurance": endurance,
            "charisma": base_stat,
        },
        "traits": [],
        "hp": hp,
        "maxHp": hp,
        "xp": 0,
        "level": level,
        "inventory": [],
        "skills": [],
        "faction": if affiliation.is_empty() { Value::Null } else { Value::String(affiliation.to_string()) },
        "backstory": lore,
        "origin": {
            "system": if history_character.is_some() { "history" } else { "quest" },
            "sourceId": history_character
                .and_then(|entry| entry.get("id").and_then(Value::as_str))
                .unwrap_or(run_id),
            "worldId": world_id,
        }
    })
}

fn load_existing_builder_characters() -> Vec<Value> {
    let dir = builder_characters_dir();
    let mut characters = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(path) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    characters.push(value);
                }
            }
        }
    }
    characters
}

fn find_reusable_npc<'a>(
    existing_characters: &'a [Value],
    world_id: &str,
    source_id: Option<&str>,
    name: &str,
) -> Option<&'a Value> {
    existing_characters.iter().find(|character| {
        character.get("worldId").and_then(Value::as_str) == Some(world_id)
            && character
                .get("isNPC")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            && (source_id
                .and_then(|id| {
                    character
                        .get("origin")
                        .and_then(|origin| origin.get("sourceId"))
                        .and_then(Value::as_str)
                        .map(|source| source == id)
                })
                .unwrap_or(false)
                || character
                    .get("name")
                    .and_then(Value::as_str)
                    .map(|existing_name| existing_name.eq_ignore_ascii_case(name))
                    .unwrap_or(false))
    })
}

fn persist_builder_character(character: &Value) -> Result<(), std::io::Error> {
    let dir = builder_characters_dir();
    fs::create_dir_all(&dir)?;
    let id = character
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let path = dir.join(format!("{id}.json"));
    fs::write(
        path,
        serde_json::to_string_pretty(character).unwrap_or_else(|_| "{}".to_string()),
    )
}

fn builder_characters_dir() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("generated")
        .join("characters")
}

fn normalize_party_updates(
    raw_updates: Option<&Value>,
    party: &Value,
    effect_summaries: Vec<Value>,
) -> Vec<Value> {
    let party_entries = party.as_array().cloned().unwrap_or_default();
    let mut updates = Vec::new();
    for update in raw_updates
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let character_id = update
            .get("characterId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                let requested_name = update.get("characterName").and_then(Value::as_str)?;
                party_entries.iter().find_map(|entry| {
                    entry.get("name").and_then(Value::as_str).and_then(|name| {
                        if name.eq_ignore_ascii_case(requested_name) {
                            entry.get("id").and_then(Value::as_str).map(str::to_string)
                        } else {
                            None
                        }
                    })
                })
            });
        if let Some(id) = character_id {
            updates.push(json!({
                "characterId": id,
                "summary": update.get("summary").and_then(Value::as_str).unwrap_or("Quest consequence applied."),
                "statChanges": update.get("statChanges").cloned().unwrap_or(Value::Array(vec![])),
                "addTraitNames": update.get("addTraitNames").cloned().unwrap_or(Value::Array(vec![])),
                "removeTraitNames": update.get("removeTraitNames").cloned().unwrap_or(Value::Array(vec![])),
                "addItems": update.get("addItems").cloned().unwrap_or(Value::Array(vec![])),
                "addSkills": update.get("addSkills").cloned().unwrap_or(Value::Array(vec![])),
                "relationshipChanges": update.get("relationshipChanges").cloned().unwrap_or(Value::Array(vec![])),
            }));
        }
    }
    if updates.is_empty() && !effect_summaries.is_empty() {
        warn!("Quest effect summaries were present without structured party updates");
    }
    updates
}

fn log_entry(
    kind: &str,
    title: &str,
    text: &str,
    effects: Vec<String>,
    node_id: Option<String>,
) -> Value {
    json!({
        "id": format!("qlog-{}", Uuid::new_v4()),
        "timestamp": now_ms(),
        "nodeId": node_id,
        "kind": kind,
        "title": title,
        "text": text,
        "effects": effects,
    })
}

fn summarize_run(run: &Value) -> Value {
    json!({
        "id": run.get("id").cloned().unwrap_or(Value::String("unknown".to_string())),
        "worldId": run.get("worldId").cloned().unwrap_or(Value::String("unknown".to_string())),
        "status": run.get("status").cloned().unwrap_or(Value::String("active".to_string())),
        "title": run.get("title").cloned().unwrap_or(Value::String("Untitled Quest".to_string())),
        "summary": run.get("summary").cloned().unwrap_or(Value::String("".to_string())),
        "createdAt": run.get("createdAt").cloned().unwrap_or(Value::Number(0.into())),
        "updatedAt": run.get("updatedAt").cloned().unwrap_or(Value::Number(0.into())),
        "completedAt": run.get("completedAt").cloned().unwrap_or(Value::Null),
        "partyCharacterIds": run.get("partyCharacterIds").cloned().unwrap_or(Value::Array(vec![])),
        "nodeCount": run.get("nodeCount").cloned().unwrap_or(Value::Number(0.into())),
        "endingReached": run.get("endingReached").cloned().unwrap_or(Value::Null),
        "chainId": run.get("chainId").cloned().unwrap_or(Value::Null),
    })
}

fn chain_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    quest_dir(planets_dir, world_id).join("chains")
}

fn snapshot_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    quest_dir(planets_dir, world_id).join("snapshots")
}

fn glossary_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    quest_dir(planets_dir, world_id).join("glossary")
}

fn illustration_record_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    quest_dir(planets_dir, world_id).join("illustrations")
}

fn illustration_image_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    quest_dir(planets_dir, world_id).join("illustration-images")
}

fn load_chain_for_run(planets_dir: &PathBuf, world_id: &str, run: &Value) -> Option<Value> {
    let chain_id = run.get("chainId").and_then(Value::as_str)?;
    let path = chain_dir(planets_dir, world_id).join(format!("{chain_id}.json"));
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
}

fn load_or_create_active_chain(planets_dir: &PathBuf, world_id: &str, seed: &Value) -> Value {
    let dir = chain_dir(planets_dir, world_id);
    let _ = fs::create_dir_all(&dir);
    let mut chains = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(path) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    chains.push(value);
                }
            }
        }
    }
    chains.sort_by(|a, b| {
        b.get("updatedAt")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .cmp(&a.get("updatedAt").and_then(Value::as_u64).unwrap_or(0))
    });
    if let Some(existing) = chains
        .into_iter()
        .find(|chain| chain.get("status").and_then(Value::as_str) == Some("active"))
    {
        return existing;
    }

    let title = seed
        .get("objective")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("Chain: {value}"))
        .unwrap_or_else(|| "Chain: Ashtrail Continuum".to_string());
    let premise = seed
        .get("premise")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("A quest chain formed from the world's accumulating tensions.");
    json!({
        "id": format!("qchain-{}", Uuid::new_v4()),
        "worldId": world_id,
        "title": title,
        "premise": premise,
        "status": "active",
        "activeRunId": Value::Null,
        "completedRunIds": [],
        "npcIds": [],
        "factionIds": [],
        "storyFlags": [],
        "nextQuestHooks": [],
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
    })
}

fn persist_chain(
    planets_dir: &PathBuf,
    world_id: &str,
    chain: &Value,
) -> Result<(), std::io::Error> {
    let dir = chain_dir(planets_dir, world_id);
    fs::create_dir_all(&dir)?;
    let id = chain.get("id").and_then(Value::as_str).unwrap_or("unknown");
    let path = dir.join(format!("{id}.json"));
    fs::write(
        path,
        serde_json::to_string_pretty(chain).unwrap_or_else(|_| "{}".to_string()),
    )
}

fn update_chain_with_active_run(
    chain: &mut Value,
    run_id: &str,
    npc_ids: &[String],
    faction_ids: Vec<String>,
) {
    if let Some(obj) = chain.as_object_mut() {
        obj.insert("activeRunId".to_string(), Value::String(run_id.to_string()));
        obj.insert("updatedAt".to_string(), Value::Number(now_ms().into()));
        merge_unique_string_field(obj, "npcIds", npc_ids);
        merge_unique_string_field(obj, "factionIds", &faction_ids);
    }
}

fn update_chain_on_completion(
    chain: &mut Value,
    run_id: &str,
    run_title: &str,
    world_consequences: &[Value],
    npc_ids: &[String],
    faction_ids: Vec<String>,
) {
    if let Some(obj) = chain.as_object_mut() {
        append_unique_string_value(obj, "completedRunIds", run_id);
        merge_unique_string_field(obj, "npcIds", npc_ids);
        merge_unique_string_field(obj, "factionIds", &faction_ids);
        let hooks = world_consequences
            .iter()
            .filter_map(|entry| entry.get("summary").and_then(Value::as_str))
            .map(|summary| format!("After {run_title}: {summary}"))
            .collect::<Vec<_>>();
        merge_unique_string_field(obj, "nextQuestHooks", &hooks);
        obj.insert("activeRunId".to_string(), Value::Null);
        obj.insert("status".to_string(), Value::String("active".to_string()));
        obj.insert("updatedAt".to_string(), Value::Number(now_ms().into()));
    }
}

fn merge_unique_string_field(
    target: &mut serde_json::Map<String, Value>,
    field: &str,
    values: &[String],
) {
    let mut merged = target
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    for value in values {
        if !merged.iter().any(|existing| existing == value) {
            merged.push(value.clone());
        }
    }
    target.insert(
        field.to_string(),
        Value::Array(merged.into_iter().map(Value::String).collect()),
    );
}

fn append_unique_string_value(
    target: &mut serde_json::Map<String, Value>,
    field: &str,
    value: &str,
) {
    let mut merged = target
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    if !merged.iter().any(|existing| existing == value) {
        merged.push(value.to_string());
    }
    target.insert(
        field.to_string(),
        Value::Array(merged.into_iter().map(Value::String).collect()),
    );
}

fn create_retry_snapshot(
    planets_dir: &PathBuf,
    world_id: &str,
    run_id: &str,
    party: &Value,
    run: &Value,
) -> Result<String, (StatusCode, String)> {
    let snapshot_id = format!("qsnap-{}", Uuid::new_v4());
    let dir = snapshot_dir(planets_dir, world_id);
    fs::create_dir_all(&dir).map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    let path = dir.join(format!("{snapshot_id}.json"));
    let snapshot = json!({
        "id": snapshot_id,
        "worldId": world_id,
        "runId": run_id,
        "createdAt": now_ms(),
        "party": party,
        "runState": run,
    });
    fs::write(
        path,
        serde_json::to_string_pretty(&snapshot).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    Ok(snapshot_id)
}

fn load_retry_snapshot(planets_dir: &PathBuf, world_id: &str, snapshot_id: &str) -> Option<Value> {
    if snapshot_id.trim().is_empty() {
        return None;
    }
    let path = snapshot_dir(planets_dir, world_id).join(format!("{snapshot_id}.json"));
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
}

fn build_world_consequences(
    run_id: &str,
    node: &Value,
    introduced_npcs: &Value,
    effect_summaries: &[Value],
    new_flags: &[Value],
) -> Vec<Value> {
    let mut consequences = Vec::new();
    for summary in effect_summaries.iter().filter_map(Value::as_str) {
        consequences.push(json!({
            "id": format!("qwc-{}", Uuid::new_v4()),
            "kind": "story",
            "summary": summary,
            "sourceRunId": run_id,
            "relatedIds": [],
        }));
    }
    for flag in new_flags.iter().filter_map(Value::as_str) {
        consequences.push(json!({
            "id": format!("qwc-{}", Uuid::new_v4()),
            "kind": "story",
            "summary": format!("Flag advanced: {flag}"),
            "sourceRunId": run_id,
            "relatedIds": [flag],
        }));
    }
    for npc_id in introduced_npcs
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.as_str().map(str::to_string))
    {
        consequences.push(json!({
            "id": format!("qwc-{}", Uuid::new_v4()),
            "kind": "npc",
            "summary": format!("A quest actor now matters to this world: {npc_id}"),
            "sourceRunId": run_id,
            "relatedIds": [npc_id],
        }));
    }
    if let Some(title) = node.get("title").and_then(Value::as_str) {
        consequences.push(json!({
            "id": format!("qwc-{}", Uuid::new_v4()),
            "kind": "story",
            "summary": format!("The quest reached {title}."),
            "sourceRunId": run_id,
            "relatedIds": [],
        }));
    }
    consequences
}

fn merge_string_ids(
    existing: Option<&Vec<Value>>,
    incoming: Option<&Vec<Value>>,
    field: &str,
) -> Vec<String> {
    let mut merged = existing
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    for value in incoming.cloned().unwrap_or_default() {
        if let Some(id) = value.get(field).and_then(Value::as_str) {
            if !merged.iter().any(|existing| existing == id) {
                merged.push(id.to_string());
            }
        }
    }
    merged
}

fn extract_referenced_faction_ids(node: &Value) -> Vec<String> {
    node.get("contextRefs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|entry| entry.get("kind").and_then(Value::as_str) == Some("faction"))
        .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

fn attach_node_metadata(
    node: &mut Value,
    state: &AppState,
    world_id: &str,
    run_id: &str,
    run_title: &str,
    gm_context: &Value,
) -> Result<Option<String>, (StatusCode, String)> {
    let term_refs = collect_term_refs(node);
    let layout_hint = match node.get("kind").and_then(Value::as_str).unwrap_or("scene") {
        "discussion" | "dialogue" => "conversation",
        "combat" => "combat",
        "ending" => "ending",
        "scene" if node.get("index").and_then(Value::as_u64) == Some(1) => "featured",
        _ => "standard",
    };
    let illustration_id = if should_generate_illustration(node) {
        Some(queue_quest_illustration(
            state, world_id, run_id, run_title, node, gm_context,
        )?)
    } else {
        None
    };
    if let Some(obj) = node.as_object_mut() {
        obj.insert("termRefs".to_string(), Value::Array(term_refs));
        obj.insert(
            "layoutHint".to_string(),
            Value::String(layout_hint.to_string()),
        );
        if let Some(id) = illustration_id.clone() {
            obj.insert("illustrationId".to_string(), Value::String(id));
            obj.insert(
                "illustrationStatus".to_string(),
                Value::String("queued".to_string()),
            );
        } else {
            obj.insert("illustrationId".to_string(), Value::Null);
            obj.insert(
                "illustrationStatus".to_string(),
                Value::String("idle".to_string()),
            );
        }
    }
    Ok(illustration_id)
}

fn collect_term_refs(node: &Value) -> Vec<Value> {
    let mut refs = Vec::new();
    let mut seen = Vec::<String>::new();
    for context in node
        .get("contextRefs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        if let Some(label) = context.get("label").and_then(Value::as_str) {
            let slug = slugify_term(label);
            if !seen.iter().any(|item| item == &slug) {
                refs.push(json!({
                    "term": label,
                    "slug": slug,
                    "sourceType": "context",
                    "sourceId": context.get("id").cloned().unwrap_or(Value::Null),
                }));
                seen.push(slugify_term(label));
            }
        }
    }
    for npc in node
        .get("npcs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        if let Some(name) = npc.get("name").and_then(Value::as_str) {
            let slug = slugify_term(name);
            if !seen.iter().any(|item| item == &slug) {
                refs.push(json!({
                    "term": name,
                    "slug": slug,
                    "sourceType": "npc",
                    "sourceId": npc.get("id").cloned().unwrap_or(Value::Null),
                }));
                seen.push(slugify_term(name));
            }
        }
    }
    if let Some(title) = node.get("title").and_then(Value::as_str) {
        let slug = slugify_term(title);
        if title.split_whitespace().count() > 1 && !seen.iter().any(|item| item == &slug) {
            refs.push(json!({
                "term": title,
                "slug": slug,
                "sourceType": "title",
                "sourceId": node.get("id").cloned().unwrap_or(Value::Null),
            }));
        }
    }
    refs
}

fn should_generate_illustration(node: &Value) -> bool {
    let index = node.get("index").and_then(Value::as_u64).unwrap_or(0);
    match node.get("kind").and_then(Value::as_str).unwrap_or("scene") {
        "combat" | "discussion" | "ending" => true,
        _ if index == 1 => true,
        _ if index > 0 && index % 3 == 0 => true,
        _ => false,
    }
}

fn queue_quest_illustration(
    state: &AppState,
    world_id: &str,
    run_id: &str,
    run_title: &str,
    node: &Value,
    gm_context: &Value,
) -> Result<String, (StatusCode, String)> {
    let illustration_id = format!("qill-{}", Uuid::new_v4());
    let record_dir = illustration_record_dir(&state.planets_dir, world_id);
    let image_dir = illustration_image_dir(&state.planets_dir, world_id);
    fs::create_dir_all(&record_dir)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    fs::create_dir_all(&image_dir)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    let kind = match node.get("kind").and_then(Value::as_str).unwrap_or("scene") {
        "combat" => "combat",
        "discussion" | "dialogue" => "discussion",
        "ending" => "ending",
        _ if node.get("index").and_then(Value::as_u64) == Some(1) => "intro",
        _ => "turning-point",
    };
    let prompt = build_quest_illustration_prompt(run_title, node, gm_context);
    let asset_path = format!("/api/planet/quests/{world_id}/illustrations/{illustration_id}/image");
    let source_character_ids = node
        .get("npcs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|npc| npc.get("id").and_then(Value::as_str).map(str::to_string))
        .map(Value::String)
        .collect::<Vec<_>>();
    let record = json!({
        "id": illustration_id,
        "worldId": world_id,
        "runId": run_id,
        "nodeId": node.get("id").cloned().unwrap_or(Value::Null),
        "kind": kind,
        "prompt": prompt,
        "assetPath": asset_path,
        "status": "queued",
        "sourceCharacterIds": source_character_ids,
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        "error": Value::Null,
    });
    let record_path = record_dir.join(format!("{illustration_id}.json"));
    fs::write(
        &record_path,
        serde_json::to_string_pretty(&record).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let planets_dir = state.planets_dir.clone();
    let world_id_owned = world_id.to_string();
    let illustration_id_owned = illustration_id.clone();
    let prompt_owned = prompt.clone();
    tokio::spawn(async move {
        let update_record = |status: &str, error_message: Option<String>| {
            let path = illustration_record_dir(&planets_dir, &world_id_owned)
                .join(format!("{illustration_id_owned}.json"));
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(mut value) = serde_json::from_str::<Value>(&raw) {
                    if let Some(obj) = value.as_object_mut() {
                        obj.insert("status".to_string(), Value::String(status.to_string()));
                        obj.insert("updatedAt".to_string(), Value::Number(now_ms().into()));
                        obj.insert(
                            "error".to_string(),
                            error_message.map(Value::String).unwrap_or(Value::Null),
                        );
                    }
                    let _ = fs::write(
                        path,
                        serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string()),
                    );
                }
            }
        };

        update_record("generating", None);
        match generate_image_bytes(&prompt_owned, Some(0.7), 1024, 1024, Some("1:1")).await {
            Ok(bytes) => {
                let image_path = illustration_image_dir(&planets_dir, &world_id_owned)
                    .join(format!("{illustration_id_owned}.png"));
                if fs::write(image_path, bytes).is_ok() {
                    update_record("ready", None);
                } else {
                    update_record(
                        "failed",
                        Some("Failed to save generated illustration.".to_string()),
                    );
                }
            }
            Err((_, message)) => update_record("failed", Some(message)),
        }
    });

    Ok(illustration_id)
}

fn build_quest_illustration_prompt(run_title: &str, node: &Value, gm_context: &Value) -> String {
    let world_prompt = gm_context
        .get("worldPrompt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("A hostile ash-choked world.");
    let node_kind = node.get("kind").and_then(Value::as_str).unwrap_or("scene");
    let node_title = node
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Quest Node");
    let node_text = node
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("The quest advances.");
    format!(
        "Create a cinematic, grounded post-apocalyptic quest illustration. World canon: {world_prompt}. Quest: {run_title}. Node type: {node_kind}. Scene title: {node_title}. Scene beat: {node_text}. Focus on strong environmental storytelling, readable silhouettes, dramatic light, and no text overlay."
    )
}

fn slugify_term(term: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in term.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn load_all_glossary_entries(planets_dir: &PathBuf, world_id: &str) -> Vec<Value> {
    let dir = glossary_dir(planets_dir, world_id);
    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(path) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    entries.push(value);
                }
            }
        }
    }
    entries.sort_by(|a, b| {
        a.get("term")
            .and_then(Value::as_str)
            .unwrap_or("")
            .cmp(b.get("term").and_then(Value::as_str).unwrap_or(""))
    });
    entries
}

fn persist_glossary_entry(
    planets_dir: &PathBuf,
    world_id: &str,
    entry: &Value,
) -> Result<(), std::io::Error> {
    let dir = glossary_dir(planets_dir, world_id);
    fs::create_dir_all(&dir)?;
    let slug = entry
        .get("slug")
        .and_then(Value::as_str)
        .unwrap_or("unknown-term");
    let path = dir.join(format!("{slug}.json"));
    fs::write(
        path,
        serde_json::to_string_pretty(entry).unwrap_or_else(|_| "{}".to_string()),
    )
}

async fn load_or_generate_glossary_entry(
    planets_dir: &PathBuf,
    world_id: &str,
    term: &str,
) -> Result<Value, (StatusCode, String)> {
    let slug = slugify_term(term);
    let path = glossary_dir(planets_dir, world_id).join(format!("{slug}.json"));
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            return Ok(value);
        }
    }
    let world_prompt = read_world_prompt(planets_dir, world_id);
    let prompt = format!(
        "You are the Ashtrail glossary keeper. Write 2 short sentences of flavorful but clear explanation for the term \"{term}\" in the context of this world. World prompt: {world_prompt}. Return plain text only."
    );
    let flavor_text = parse_text_with_retry(&prompt)
        .await
        .unwrap_or_else(|_| format!("{term} is a significant concept in this world."));
    let entry = json!({
        "worldId": world_id,
        "term": term,
        "slug": slug,
        "shortLabel": term,
        "flavorText": flavor_text.trim(),
        "sourceType": "system",
        "sourceId": Value::Null,
        "relatedIds": [],
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
    });
    persist_glossary_entry(planets_dir, world_id, &entry)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    Ok(entry)
}

fn read_world_prompt(planets_dir: &PathBuf, world_id: &str) -> String {
    let path = planets_dir.join(world_id).join("gm_settings.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| {
            value
                .get("worldPrompt")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "A dangerous ash-swept frontier.".to_string())
}

fn quest_dir(planets_dir: &PathBuf, world_id: &str) -> PathBuf {
    planets_dir.join(world_id).join("quests")
}

fn run_length_to_node_count(run_length: &str) -> u64 {
    match run_length {
        "short" => 5,
        "long" => 12,
        _ => 8,
    }
}

fn act_for_index(index: u64, max_node_count: u64) -> u64 {
    if max_node_count <= 3 {
        return index.clamp(1, 3);
    }
    let threshold_one = (max_node_count as f32 * 0.34).ceil() as u64;
    let threshold_two = (max_node_count as f32 * 0.67).ceil() as u64;
    if index <= threshold_one {
        1
    } else if index <= threshold_two {
        2
    } else {
        3
    }
}

fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_fauna_candidates_filters_by_selected_biome() {
        let ecology = json!({
            "faunaCatalog": [
                {
                    "id": "fauna-ash-stalker",
                    "name": "Ash Stalker",
                    "biomeIds": ["ashlands"],
                    "dangerLevel": 88,
                    "temperament": "apex",
                    "sizeClass": "large"
                },
                {
                    "id": "fauna-river-heron",
                    "name": "River Heron",
                    "biomeIds": ["salt_marsh"],
                    "dangerLevel": 18,
                    "temperament": "skittish",
                    "sizeClass": "medium"
                }
            ]
        });

        let candidates = context_fauna_candidates(&ecology, &[String::from("biome:ashlands")]);
        assert_eq!(candidates.len(), 1);
        assert_eq!(
            candidates[0].get("name").and_then(Value::as_str),
            Some("Ash Stalker")
        );
    }

    #[test]
    fn find_matching_biome_fauna_uses_ecology_context() {
        let ecology = json!({
            "faunaCatalog": [
                {
                    "id": "fauna-ash-stalker",
                    "name": "Ash Stalker",
                    "biomeIds": ["ashlands"],
                    "dangerLevel": 88,
                    "temperament": "apex",
                    "sizeClass": "large"
                },
                {
                    "id": "fauna-river-heron",
                    "name": "River Heron",
                    "biomeIds": ["salt_marsh"],
                    "dangerLevel": 18,
                    "temperament": "skittish",
                    "sizeClass": "medium"
                }
            ]
        });
        let seed = json!({
            "ecologyAnchorIds": ["biome:ashlands"]
        });
        let node = json!({
            "contextRefs": [
                {"kind": "ecology", "id": "biome:ashlands", "label": "Ashlands"}
            ]
        });

        let ash_match = find_matching_biome_fauna(&ecology, &seed, &node, "Ash Stalker");
        assert_eq!(
            ash_match
                .and_then(|entry| entry.get("id"))
                .and_then(Value::as_str),
            Some("fauna-ash-stalker")
        );

        let marsh_match = find_matching_biome_fauna(&ecology, &seed, &node, "River Heron");
        assert!(marsh_match.is_none());
    }

    #[test]
    fn build_generate_prompt_includes_context_fauna_candidates() {
        let payload = GenerateQuestRunRequest {
            world_id: "world-1".to_string(),
            seed: json!({
                "ecologyAnchorIds": ["biome:ashlands"]
            }),
            party: json!([]),
            gm_context: Value::Null,
            factions: Value::Null,
            locations: Value::Null,
            ecology: json!({
                "faunaCatalog": [
                    {
                        "id": "fauna-ash-stalker",
                        "name": "Ash Stalker",
                        "biomeIds": ["ashlands"],
                        "dangerLevel": 88,
                        "temperament": "apex",
                        "sizeClass": "large"
                    }
                ]
            }),
            history_characters: Value::Null,
        };

        let prompt = build_generate_prompt(&payload, None);
        assert!(prompt.contains("Context Fauna Candidates"));
        assert!(prompt.contains("Ash Stalker"));
        assert!(prompt.contains("Do not invent alternate animal names"));
    }
}
