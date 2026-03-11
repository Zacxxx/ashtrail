use crate::gemini::generate_text;
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use serde_json::Value;
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
    pub party: Value,
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
    pub run: Value,
    pub party: Value,
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
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestAdvanceResponse {
    pub run: Value,
    pub party_updates: Vec<Value>,
    pub materialized_characters: Vec<Value>,
    pub warnings: Vec<String>,
}

pub async fn generate_quest_run_handler(
    State(_state): State<AppState>,
    Json(payload): Json<GenerateQuestRunRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut warnings = Vec::new();
    let run_id = format!("quest-{}", Uuid::new_v4());
    let timestamp = now_ms();
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

    let generated = match parse_json_with_retry(&build_generate_prompt(&payload)).await {
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

    let (materialized_characters, npc_entries, enemy_ids, npc_warnings) = materialize_node_characters(
        &run_id,
        &payload.world_id,
        &current_node,
        &payload.history_characters,
        &payload.seed,
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

    let run = json!({
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
    });

    Ok(Json(QuestGenerationResponse {
        run,
        materialized_characters,
        warnings,
    }))
}

pub async fn advance_quest_handler(
    State(_state): State<AppState>,
    Json(payload): Json<AdvanceQuestRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut warnings = Vec::new();
    let current_run = payload.run.clone();
    let world_id = current_run
        .get("worldId")
        .and_then(Value::as_str)
        .ok_or((StatusCode::BAD_REQUEST, "Quest run is missing worldId".to_string()))?;
    let run_id = current_run
        .get("id")
        .and_then(Value::as_str)
        .ok_or((StatusCode::BAD_REQUEST, "Quest run is missing id".to_string()))?;
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

    let generated = match parse_json_with_retry(&build_advance_prompt(&payload)).await {
        Ok(value) => value,
        Err(err) => {
            warnings.push(err);
            fallback_advance_payload(&payload)
        }
    };

    let party_updates = normalize_party_updates(
        generated.get("partyUpdates"),
        &payload.party,
        generated
            .get("effectSummaries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );
    let mut next_node = generated.get("nextNode").cloned().unwrap_or(Value::Null);
    let mut status = generated
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();

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
    if !next_node.is_null() {
        let (characters, npc_entries, enemy_ids, npc_warnings) = materialize_node_characters(
            run_id,
            world_id,
            &next_node,
            &payload.history_characters,
            current_run.get("seed").unwrap_or(&Value::Null),
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
    }

    let timestamp = now_ms();
    let mut flags = current_run
        .get("flags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(new_flags) = generated.get("newFlags").and_then(Value::as_array) {
        for flag in new_flags {
            if !flags.iter().any(|existing| existing == flag) {
                flags.push(flag.clone());
            }
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
    let effect_summaries = generated
        .get("effectSummaries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
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
    });

    Ok(Json(QuestAdvanceResponse {
        run: updated_run,
        party_updates,
        materialized_characters,
        warnings,
    }))
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
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

fn build_generate_prompt(payload: &GenerateQuestRunRequest) -> String {
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
History Characters:\n{}\n\
\n\
Rules:\n\
- The quest must fit the canon and not rewrite world history.\n\
- The run must feel interactive, dangerous, and open-ended.\n\
- Produce 3 acts and at least 3 ending tracks.\n\
- The first node must have exactly 4 meaningful player choices.\n\
- If the first node naturally implies combat, include pendingCombat.enemyNpcNames.\n\
- NPCs should reference history characters when appropriate.\n\
\n\
Return raw JSON only. No markdown fences.\n\
Schema:\n\
{{\n  \"title\": \"string\",\n  \"summary\": \"string\",\n  \"arc\": {{\n    \"title\": \"string\",\n    \"premise\": \"string\",\n    \"acts\": [\"string\", \"string\", \"string\"],\n    \"recurringTensions\": [\"string\"],\n    \"endingTracks\": [{{\"id\":\"string\",\"title\":\"string\",\"description\":\"string\"}}],\n    \"likelyNpcRoles\": [\"string\"]\n  }},\n  \"currentNode\": {{\n    \"kind\": \"scene|dialogue|decision|combat\",\n    \"title\": \"string\",\n    \"text\": \"string\",\n    \"choices\": [{{\"id\":\"string\",\"label\":\"string\",\"intent\":\"string\",\"risk\":\"low|medium|high\",\"tags\":[\"string\"]}}],\n    \"npcs\": [{{\"name\":\"string\",\"role\":\"string\",\"isHostile\":false,\"sourceHistoryCharacterId\":\"optional string\",\"faction\":\"optional string\",\"lore\":\"optional string\"}}],\n    \"contextRefs\": [{{\"kind\":\"faction|location|ecology|history|character\",\"id\":\"string\",\"label\":\"string\"}}],\n    \"flags\": [\"string\"],\n    \"pendingCombat\": {{\"encounterLabel\":\"string\",\"stakes\":\"string\",\"enemyNpcNames\":[\"string\"]}}\n  }}\n}}",
        pretty(&payload.seed),
        pretty(&payload.party),
        pretty(&payload.gm_context),
        pretty(&payload.factions),
        pretty(&payload.locations),
        pretty(&payload.ecology),
        pretty(&payload.history_characters),
    )
}

fn build_advance_prompt(payload: &AdvanceQuestRequest) -> String {
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
- Use current history characters for NPCs when appropriate.\n\
\n\
Return raw JSON only. No markdown fences.\n\
Schema:\n\
{{\n  \"status\": \"active|completed|failed\",\n  \"lastOutcomeText\": \"string\",\n  \"endingSummary\": \"string optional\",\n  \"endingReached\": \"string optional\",\n  \"effectSummaries\": [\"string\"],\n  \"newFlags\": [\"string\"],\n  \"clearFlags\": [\"string\"],\n  \"partyUpdates\": [{{\n    \"characterId\": \"party character id or empty\",\n    \"characterName\": \"party character name\",\n    \"summary\": \"string\",\n    \"statChanges\": [{{\"target\":\"hp|maxHp|strength|agility|intelligence|wisdom|endurance|charisma\",\"value\":0}}],\n    \"addTraitNames\": [\"string\"],\n    \"removeTraitNames\": [\"string\"],\n    \"addItems\": [{{\"name\":\"string\",\"category\":\"weapon|armor|consumable|resource|junk\",\"rarity\":\"salvaged|reinforced|pre-ash|specialized|relic|ashmarked\",\"description\":\"string\"}}],\n    \"addSkills\": [{{\"name\":\"string\",\"description\":\"string\",\"category\":\"base|occupation|unique|equipment\"}}],\n    \"relationshipChanges\": [{{\"characterName\":\"string\",\"change\":0}}]\n  }}],\n  \"nextNode\": {{\n    \"kind\": \"scene|dialogue|decision|combat|ending\",\n    \"title\": \"string\",\n    \"text\": \"string\",\n    \"choices\": [{{\"id\":\"string\",\"label\":\"string\",\"intent\":\"string\",\"risk\":\"low|medium|high\",\"tags\":[\"string\"]}}],\n    \"npcs\": [{{\"name\":\"string\",\"role\":\"string\",\"isHostile\":false,\"sourceHistoryCharacterId\":\"optional string\",\"faction\":\"optional string\",\"lore\":\"optional string\"}}],\n    \"contextRefs\": [{{\"kind\":\"faction|location|ecology|history|character\",\"id\":\"string\",\"label\":\"string\"}}],\n    \"flags\": [\"string\"],\n    \"endingId\": \"string optional\",\n    \"pendingCombat\": {{\"encounterLabel\":\"string\",\"stakes\":\"string\",\"enemyNpcNames\":[\"string\"]}}\n  }}\n}}",
        pretty(&payload.run),
        pretty(&payload.party),
        pretty(&payload.gm_context),
        pretty(&payload.factions),
        pretty(&payload.locations),
        pretty(&payload.ecology),
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
        vec!["Scarcity".to_string(), "Loyalty".to_string(), "Violence".to_string()]
    });
    let likely_npc_roles = take_string_array(arc.get("likelyNpcRoles"), 3, || {
        vec!["Witness".to_string(), "Broker".to_string(), "Hunter".to_string()]
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
    let kind = raw
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("decision");
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
    if kind != "ending" && choices.len() < 4 {
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
    party.as_array()
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
            if let Some(faction) = factions
                .as_array()
                .and_then(|items| items.iter().find(|item| item.get("id").and_then(Value::as_str) == Some(id)))
            {
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
            if let Some(location) = locations
                .as_array()
                .and_then(|items| items.iter().find(|item| item.get("id").and_then(Value::as_str) == Some(id)))
            {
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
            if let Some(option) = ecology
                .get("options")
                .and_then(Value::as_array)
                .and_then(|items| items.iter().find(|item| item.get("id").and_then(Value::as_str) == Some(id)))
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

fn materialize_node_characters(
    run_id: &str,
    world_id: &str,
    node: &Value,
    history_characters: &Value,
    seed: &Value,
) -> Result<(Vec<Value>, Vec<Value>, Vec<Value>, Vec<String>), (StatusCode, String)> {
    let mut warnings = Vec::new();
    let mut materialized = Vec::new();
    let mut npc_entries = Vec::new();
    let mut enemy_ids = Vec::new();
    let combat_enemy_names = node
        .get("pendingCombat")
        .and_then(|pending| pending.get("enemyNpcNames"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(|item| item.to_lowercase()))
        .collect::<Vec<_>>();

    let existing_characters = load_existing_builder_characters();
    let history_list = history_characters
        .as_array()
        .cloned()
        .unwrap_or_default();
    let difficulty = seed
        .get("difficulty")
        .and_then(Value::as_str)
        .unwrap_or("medium");

    for npc in node
        .get("npcs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let npc_name = npc
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Unknown Figure")
            .to_string();
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

        let existing = find_reusable_npc(&existing_characters, world_id, hinted_source_id.as_deref(), &npc_name);
        let character_value = if let Some(existing_character) = existing {
            existing_character.clone()
        } else {
            let generated = build_materialized_character(
                run_id,
                world_id,
                &npc,
                matched_history,
                difficulty,
            );
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
        let is_hostile = npc
            .get("isHostile")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if is_hostile || combat_enemy_names.iter().any(|name| name == &npc_name.to_lowercase()) {
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
        .or_else(|| history_character.and_then(|entry| entry.get("affiliation").and_then(Value::as_str)))
        .unwrap_or("");
    let (base_stat, level) = match difficulty {
        "low" => (3, 1),
        "high" => (6, 4),
        "deadly" => (8, 6),
        _ => (4, 2),
    };
    let endurance = base_stat + if npc_hint.get("isHostile").and_then(Value::as_bool).unwrap_or(false) { 1 } else { 0 };
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
            && character.get("isNPC").and_then(Value::as_bool).unwrap_or(false)
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
    fs::write(path, serde_json::to_string_pretty(character).unwrap_or_else(|_| "{}".to_string()))
}

fn builder_characters_dir() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("generated")
        .join("characters")
}

fn normalize_party_updates(raw_updates: Option<&Value>, party: &Value, effect_summaries: Vec<Value>) -> Vec<Value> {
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

fn log_entry(kind: &str, title: &str, text: &str, effects: Vec<String>, node_id: Option<String>) -> Value {
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
    })
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
