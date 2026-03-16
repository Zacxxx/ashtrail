use crate::gemini;
use crate::jobs::JobStatus;
use crate::{build_text_output_ref, make_job_record, parse_tracked_job_meta, AppState};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCharacterRequest {
    pub count: u32,
    pub prompt: String,
    pub world_lore: Option<String>,
    pub faction: Option<String>,
    pub location: Option<String>,
    pub character_type: String,
    pub variance: CharacterVariance,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterVariance {
    pub sex: String, // "Male", "Female", "Any"
    pub min_level: u32,
    pub max_level: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCharacterResponse {
    pub raw_json: String,
}

fn finish_tracked_character_job(
    jobs: &Arc<Mutex<std::collections::HashMap<String, crate::jobs::JobRecord>>>,
    job_id: &str,
    result: Value,
    output_label: &str,
    summary: &str,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.transition(JobStatus::Completed, 100.0, "Completed".to_string());
            job.result = Some(result);
            job.output_refs = vec![build_text_output_ref(output_label, summary)];
        }
    }
}

fn fail_tracked_character_job(
    jobs: &Arc<Mutex<std::collections::HashMap<String, crate::jobs::JobRecord>>>,
    job_id: &str,
    message: String,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.transition(JobStatus::Failed, 100.0, "Failed".to_string());
            job.error = Some(message);
        }
    }
}

fn extract_character_preview(raw_json: &str) -> String {
    serde_json::from_str::<Value>(raw_json)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .map(|entries| {
            let names = entries
                .iter()
                .filter_map(|entry| entry.get("name").and_then(Value::as_str))
                .take(3)
                .collect::<Vec<_>>();
            if names.is_empty() {
                format!("Generated {} characters.", entries.len())
            } else {
                format!(
                    "Generated {} characters: {}",
                    entries.len(),
                    names.join(", ")
                )
            }
        })
        .unwrap_or_else(|| raw_json.chars().take(220).collect())
}

async fn execute_generate_characters(
    req: GenerateCharacterRequest,
) -> Result<GenerateCharacterResponse, (StatusCode, String)> {
    let mut prompt = String::new();
    prompt.push_str(&format!("You are an expert game designer creating {} unique characters for a dark fantasy post-apocalyptic roleplaying game.\n", req.count));
    prompt.push_str("Each character must be returned in a JSON array of objects. ");
    prompt.push_str("DO NOT return markdown codeblocks, just the raw JSON array.\n\n");

    prompt.push_str(&format!(
        "Base Character Type/Species: {}\n",
        req.character_type
    ));
    prompt.push_str(&format!("General Concept/Direction: {}\n", req.prompt));

    if let Some(lore) = &req.world_lore {
        if !lore.is_empty() {
            prompt.push_str(&format!("World Context:\n{}\n", lore));
        }
    }

    if let Some(fac) = &req.faction {
        if !fac.is_empty() {
            prompt.push_str(&format!("Faction constraint: {}\n", fac));
        }
    }

    if let Some(loc) = &req.location {
        if !loc.is_empty() {
            prompt.push_str(&format!("Location constraint: {}\n", loc));
        }
    }

    prompt.push_str(&format!(
        "Level range: {} to {}\n",
        req.variance.min_level, req.variance.max_level
    ));
    prompt.push_str(&format!("Sex/Gender parameter: {}\n", req.variance.sex));

    prompt.push_str(r#"
Required JSON object structure for each character:
{
  "name": "string (first and last name if appropriate)",
  "age": number (realistic for the species),
  "gender": "string (Male/Female/Other)",
  "level": number (within requested range),
  "stats": {
    "strength": number (1-20),
    "agility": number (1-20),
    "intelligence": number (1-20),
    "wisdom": number (1-20),
    "endurance": number (1-20),
    "charisma": number (1-20)
  },
  "history": "string (2-3 paragraphs of rich backstory tying into the world lore)",
  "backstory": "string (1 brief paragraph describing their current situation)",
  "traitNames": ["string", "string"] (list of 1 to 3 trait names that fit their personality, e.g. "Greedy", "Brave"),
  "occupationName": "string" (a short title for their job/role, e.g. "Scavenger", "Guard Captain")
}

Make sure to balance the stats roughly around the character's level. A level 1 character might have stats averaging 3-4, while a level 10 character might average 8-10.
Keep 'history' and 'backstory' detailed and flavorful.
    "#);

    let text = gemini::generate_text(&prompt).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Gemini API error: {:?}", e),
        )
    })?;

    let mut clean_text = text.trim().to_string();
    if clean_text.starts_with("```json") {
        clean_text = clean_text.trim_start_matches("```json").to_string();
    } else if clean_text.starts_with("```") {
        clean_text = clean_text.trim_start_matches("```").to_string();
    }
    if clean_text.ends_with("```") {
        clean_text = clean_text.trim_end_matches("```").to_string();
    }
    Ok(GenerateCharacterResponse {
        raw_json: clean_text.trim().to_string(),
    })
}

pub async fn generate_character_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<GenerateCharacterRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = uuid::Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "job store lock poisoned".to_string(),
                )
            })?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("characters.generate"),
                meta.title.as_deref().unwrap_or("Generate Characters"),
                meta.tool.as_deref().unwrap_or("character-builder"),
                "Queued",
                meta.metadata
                    .as_ref()
                    .and_then(|m| m.get("worldId"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
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
                job.metadata = Some(Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }
        let jobs = state.jobs.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.transition(
                        JobStatus::Running,
                        25.0,
                        "Generating characters".to_string(),
                    );
                }
            }
            match execute_generate_characters(req).await {
                Ok(response) => {
                    let preview = extract_character_preview(&response.raw_json);
                    finish_tracked_character_job(
                        &jobs,
                        &spawned_job_id,
                        json!({ "rawJson": response.raw_json }),
                        "Generated Characters",
                        &preview,
                    );
                }
                Err((_status, message)) => {
                    fail_tracked_character_job(&jobs, &spawned_job_id, message)
                }
            }
        });
        return Ok((StatusCode::ACCEPTED, Json(json!({ "jobId": job_id }))).into_response());
    }
    Ok(Json(execute_generate_characters(req).await?).into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub target_name: String,
    pub rel_type: String,
    pub is_player: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateStoryRequest {
    pub name: String,
    pub age: u32,
    pub gender: String,
    pub occupation: String,
    pub draft: String,
    pub relationships: Option<Vec<Relationship>>,
    pub world_lore: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateStoryResponse {
    pub story: String,
}

async fn execute_generate_story(
    req: GenerateStoryRequest,
) -> Result<GenerateStoryResponse, (StatusCode, String)> {
    let mut prompt = String::new();
    prompt.push_str("ASHTRAIL HISTORIAN PROTOCOL: You are the narrator of a dark, gritty sci-fi/fantasy post-apocalyptic world.\n");
    prompt.push_str(&format!("Generate a detailed, evocative 5-paragraph character story for: {}, Age: {}, Gender: {}, current Occupation: {}.\n\n",
        req.name, req.age, req.gender, req.occupation));

    if !req.draft.is_empty() {
        prompt.push_str(&format!(
            "User's provided backstory draft / context:\n{}\n\n",
            req.draft
        ));
    }

    if let Some(rels) = &req.relationships {
        if !rels.is_empty() {
            prompt.push_str("SOCIAL TIES & RELATIONSHIPS:\n");
            for r in rels {
                let player_tag = if r.is_player {
                    " [MAIN PROTAGONIST / PLAYER CHARACTER]"
                } else {
                    ""
                };
                prompt.push_str(&format!(
                    "- {}: {} {}\n",
                    r.target_name, r.rel_type, player_tag
                ));
            }
            prompt.push_str("\nRELATIONSHIP DIRECTIVE:\n");
            prompt.push_str("Characters marked as [MAIN PROTAGONIST / PLAYER CHARACTER] are CRITICAL. You MUST weave them into the narrative as active partners, rivals, or anchors. Their destiny is intertwined with the subject. Avoid generic 'lone wolf' tropes if these bonds exist; focus on shared survival or deep-rooted history.\n\n");
        }
    }

    if let Some(lore) = &req.world_lore {
        if !lore.is_empty() {
            prompt.push_str(&format!(
                "Current World Context (Synchronize with this era):\n{}\n\n",
                lore
            ));
        }
    }

    prompt.push_str("CHRONOLOGICAL REQUIREMENTS (One paragraph for each phase):\n");
    prompt.push_str("1. ORIGINE: Life in the Old World before the heavens suffocated under the Great Fog. Focus on their previous situation or dreams.\n");
    prompt.push_str("2. LA CHUTE: The terrifying transition as the horizon vanished and the sun became a dying ember. The moment civilization broke.\n");
    prompt.push_str("3. SURVIE: The immediate struggle to survive the resource wars and the descent into the deep vaults or the shadows of the ruins.\n");
    prompt.push_str("4. ADAPTATION: The long years of hardening inside the structural shells or the wastes. How they became what they are now.\n");
    prompt.push_str("5. ÉTAT ACTUEL: Their current standing in the City-States or the Ash-Trail. Why they are starting their journey today as a survivor.\n\n");

    prompt.push_str("TONE: Objective but dramatic, emphasizing consequences and power dynamics. Avoid moralizing; focus on survival math.\n");
    prompt.push_str("Return ONLY the story text. No markdown blocks, no titles, just formatting with double newlines between paragraphs.");

    let text = gemini::generate_text(&prompt).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Gemini API error: {:?}", e),
        )
    })?;

    Ok(GenerateStoryResponse {
        story: text.trim().to_string(),
    })
}

pub async fn generate_story_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<GenerateStoryRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Some(meta) = parse_tracked_job_meta(&headers) {
        let job_id = uuid::Uuid::new_v4().to_string();
        {
            let mut jobs = state.jobs.lock().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "job store lock poisoned".to_string(),
                )
            })?;
            let mut job = make_job_record(
                meta.kind.as_deref().unwrap_or("characters.story"),
                meta.title.as_deref().unwrap_or("Generate Character Story"),
                meta.tool.as_deref().unwrap_or("character-builder"),
                "Queued",
                meta.metadata
                    .as_ref()
                    .and_then(|m| m.get("worldId"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
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
                job.metadata = Some(Value::Object(metadata));
            }
            jobs.insert(job_id.clone(), job);
        }
        let jobs = state.jobs.clone();
        let spawned_job_id = job_id.clone();
        tokio::spawn(async move {
            if let Ok(mut map) = jobs.lock() {
                if let Some(job) = map.get_mut(&spawned_job_id) {
                    job.transition(JobStatus::Running, 25.0, "Generating story".to_string());
                }
            }
            match execute_generate_story(req).await {
                Ok(response) => finish_tracked_character_job(
                    &jobs,
                    &spawned_job_id,
                    json!({ "story": response.story }),
                    "Character Story",
                    &response.story,
                ),
                Err((_status, message)) => {
                    fail_tracked_character_job(&jobs, &spawned_job_id, message)
                }
            }
        });
        return Ok((StatusCode::ACCEPTED, Json(json!({ "jobId": job_id }))).into_response());
    }
    Ok(Json(execute_generate_story(req).await?).into_response())
}
