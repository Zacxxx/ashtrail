use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationTile {
    pub r#type: String,
    pub walkable: bool,
    pub move_cost: f32,
    #[serde(default)]
    pub texture_url: Option<String>,
    #[serde(default)]
    pub is_spawn_zone: Option<String>,
    #[serde(default)]
    pub interior_id: Option<String>,
    #[serde(default)]
    pub light_level: Option<f32>,
    #[serde(default)]
    pub blocks_light: Option<bool>,
    #[serde(default)]
    pub door_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationPawn {
    pub id: String,
    pub name: String,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub target_x: Option<f32>,
    #[serde(default)]
    pub target_y: Option<f32>,
    #[serde(default)]
    pub path: Option<Vec<PathNode>>,
    pub speed: f32,
    pub faction_id: String,
    pub r#type: String,
    #[serde(default)]
    pub texture_url: Option<String>,
    #[serde(default)]
    pub sprite: Option<serde_json::Value>,
    #[serde(default)]
    pub facing: Option<String>,
    #[serde(default)]
    pub is_npc: Option<bool>,
    #[serde(default)]
    pub interaction_label: Option<String>,
    #[serde(default)]
    pub home_interior_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationObject {
    pub id: String,
    pub r#type: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub passable: bool,
    #[serde(default)]
    pub texture_url: Option<String>,
    #[serde(default)]
    pub is_natural: Option<bool>,
    #[serde(default)]
    pub is_hidden: Option<bool>,
    #[serde(default)]
    pub move_cost: Option<f32>,
    #[serde(default)]
    pub fertility: Option<f32>,
    #[serde(default)]
    pub door_id: Option<String>,
    #[serde(default)]
    pub interior_id: Option<String>,
    #[serde(default)]
    pub roof_group_id: Option<String>,
    #[serde(default)]
    pub height_tiles: Option<u32>,
    #[serde(default)]
    pub blocks_light: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationMap {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub tiles: Vec<ExplorationTile>,
    pub pawns: Vec<ExplorationPawn>,
    pub objects: Vec<ExplorationObject>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub fog_of_war: Option<Vec<bool>>,
    #[serde(default)]
    pub ambient_light: Option<f32>,
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub render_mode: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathNode {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationSessionSnapshot {
    pub map: ExplorationMap,
    pub selected_pawn_id: Option<String>,
    pub tick: u64,
    pub connection_state: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationSessionConfig {
    #[serde(default)]
    pub session_name: Option<String>,
    #[serde(default)]
    pub tick_rate_hz: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExplorationClientAction {
    #[serde(rename_all = "camelCase")]
    StartSession {
        map: ExplorationMap,
        #[serde(default)]
        selected_pawn_id: Option<String>,
        #[serde(default)]
        config: Option<ExplorationSessionConfig>,
    },
    #[serde(rename_all = "camelCase")]
    MoveTo {
        pawn_id: String,
        target_row: u32,
        target_col: u32,
    },
    #[serde(rename_all = "camelCase")]
    SetSelectedPawn {
        #[serde(default)]
        pawn_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Interact {
        #[serde(default)]
        row: Option<u32>,
        #[serde(default)]
        col: Option<u32>,
        #[serde(default)]
        object_id: Option<String>,
        #[serde(default)]
        actor_id: Option<String>,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExplorationSessionEvent {
    #[serde(rename_all = "camelCase")]
    StateSync {
        state: ExplorationSessionSnapshot,
    },
    #[serde(rename_all = "camelCase")]
    PawnSync {
        pawns: Vec<ExplorationPawn>,
        selected_pawn_id: Option<String>,
        tick: u64,
        connection_state: String,
    },
    #[serde(rename_all = "camelCase")]
    Interaction {
        label: String,
        #[serde(default)]
        row: Option<u32>,
        #[serde(default)]
        col: Option<u32>,
        #[serde(default)]
        object_id: Option<String>,
        #[serde(default)]
        actor_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Pong {
        tick: u64,
    },
    Error {
        message: String,
    },
}
