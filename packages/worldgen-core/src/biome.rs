use crate::raster::distance_transform;

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

/// Stage 5: Biome classification.
/// Inputs: latitude (from y position), elevation, slope, coast distance.
pub fn classify_biomes(
    height: &[u16],
    landmask: &[bool],
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

            // Classification rules (priority order)
            if elev > 0.75 || s > 0.05 {
                biome[i] = BIOME_MOUNTAIN;
            } else if temp < 0.15 {
                biome[i] = if elev > 0.5 { BIOME_ICE } else { BIOME_TUNDRA };
            } else if temp < 0.3 {
                biome[i] = BIOME_TAIGA;
            } else if temp > 0.7 && rain < 0.3 {
                biome[i] = BIOME_DESERT;
            } else if temp > 0.7 && rain > 0.5 {
                biome[i] = BIOME_TROPICAL;
            } else if temp > 0.5 && rain < 0.4 {
                biome[i] = BIOME_SAVANNA;
            } else if rain > 0.5 {
                biome[i] = BIOME_TEMPERATE;
            } else {
                biome[i] = BIOME_GRASSLAND;
            }
        }
    }

    on_progress(100.0, "Biome classification complete");
    biome
}
