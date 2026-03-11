use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use uuid::Uuid;

use crate::AppState;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetPackGrouping {
    #[serde(rename = "type")]
    pub group_type: String, // "biome" or "structure"
    pub name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackTexturePointer {
    pub batch_id: String,
    pub filename: String,
    pub url: String,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackSpritePointer {
    pub batch_id: String,
    pub sprite_id: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetPackManifest {
    pub pack_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub grouping: Option<AssetPackGrouping>,
    #[serde(default)]
    pub textures: Vec<PackTexturePointer>,
    #[serde(default)]
    pub sprites: Vec<PackSpritePointer>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackRequest {
    pub name: String,
    pub description: Option<String>,
    pub grouping: Option<AssetPackGrouping>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub grouping: Option<AssetPackGrouping>,
    pub textures: Option<Vec<PackTexturePointer>>,
    pub sprites: Option<Vec<PackSpritePointer>>,
}

// Routes
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/packs", get(list_packs).post(create_pack))
        .route(
            "/api/packs/{pack_id}",
            get(get_pack).put(update_pack).delete(delete_pack),
        )
}

async fn list_packs(State(state): State<AppState>) -> impl IntoResponse {
    let mut packs = Vec::new();

    if let Ok(entries) = fs::read_dir(&state.packs_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Ok(manifest) = serde_json::from_str::<AssetPackManifest>(&content) {
                        packs.push(manifest);
                    }
                }
            }
        }
    }

    // Sort by created_at descending
    packs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    (StatusCode::OK, Json(packs))
}

async fn get_pack(
    State(state): State<AppState>,
    Path(pack_id): Path<String>,
) -> impl IntoResponse {
    let path = state.packs_dir.join(format!("{}.json", pack_id));
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Pack not found".to_string()).into_response();
    }

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<AssetPackManifest>(&content) {
            Ok(manifest) => (StatusCode::OK, Json(manifest)).into_response(),
            Err(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to parse pack".to_string(),
            )
                .into_response(),
        },
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to read pack".to_string(),
        )
            .into_response(),
    }
}

async fn create_pack(
    State(state): State<AppState>,
    Json(payload): Json<CreatePackRequest>,
) -> impl IntoResponse {
    let pack_id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();

    let manifest = AssetPackManifest {
        pack_id: pack_id.clone(),
        name: payload.name,
        description: payload.description,
        created_at,
        grouping: payload.grouping,
        textures: vec![],
        sprites: vec![],
    };

    let path = state.packs_dir.join(format!("{}.json", pack_id));
    if let Err(e) = fs::write(&path, serde_json::to_string_pretty(&manifest).unwrap()) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save pack: {}", e),
        )
            .into_response();
    }

    (StatusCode::CREATED, Json(manifest)).into_response()
}

async fn update_pack(
    State(state): State<AppState>,
    Path(pack_id): Path<String>,
    Json(payload): Json<UpdatePackRequest>,
) -> impl IntoResponse {
    let path = state.packs_dir.join(format!("{}.json", pack_id));
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Pack not found".to_string()).into_response();
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to read pack".to_string(),
            )
                .into_response()
        }
    };

    let mut manifest: AssetPackManifest = match serde_json::from_str(&content) {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to parse pack".to_string(),
            )
                .into_response()
        }
    };

    if let Some(name) = payload.name {
        manifest.name = name;
    }
    if let Some(desc) = payload.description {
        manifest.description = Some(desc);
    }
    if let Some(grouping) = payload.grouping {
        manifest.grouping = Some(grouping);
    }
    if let Some(textures) = payload.textures {
        manifest.textures = textures;
    }
    if let Some(sprites) = payload.sprites {
        manifest.sprites = sprites;
    }

    if let Err(e) = fs::write(&path, serde_json::to_string_pretty(&manifest).unwrap()) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save pack: {}", e),
        )
            .into_response();
    }

    (StatusCode::OK, Json(manifest)).into_response()
}

async fn delete_pack(
    State(state): State<AppState>,
    Path(pack_id): Path<String>,
) -> impl IntoResponse {
    let path = state.packs_dir.join(format!("{}.json", pack_id));
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Pack not found".to_string()).into_response();
    }

    if let Err(e) = fs::remove_file(path) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete pack: {}", e),
        )
            .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}
