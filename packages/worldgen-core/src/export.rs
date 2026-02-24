use crate::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};
use crate::graph::ProvinceAdjacency;
use crate::sampling::Seed;
use image::{GrayImage, ImageBuffer, Luma, Rgb, RgbImage};
use std::path::Path;

/// Pack a u32 ID into RGB (24-bit).
/// r = id & 0xFF, g = (id >> 8) & 0xFF, b = (id >> 16) & 0xFF
fn pack_id_rgb(id: u32) -> Rgb<u8> {
    Rgb([
        (id & 0xFF) as u8,
        ((id >> 8) & 0xFF) as u8,
        ((id >> 16) & 0xFF) as u8,
    ])
}

/// Write an ID label texture as RGB24 packed PNG.
pub fn write_id_texture(
    labels: &[u32],
    width: u32,
    height: u32,
    path: &Path,
) -> Result<(), String> {
    let no_label = u32::MAX;
    let mut img = ImageBuffer::new(width, height);

    for (i, pixel) in img.pixels_mut().enumerate() {
        if labels[i] == no_label {
            *pixel = Rgb([0, 0, 0]); // Black for unlabeled
        } else {
            *pixel = pack_id_rgb(labels[i]);
        }
    }

    img.save(path)
        .map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write a grayscale 8-bit texture.
pub fn write_mask_texture(data: &[u8], width: u32, height: u32, path: &Path) -> Result<(), String> {
    let img: GrayImage = ImageBuffer::from_raw(width, height, data.to_vec())
        .ok_or_else(|| "Failed to create grayscale image".to_string())?;
    img.save(path)
        .map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write a 16-bit grayscale height texture.
pub fn write_height_texture(
    data: &[u16],
    width: u32,
    height: u32,
    path: &Path,
) -> Result<(), String> {
    let img: ImageBuffer<Luma<u16>, Vec<u16>> = ImageBuffer::from_raw(width, height, data.to_vec())
        .ok_or_else(|| "Failed to create 16-bit image".to_string())?;
    img.save(path)
        .map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write an RGB image.
pub fn write_rgb_image(img: &RgbImage, path: &Path) -> Result<(), String> {
    img.save(path)
        .map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write the landmask as boolean -> u8 texture.
pub fn write_landmask(mask: &[bool], width: u32, height: u32, path: &Path) -> Result<(), String> {
    let data: Vec<u8> = mask.iter().map(|&v| if v { 255u8 } else { 0u8 }).collect();
    write_mask_texture(&data, width, height, path)
}

/// Write suitability as f32 binary file.
pub fn write_f32_binary(data: &[f32], path: &Path) -> Result<(), String> {
    let bytes: Vec<u8> = data.iter().flat_map(|f| f.to_le_bytes()).collect();
    std::fs::write(path, bytes).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write seeds as JSON (array of {id, x, y}).
pub fn write_seeds_json(seeds: &[Seed], path: &Path) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(seeds).map_err(|e| format!("JSON serialize error: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write adjacency data as JSON.
pub fn write_adjacency_json(adjacency: &[ProvinceAdjacency], path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(adjacency)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write province records.
pub fn write_provinces_json(provinces: &[ProvinceRecord], path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(provinces)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write duchy records.
pub fn write_duchies_json(duchies: &[DuchyRecord], path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(duchies)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Write kingdom records.
pub fn write_kingdoms_json(kingdoms: &[KingdomRecord], path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(kingdoms)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to save {}: {}", path.display(), e))
}

/// Pipeline status tracking — which stages are completed.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStatus {
    pub stages: std::collections::HashMap<String, StageRecord>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRecord {
    pub completed: bool,
    pub completed_at: Option<u64>,
}

impl PipelineStatus {
    pub fn new() -> Self {
        Self {
            stages: std::collections::HashMap::new(),
        }
    }

    pub fn mark_completed(&mut self, stage_id: &str) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.stages.insert(
            stage_id.to_string(),
            StageRecord {
                completed: true,
                completed_at: Some(now),
            },
        );
    }

    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(Self::new)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("JSON error: {}", e))?;
        std::fs::write(path, json).map_err(|e| format!("Failed to save: {}", e))
    }
}
