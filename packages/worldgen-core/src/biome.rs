use crate::landmask::rgb_to_hsv;
use crate::raster::distance_transform;
use crate::WorldgenConfig;
use image::RgbImage;

/// Biome indices (stored as u8 in biome.png).
pub const BIOME_OCEAN: u8 = 0;
pub const BIOME_TUNDRA: u8 = 1;
pub const BIOME_TAIGA: u8 = 2;
pub const BIOME_TEMPERATE: u8 = 3;
pub const BIOME_GRASSLAND: u8 = 4;
pub const BIOME_DESERT: u8 = 5;
pub const BIOME_SAVANNA: u8 = 6;
pub const BIOME_TROPICAL: u8 = 7;
pub const BIOME_MOUNTAIN: u8 = 8;
pub const BIOME_ICE: u8 = 9;
pub const BIOME_VOLCANIC: u8 = 10;

/// Readable names for biome indices.
pub const BIOME_NAMES: [&str; 11] = [
    "ocean",
    "tundra",
    "taiga",
    "temperate_forest",
    "grassland",
    "desert",
    "savanna",
    "tropical_forest",
    "mountain",
    "ice",
    "volcanic",
];

struct BiomeColor {
    biome: u8,
    h: f32,
    s: f32,
    v: f32,
}

const BIOME_COLORS: &[BiomeColor] = &[
    BiomeColor {
        biome: BIOME_ICE,
        h: 0.0,
        s: 0.0,
        v: 0.9,
    }, // White
    BiomeColor {
        biome: BIOME_TUNDRA,
        h: 60.0,
        s: 0.2,
        v: 0.6,
    }, // Pale brown/gray
    BiomeColor {
        biome: BIOME_TAIGA,
        h: 120.0,
        s: 0.4,
        v: 0.3,
    }, // Dark green
    BiomeColor {
        biome: BIOME_TEMPERATE,
        h: 100.0,
        s: 0.5,
        v: 0.4,
    }, // Green
    BiomeColor {
        biome: BIOME_GRASSLAND,
        h: 80.0,
        s: 0.4,
        v: 0.6,
    }, // Light green/yellow
    BiomeColor {
        biome: BIOME_DESERT,
        h: 45.0,
        s: 0.5,
        v: 0.8,
    }, // Sand/yellow
    BiomeColor {
        biome: BIOME_SAVANNA,
        h: 60.0,
        s: 0.6,
        v: 0.6,
    }, // Dry yellow/green
    BiomeColor {
        biome: BIOME_TROPICAL,
        h: 140.0,
        s: 0.7,
        v: 0.3,
    }, // Deep lush green
    BiomeColor {
        biome: BIOME_MOUNTAIN,
        h: 0.0,
        s: 0.0,
        v: 0.4,
    }, // Gray
    BiomeColor {
        biome: BIOME_VOLCANIC,
        h: 0.0,
        s: 0.0,
        v: 0.1,
    }, // Black/dark gray
];

/// Stage 5: Biome classification.
/// Inputs: latitude (from y position), elevation, slope, coast distance.
pub fn classify_biomes(
    height: &[u16],
    landmask: &[bool],
    img: &RgbImage,
    config: &WorldgenConfig,
    width: u32,
    height_dim: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<u8> {
    let n = (width * height_dim) as usize;

    on_progress(0.0, "Computing slope");

    // Compute slope from height neighbors
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

    on_progress(25.0, "Computing coast distance");

    // Coast distance
    let coast_dist = distance_transform(landmask, width, height_dim);

    on_progress(50.0, "Classifying biomes");

    let mut biome = vec![BIOME_OCEAN; n];

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;

            if !landmask[i] {
                biome[i] = BIOME_OCEAN;
                continue;
            }

            // Latitude: 0.0 at top (north pole), 1.0 at bottom (south pole)
            let lat = y as f32 / height_dim as f32;
            // Temperature: warmest at equator (0.5), coldest at poles
            let temp = 1.0 - (lat - 0.5).abs() * 2.0;

            // Elevation normalized to 0..1
            let elev = height[i] as f32 / 65535.0;

            // Local slope
            let s = slope[i];

            // Coast proximity bonus for rainfall
            let coast_prox = (1.0 - (coast_dist[i] / 200.0).min(1.0)).max(0.0);

            // Simple rainfall estimate
            let rain = 0.5 + coast_prox * 0.3 - elev * 0.2;

            // Base procedural classification (used as prior)
            let mut proc_biome = BIOME_GRASSLAND;
            if elev > 0.75 || s > 0.05 {
                proc_biome = BIOME_MOUNTAIN;
            } else if temp < 0.15 {
                proc_biome = if elev > 0.5 { BIOME_ICE } else { BIOME_TUNDRA };
            } else if temp < 0.3 {
                proc_biome = BIOME_TAIGA;
            } else if temp > 0.7 && rain < 0.3 {
                proc_biome = BIOME_DESERT;
            } else if temp > 0.7 && rain > 0.5 {
                proc_biome = BIOME_TROPICAL;
            } else if temp > 0.5 && rain < 0.4 {
                proc_biome = BIOME_SAVANNA;
            } else if rain > 0.5 {
                proc_biome = BIOME_TEMPERATE;
            }

            if config.color_based_biomes {
                let pixel = img.get_pixel(x, y);
                let (h, s, v) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);

                let mut best_biome = proc_biome;
                let mut min_dist = f32::MAX;

                for bc in BIOME_COLORS {
                    let mut dh = (h - bc.h).abs();
                    if dh > 180.0 {
                        dh = 360.0 - dh;
                    }
                    dh /= 180.0;

                    let ds = s - bc.s;
                    let dv = v - bc.v;
                    let hue_weight = s.max(bc.s);

                    let dist = dh * dh * hue_weight + ds * ds + dv * dv;
                    let penalty = if bc.biome == proc_biome { 0.0 } else { 0.15 };

                    let total_score = dist + penalty;

                    if total_score < min_dist {
                        min_dist = total_score;
                        best_biome = bc.biome;
                    }
                }
                biome[i] = best_biome;
            } else {
                biome[i] = proc_biome;
            }
        }
    }

    on_progress(100.0, "Biome classification complete");
    biome
}
