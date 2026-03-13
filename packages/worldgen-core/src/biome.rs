use crate::biome_archetype::BiomeRegistry;
use crate::landmask::rgb_to_hsv;
use crate::raster::distance_transform;
use crate::WorldgenConfig;
use image::RgbImage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeModelSettings {
    pub deterministic_weight: f32,
    pub color_weight: f32,
    pub vision_weight: f32,
    pub smoothing_passes: u32,
    pub confidence_floor: f32,
    pub vision_model_id: String,
    pub vision_tile_size: u32,
    pub analysis_version: String,
}

impl Default for BiomeModelSettings {
    fn default() -> Self {
        Self {
            deterministic_weight: 1.0,
            color_weight: 0.8,
            vision_weight: 0.6,
            smoothing_passes: 1,
            confidence_floor: 0.45,
            vision_model_id: "gemini-2.5-flash".to_string(),
            vision_tile_size: 1024,
            analysis_version: "v1".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeVisionCandidate {
    pub biome_id: String,
    pub coverage: f32,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeVisionTilePrior {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub notable_cues: Vec<String>,
    #[serde(default)]
    pub candidates: Vec<BiomeVisionCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeVisionCellPrior {
    pub x: u32,
    pub y: u32,
    #[serde(default)]
    pub candidates: Vec<BiomeVisionCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BiomeVisionAnalysis {
    #[serde(default)]
    pub source_image_hash: String,
    #[serde(default)]
    pub analysis_version: String,
    #[serde(default)]
    pub model_id: String,
    pub tile_size: u32,
    pub cell_size: u32,
    pub grid_width: u32,
    pub grid_height: u32,
    #[serde(default)]
    pub generated_at: Option<String>,
    #[serde(default)]
    pub tiles: Vec<BiomeVisionTilePrior>,
    #[serde(default)]
    pub cells: Vec<BiomeVisionCellPrior>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomePaletteEntry {
    pub index: u8,
    pub biome_id: String,
    pub name: String,
    pub hex_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeCoverageSummary {
    pub biome_id: String,
    pub name: String,
    pub hex_color: String,
    pub pixel_count: u64,
    pub pixel_share: f32,
    pub avg_confidence: f32,
    pub province_count: u32,
    #[serde(default)]
    pub top_candidate_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeMixEntry {
    pub biome_id: String,
    pub pixel_count: u32,
    pub pixel_share: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeProvinceSummary {
    pub province_id: u32,
    pub biome_primary_id: String,
    pub biome_confidence: f32,
    #[serde(default)]
    pub biome_candidate_ids: Vec<String>,
    #[serde(default)]
    pub biome_mix: Vec<BiomeMixEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BiomeReport {
    pub width: u32,
    pub height: u32,
    pub analysis_version: String,
    #[serde(default)]
    pub source_image_hash: Option<String>,
    pub vision_available: bool,
    #[serde(default)]
    pub vision_model_id: Option<String>,
    pub confidence_floor: f32,
    pub average_confidence: f32,
    pub low_confidence_pixel_count: u64,
    #[serde(default)]
    pub active_biomes: Vec<BiomeCoverageSummary>,
    #[serde(default)]
    pub province_summaries: Vec<BiomeProvinceSummary>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BiomeAnalysisResult {
    pub biome_indices: Vec<u8>,
    pub confidence_map: Vec<u8>,
    pub report: BiomeReport,
}

#[derive(Debug, Clone)]
struct EnvironmentalRasters {
    temperature: Vec<f32>,
    precipitation: Vec<f32>,
    elevation: Vec<f32>,
    slope: Vec<f32>,
    coast_distance: Vec<f32>,
    river_distance: Vec<f32>,
    hue: Vec<f32>,
    saturation: Vec<f32>,
    value: Vec<f32>,
}

/// Stage 5: biome classification with calibrated archetypes, confidence, and optional vision priors.
pub fn classify_biomes(
    height: &[u16],
    landmask: &[bool],
    river_mask: Option<&[u8]>,
    img: &RgbImage,
    config: &WorldgenConfig,
    registry: &BiomeRegistry,
    model_settings: &BiomeModelSettings,
    vision_analysis: Option<&BiomeVisionAnalysis>,
    width: u32,
    height_dim: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> BiomeAnalysisResult {
    let n = (width * height_dim) as usize;
    let rasters = derive_environmental_rasters(
        height,
        landmask,
        river_mask,
        img,
        config,
        width,
        height_dim,
        on_progress,
    );

    on_progress(55.0, "Scoring biome archetypes");

    let mut biome_indices = vec![0u8; n];
    let mut confidence = vec![0u8; n];
    let mut pixel_counts = vec![0u64; registry.archetypes.len()];
    let mut confidence_sums = vec![0f32; registry.archetypes.len()];
    let mut confusion_counts = vec![vec![0u64; registry.archetypes.len()]; registry.archetypes.len()];
    let use_color = config.color_based_biomes;
    let vision_available = vision_analysis
        .map(|analysis| !analysis.cells.is_empty())
        .unwrap_or(false);
    let ocean_idx = water_biome_index(registry, "ocean").unwrap_or(0);
    let deep_ocean_idx = water_biome_index(registry, "deep_ocean").unwrap_or(ocean_idx);
    let abyssal_idx = water_biome_index(registry, "abyssal_ocean").unwrap_or(deep_ocean_idx);

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;

            if !landmask[i] {
                let elev = rasters.elevation[i];
                let water_idx = if elev < 0.2 {
                    abyssal_idx
                } else if elev < 0.35 {
                    deep_ocean_idx
                } else {
                    ocean_idx
                };
                biome_indices[i] = water_idx as u8;
                confidence[i] = 255;
                pixel_counts[water_idx] += 1;
                confidence_sums[water_idx] += 1.0;
                continue;
            }

            let mut scored = registry
                .archetypes
                .iter()
                .enumerate()
                .map(|(idx, archetype)| {
                    let env_score = archetype.environmental_score(
                        rasters.temperature[i],
                        rasters.precipitation[i],
                        rasters.elevation[i],
                        rasters.slope[i],
                    );
                    let color_score = if use_color {
                        archetype.color_score(
                            rasters.hue[i],
                            rasters.saturation[i],
                            rasters.value[i],
                        )
                    } else {
                        0.0
                    };
                    let vision_penalty = if vision_available {
                        vision_penalty_for_pixel(vision_analysis, x, y, &archetype.id)
                    } else {
                        0.0
                    };
                    let total_score = env_score * model_settings.deterministic_weight
                        + color_score * model_settings.color_weight
                        + vision_penalty * model_settings.vision_weight
                        + archetype.calibration.score_bias;
                    (idx, total_score)
                })
                .collect::<Vec<_>>();

            scored.sort_by(|left, right| left.1.total_cmp(&right.1));

            let best = scored[0];
            let second = scored.get(1).copied().unwrap_or(best);
            let third = scored.get(2).copied().unwrap_or(second);
            let margin = (second.1 - best.1).max(0.0);
            let denom = second.1.abs() + best.1.abs() + 0.0001;
            let conf = (margin / denom).clamp(0.0, 1.0);

            biome_indices[i] = best.0 as u8;
            confidence[i] = (conf * 255.0).round() as u8;
            pixel_counts[best.0] += 1;
            confidence_sums[best.0] += conf;
            confusion_counts[best.0][second.0] += 1;
            confusion_counts[best.0][third.0] += 1;
        }
    }

    on_progress(80.0, "Smoothing low-confidence edges");

    smooth_low_confidence_edges(
        &mut biome_indices,
        &mut confidence,
        landmask,
        &rasters,
        model_settings,
        width,
        height_dim,
    );

    on_progress(92.0, "Building biome diagnostics");

    let report = build_biome_report(
        registry,
        vision_analysis,
        model_settings,
        width,
        height_dim,
        &biome_indices,
        &confidence,
        &pixel_counts,
        &confidence_sums,
        &confusion_counts,
    );

    on_progress(100.0, "Biome classification complete");

    BiomeAnalysisResult {
        biome_indices,
        confidence_map: confidence,
        report,
    }
}

pub fn biome_palette(registry: &BiomeRegistry) -> Vec<BiomePaletteEntry> {
    registry
        .archetypes
        .iter()
        .enumerate()
        .map(|(index, archetype)| BiomePaletteEntry {
            index: index as u8,
            biome_id: archetype.id.clone(),
            name: archetype.name.clone(),
            hex_color: archetype.hex_color.clone(),
        })
        .collect()
}

fn derive_environmental_rasters(
    height: &[u16],
    landmask: &[bool],
    river_mask: Option<&[u8]>,
    img: &RgbImage,
    config: &WorldgenConfig,
    width: u32,
    height_dim: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> EnvironmentalRasters {
    let n = (width * height_dim) as usize;

    on_progress(0.0, "Computing slope");
    let mut slope = vec![0.0f32; n];
    for y in 1..(height_dim - 1) {
        for x in 0..width {
            let i = (y * width + x) as usize;
            let left_x = if x == 0 { width - 1 } else { x - 1 };
            let right_x = if x == width - 1 { 0 } else { x + 1 };
            let dh_dx = (height[(y * width + right_x) as usize] as f32
                - height[(y * width + left_x) as usize] as f32)
                / 2.0;
            let dh_dy = (height[((y + 1) * width + x) as usize] as f32
                - height[((y - 1) * width + x) as usize] as f32)
                / 2.0;
            slope[i] = (dh_dx * dh_dx + dh_dy * dh_dy).sqrt() / 65535.0;
        }
    }

    on_progress(15.0, "Computing coast distance");
    let coast_distance = distance_transform(landmask, width, height_dim);

    on_progress(25.0, "Computing river distance");
    let river_distance = if let Some(river_mask) = river_mask {
        let river_bool = river_mask.iter().map(|&value| value > 0).collect::<Vec<_>>();
        distance_transform(&river_bool, width, height_dim)
    } else {
        vec![width.max(height_dim) as f32; n]
    };

    on_progress(35.0, "Computing color samples");
    let mut temperature = vec![0.0f32; n];
    let mut precipitation = vec![0.0f32; n];
    let mut elevation = vec![0.0f32; n];
    let mut hue = vec![0.0f32; n];
    let mut saturation = vec![0.0f32; n];
    let mut value = vec![0.0f32; n];

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;
            let lat = y as f32 / height_dim as f32;
            let equator_warmth = 1.0 - (lat - 0.5).abs() * 2.0;
            let elev = height[i] as f32 / 65535.0;
            let coast_prox = (1.0 - (coast_distance[i] / 220.0).min(1.0)).max(0.0);
            let river_prox = (1.0 - (river_distance[i] / 120.0).min(1.0)).max(0.0);

            temperature[i] = (equator_warmth - elev * 0.35).clamp(0.0, 1.0);
            precipitation[i] = (0.25 + coast_prox * 0.45 + river_prox * 0.2 - elev * 0.25)
                .clamp(0.0, 1.0);
            elevation[i] = elev;

            if config.color_based_biomes {
                let pixel = img.get_pixel(x, y);
                let (h, s, v) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);
                hue[i] = h;
                saturation[i] = s;
                value[i] = v;
            }
        }
    }

    EnvironmentalRasters {
        temperature,
        precipitation,
        elevation,
        slope,
        coast_distance,
        river_distance,
        hue,
        saturation,
        value,
    }
}

fn build_biome_report(
    registry: &BiomeRegistry,
    vision_analysis: Option<&BiomeVisionAnalysis>,
    model_settings: &BiomeModelSettings,
    width: u32,
    height: u32,
    biome_indices: &[u8],
    confidence_map: &[u8],
    pre_smooth_pixel_counts: &[u64],
    pre_smooth_confidence_sums: &[f32],
    confusion_counts: &[Vec<u64>],
) -> BiomeReport {
    let total_pixels = biome_indices.len() as f32;
    let mut counts = vec![0u64; registry.archetypes.len()];
    let mut confidence_sums = vec![0f32; registry.archetypes.len()];
    let mut average_confidence = 0.0;
    let mut low_confidence_pixel_count = 0u64;

    for (index, &biome_idx) in biome_indices.iter().enumerate() {
        let confidence = confidence_map[index] as f32 / 255.0;
        let biome_idx = biome_idx as usize;
        counts[biome_idx] += 1;
        confidence_sums[biome_idx] += confidence;
        average_confidence += confidence;
        if confidence < model_settings.confidence_floor {
            low_confidence_pixel_count += 1;
        }
    }

    let mut active_biomes = Vec::new();
    for (idx, archetype) in registry.archetypes.iter().enumerate() {
        let pixel_count = counts[idx];
        if pixel_count == 0 {
            continue;
        }

        let mut top_candidates = confusion_counts[idx]
            .iter()
            .enumerate()
            .filter(|(candidate_idx, count)| *candidate_idx != idx && **count > 0)
            .collect::<Vec<_>>();
        top_candidates.sort_by(|left, right| right.1.cmp(left.1));

        active_biomes.push(BiomeCoverageSummary {
            biome_id: archetype.id.clone(),
            name: archetype.name.clone(),
            hex_color: archetype.hex_color.clone(),
            pixel_count,
            pixel_share: pixel_count as f32 / total_pixels,
            avg_confidence: if pixel_count > 0 {
                confidence_sums[idx] / pixel_count as f32
            } else if pre_smooth_pixel_counts[idx] > 0 {
                pre_smooth_confidence_sums[idx] / pre_smooth_pixel_counts[idx] as f32
            } else {
                0.0
            },
            province_count: 0,
            top_candidate_ids: top_candidates
                .into_iter()
                .take(3)
                .map(|(candidate_idx, _)| registry.archetypes[candidate_idx].id.clone())
                .collect(),
        });
    }

    active_biomes.sort_by(|left, right| right.pixel_count.cmp(&left.pixel_count));

    BiomeReport {
        width,
        height,
        analysis_version: model_settings.analysis_version.clone(),
        source_image_hash: vision_analysis.and_then(|analysis| {
            if analysis.source_image_hash.is_empty() {
                None
            } else {
                Some(analysis.source_image_hash.clone())
            }
        }),
        vision_available: vision_analysis
            .map(|analysis| !analysis.cells.is_empty())
            .unwrap_or(false),
        vision_model_id: vision_analysis.and_then(|analysis| {
            if analysis.model_id.is_empty() {
                None
            } else {
                Some(analysis.model_id.clone())
            }
        }),
        confidence_floor: model_settings.confidence_floor,
        average_confidence: if total_pixels > 0.0 {
            average_confidence / total_pixels
        } else {
            0.0
        },
        low_confidence_pixel_count,
        active_biomes,
        province_summaries: Vec::new(),
    }
}

fn smooth_low_confidence_edges(
    biome_indices: &mut Vec<u8>,
    confidence: &mut Vec<u8>,
    landmask: &[bool],
    rasters: &EnvironmentalRasters,
    model_settings: &BiomeModelSettings,
    width: u32,
    height: u32,
) {
    for _ in 0..model_settings.smoothing_passes {
        let mut next = biome_indices.clone();
        let mut next_confidence = confidence.clone();

        for y in 1..(height - 1) {
            for x in 1..(width - 1) {
                let i = (y * width + x) as usize;
                if !landmask[i] {
                    continue;
                }
                if confidence[i] as f32 / 255.0 >= model_settings.confidence_floor {
                    continue;
                }
                if rasters.coast_distance[i] <= 4.0 || rasters.elevation[i] >= 0.82 {
                    continue;
                }

                let mut counts = HashMap::<u8, u32>::new();
                let mut conf_sum = HashMap::<u8, u32>::new();
                for ny in (y - 1)..=(y + 1) {
                    for nx in (x - 1)..=(x + 1) {
                        if nx == x && ny == y {
                            continue;
                        }
                        let ni = (ny * width + nx) as usize;
                        if !landmask[ni] {
                            continue;
                        }
                        *counts.entry(biome_indices[ni]).or_insert(0) += 1;
                        *conf_sum.entry(biome_indices[ni]).or_insert(0) += confidence[ni] as u32;
                    }
                }

                let Some((&best_label, &best_count)) =
                    counts.iter().max_by_key(|(_, count)| *count)
                else {
                    continue;
                };

                if best_count >= 5 && best_label != biome_indices[i] {
                    next[i] = best_label;
                    let avg_conf = conf_sum.get(&best_label).copied().unwrap_or(0) / best_count;
                    next_confidence[i] = avg_conf.min(255) as u8;
                }
            }
        }

        *biome_indices = next;
        *confidence = next_confidence;
    }
}

fn water_biome_index(registry: &BiomeRegistry, preferred_id: &str) -> Option<usize> {
    registry
        .index_of_id(preferred_id)
        .or_else(|| registry.archetypes.iter().position(|entry| entry.id.contains("ocean")))
}

fn vision_penalty_for_pixel(
    vision_analysis: Option<&BiomeVisionAnalysis>,
    x: u32,
    y: u32,
    biome_id: &str,
) -> f32 {
    let Some(vision_analysis) = vision_analysis else {
        return 0.0;
    };
    if vision_analysis.cells.is_empty()
        || vision_analysis.grid_width == 0
        || vision_analysis.grid_height == 0
        || vision_analysis.cell_size == 0
    {
        return 0.0;
    }

    let cell_x = (x / vision_analysis.cell_size).min(vision_analysis.grid_width - 1);
    let cell_y = (y / vision_analysis.cell_size).min(vision_analysis.grid_height - 1);
    let cell_index = (cell_y * vision_analysis.grid_width + cell_x) as usize;
    let Some(cell) = vision_analysis.cells.get(cell_index) else {
        return 0.0;
    };

    let prior_strength = cell
        .candidates
        .iter()
        .find(|candidate| candidate.biome_id == biome_id)
        .map(|candidate| (candidate.coverage * candidate.confidence).clamp(0.0, 1.0))
        .unwrap_or(0.0);

    if prior_strength == 0.0 {
        1.0
    } else {
        1.0 - prior_strength
    }
}
