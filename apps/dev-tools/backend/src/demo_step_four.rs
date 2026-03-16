use std::{
    fs,
    path::{Path, PathBuf},
};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{ai_quests, demo_output, demo_step_three, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepFourArtifactQuery {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    #[serde(default)]
    pub hero: Option<String>,
    #[serde(default)]
    pub location_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDemoStepFourArtifact {
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world_id: Option<String>,
    pub world_title: String,
    pub location_id: String,
    pub location_title: String,
    pub quest_title: String,
    pub quest_description: String,
    pub quest_objectives: Vec<String>,
    pub quest_rewards: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quest_run_id: Option<String>,
}

fn normalize_demo_hero_variant(value: Option<&str>) -> &'static str {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("jane") => "jane",
        _ => "john",
    }
}

fn demo_step_four_run_root(state: &AppState, step_one_job_id: Option<&str>) -> PathBuf {
    let run_id = if state.demo_step_one_use_pregenerated {
        state.demo_step_one_pregenerated_folder.clone()
    } else {
        step_one_job_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("live")
            .to_string()
    };
    state.demo_output_dir.join(run_id).join("step-4")
}

pub fn demo_step_four_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
    location_id: Option<&str>,
) -> PathBuf {
    let normalized_location = location_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default-location");
    
    demo_step_four_run_root(state, step_one_job_id)
        .join(normalize_demo_hero_variant(hero_variant))
        .join(normalized_location)
}

pub fn load_persisted_demo_step_four_artifact(
    state: &AppState,
    query: &DemoStepFourArtifactQuery,
) -> Result<PersistedDemoStepFourArtifact, (StatusCode, String)> {
    let output_root = demo_step_four_output_root(
        state,
        query.step_one_job_id.as_deref(),
        query.hero.as_deref(),
        query.location_id.as_deref(),
    );
    let envelope = demo_output::load_demo_artifact::<PersistedDemoStepFourArtifact>(&output_root)
        .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    Ok(envelope.artifact)
}

pub fn save_demo_step_four_artifact(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: &str,
    location_id: &str,
    artifact: &PersistedDemoStepFourArtifact,
) -> Result<(), (StatusCode, String)> {
    let output_root = demo_step_four_output_root(
        state,
        step_one_job_id,
        Some(hero_variant),
        Some(location_id),
    );
    
    fs::create_dir_all(&output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 4 directory: {error}"),
        )
    })?;

    let run_id = output_root
        .parent()
        .and_then(|value| value.parent())
        .and_then(|value| value.parent())
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("live")
        .to_string();

    let envelope = demo_output::DemoStoredArtifactEnvelope {
        envelope_type: "demo_step_artifact".to_string(),
        step: 4,
        phase: Some("quest_initialization".to_string()),
        run_id,
        source: if state.demo_step_one_use_pregenerated {
            "pregenerated".to_string()
        } else {
            "live".to_string()
        },
        created_at: demo_output::now_created_at(),
        artifact: artifact.clone(),
        transcript: None,
        context: Some(json!({
            "stepFourFolder": format!(
                "generated/demo-output/{}/step-4/{}/{}",
                step_one_job_id
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(if state.demo_step_one_use_pregenerated {
                        state.demo_step_one_pregenerated_folder.as_str()
                    } else {
                        "live"
                    }),
                normalize_demo_hero_variant(Some(hero_variant)),
                location_id,
            ),
            "locationId": location_id,
        })),
    };

    demo_output::persist_demo_artifact(&output_root, &envelope)
        .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;

    Ok(())
}

pub async fn initialize_demo_step_four_quest(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: &str,
    location_id: &str,
    location_title: &str,
    world_title: &str,
) -> Result<PersistedDemoStepFourArtifact, (StatusCode, String)> {
    // Try to load existing artifact first
    let query = DemoStepFourArtifactQuery {
        step_one_job_id: step_one_job_id.map(String::from),
        hero: Some(hero_variant.to_string()),
        location_id: Some(location_id.to_string()),
    };

    if let Ok(existing) = load_persisted_demo_step_four_artifact(state, &query) {
        return Ok(existing);
    }

    // Load step 3 context to get hero name and world context
    let step_three_artifact = demo_step_three::load_persisted_demo_step_three_artifact(
        state,
        &demo_step_three::DemoStepThreeArtifactQuery {
            step_one_job_id: step_one_job_id.map(String::from),
            hero: Some(hero_variant.to_string()),
            node_id: Some(location_id.to_string()),
        },
    )
    .ok();

    let hero_name = step_three_artifact
        .as_ref()
        .map(|a| a.hero_name.clone())
        .unwrap_or_else(|| "Traveler".to_string());

    // Use demo-specific world ID based on step one job ID
    let world_id = step_three_artifact
        .as_ref()
        .and_then(|a| a.world_id.clone())
        .unwrap_or_else(|| {
            step_one_job_id
                .filter(|id| !id.trim().is_empty())
                .map(|id| format!("demo-{}", id))
                .unwrap_or_else(|| "demo-world".to_string())
        });

    let location_brief = step_three_artifact
        .as_ref()
        .map(|a| a.brief_text.clone())
        .unwrap_or_else(|| format!("A mysterious location on {}", world_title));

    // Build quest seed based on location context
    let quest_seed = json!({
        "premise": format!("Explore {} and uncover its secrets", location_title),
        "objective": format!("Investigate the area around {} and discover what makes this location significant", location_title),
        "stakes": format!("Understanding {} could be crucial to your survival on {}", location_title, world_title),
        "tone": "mysterious",
        "difficulty": "medium",
        "runLength": "short",
        "openness": "balanced",
        "targetEndingCount": 2,
        "factionAnchorIds": [],
        "locationAnchorIds": [],
        "ecologyAnchorIds": [],
        "notes": format!("Location context: {}", location_brief),
    });

    // Generate quest using the quest system
    let quest_request = ai_quests::GenerateQuestRunRequest {
        world_id: world_id.clone(),
        seed: quest_seed,
        party_character_ids: vec![],
        party: json!({}),
        gm_context: json!({
            "worldTitle": world_title,
            "locationTitle": location_title,
            "heroName": hero_name,
        }),
        factions: json!({}),
        locations: json!({}),
        ecology: json!({}),
        history_characters: json!({}),
    };

    // Call the quest generation (synchronous version for demo)
    let quest_run = match generate_demo_quest_sync(state, quest_request).await {
        Ok(run) => run,
        Err(e) => {
            eprintln!("Quest generation failed: {}, using fallback", e);
            // Fallback to simple quest
            return create_fallback_quest_artifact(
                hero_variant,
                &hero_name,
                Some(&world_id),
                world_title,
                location_id,
                location_title,
            );
        }
    };

    // Extract quest data from the generated run
    let quest_title = quest_run
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&format!("Explore {}", location_title))
        .to_string();

    let quest_description = quest_run
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or(&format!(
            "Investigate this location and uncover its secrets. The journey to {} marks the beginning of your story on {}.",
            location_title, world_title
        ))
        .to_string();

    // Extract objectives from current node
    let mut quest_objectives = vec![];
    if let Some(current_node) = quest_run.get("currentNode").and_then(Value::as_object) {
        if let Some(text) = current_node.get("text").and_then(Value::as_str) {
            // Extract first few sentences as objectives
            let sentences: Vec<&str> = text.split('.').take(3).collect();
            for sentence in sentences {
                let trimmed = sentence.trim();
                if !trimmed.is_empty() {
                    quest_objectives.push(trimmed.to_string());
                }
            }
        }
    }

    // Fallback objectives if none extracted
    if quest_objectives.is_empty() {
        quest_objectives = vec![
            format!("Arrive at {}", location_title),
            "Survey the surrounding area".to_string(),
            "Document your findings".to_string(),
        ];
    }

    let quest_rewards = vec!["500 XP".to_string(), "Location Access".to_string()];

    // Create the quest artifact
    let artifact = PersistedDemoStepFourArtifact {
        hero_variant: normalize_demo_hero_variant(Some(hero_variant)).to_string(),
        hero_name,
        world_id: Some(world_id),
        world_title: world_title.to_string(),
        location_id: location_id.to_string(),
        location_title: location_title.to_string(),
        quest_title,
        quest_description,
        quest_objectives,
        quest_rewards,
        quest_run_id: None,
    };

    // Save the artifact
    save_demo_step_four_artifact(
        state,
        step_one_job_id,
        hero_variant,
        location_id,
        &artifact,
    )?;

    Ok(artifact)
}

async fn generate_demo_quest_sync(
    _state: &AppState,
    _request: ai_quests::GenerateQuestRunRequest,
) -> Result<Value, String> {
    // For now, return an error to use fallback
    // TODO: Implement actual quest generation integration
    Err("Quest generation not yet integrated".to_string())
}

fn create_fallback_quest_artifact(
    hero_variant: &str,
    hero_name: &str,
    world_id: Option<&str>,
    world_title: &str,
    location_id: &str,
    location_title: &str,
) -> Result<PersistedDemoStepFourArtifact, (StatusCode, String)> {
    Ok(PersistedDemoStepFourArtifact {
        hero_variant: normalize_demo_hero_variant(Some(hero_variant)).to_string(),
        hero_name: hero_name.to_string(),
        world_id: world_id.map(String::from),
        world_title: world_title.to_string(),
        location_id: location_id.to_string(),
        location_title: location_title.to_string(),
        quest_title: format!("Explore {}", location_title),
        quest_description: format!(
            "Investigate this location and uncover its secrets. The journey to {} marks the beginning of your story on {}.",
            location_title, world_title
        ),
        quest_objectives: vec![
            format!("Arrive at {}", location_title),
            "Survey the surrounding area".to_string(),
            "Document your findings".to_string(),
        ],
        quest_rewards: vec!["500 XP".to_string(), "Location Access".to_string()],
        quest_run_id: None,
    })
}


// Add combat encounter to quest ending for demo purposes
pub async fn ensure_demo_quest_has_final_combat(
    state: &AppState,
    world_id: &str,
    run_id: &str,
) -> Result<(), (StatusCode, String)> {
    let quest_path = state
        .planets_dir
        .join(world_id)
        .join("quests")
        .join(format!("{}.json", run_id));

    let quest_json = fs::read_to_string(&quest_path).map_err(|e| {
        (
            StatusCode::NOT_FOUND,
            format!("Failed to read quest: {}", e),
        )
    })?;

    let mut quest_run: serde_json::Value = serde_json::from_str(&quest_json).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse quest: {}", e),
        )
    })?;

    // Check if current node is an ending and doesn't have combat
    let is_ending = quest_run
        .get("currentNode")
        .and_then(|node| node.get("kind"))
        .and_then(serde_json::Value::as_str)
        == Some("ending");

    let has_combat = quest_run
        .get("currentNode")
        .and_then(|node| node.get("pendingCombat"))
        .and_then(serde_json::Value::as_object)
        .and_then(|obj| obj.get("enemyIds"))
        .and_then(serde_json::Value::as_array)
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);

    if is_ending && !has_combat {
        // Extract data before mutable borrow
        let quest_title = quest_run
            .get("title")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Unknown Quest")
            .to_string();
        
        let quest_summary = quest_run
            .get("summary")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        
        let node_title = quest_run
            .get("currentNode")
            .and_then(|node| node.get("title"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Final Encounter")
            .to_string();
        
        let node_text = quest_run
            .get("currentNode")
            .and_then(|node| node.get("text"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        
        // Build quest context from log
        let quest_context = quest_run
            .get("log")
            .and_then(serde_json::Value::as_array)
            .map(|log| {
                log.iter()
                    .filter_map(|entry| {
                        entry.get("title").and_then(serde_json::Value::as_str)
                    })
                    .take(5)
                    .collect::<Vec<_>>()
                    .join(". ")
            })
            .unwrap_or_default();

        eprintln!("🤖 Generating contextual enemies for quest: {}", quest_title);

        // Generate fauna enemies using the existing ecology system
        let (enemy_fauna, enemy_names) = generate_quest_fauna_enemies(
            state,
            world_id,
            &quest_title,
            &quest_summary,
            &node_title,
            &node_text,
            &quest_context,
        ).await.unwrap_or_else(|e| {
            eprintln!("⚠️ Failed to generate fauna enemies: {}, using fallback", e);
            (
                vec!["fauna:ash-stalker-1".to_string(), "fauna:ash-stalker-2".to_string()],
                vec!["Ash Stalker".to_string(), "Ash Stalker".to_string()]
            )
        });

        // Now do the mutable borrow
        let current_node = quest_run
            .get_mut("currentNode")
            .ok_or((StatusCode::BAD_REQUEST, "No current node".to_string()))?;

        if let Some(node_obj) = current_node.as_object_mut() {
            node_obj.insert("kind".to_string(), json!("combat"));
            node_obj.insert("title".to_string(), json!("Final Encounter"));
            node_obj.insert("text".to_string(), json!(format!(
                "As you stand in the oppressive darkness of the grotto's heart, the silence is shattered. From the shadows emerge hostile creatures, drawn by your intrusion into their domain. {} The air crackles with tension as they close in, blocking your path forward. There is no escape—only combat.",
                if enemy_names.len() > 1 {
                    format!("A {} and a {} materialize from the crystalline formations.", 
                        enemy_names[0],
                        enemy_names[1])
                } else {
                    format!("A {} materializes from the crystalline formations.", 
                        enemy_names[0])
                }
            )));
            // Clear the illustration so a new one will be generated
            node_obj.insert("illustrationId".to_string(), json!(null));
            node_obj.insert("illustrationStatus".to_string(), json!("queued"));
            node_obj.insert(
                "pendingCombat".to_string(),
                json!({
                    "encounterLabel": "Final Encounter - Combat",
                    "stakes": "Defeat these creatures to complete your quest and escape the grotto alive.",
                    "enemyIds": enemy_fauna
                }),
            );
        }

        // Save the updated quest
        let updated_json = serde_json::to_string_pretty(&quest_run).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to serialize quest: {}", e),
            )
        })?;

        fs::write(&quest_path, updated_json).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to save quest: {}", e),
            )
        })?;

        eprintln!("✓ Added final combat encounter to demo quest with enemies: {:?}", enemy_fauna);
    }

    Ok(())
}

async fn generate_quest_fauna_enemies(
    state: &AppState,
    world_id: &str,
    quest_title: &str,
    quest_summary: &str,
    node_title: &str,
    node_text: &str,
    quest_context: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    use crate::ecology::{BiosphereBriefingRequest, generate_briefing_fauna_impl};

    // Build a context prompt for fauna generation
    let context = format!(
        "Quest: {}\nSummary: {}\nFinal Scene: {}\nScene Description: {}\nQuest Events: {}",
        quest_title, quest_summary, node_title, node_text, quest_context
    );

    let briefing_request = BiosphereBriefingRequest {
        zone_title: node_title.to_string(),
        biome_label: "Ashtrail Wasteland".to_string(),
        context: context.clone(),
        count: 2, // Generate 1-2 enemies
    };

    // Generate fauna using the existing system
    let fauna_entries = generate_briefing_fauna_impl(
        &state.planets_dir,
        world_id,
        briefing_request,
    )
    .await
    .map_err(|e| format!("Failed to generate fauna: {}", e))?;

    // Return fauna IDs in the format "fauna:{id}" for the combat system
    let enemy_ids: Vec<String> = fauna_entries
        .iter()
        .take(2)
        .map(|entry| {
            // Fauna IDs already have "fauna-" prefix, so just use the UUID part
            let uuid_part = entry.id.strip_prefix("fauna-").unwrap_or(&entry.id);
            format!("fauna:{}", uuid_part)
        })
        .collect();

    // Also return fauna names for text generation
    let enemy_names: Vec<String> = fauna_entries
        .iter()
        .take(2)
        .map(|entry| entry.name.clone())
        .collect();

    if enemy_ids.is_empty() {
        return Err("No fauna enemies generated".to_string());
    }

    Ok((enemy_ids, enemy_names))
}
