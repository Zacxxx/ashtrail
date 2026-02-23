//! Cell Analyzer — Per-cell feature extraction from planet texture pixels + geography regions.
//!
//! Each cell in the grid gets analyzed independently:
//! 1. Sample pixels in the cell's rectangular area of the texture
//! 2. Compute color statistics (dominant color, variance, luminance, channel ratios)
//! 3. Classify terrain from color heuristics
//! 4. Cross-reference with user-drawn geography regions (point-in-polygon)
//! 5. Detect coastal cells (land neighbors water)
//! 6. Derive game-ready features (vegetation, aridity, elevation estimate)

use rayon::prelude::*;
use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────
// Input types
// ────────────────────────────────────────────────────────

/// A geography region polygon passed in from the frontend / loaded from geography.json.
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeoRegionInput {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub region_type: String,
    /// Normalized [x, y] pairs in 0..1 range (equirectangular projection).
    pub polygon: Vec<[f64; 2]>,
    pub metadata: Option<RegionMetadata>,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RegionMetadata {
    pub description: Option<String>,
    pub area_percent: Option<f64>,
    pub avg_elevation: Option<f64>,
    pub avg_temperature: Option<f64>,
}

// ────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────

/// Analysis result per-cell — written to cell_features.json.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellAnalysis {
    pub x: u32,
    pub y: u32,

    // ── Pixel-derived ──
    pub dominant_color: String,
    pub color_variance: f64,
    pub luminance: f64,
    pub blue_ratio: f64,
    pub green_ratio: f64,
    pub red_ratio: f64,
    pub saturation: f64,
    pub terrain_class: String,

    // ── Region-derived ──
    pub regions: Vec<CellRegionMatch>,
    pub primary_region: Option<String>,
    pub primary_region_type: Option<String>,

    // ── Game-ready features ──
    pub elevation_estimate: f64,
    pub is_water: bool,
    pub is_coastal: bool,
    pub vegetation_index: f64,
    pub aridity_index: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellRegionMatch {
    pub region_id: String,
    pub region_name: String,
    pub region_type: String,
}

/// Full analysis result for all cells.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellAnalysisResult {
    pub cols: u32,
    pub rows: u32,
    pub total_cells: usize,
    pub cells: Vec<CellAnalysis>,
}

/// Progress callback data.
pub struct AnalysisProgress {
    pub progress: f32,
    pub stage: &'static str,
}

// ────────────────────────────────────────────────────────
// Core analysis
// ────────────────────────────────────────────────────────

/// Analyze all cells in the grid. This is the main entry point.
///
/// - `image_rgba`: raw RGBA pixel bytes of the planet texture.
/// - `image_width`, `image_height`: dimensions of the texture.
/// - `cols`, `rows`: grid dimensions (how many cells).
/// - `regions`: geography regions from the frontend / disk.
/// - `on_progress`: callback for progress reporting.
pub fn analyze_cells<F>(
    image_rgba: &[u8],
    image_width: u32,
    image_height: u32,
    cols: u32,
    rows: u32,
    regions: &[GeoRegionInput],
    mut on_progress: F,
) -> CellAnalysisResult
where
    F: FnMut(AnalysisProgress),
{
    let total = (cols * rows) as usize;

    on_progress(AnalysisProgress {
        progress: 2.0,
        stage: "Sampling cell pixels",
    });

    // ── PASS 1: Parallel pixel analysis per cell ──
    let pixel_stats: Vec<PixelStats> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let cx = idx as u32 % cols;
            let cy = idx as u32 / cols;
            sample_cell_pixels(image_rgba, image_width, image_height, cols, rows, cx, cy)
        })
        .collect();

    on_progress(AnalysisProgress {
        progress: 30.0,
        stage: "Classifying terrain",
    });

    // ── PASS 2: Terrain classification (parallel) ──
    let classifications: Vec<TerrainInfo> = pixel_stats
        .par_iter()
        .map(|stats| classify_terrain(stats))
        .collect();

    on_progress(AnalysisProgress {
        progress: 45.0,
        stage: "Matching geography regions",
    });

    // ── PASS 3: Region matching (parallel) ──
    let region_matches: Vec<Vec<CellRegionMatch>> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let cx = idx as u32 % cols;
            let cy = idx as u32 / cols;
            let center_x = (cx as f64 + 0.5) / cols as f64;
            let center_y = (cy as f64 + 0.5) / rows as f64;
            find_matching_regions(center_x, center_y, regions)
        })
        .collect();

    on_progress(AnalysisProgress {
        progress: 70.0,
        stage: "Detecting coastlines",
    });

    // ── PASS 4: Coastal detection (needs neighbor info, sequential scan) ──
    let mut is_coastal = vec![false; total];
    for idx in 0..total {
        if !classifications[idx].is_water {
            // Check 4-neighbors for water
            let cx = (idx as u32 % cols) as i32;
            let cy = (idx as u32 / cols) as i32;
            for (dx, dy) in &[(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nx = (cx + dx).rem_euclid(cols as i32);
                let ny = cy + dy;
                if ny >= 0 && ny < rows as i32 {
                    let n_idx = (ny * cols as i32 + nx) as usize;
                    if classifications[n_idx].is_water {
                        is_coastal[idx] = true;
                        break;
                    }
                }
            }
        }
    }

    on_progress(AnalysisProgress {
        progress: 85.0,
        stage: "Assembling cell features",
    });

    // ── PASS 5: Final assembly (parallel) ──
    let cells: Vec<CellAnalysis> = (0..total)
        .into_par_iter()
        .map(|idx| {
            let cx = idx as u32 % cols;
            let cy = idx as u32 / cols;
            let stats = &pixel_stats[idx];
            let terrain = &classifications[idx];
            let matches = &region_matches[idx];

            // Pick primary region = smallest/most specific one
            let primary = pick_primary_region(matches, regions);

            CellAnalysis {
                x: cx,
                y: cy,
                dominant_color: format!(
                    "#{:02x}{:02x}{:02x}",
                    (stats.avg_r * 255.0) as u8,
                    (stats.avg_g * 255.0) as u8,
                    (stats.avg_b * 255.0) as u8
                ),
                color_variance: stats.variance,
                luminance: stats.luminance,
                blue_ratio: stats.blue_ratio,
                green_ratio: stats.green_ratio,
                red_ratio: stats.red_ratio,
                saturation: stats.saturation,
                terrain_class: terrain.class.clone(),
                regions: matches.clone(),
                primary_region: primary.as_ref().map(|p| p.region_name.clone()),
                primary_region_type: primary.map(|p| p.region_type),
                elevation_estimate: terrain.elevation_estimate,
                is_water: terrain.is_water,
                is_coastal: is_coastal[idx],
                vegetation_index: terrain.vegetation_index,
                aridity_index: terrain.aridity_index,
            }
        })
        .collect();

    on_progress(AnalysisProgress {
        progress: 100.0,
        stage: "Analysis complete",
    });

    CellAnalysisResult {
        cols,
        rows,
        total_cells: total,
        cells,
    }
}

// ────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────

struct PixelStats {
    avg_r: f64,
    avg_g: f64,
    avg_b: f64,
    luminance: f64,
    variance: f64,
    blue_ratio: f64,
    green_ratio: f64,
    red_ratio: f64,
    saturation: f64,
}

struct TerrainInfo {
    class: String,
    is_water: bool,
    elevation_estimate: f64,
    vegetation_index: f64,
    aridity_index: f64,
}

/// Sample all pixels that fall within a cell's rectangular area of the texture.
fn sample_cell_pixels(
    image_rgba: &[u8],
    image_width: u32,
    image_height: u32,
    cols: u32,
    rows: u32,
    cx: u32,
    cy: u32,
) -> PixelStats {
    // Map cell to pixel rectangle
    let px_start = (cx as f64 / cols as f64 * image_width as f64) as u32;
    let px_end = (((cx + 1) as f64 / cols as f64) * image_width as f64).ceil() as u32;
    let py_start = (cy as f64 / rows as f64 * image_height as f64) as u32;
    let py_end = (((cy + 1) as f64 / rows as f64) * image_height as f64).ceil() as u32;

    let px_end = px_end.min(image_width);
    let py_end = py_end.min(image_height);

    let mut sum_r: f64 = 0.0;
    let mut sum_g: f64 = 0.0;
    let mut sum_b: f64 = 0.0;
    let mut count: u64 = 0;
    let mut pixels: Vec<(f64, f64, f64)> = Vec::new();

    for py in py_start..py_end {
        for px in px_start..px_end {
            let idx = ((py * image_width + px) * 4) as usize;
            if idx + 2 < image_rgba.len() {
                let r = image_rgba[idx] as f64 / 255.0;
                let g = image_rgba[idx + 1] as f64 / 255.0;
                let b = image_rgba[idx + 2] as f64 / 255.0;
                sum_r += r;
                sum_g += g;
                sum_b += b;
                count += 1;
                pixels.push((r, g, b));
            }
        }
    }

    if count == 0 {
        return PixelStats {
            avg_r: 0.0,
            avg_g: 0.0,
            avg_b: 0.0,
            luminance: 0.0,
            variance: 0.0,
            blue_ratio: 0.0,
            green_ratio: 0.0,
            red_ratio: 0.0,
            saturation: 0.0,
        };
    }

    let n = count as f64;
    let avg_r = sum_r / n;
    let avg_g = sum_g / n;
    let avg_b = sum_b / n;
    let luminance = 0.299 * avg_r + 0.587 * avg_g + 0.114 * avg_b;

    // Color variance: average squared distance from mean color
    let variance = pixels
        .iter()
        .map(|(r, g, b)| {
            let dr = r - avg_r;
            let dg = g - avg_g;
            let db = b - avg_b;
            dr * dr + dg * dg + db * db
        })
        .sum::<f64>()
        / n;

    // Channel ratios (relative to total)
    let total_rgb = avg_r + avg_g + avg_b;
    let (red_ratio, green_ratio, blue_ratio) = if total_rgb > 0.001 {
        (avg_r / total_rgb, avg_g / total_rgb, avg_b / total_rgb)
    } else {
        (0.333, 0.333, 0.333)
    };

    // Saturation (simple HSL-like)
    let c_max = avg_r.max(avg_g).max(avg_b);
    let c_min = avg_r.min(avg_g).min(avg_b);
    let saturation = if c_max > 0.001 {
        (c_max - c_min) / c_max
    } else {
        0.0
    };

    PixelStats {
        avg_r,
        avg_g,
        avg_b,
        luminance,
        variance,
        blue_ratio,
        green_ratio,
        red_ratio,
        saturation,
    }
}

/// Classify terrain from pixel statistics.
fn classify_terrain(stats: &PixelStats) -> TerrainInfo {
    let is_water = stats.blue_ratio > 0.42 && stats.avg_b > stats.avg_r * 1.15;

    let class;
    let mut elevation_estimate;
    let vegetation_index;
    let aridity_index;

    if is_water {
        // Water depth from darkness
        if stats.luminance < 0.12 {
            class = "deep_ocean".to_string();
            elevation_estimate = 0.05;
        } else if stats.luminance < 0.25 {
            class = "ocean".to_string();
            elevation_estimate = 0.15;
        } else {
            class = "shallow_water".to_string();
            elevation_estimate = 0.30;
        }
        vegetation_index = 0.0;
        aridity_index = 0.0;
    } else if stats.luminance > 0.85 && stats.saturation < 0.15 {
        // Very bright + desaturated = ice/snow
        class = "ice".to_string();
        elevation_estimate = 0.9;
        vegetation_index = 0.0;
        aridity_index = 0.8;
    } else if stats.red_ratio > 0.42 && stats.green_ratio < 0.30 && stats.saturation > 0.25 {
        // Strong red, low green = volcanic or hot desert
        class = "volcanic".to_string();
        elevation_estimate = 0.55;
        vegetation_index = 0.0;
        aridity_index = 0.95;
    } else if stats.green_ratio > 0.40 && stats.saturation > 0.15 {
        // Greenish = vegetated land
        if stats.luminance < 0.25 {
            class = "dense_forest".to_string();
            elevation_estimate = 0.50;
            vegetation_index = 0.95;
            aridity_index = 0.1;
        } else if stats.luminance < 0.45 {
            class = "forest".to_string();
            elevation_estimate = 0.52;
            vegetation_index = 0.75;
            aridity_index = 0.2;
        } else {
            class = "grassland".to_string();
            elevation_estimate = 0.55;
            vegetation_index = 0.5;
            aridity_index = 0.3;
        }
    } else if stats.luminance > 0.65 && stats.saturation < 0.25 {
        // Bright, desaturated = desert / arid high land
        class = "desert".to_string();
        elevation_estimate = 0.60;
        vegetation_index = 0.05;
        aridity_index = 0.9;
    } else if stats.luminance > 0.55 {
        // Medium-bright = highlands / savanna
        class = "highlands".to_string();
        elevation_estimate = 0.70;
        vegetation_index = 0.2;
        aridity_index = 0.5;
    } else {
        // Default mid-range land
        class = "lowland".to_string();
        elevation_estimate = 0.50;
        vegetation_index = 0.3;
        aridity_index = 0.4;
    }

    // Refine elevation from luminance for land cells
    if !is_water {
        // Higher luminance generally = higher altitude or lighter terrain
        elevation_estimate = (0.45 + stats.luminance * 0.55).clamp(0.4, 1.0);
    }

    TerrainInfo {
        class,
        is_water,
        elevation_estimate,
        vegetation_index,
        aridity_index,
    }
}

/// Point-in-polygon test (ray casting algorithm).
fn point_in_polygon(px: f64, py: f64, polygon: &[[f64; 2]]) -> bool {
    let n = polygon.len();
    if n < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let xi = polygon[i][0];
        let yi = polygon[i][1];
        let xj = polygon[j][0];
        let yj = polygon[j][1];

        if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Find all geography regions that contain the cell center point.
fn find_matching_regions(
    center_x: f64,
    center_y: f64,
    regions: &[GeoRegionInput],
) -> Vec<CellRegionMatch> {
    regions
        .iter()
        .filter(|r| point_in_polygon(center_x, center_y, &r.polygon))
        .map(|r| CellRegionMatch {
            region_id: r.id.clone(),
            region_name: r.name.clone(),
            region_type: r.region_type.clone(),
        })
        .collect()
}

/// Pick the most specific (smallest) region as primary.
/// Heuristic: the region with the fewest polygon vertices is likely the smallest drawn area.
fn pick_primary_region(
    matches: &[CellRegionMatch],
    all_regions: &[GeoRegionInput],
) -> Option<CellRegionMatch> {
    if matches.is_empty() {
        return None;
    }
    if matches.len() == 1 {
        return Some(matches[0].clone());
    }

    // Find the matched region with the smallest polygon (fewest vertices = likely smaller area)
    let mut best: Option<&CellRegionMatch> = None;
    let mut best_vertices = usize::MAX;

    for m in matches {
        if let Some(region) = all_regions.iter().find(|r| r.id == m.region_id) {
            if region.polygon.len() < best_vertices {
                best_vertices = region.polygon.len();
                best = Some(m);
            }
        }
    }

    best.cloned().or_else(|| Some(matches[0].clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_in_polygon_square() {
        let poly = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        assert!(point_in_polygon(0.5, 0.5, &poly));
        assert!(!point_in_polygon(1.5, 0.5, &poly));
    }

    #[test]
    fn test_point_in_polygon_triangle() {
        let poly = vec![[0.0, 0.0], [1.0, 0.0], [0.5, 1.0]];
        assert!(point_in_polygon(0.5, 0.3, &poly));
        assert!(!point_in_polygon(0.9, 0.9, &poly));
    }

    #[test]
    fn test_empty_polygon() {
        assert!(!point_in_polygon(0.5, 0.5, &[]));
        assert!(!point_in_polygon(0.5, 0.5, &[[0.0, 0.0]]));
    }
}
