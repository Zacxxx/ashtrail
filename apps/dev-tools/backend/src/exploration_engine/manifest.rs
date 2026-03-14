use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::types::{
    ExplorationChunk, ExplorationManifestDescriptor, ExplorationMap, ExplorationObject,
    ExplorationPawn, ExplorationSpawnPoint,
};

pub const EXPLORATION_CHUNK_SIZE: u32 = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationStorageManifest {
    #[serde(flatten)]
    pub descriptor: ExplorationManifestDescriptor,
    #[serde(default)]
    pub pawns: Vec<ExplorationPawn>,
}

pub fn manifest_path(planets_dir: &Path, world_id: &str, location_id: &str) -> PathBuf {
    planets_dir
        .join(world_id)
        .join("exploration")
        .join(location_id)
        .join("manifest.json")
}

fn location_dir(planets_dir: &Path, world_id: &str, location_id: &str) -> PathBuf {
    planets_dir
        .join(world_id)
        .join("exploration")
        .join(location_id)
}

fn chunks_dir(planets_dir: &Path, world_id: &str, location_id: &str) -> PathBuf {
    location_dir(planets_dir, world_id, location_id).join("chunks")
}

fn chunk_path(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
    chunk_row: u32,
    chunk_col: u32,
) -> PathBuf {
    chunks_dir(planets_dir, world_id, location_id)
        .join(format!("chunk_{chunk_row}_{chunk_col}.json"))
}

pub fn write_chunked_location(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
    map: &ExplorationMap,
) -> Result<ExplorationManifestDescriptor, String> {
    let location_dir = location_dir(planets_dir, world_id, location_id);
    let chunks_dir = chunks_dir(planets_dir, world_id, location_id);
    fs::create_dir_all(&chunks_dir)
        .map_err(|error| format!("Failed to create exploration chunk directory: {error}"))?;

    if let Ok(entries) = fs::read_dir(&chunks_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    let (storage, chunks) = chunk_map(world_id, location_id, map);
    let manifest_json = serde_json::to_string_pretty(&storage)
        .map_err(|error| format!("Failed to serialize exploration manifest: {error}"))?;
    fs::write(location_dir.join("manifest.json"), manifest_json)
        .map_err(|error| format!("Failed to write exploration manifest: {error}"))?;

    for chunk in chunks {
        let chunk_json = serde_json::to_string_pretty(&chunk)
            .map_err(|error| format!("Failed to serialize exploration chunk: {error}"))?;
        fs::write(
            chunk_path(
                planets_dir,
                world_id,
                location_id,
                chunk.chunk_row,
                chunk.chunk_col,
            ),
            chunk_json,
        )
        .map_err(|error| format!("Failed to write exploration chunk: {error}"))?;
    }

    Ok(storage.descriptor)
}

pub fn ensure_chunked_location(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
) -> Result<ExplorationStorageManifest, String> {
    let manifest_path = manifest_path(planets_dir, world_id, location_id);
    let content = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Failed to read exploration manifest: {error}"))?;
    let value = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("Failed to parse exploration manifest: {error}"))?;

    let version = value.get("version").and_then(Value::as_u64).unwrap_or(0);
    let has_chunks = chunks_dir(planets_dir, world_id, location_id).exists();

    if version < 3 || !has_chunks {
        let map = serde_json::from_value::<ExplorationMap>(value)
            .map_err(|error| format!("Failed to migrate exploration manifest: {error}"))?;
        write_chunked_location(planets_dir, world_id, location_id, &map)?;
    }

    load_storage_manifest(planets_dir, world_id, location_id)
}

pub fn load_storage_manifest(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
) -> Result<ExplorationStorageManifest, String> {
    let content = fs::read_to_string(manifest_path(planets_dir, world_id, location_id))
        .map_err(|error| format!("Failed to read exploration manifest: {error}"))?;
    serde_json::from_str::<ExplorationStorageManifest>(&content)
        .map_err(|error| format!("Failed to parse exploration storage manifest: {error}"))
}

pub fn load_manifest_descriptor(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
) -> Result<ExplorationManifestDescriptor, String> {
    Ok(ensure_chunked_location(planets_dir, world_id, location_id)?.descriptor)
}

pub fn load_chunk(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
    chunk_row: u32,
    chunk_col: u32,
) -> Result<Option<ExplorationChunk>, String> {
    ensure_chunked_location(planets_dir, world_id, location_id)?;
    let path = chunk_path(planets_dir, world_id, location_id, chunk_row, chunk_col);
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read exploration chunk: {error}"))?;
    let chunk = serde_json::from_str::<ExplorationChunk>(&content)
        .map_err(|error| format!("Failed to parse exploration chunk: {error}"))?;
    Ok(Some(chunk))
}

pub fn load_chunks_in_radius(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
    center_row: u32,
    center_col: u32,
    radius: u32,
) -> Result<Vec<ExplorationChunk>, String> {
    let storage = ensure_chunked_location(planets_dir, world_id, location_id)?;
    let chunk_size = storage.descriptor.chunk_size.max(1);
    let center_chunk_row = center_row / chunk_size;
    let center_chunk_col = center_col / chunk_size;
    let max_chunk_row = storage.descriptor.height.saturating_sub(1) / chunk_size;
    let max_chunk_col = storage.descriptor.width.saturating_sub(1) / chunk_size;

    let min_row = center_chunk_row.saturating_sub(radius);
    let min_col = center_chunk_col.saturating_sub(radius);
    let max_row = (center_chunk_row + radius).min(max_chunk_row);
    let max_col = (center_chunk_col + radius).min(max_chunk_col);

    let mut chunks = Vec::new();
    for chunk_row in min_row..=max_row {
        for chunk_col in min_col..=max_col {
            if let Some(chunk) =
                load_chunk(planets_dir, world_id, location_id, chunk_row, chunk_col)?
            {
                chunks.push(chunk);
            }
        }
    }
    Ok(chunks)
}

pub fn load_all_chunks(
    planets_dir: &Path,
    world_id: &str,
    location_id: &str,
) -> Result<Vec<ExplorationChunk>, String> {
    let storage = ensure_chunked_location(planets_dir, world_id, location_id)?;
    let chunk_size = storage.descriptor.chunk_size.max(1);
    let max_chunk_row = storage.descriptor.height.saturating_sub(1) / chunk_size;
    let max_chunk_col = storage.descriptor.width.saturating_sub(1) / chunk_size;
    let mut chunks = Vec::new();
    for chunk_row in 0..=max_chunk_row {
        for chunk_col in 0..=max_chunk_col {
            if let Some(chunk) =
                load_chunk(planets_dir, world_id, location_id, chunk_row, chunk_col)?
            {
                chunks.push(chunk);
            }
        }
    }
    Ok(chunks)
}

fn chunk_map(
    world_id: &str,
    location_id: &str,
    map: &ExplorationMap,
) -> (ExplorationStorageManifest, Vec<ExplorationChunk>) {
    let spawn = find_spawn(map);
    let descriptor = ExplorationManifestDescriptor {
        id: map.id.clone(),
        world_id: world_id.to_string(),
        location_id: location_id.to_string(),
        name: map.name.clone().unwrap_or_else(|| location_id.to_string()),
        width: map.width,
        height: map.height,
        chunk_size: EXPLORATION_CHUNK_SIZE,
        version: 3,
        render_mode: "isometric".to_string(),
        ambient_light: map.ambient_light.unwrap_or(0.76),
        spawn,
        metadata: map.metadata.clone(),
    };
    let mut chunks = Vec::new();
    let chunk_cols = map.width.div_ceil(EXPLORATION_CHUNK_SIZE);
    let chunk_rows = map.height.div_ceil(EXPLORATION_CHUNK_SIZE);

    for chunk_row in 0..chunk_rows {
        for chunk_col in 0..chunk_cols {
            let origin_row = chunk_row * EXPLORATION_CHUNK_SIZE;
            let origin_col = chunk_col * EXPLORATION_CHUNK_SIZE;
            let width = (map.width - origin_col).min(EXPLORATION_CHUNK_SIZE);
            let height = (map.height - origin_row).min(EXPLORATION_CHUNK_SIZE);
            let mut tiles = Vec::with_capacity((width * height) as usize);
            for row in 0..height {
                for col in 0..width {
                    let world_row = origin_row + row;
                    let world_col = origin_col + col;
                    let index = (world_row * map.width + world_col) as usize;
                    if let Some(tile) = map.tiles.get(index) {
                        tiles.push(tile.clone());
                    }
                }
            }

            let objects = map
                .objects
                .iter()
                .filter(|object| {
                    object_belongs_to_chunk(object, origin_row, origin_col, width, height)
                })
                .cloned()
                .collect::<Vec<_>>();

            chunks.push(ExplorationChunk {
                id: format!("chunk-{chunk_row}-{chunk_col}"),
                chunk_row,
                chunk_col,
                origin_row,
                origin_col,
                width,
                height,
                tiles,
                objects,
            });
        }
    }

    (
        ExplorationStorageManifest {
            descriptor,
            pawns: map.pawns.clone(),
        },
        chunks,
    )
}

fn object_belongs_to_chunk(
    object: &ExplorationObject,
    origin_row: u32,
    origin_col: u32,
    chunk_width: u32,
    chunk_height: u32,
) -> bool {
    object.y >= origin_row
        && object.y < origin_row + chunk_height
        && object.x >= origin_col
        && object.x < origin_col + chunk_width
}

fn find_spawn(map: &ExplorationMap) -> ExplorationSpawnPoint {
    if let Some((index, _tile)) = map
        .tiles
        .iter()
        .enumerate()
        .find(|(_, tile)| tile.is_spawn_zone.as_deref() == Some("player") && tile.walkable)
    {
        return ExplorationSpawnPoint {
            row: index as u32 / map.width.max(1),
            col: index as u32 % map.width.max(1),
        };
    }

    let center_row = map.height / 2;
    let center_col = map.width / 2;
    for radius in 0..map.width.max(map.height) {
        let min_row = center_row.saturating_sub(radius);
        let min_col = center_col.saturating_sub(radius);
        let max_row = (center_row + radius).min(map.height.saturating_sub(1));
        let max_col = (center_col + radius).min(map.width.saturating_sub(1));
        for row in min_row..=max_row {
            for col in min_col..=max_col {
                let index = (row * map.width + col) as usize;
                if map.tiles.get(index).is_some_and(|tile| tile.walkable) {
                    return ExplorationSpawnPoint { row, col };
                }
            }
        }
    }

    ExplorationSpawnPoint { row: 0, col: 0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exploration_engine::types::{ExplorationObject, ExplorationTile};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("ashtrail-exploration-test-{nanos}"))
    }

    fn sample_map() -> ExplorationMap {
        let width = 18;
        let height = 18;
        let mut tiles = Vec::new();
        for row in 0..height {
            for col in 0..width {
                let is_wall = row == 0 || col == 0 || row == height - 1 || col == width - 1;
                tiles.push(ExplorationTile {
                    r#type: if is_wall {
                        "wall".to_string()
                    } else {
                        "floor".to_string()
                    },
                    walkable: !is_wall,
                    move_cost: if is_wall { 0.0 } else { 1.0 },
                    texture_url: None,
                    is_spawn_zone: if row == 9 && col == 9 {
                        Some("player".to_string())
                    } else {
                        None
                    },
                    interior_id: if (4..=8).contains(&row) && (4..=8).contains(&col) {
                        Some("interior-a".to_string())
                    } else {
                        None
                    },
                    light_level: Some(0.8),
                    blocks_light: Some(is_wall),
                    door_id: if row == 4 && col == 6 {
                        Some("door-a".to_string())
                    } else {
                        None
                    },
                });
            }
        }
        ExplorationMap {
            id: "test-map".to_string(),
            width,
            height,
            tiles,
            pawns: vec![ExplorationPawn {
                id: "npc-1".to_string(),
                name: "NPC".to_string(),
                x: 6.0,
                y: 6.0,
                tile_row: 6,
                tile_col: 6,
                target_x: None,
                target_y: None,
                path: None,
                route: Vec::new(),
                route_index: 0,
                segment_progress: 0.0,
                moving: false,
                move_speed_tiles_per_second: 2.0,
                speed: 2.0,
                faction_id: "ambient".to_string(),
                r#type: "human".to_string(),
                texture_url: None,
                sprite: None,
                facing: Some("south".to_string()),
                is_npc: Some(true),
                interaction_label: Some("Talk".to_string()),
                home_interior_id: Some("interior-a".to_string()),
                schedule_id: Some("resident:interior-a".to_string()),
                current_anchor_id: Some("6:6".to_string()),
                current_intent: Some("idle".to_string()),
                next_decision_at_tick: None,
            }],
            objects: vec![
                ExplorationObject {
                    id: "door-object".to_string(),
                    r#type: "door".to_string(),
                    x: 6,
                    y: 4,
                    width: 1,
                    height: 1,
                    passable: true,
                    texture_url: None,
                    is_natural: Some(false),
                    is_hidden: Some(false),
                    move_cost: None,
                    fertility: None,
                    door_id: Some("door-a".to_string()),
                    interior_id: Some("interior-a".to_string()),
                    roof_group_id: Some("roof-a".to_string()),
                    height_tiles: Some(2),
                    blocks_light: Some(false),
                },
                ExplorationObject {
                    id: "roof-object".to_string(),
                    r#type: "house-roof".to_string(),
                    x: 4,
                    y: 4,
                    width: 5,
                    height: 5,
                    passable: true,
                    texture_url: None,
                    is_natural: Some(false),
                    is_hidden: Some(false),
                    move_cost: None,
                    fertility: None,
                    door_id: None,
                    interior_id: Some("interior-a".to_string()),
                    roof_group_id: Some("roof-a".to_string()),
                    height_tiles: Some(2),
                    blocks_light: Some(true),
                },
            ],
            name: Some("Test".to_string()),
            fog_of_war: None,
            ambient_light: Some(0.76),
            version: Some(2),
            render_mode: Some("isometric".to_string()),
            metadata: Some(serde_json::json!({ "source": "test" })),
        }
    }

    #[test]
    fn writes_and_loads_chunked_storage() {
        let dir = unique_temp_dir();
        let world_id = "world-a";
        let location_id = "loc-a";
        fs::create_dir_all(dir.join(world_id).join("exploration").join(location_id)).unwrap();

        let descriptor =
            write_chunked_location(&dir, world_id, location_id, &sample_map()).unwrap();
        assert_eq!(descriptor.version, 3);
        assert_eq!(descriptor.chunk_size, EXPLORATION_CHUNK_SIZE);

        let storage = ensure_chunked_location(&dir, world_id, location_id).unwrap();
        assert_eq!(storage.descriptor.version, 3);
        assert_eq!(storage.pawns.len(), 1);

        let chunk = load_chunk(&dir, world_id, location_id, 0, 0)
            .unwrap()
            .unwrap();
        assert!(!chunk.tiles.is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn migrates_v2_manifest_to_chunk_storage() {
        let dir = unique_temp_dir();
        let world_id = "world-b";
        let location_id = "loc-b";
        let location_dir = dir.join(world_id).join("exploration").join(location_id);
        fs::create_dir_all(&location_dir).unwrap();
        let content = serde_json::to_string_pretty(&sample_map()).unwrap();
        fs::write(location_dir.join("manifest.json"), content).unwrap();

        let storage = ensure_chunked_location(&dir, world_id, location_id).unwrap();
        assert_eq!(storage.descriptor.version, 3);
        assert!(chunks_dir(&dir, world_id, location_id).exists());
        assert!(load_chunk(&dir, world_id, location_id, 0, 0)
            .unwrap()
            .is_some());

        let _ = fs::remove_dir_all(dir);
    }
}
