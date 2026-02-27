use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::fs;
use crate::AppState;

pub async fn get_traits(State(state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Navigate up from backend to packages/core/src/data/traits.json
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/traits.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        },
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn save_traits(State(_state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/traits.json");
    
    let mut traits: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        },
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = traits.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(id)) {
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

pub async fn get_occupations(State(state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/occupations.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        },
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn save_occupations(State(_state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/occupations.json");
    
    let mut occupations: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        },
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = occupations.iter().position(|o| o.get("id").and_then(|v| v.as_str()) == Some(id)) {
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

pub async fn get_items(State(_state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/items.json");
    match fs::read_to_string(&path) {
        Ok(data) => {
            let json: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            Ok((StatusCode::OK, Json(json)))
        },
        Err(e) => {
            // It's okay if items.json is brand new or doesn't exist
            Ok((StatusCode::OK, Json(serde_json::json!([]))))
        },
    }
}

pub async fn save_items(State(_state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let path = std::env::current_dir().unwrap().join("../../packages/core/src/data/items.json");
    
    let mut items: Vec<serde_json::Value> = match fs::read_to_string(&path) {
        Ok(data) => {
            let val: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::json!([]));
            if val.is_array() {
                val.as_array().unwrap().clone()
            } else if val.is_object() {
                vec![val]
            } else {
                Vec::new()
            }
        },
        Err(_) => Vec::new(),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.is_empty() {
        if let Some(pos) = items.iter().position(|i| i.get("id").and_then(|v| v.as_str()) == Some(id)) {
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

pub async fn get_characters(State(_state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir().unwrap().join("generated").join("characters");
    let mut characters = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        characters.push(json);
                    }
                }
            }
        }
    }

    Ok((StatusCode::OK, Json(serde_json::Value::Array(characters))))
}

pub async fn save_character(State(_state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir().unwrap().join("generated").join("characters");
    if let Err(e) = fs::create_dir_all(&dir) {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create characters dir: {}", e)));
    }

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
    let path = dir.join(format!("{}.json", id));
    
    let json_string = serde_json::to_string_pretty(&payload).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_skills(State(_state): State<AppState>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir().unwrap().join("generated").join("skills");
    let mut skills = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        skills.push(json);
                    }
                }
            }
        }
    }

    Ok((StatusCode::OK, Json(serde_json::Value::Array(skills))))
}

pub async fn save_skill(State(_state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let dir = std::env::current_dir().unwrap().join("generated").join("skills");
    if let Err(e) = fs::create_dir_all(&dir) {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create skills dir: {}", e)));
    }

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
    let path = dir.join(format!("{}.json", id));
    
    let json_string = serde_json::to_string_pretty(&payload).unwrap();
    match fs::write(&path, json_string) {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
