use std::{
    fs,
    path::{Path, PathBuf},
};

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{demo_output, demo_step_two, gemini, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepThreeArtifactQuery {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    #[serde(default)]
    pub hero: Option<String>,
    #[serde(default)]
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepThreeLocationHint {
    pub node_id: String,
    pub node_title: String,
    pub node_prompt_seed: String,
    #[serde(default)]
    pub route_id: Option<String>,
    pub lon: f64,
    pub lat: f64,
    pub normalized_x: f64,
    pub normalized_y: f64,
    #[serde(default)]
    pub coordinate_label: Option<String>,
    #[serde(default)]
    pub route_summary: Option<String>,
    #[serde(default)]
    pub prompt_context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepThreeGenerateRequest {
    #[serde(default)]
    pub step_one_job_id: Option<String>,
    pub hero_variant: String,
    #[serde(default)]
    pub hero_name: Option<String>,
    #[serde(default)]
    pub world_id: Option<String>,
    pub location_hint: DemoStepThreeLocationHint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepThreeAssetRef {
    pub url: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionCoordinate {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedVisionCoordinates {
    pub coordinates: Vec<VisionCoordinate>,
    pub texture_url: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDemoStepThreeArtifact {
    pub hero_variant: String,
    pub hero_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world_id: Option<String>,
    pub world_context: demo_step_two::DemoStepTwoWorldContext,
    pub character_lore: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weapon_artifact: Option<demo_step_two::DemoStepTwoGeneratedWeaponArtifact>,
    pub location_hint: DemoStepThreeLocationHint,
    pub location_title: String,
    pub brief_text: String,
    pub image: DemoStepThreeAssetRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStepThreeResult {
    pub artifact: PersistedDemoStepThreeArtifact,
}

fn normalize_demo_hero_variant(value: Option<&str>) -> &'static str {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("jane") => "jane",
        _ => "john",
    }
}

fn sanitize_json_payload(raw: &str) -> String {
    raw.trim()
        .strip_prefix("```json")
        .or_else(|| raw.trim().strip_prefix("```"))
        .unwrap_or(raw.trim())
        .trim()
        .strip_suffix("```")
        .unwrap_or(raw.trim())
        .trim()
        .to_string()
}

fn demo_step_three_run_root(state: &AppState, step_one_job_id: Option<&str>) -> PathBuf {
    let run_id = if state.demo_step_one_use_pregenerated {
        state.demo_step_one_pregenerated_folder.clone()
    } else {
        step_one_job_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("live")
            .to_string()
    };
    state.demo_output_dir.join(run_id).join("step-3")
}

fn vision_coordinates_path(state: &AppState, step_one_job_id: Option<&str>, hero_variant: Option<&str>) -> PathBuf {
    demo_step_three_run_root(state, step_one_job_id)
        .join(normalize_demo_hero_variant(hero_variant))
        .join("vision_coordinates.json")
}

pub fn load_vision_coordinates(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
) -> Option<PersistedVisionCoordinates> {
    let path = vision_coordinates_path(state, step_one_job_id, hero_variant);
    if !path.is_file() {
        return None;
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

pub fn save_vision_coordinates(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
    coordinates: &PersistedVisionCoordinates,
) -> Result<(), String> {
    let path = vision_coordinates_path(state, step_one_job_id, hero_variant);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(coordinates)
        .map_err(|e| format!("Failed to serialize coordinates: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write coordinates: {}", e))?;
    Ok(())
}

pub fn demo_step_three_output_root(
    state: &AppState,
    step_one_job_id: Option<&str>,
    hero_variant: Option<&str>,
    node_id: Option<&str>,
) -> PathBuf {
    demo_step_three_run_root(state, step_one_job_id)
        .join(normalize_demo_hero_variant(hero_variant))
        .join(normalize_step_three_node_id(node_id))
}

fn normalize_step_three_node_id(value: Option<&str>) -> String {
    let normalized = value
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .unwrap_or("node-1")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let compact = normalized
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if compact.is_empty() {
        "node-1".to_string()
    } else {
        compact
    }
}

fn demo_output_asset_url(output_root: &Path, file_name: &str) -> String {
    demo_output::api_asset_url(Path::new("generated/demo-output"), output_root, file_name)
}

fn repair_loaded_demo_step_three_artifact(
    output_root: &Path,
    artifact: &mut PersistedDemoStepThreeArtifact,
) {
    if output_root.join("brief.png").is_file() {
        artifact.image = DemoStepThreeAssetRef {
            url: demo_output_asset_url(output_root, "brief.png"),
            mime_type: "image/png".to_string(),
        };
    }
}

pub fn load_persisted_demo_step_three_artifact(
    state: &AppState,
    query: &DemoStepThreeArtifactQuery,
) -> Result<PersistedDemoStepThreeArtifact, (StatusCode, String)> {
    let output_root = demo_step_three_output_root(
        state,
        query.step_one_job_id.as_deref(),
        query.hero.as_deref(),
        query.node_id.as_deref(),
    );
    let envelope = demo_output::load_demo_artifact::<PersistedDemoStepThreeArtifact>(&output_root)
        .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    let mut artifact = envelope.artifact;
    repair_loaded_demo_step_three_artifact(&output_root, &mut artifact);
    Ok(artifact)
}

pub async fn run_demo_step_three(
    state: &AppState,
    request: &DemoStepThreeGenerateRequest,
    output_root: &Path,
) -> Result<DemoStepThreeResult, (StatusCode, String)> {
    fs::create_dir_all(output_root).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create demo step 3 directory: {error}"),
        )
    })?;

    let step_two = demo_step_two::load_persisted_demo_step_two_artifact(
        state,
        &demo_step_two::DemoStepTwoArtifactQuery {
            step_one_job_id: request.step_one_job_id.clone(),
            hero: Some(
                normalize_demo_hero_variant(Some(request.hero_variant.as_str())).to_string(),
            ),
        },
    )
    .map_err(|(_, message)| {
        (
            StatusCode::BAD_REQUEST,
            format!("Demo step 3 requires persisted step 2 context: {message}"),
        )
    })?;

    let hero_name = request
        .hero_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(step_two.hero_name.as_str())
        .to_string();
    
    // Use AI vision coordinates if provided, otherwise use the hint coordinates
    let (final_lat, final_lon) = if let (Some(lat), Some(lon)) = (
        request.location_hint.prompt_context.as_ref().and_then(|ctx| {
            ctx.split("vision_lat:").nth(1).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse::<f64>().ok())
        }),
        request.location_hint.prompt_context.as_ref().and_then(|ctx| {
            ctx.split("vision_lon:").nth(1).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse::<f64>().ok())
        }),
    ) {
        (lat, lon)
    } else {
        (request.location_hint.lat, request.location_hint.lon)
    };
    
    let coordinate_label = request
        .location_hint
        .coordinate_label
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            format!(
                "Lat {:.1}{} • Lon {:.1}{}",
                final_lat.abs().to_degrees(),
                if final_lat >= 0.0 {
                    "N"
                } else {
                    "S"
                },
                final_lon.abs().to_degrees(),
                if final_lon >= 0.0 {
                    "E"
                } else {
                    "W"
                },
            )
        });
    let route_summary = request
        .location_hint
        .route_summary
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("A five-hop orbital travel route carried us from survey orbit into this exact surface corridor.");
    let prompt_context = request
        .location_hint
        .prompt_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No additional terrain telemetry was preserved for this arrival point.");
    let occupation_name = step_two.draft.occupation_name.trim();
    let node_title = request.location_hint.node_title.trim();
    let node_prompt_seed = request.location_hint.node_prompt_seed.trim();
    let direction_title = step_two
        .world_context
        .selected_direction_title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unspoken frontier");
    let weapon_context = step_two
        .weapon_artifact
        .as_ref()
        .map(|artifact| {
            format!(
                "{}: {} {}",
                artifact.weapon.name.trim(),
                artifact.weapon.description.trim(),
                artifact.lore_text.trim()
            )
        })
        .unwrap_or_else(|| {
            "No bespoke weapon context was preserved in the previous step.".to_string()
        });

    let text_prompt = format!(
        "Return strict JSON only for an Ashtrail demo step 3 arrival brief.\n\
The output must be a single JSON object with exactly these keys: title, briefText.\n\
title must be 2 to 5 words and feel like a memorable location name.\n\
briefText must be exactly two short paragraphs separated by a blank line.\n\
Paragraph 1 explains the location itself: what it is, what dominates the environment, and what makes it feel distinct.\n\
Paragraph 2 explains how we got here right now, making it feel like a direct continuation of the persisted step-2 hero story.\n\
The continuity paragraph must use the hero, world, and selected direction context so the scene feels like the next beat, not a reset.\n\
Do not use bullet points. Do not mention JSON. Do not mention UI. Do not mention coordinates verbatim unless naturally embedded.\n\
World title: {world_title}\n\
Selected direction: {direction_title}\n\
World lore: {world_lore}\n\
Hero: {hero_name}\n\
Occupation: {occupation_name}\n\
Hero lore: {hero_lore}\n\
Weapon continuity: {weapon_context}\n\
Chosen destination node: {node_title}\n\
Node directive: {node_prompt_seed}\n\
Arrival route: {route_summary}\n\
Location telemetry: {prompt_context}\n\
Coordinate label: {coordinate_label}",
        world_title = step_two.world_context.world_title.trim(),
        direction_title = direction_title,
        world_lore = step_two.world_context.world_lore.trim(),
        hero_name = hero_name,
        occupation_name = occupation_name,
        hero_lore = step_two.lore_text.trim(),
        weapon_context = weapon_context,
        node_title = node_title,
        node_prompt_seed = node_prompt_seed,
        route_summary = route_summary,
        prompt_context = prompt_context,
        coordinate_label = coordinate_label,
    );

    let raw = gemini::generate_text_with_options(&text_prompt, 0.62).await?;
    let cleaned = sanitize_json_payload(&raw);
    let parsed = serde_json::from_str::<Value>(&cleaned).map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse generated demo step 3 JSON: {error}"),
        )
    })?;
    let location_title = parsed
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Unnamed Reach")
        .to_string();
    let brief_text = parsed
        .get("briefText")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Demo step 3 generation did not return briefText.".to_string(),
            )
        })?
        .to_string();

    let image_prompt = format!(
        "Create a cinematic environmental concept art illustration for an Ashtrail demo arrival scene.\n\
Location: {location_title}.\n\
World: {world_title}.\n\
Hero continuity: {hero_name}, a {occupation_name}, has arrived here after {route_summary}.\n\
Chosen destination node: {node_title}. Node directive: {node_prompt_seed}.\n\
Scene brief: {brief_text}\n\
Visual continuity cues: selected direction {direction_title}. Weapon continuity: {weapon_context}\n\
Render the location only, with no character portrait, no text overlay, no UI, and no frame. Make it feel like the first look at a destination we have just reached.",
        location_title = location_title,
        world_title = step_two.world_context.world_title.trim(),
        hero_name = hero_name,
        occupation_name = occupation_name,
        route_summary = route_summary,
        node_title = node_title,
        node_prompt_seed = node_prompt_seed,
        brief_text = brief_text,
        direction_title = direction_title,
        weapon_context = weapon_context,
    );
    let bytes =
        gemini::generate_image_bytes(&image_prompt, Some(0.68), 1024, 1024, Some("1:1")).await?;
    fs::write(output_root.join("brief.png"), bytes).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write demo step 3 brief illustration: {error}"),
        )
    })?;

    let artifact = PersistedDemoStepThreeArtifact {
        hero_variant: normalize_demo_hero_variant(Some(request.hero_variant.as_str())).to_string(),
        hero_name,
        world_id: request.world_id.clone().or(step_two.world_id.clone()),
        world_context: step_two.world_context.clone(),
        character_lore: step_two.lore_text.clone(),
        weapon_artifact: step_two.weapon_artifact.clone(),
        location_hint: request.location_hint.clone(),
        location_title,
        brief_text,
        image: DemoStepThreeAssetRef {
            url: demo_output_asset_url(output_root, "brief.png"),
            mime_type: "image/png".to_string(),
        },
    };
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
        step: 3,
        phase: Some("location_generation".to_string()),
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
            "sourceStep": 2,
            "sourceFolder": format!(
                "generated/demo-output/{}/step-2/{}",
                request
                    .step_one_job_id
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(if state.demo_step_one_use_pregenerated {
                        state.demo_step_one_pregenerated_folder.as_str()
                    } else {
                        "live"
                    }),
                normalize_demo_hero_variant(Some(request.hero_variant.as_str())),
            ),
            "stepThreeFolder": format!(
                "generated/demo-output/{}/step-3/{}/{}",
                request
                    .step_one_job_id
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or(if state.demo_step_one_use_pregenerated {
                        state.demo_step_one_pregenerated_folder.as_str()
                    } else {
                        "live"
                    }),
                normalize_demo_hero_variant(Some(request.hero_variant.as_str())),
                normalize_step_three_node_id(Some(request.location_hint.node_id.as_str())),
            ),
            "nodeId": normalize_step_three_node_id(Some(request.location_hint.node_id.as_str())),
            "coordinateLabel": coordinate_label,
            "routeSummary": route_summary,
        })),
    };
    demo_output::persist_demo_artifact(output_root, &envelope)
        .map_err(|message| (StatusCode::INTERNAL_SERVER_ERROR, message))?;

    Ok(DemoStepThreeResult { artifact })
}
