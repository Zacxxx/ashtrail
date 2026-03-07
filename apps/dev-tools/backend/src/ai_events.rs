use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use crate::gemini::generate_text;

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

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateEventRequest {
    pub character_stats: Stats,
    pub character_traits: Vec<Trait>,
    pub character_alignment: Option<String>,
    pub context: String,
    pub event_type: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateEventResponse {
    pub raw_json: String,
}

pub async fn generate_event_handler(
    Json(payload): Json<GenerateEventRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let traits_list: Vec<String> = payload.character_traits.iter().map(|t| t.name.clone()).collect();
    
    let prompt = format!(
        "You are an AI Game Master for an RPG. Generate a dynamic event.
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
    
    // Clean up potential markdown formatting from Gemini
    let cleaned = generated_text
        .trim()
        .strip_prefix("```json")
        .unwrap_or(&generated_text)
        .strip_suffix("```")
        .unwrap_or(&generated_text)
        .trim()
        .to_string();

    Ok(Json(GenerateEventResponse {
        raw_json: cleaned,
    }))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEventRequest {
    pub character_stats: Stats, 
    pub character_traits: Vec<Trait>,
    pub character_alignment: Option<String>,
    pub event_description: String,
    pub chosen_action: String, // Can be one of the choices OR a custom string
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEventResponse {
    pub raw_json: String,
}

pub async fn resolve_event_handler(
    Json(payload): Json<ResolveEventRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let traits_list: Vec<String> = payload.character_traits.iter().map(|t| t.name.clone()).collect();
    
    let prompt = format!(
        "You are an AI Game Master. Resolve the outcome of the player's action.
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
  \"starts_combat\": \"boolean\",
  \"starts_quest\": \"boolean\"
}}",
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

    Ok(Json(ResolveEventResponse {
        raw_json: cleaned,
    }))
}
