use axum::{Json, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::gemini;

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

pub async fn generate_character_handler(
    Json(req): Json<GenerateCharacterRequest>,
) -> Result<Json<GenerateCharacterResponse>, (StatusCode, String)> {
    let mut prompt = String::new();
    prompt.push_str(&format!("You are an expert game designer creating {} unique characters for a dark fantasy post-apocalyptic roleplaying game.\n", req.count));
    prompt.push_str("Each character must be returned in a JSON array of objects. ");
    prompt.push_str("DO NOT return markdown codeblocks, just the raw JSON array.\n\n");
    
    prompt.push_str(&format!("Base Character Type/Species: {}\n", req.character_type));
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
    
    prompt.push_str(&format!("Level range: {} to {}\n", req.variance.min_level, req.variance.max_level));
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
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Gemini API error: {:?}", e))
    })?;

    // Optionally cleanup markdown fences
    let mut clean_text = text.trim().to_string();
    if clean_text.starts_with("```json") {
        clean_text = clean_text.trim_start_matches("```json").to_string();
    } else if clean_text.starts_with("```") {
        clean_text = clean_text.trim_start_matches("```").to_string();
    }
    if clean_text.ends_with("```") {
        clean_text = clean_text.trim_end_matches("```").to_string();
    }
    let clean_text = clean_text.trim().to_string();

    Ok(Json(GenerateCharacterResponse {
        raw_json: clean_text,
    }))
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

pub async fn generate_story_handler(
    Json(req): Json<GenerateStoryRequest>,
) -> Result<Json<GenerateStoryResponse>, (StatusCode, String)> {
    let mut prompt = String::new();
    prompt.push_str("ASHTRAIL HISTORIAN PROTOCOL: You are the narrator of a dark, gritty sci-fi/fantasy post-apocalyptic world.\n");
    prompt.push_str(&format!("Generate a detailed, evocative 5-paragraph character story for: {}, Age: {}, Gender: {}, current Occupation: {}.\n\n", 
        req.name, req.age, req.gender, req.occupation));
        
    if !req.draft.is_empty() {
        prompt.push_str(&format!("User's provided backstory draft / context:\n{}\n\n", req.draft));
    }
    
    if let Some(rels) = &req.relationships {
        if !rels.is_empty() {
            prompt.push_str("SOCIAL TIES & RELATIONSHIPS:\n");
            for r in rels {
                let player_tag = if r.is_player { " [MAIN PROTAGONIST / PLAYER CHARACTER]" } else { "" };
                prompt.push_str(&format!("- {}: {} {}\n", r.target_name, r.rel_type, player_tag));
            }
            prompt.push_str("\nRELATIONSHIP DIRECTIVE:\n");
            prompt.push_str("Characters marked as [MAIN PROTAGONIST / PLAYER CHARACTER] are CRITICAL. You MUST weave them into the narrative as active partners, rivals, or anchors. Their destiny is intertwined with the subject. Avoid generic 'lone wolf' tropes if these bonds exist; focus on shared survival or deep-rooted history.\n\n");
        }
    }

    if let Some(lore) = &req.world_lore {
        if !lore.is_empty() {
            prompt.push_str(&format!("Current World Context (Synchronize with this era):\n{}\n\n", lore));
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
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Gemini API error: {:?}", e))
    })?;

    Ok(Json(GenerateStoryResponse {
        story: text.trim().to_string(),
    }))
}
