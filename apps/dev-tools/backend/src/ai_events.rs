use crate::gemini::generate_text;
use crate::{build_text_output_ref, make_job_record, parse_tracked_job_meta, AppState};
use crate::jobs::{now_ms, JobStatus};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tracing::info;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub strength: i32,
    pub agility: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub endurance: i32,
    pub charisma: i32,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Trait {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GmContextPayload {
    pub world_id: String,
    pub prompt_block: String,
    pub source_summary: serde_json::Value,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateEventRequest {
    pub character_stats: Stats,
    pub character_traits: Vec<Trait>,
    pub character_alignment: Option<String>,
    pub context: String,
    pub event_type: String,
    pub gm_context: Option<GmContextPayload>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateEventResponse {
    pub raw_json: String,
}

fn job_store_lock_error() -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "job store lock poisoned".to_string(),
    )
}

fn finish_tracked_event_job(
    jobs: &Arc<Mutex<std::collections::HashMap<String, crate::jobs::JobRecord>>>,
    job_id: &str,
    result: serde_json::Value,
    output_label: &str,
    summary: &str,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = JobStatus::Completed;
            job.progress = 100.0;
            job.current_stage = "Completed".to_string();
            job.result = Some(result);
            job.output_refs = vec![build_text_output_ref(output_label, summary)];
            job.updated_at = now_ms();
        }
    }
}

fn fail_tracked_event_job(
    jobs: &Arc<Mutex<std::collections::HashMap<String, crate::jobs::JobRecord>>>,
    job_id: &str,
    message: String,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = JobStatus::Failed;
            job.progress = 100.0;
            job.current_stage = "Failed".to_string();
            job.error = Some(message);
            job.updated_at = now_ms();
        }
    }
}

async fn execute_generate_event(
    payload: GenerateEventRequest,
) -> Result<GenerateEventResponse, (StatusCode, String)> {
    let traits_list: Vec<String> = payload
        .character_traits
        .iter()
        .map(|t| t.name.clone())
        .collect();
    let gm_context_block = payload.gm_context.as_ref().map(|ctx| format!(
        "World Canon Context for {}:\n{}\n\nTreat this as ambience and canon constraints. Generated events must fit it and must not rewrite it.\n",
        ctx.world_id, ctx.prompt_block
    )).unwrap_or_default();

    let prompt = format!(
        "You are an AI Game Master for an RPG. Generate a dynamic event.
{}
Context: {}
Event Type: {}

Character Attributes:
Alignment: {}
Traits: {}
Stats: STR: {}, AGI: {}, INT: {}, WIS: {}, END: {}, CHA: {}

Important Rule: 
The generated 4 choices MUST be deeply influenced by the character's stats, traits, and alignment.
If their intelligence is low, options should be simple. If charisma is high, diplomatic options should be available.
Make Choice 1 & 2 align with their core traits.
Make Choice 3 neutral/diplomatic.
Make Choice 4 a wildcard or against their nature.

Output strictly in JSON format matching this schema:
{{
  \"title\": \"string, thematic title\",
  \"description\": \"string, narrative text of the event\",
  \"choices\": [
    {{
      \"id\": \"choice_1\",
      \"text\": \"string, description of the choice\",
      \"trait_affinity\": \"string, e.g. 'Greedy' or null\",
      \"stat_affinity\": \"string, e.g. 'charisma' or null\"
    }}
  ]
}}",
        gm_context_block,
        payload.context,
        payload.event_type,
        payload.character_alignment.unwrap_or_else(|| "Neutral".to_string()),
        traits_list.join(", "),
        payload.character_stats.strength,
        payload.character_stats.agility,
        payload.character_stats.intelligence,
        payload.character_stats.wisdom,
        payload.character_stats.endurance,
        payload.character_stats.charisma,
    );

    info!("Generating event: {}", payload.context);
    let generated_text = generate_text(&prompt).await?;
    let cleaned = generated_text
        .trim()
        .strip_prefix("```json")
        .unwrap_or(&generated_text)
        .strip_suffix("```")
        .unwrap_or(&generated_text)
        .trim()
        .to_string();

    Ok(GenerateEventResponse { raw_json: cleaned })
}

pub async fn generate_event_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GenerateEventRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = uuid::Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| job_store_lock_error())?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("events.generate"),
                meta.title.as_deref().unwrap_or("Generate Event"),
                meta.tool.as_deref().unwrap_or("gameplay-engine"),
                "Queued",
                meta.metadata.as_ref().and_then(|m| m.get("worldId")).and_then(serde_json::Value::as_str).map(str::to_string),
                None,
            );
            if meta.restore.is_some() || meta.metadata.is_some() {
                let mut metadata = serde_json::Map::new();
                if let Some(restore) = meta.restore {
                    metadata.insert("restore".to_string(), restore);
                }
                if let Some(extra) = meta.metadata {
                    metadata.insert("metadata".to_string(), extra);
                }
                job.metadata = Some(serde_json::Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }
        let jobs = state.jobs.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = 25.0;
                    job.current_stage = "Generating event".to_string();
                    job.updated_at = now_ms();
                }
            }
            match execute_generate_event(payload).await {
                Ok(response) => finish_tracked_event_job(
                    &jobs,
                    &spawned_job_id,
                    json!({ "rawJson": response.raw_json }),
                    "Generated Event",
                    &response.raw_json,
                ),
                Err((_status, message)) => fail_tracked_event_job(&jobs, &spawned_job_id, message),
            }
        });
        return Ok((StatusCode::ACCEPTED, Json(json!({ "jobId": job_id }))).into_response());
    }
    Ok(Json(execute_generate_event(payload).await?).into_response())
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEventRequest {
    pub character_stats: Stats,
    pub character_traits: Vec<Trait>,
    pub character_alignment: Option<String>,
    pub event_description: String,
    pub chosen_action: String, // Can be one of the choices OR a custom string
    pub gm_context: Option<GmContextPayload>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEventResponse {
    pub raw_json: String,
}

async fn execute_resolve_event(
    payload: ResolveEventRequest,
) -> Result<ResolveEventResponse, (StatusCode, String)> {
    let traits_list: Vec<String> = payload
        .character_traits
        .iter()
        .map(|t| t.name.clone())
        .collect();
    let gm_context_block = payload.gm_context.as_ref().map(|ctx| format!(
        "World Canon Context for {}:\n{}\n\nUse this as ambient canon while resolving the outcome. Do not contradict or rewrite established lore.\n",
        ctx.world_id, ctx.prompt_block
    )).unwrap_or_default();

    let prompt = format!(
        "You are an AI Game Master. Resolve the outcome of the player's action.
{}
Event Context: {}

Character Attributes:
Alignment: {}
Traits: {}
Stats: STR: {}, AGI: {}, INT: {}, WIS: {}, END: {}, CHA: {}

Player's Action: {}

Output strictly in JSON format matching this schema:
{{
  \"resolution_text\": \"string, what happens as a result\",
  \"stat_changes\": [
    {{
      \"target\": \"string (e.g., 'hp', 'maxHp', 'food', 'water')\",
      \"value\": \"number (positive or negative)\"
    }}
  ],
  \"new_traits\": [\"string (names of traits gained)\"],
  \"removed_traits\": [\"string (names of traits lost)\"],
  \"loot\": [
    {{
      \"name\": \"string (name of item)\",
      \"category\": \"string (weapon, armor, consumable, resource, junk)\",
      \"rarity\": \"string (salvaged, reinforced, pre-ash, specialized, relic, ashmarked)\",
      \"description\": \"string (brief flavor text)\"
    }}
  ],
  \"new_skills\": [
    {{
      \"name\": \"string\",
      \"description\": \"string\",
      \"category\": \"string (base, physical, magical, utility)\"
    }}
  ],
  \"relationship_changes\": [
    {{
      \"character_name\": \"string (name of the character involved)\",
      \"change\": \"number (positive or negative, e.g. 10 or -5)\"
    }}
  ],
  \"starts_combat\": \"boolean\",
  \"starts_quest\": \"boolean\"
}}",
        gm_context_block,
        payload.event_description,
        payload.character_alignment.unwrap_or_else(|| "Neutral".to_string()),
        traits_list.join(", "),
        payload.character_stats.strength,
        payload.character_stats.agility,
        payload.character_stats.intelligence,
        payload.character_stats.wisdom,
        payload.character_stats.endurance,
        payload.character_stats.charisma,
        payload.chosen_action
    );
    let generated_text = generate_text(&prompt).await?;
    let cleaned = generated_text
        .trim()
        .strip_prefix("```json")
        .unwrap_or(&generated_text)
        .strip_suffix("```")
        .unwrap_or(&generated_text)
        .trim()
        .to_string();
    Ok(ResolveEventResponse { raw_json: cleaned })
}

pub async fn resolve_event_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ResolveEventRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = uuid::Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| job_store_lock_error())?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("events.resolve"),
                meta.title.as_deref().unwrap_or("Resolve Event"),
                meta.tool.as_deref().unwrap_or("gameplay-engine"),
                "Queued",
                meta.metadata.as_ref().and_then(|m| m.get("worldId")).and_then(serde_json::Value::as_str).map(str::to_string),
                None,
            );
            if meta.restore.is_some() || meta.metadata.is_some() {
                let mut metadata = serde_json::Map::new();
                if let Some(restore) = meta.restore {
                    metadata.insert("restore".to_string(), restore);
                }
                if let Some(extra) = meta.metadata {
                    metadata.insert("metadata".to_string(), extra);
                }
                job.metadata = Some(serde_json::Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }
        let jobs = state.jobs.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = 25.0;
                    job.current_stage = "Resolving event".to_string();
                    job.updated_at = now_ms();
                }
            }
            match execute_resolve_event(payload).await {
                Ok(response) => finish_tracked_event_job(
                    &jobs,
                    &spawned_job_id,
                    json!({ "rawJson": response.raw_json }),
                    "Resolved Outcome",
                    &response.raw_json,
                ),
                Err((_status, message)) => fail_tracked_event_job(&jobs, &spawned_job_id, message),
            }
        });
        return Ok((StatusCode::ACCEPTED, Json(json!({ "jobId": job_id }))).into_response());
    }
    Ok(Json(execute_resolve_event(payload).await?).into_response())
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RethinkEventRequest {
    pub character_stats: Stats,
    pub character_traits: Vec<Trait>,
    pub character_alignment: Option<String>,
    pub event_description: String,
    pub gm_context: Option<GmContextPayload>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RethinkEventResponse {
    pub raw_json: String,
}

async fn execute_rethink_event(
    payload: RethinkEventRequest,
) -> Result<RethinkEventResponse, (StatusCode, String)> {
    let traits_list: Vec<String> = payload
        .character_traits
        .iter()
        .map(|t| t.name.clone())
        .collect();
    let gm_context_block = payload.gm_context.as_ref().map(|ctx| format!(
        "World Canon Context for {}:\n{}\n\nUse this as ambience and constraint while generating alternative choices.\n",
        ctx.world_id, ctx.prompt_block
    )).unwrap_or_default();

    let prompt = format!(
        "You are an AI Game Master for an RPG. The player has encountered the following event:
{}
{}

The player has used their 'THINK' action. Based strictly on their mental stats (INT, WIS, CHA) and traits, generate 4 NEW alternative choices for this event.
Do NOT re-write the event description. ONLY provide the 4 choices.

Character Attributes:
Alignment: {}
Traits: {}
Stats: STR: {}, AGI: {}, INT: {}, WIS: {}, END: {}, CHA: {}

Output strictly in JSON format matching this schema:
{{
  \"choices\": [
    {{
      \"id\": \"choice_1\",
      \"text\": \"string, description of the alternative choice\",
      \"trait_affinity\": \"string, e.g. 'Paranoid' or null\",
      \"stat_affinity\": \"string, e.g. 'intelligence' or null\"
    }}
  ]
}}",
        gm_context_block,
        payload.event_description,
        payload.character_alignment.unwrap_or_else(|| "Neutral".to_string()),
        traits_list.join(", "),
        payload.character_stats.strength,
        payload.character_stats.agility,
        payload.character_stats.intelligence,
        payload.character_stats.wisdom,
        payload.character_stats.endurance,
        payload.character_stats.charisma,
    );

    let generated_text = generate_text(&prompt).await?;
    let cleaned = generated_text
        .trim()
        .strip_prefix("```json")
        .unwrap_or(&generated_text)
        .strip_suffix("```")
        .unwrap_or(&generated_text)
        .trim()
        .to_string();

    Ok(RethinkEventResponse { raw_json: cleaned })
}

pub async fn rethink_event_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RethinkEventRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = uuid::Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| job_store_lock_error())?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("events.rethink"),
                meta.title.as_deref().unwrap_or("Rethink Event"),
                meta.tool.as_deref().unwrap_or("gameplay-engine"),
                "Queued",
                meta.metadata.as_ref().and_then(|m| m.get("worldId")).and_then(serde_json::Value::as_str).map(str::to_string),
                None,
            );
            if meta.restore.is_some() || meta.metadata.is_some() {
                let mut metadata = serde_json::Map::new();
                if let Some(restore) = meta.restore {
                    metadata.insert("restore".to_string(), restore);
                }
                if let Some(extra) = meta.metadata {
                    metadata.insert("metadata".to_string(), extra);
                }
                job.metadata = Some(serde_json::Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }
        let jobs = state.jobs.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.status = JobStatus::Running;
                    job.progress = 25.0;
                    job.current_stage = "Rethinking choices".to_string();
                    job.updated_at = now_ms();
                }
            }
            match execute_rethink_event(payload).await {
                Ok(response) => finish_tracked_event_job(
                    &jobs,
                    &spawned_job_id,
                    json!({ "rawJson": response.raw_json }),
                    "Rethought Choices",
                    &response.raw_json,
                ),
                Err((_status, message)) => fail_tracked_event_job(&jobs, &spawned_job_id, message),
            }
        });
        return Ok((StatusCode::ACCEPTED, Json(json!({ "jobId": job_id }))).into_response());
    }
    Ok(Json(execute_rethink_event(payload).await?).into_response())
}
