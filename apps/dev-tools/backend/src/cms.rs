use crate::{
    combat_engine::content_loader::load_content_bundle,
    game_rules::{load_rules_from_file, normalize_game_rules, save_rules_to_file, GameRulesConfig},
    progression::normalize_character_payload,
    AppState,
};
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use base64::Engine as _;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

fn strip_utf8_bom(raw: &str) -> &str {
    raw.strip_prefix('\u{feff}').unwrap_or(raw)
}

fn character_portraits_dir(state: &AppState) -> PathBuf {
    state.character_portraits_dir.clone()
}

fn characters_dir(state: &AppState) -> PathBuf {
    state.characters_dir.clone()
}

fn parse_data_url_image(value: &str) -> Option<(&str, Vec<u8>)> {
    let payload = value.strip_prefix("data:")?;
    let (meta, encoded) = payload.split_once(',')?;
    if !meta.ends_with(";base64") {
        return None;
    }
    let mime = meta.trim_end_matches(";base64");
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    Some((mime, bytes))
}

fn image_extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn portrait_public_url(file_name: &str) -> String {
    format!("/api/character-portraits/{file_name}")
}

fn extract_portrait_file_name(value: &str) -> Option<String> {
    let path = value.split('?').next().unwrap_or(value);
    path.strip_prefix("/api/character-portraits/")
        .map(str::to_string)
        .filter(|name| !name.is_empty() && !name.contains("..") && !name.contains('/'))
}

fn remove_existing_portrait_assets(
    portraits_dir: &Path,
    character_id: &str,
    existing_value: Option<&Value>,
) {
    if let Some(file_name) = existing_value
        .and_then(Value::as_str)
        .and_then(extract_portrait_file_name)
    {
        let _ = fs::remove_file(portraits_dir.join(file_name));
    }

    if let Ok(entries) = fs::read_dir(portraits_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if stem == character_id {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn normalize_character_portrait(
    state: &AppState,
    payload: &mut Value,
) -> Result<bool, (StatusCode, String)> {
    let Some(obj) = payload.as_object_mut() else {
        return Ok(false);
    };

    let id = obj
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
        .to_string();

    let portraits_dir = character_portraits_dir(state);
    fs::create_dir_all(&portraits_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create portraits dir: {e}")))?;

    let existing_path = characters_dir(state).join(format!("{id}.json"));
    let existing_record = fs::read_to_string(&existing_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    let existing_portrait = existing_record
        .as_ref()
        .and_then(|record| record.get("portraitUrl"))
        .cloned();

    let Some(portrait_url) = obj.get("portraitUrl").cloned() else {
        remove_existing_portrait_assets(&portraits_dir, &id, existing_portrait.as_ref());
        return Ok(false);
    };

    if portrait_url.is_null() {
        obj.remove("portraitUrl");
        remove_existing_portrait_assets(&portraits_dir, &id, existing_portrait.as_ref());
        return Ok(true);
    }

    let Some(portrait_url_str) = portrait_url.as_str() else {
        return Ok(false);
    };

    if let Some((mime, bytes)) = parse_data_url_image(portrait_url_str) {
        remove_existing_portrait_assets(&portraits_dir, &id, existing_portrait.as_ref());
        let extension = image_extension_for_mime(mime);
        let file_name = format!("{id}.{extension}");
        let output_path = portraits_dir.join(&file_name);
        fs::write(&output_path, bytes).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to write portrait asset: {e}"),
            )
        })?;
        let cache_busted = format!("{}?v={}", portrait_public_url(&file_name), chrono::Utc::now().timestamp_millis());
        obj.insert("portraitUrl".to_string(), Value::String(cache_busted));
        return Ok(true);
    }

    if let Some(file_name) = extract_portrait_file_name(portrait_url_str) {
        let path = portraits_dir.join(file_name);
        if path.exists() {
            return Ok(false);
        }
    }

    Ok(false)
}

pub async fn get_traits(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Navigate up from backend to packages/core/src/data/traits.json
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/traits.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn save_traits(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/traits.json");

    let mut traits: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = traits
            .iter()
            .position(|t| t.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            traits[pos] = payload;
        } else {
            traits.push(payload);
        }
    }

    let json_string = serde_json::to_string_pretty(&traits).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_occupations(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/occupations.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn save_occupations(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/occupations.json");

    let mut occupations: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = occupations
            .iter()
            .position(|o| o.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            occupations[pos] = payload;
        } else {
            occupations.push(payload);
        }
    }

    let json_string = serde_json::to_string_pretty(&occupations).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_items(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/items.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(e) => {
            // It's okay if items.json is brand new or doesn't exist
            Ok((StatusCode::OK, Json(serde_json::json!([]))))
        }
    }
}

pub async fn get_talent_trees(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/talentTrees.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(_) => Ok((StatusCode::OK, Json(serde_json::json!([])))),
    }
}

pub async fn save_talent_tree(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/talentTrees.json");

    let mut trees: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let occupation_id = payload
        .get("occupationId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !occupation_id.is_empty() {
        if let Some(pos) = trees.iter().position(|tree| {
            tree.get("occupationId").and_then(|v| v.as_str()) == Some(occupation_id)
        }) {
            trees[pos] = payload;
        } else {
            trees.push(payload);
        }
    }

    let json_string = serde_json::to_string_pretty(&trees).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn save_items(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/items.json");

    let mut items: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = items
            .iter()
            .position(|i| i.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            items[pos] = payload;
        } else {
            items.push(payload);
        }
    }

    let json_string = serde_json::to_string_pretty(&items).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_characters(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = characters_dir(&state);
    let mut characters = Vec::new();
    let rules = load_rules_from_file();
    let content = load_content_bundle().ok();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content_raw) = fs::read_to_string(&path) {
                    if let Ok(mut json) = serde_json::from_str::<Value>(strip_utf8_bom(&content_raw)) {
                        let normalized = normalize_character_portrait(&state, &mut json)?;
                        if normalized {
                            let _ = fs::write(
                                &path,
                                serde_json::to_string_pretty(&json).unwrap_or_else(|_| "{}".to_string()),
                            );
                        }
                        characters.push(normalize_character_payload(
                            json,
                            &rules,
                            content.as_ref(),
                        ));
                    }
                }
            }
        }
    }

    Ok((StatusCode::OK, Json(Value::Array(characters))))
}

pub async fn save_character(
    State(state): State<AppState>,
    Json(mut payload): Json<Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = characters_dir(&state);
    if let Err(e) = fs::create_dir_all(&dir) {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create characters dir: {}", e),
        ));
    }

    normalize_character_portrait(&state, &mut payload)?;

    let id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let path = dir.join(format!("{}.json", id));

    let rules = load_rules_from_file();
    let content = load_content_bundle().ok();
    let normalized = normalize_character_payload(payload, &rules, content.as_ref());
    let json_string = serde_json::to_string_pretty(&normalized).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_skills(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/skills.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(_) => {
            // It's okay if it doesn't exist yet
            Ok((StatusCode::OK, Json(serde_json::json!([]))))
        }
    }
}

pub async fn save_skill(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/skills.json");

    let mut skills: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = skills
            .iter()
            .position(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            skills[pos] = payload;
        } else {
            skills.push(payload);
        }
    }

    let json_string = serde_json::to_string_pretty(&skills).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn delete_skill(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Deleting skill with ID: {}", id);
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/skills.json");

    let mut data: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    };

    let initial_len = data.len();
    data.retain(|v| v.get("id").and_then(|id_val| id_val.as_str()) != Some(id.as_str()));
    tracing::info!("Removed {} items", initial_len - data.len());

    let json_string = serde_json::to_string_pretty(&data).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn delete_trait(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Deleting trait with ID: {}", id);
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/traits.json");
    let mut data: Vec<serde_json::Value> = load_json_array(&path);
    let initial_len = data.len();
    data.retain(|v| v.get("id").and_then(|id_val| id_val.as_str()) != Some(id.as_str()));
    tracing::info!("Removed {} items", initial_len - data.len());
    save_json_array(&path, data)
}

pub async fn delete_occupation(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Deleting occupation with ID: {}", id);
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/occupations.json");
    let mut data: Vec<serde_json::Value> = load_json_array(&path);
    let initial_len = data.len();
    data.retain(|v| v.get("id").and_then(|id_val| id_val.as_str()) != Some(id.as_str()));
    tracing::info!("Removed {} items", initial_len - data.len());
    save_json_array(&path, data)
}

pub async fn delete_item(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Deleting item with ID: {}", id);
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/items.json");
    let mut data: Vec<serde_json::Value> = load_json_array(&path);
    let initial_len = data.len();
    data.retain(|v| v.get("id").and_then(|id_val| id_val.as_str()) != Some(id.as_str()));
    tracing::info!("Removed {} items", initial_len - data.len());
    save_json_array(&path, data)
}

pub async fn delete_talent_tree(
    State(_state): State<AppState>,
    axum::extract::Path(occupation_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Deleting talent tree with occupationId: {}", occupation_id);
    let path = std::env::current_dir()
        .unwrap()
        .join("../../packages/core/src/data/talentTrees.json");
    let mut data: Vec<serde_json::Value> = load_json_array(&path);
    let initial_len = data.len();
    data.retain(|v| {
        v.get("occupationId").and_then(|id_val| id_val.as_str()) != Some(occupation_id.as_str())
    });
    tracing::info!("Removed {} items", initial_len - data.len());
    save_json_array(&path, data)
}

fn load_json_array(path: &std::path::PathBuf) -> Vec<serde_json::Value> {
    match fs::read_to_string(path) {
        Ok(data) => {
            let val: serde_json::Value =
                serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        }
        Err(_) => Vec::new(),
    }
}

fn save_json_array(
    path: &std::path::PathBuf,
    data: Vec<serde_json::Value>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let json_string = serde_json::to_string_pretty(&data).unwrap();
    match fs::write(path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_game_rules(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    Ok((
        StatusCode::OK,
        Json(serde_json::json!(load_rules_from_file())),
    ))
}

pub async fn save_game_rules(
    State(_state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let parsed: GameRulesConfig = serde_json::from_value(payload).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Invalid rules payload: {e}"),
        )
    })?;
    let normalized = normalize_game_rules(parsed);
    save_rules_to_file(&normalized).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok((StatusCode::OK, Json(serde_json::json!(normalized))))
}

pub async fn get_world_settings(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir()
        .unwrap()
        .join("generated")
        .join("settings");
    let path = dir.join(format!("{}.json", id));
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value = serde_json::from_str(&data)
                .unwrap_or(serde_json::json!({ "worldId": id, "baseTypes": [] }));
            Ok((StatusCode::OK, Json(json)))
        }
        Err(_) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "worldId": id, "baseTypes": [] })),
        )),
    }
}

pub async fn save_world_settings(
    State(_state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir()
        .unwrap()
        .join("generated")
        .join("settings");
    if let Err(e) = fs::create_dir_all(&dir) {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create settings dir: {}", e),
        ));
    }

    let path = dir.join(format!("{}.json", id));
    let json_string = serde_json::to_string_pretty(&payload).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
