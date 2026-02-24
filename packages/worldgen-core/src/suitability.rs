use crate::biome::*;
use crate::raster::distance_transform;

/// Stage 6: Suitability map for settlement density.
/// Higher suitability = more/smaller provinces. Lower = fewer/larger provinces.
pub fn compute_suitability(
    height: &[u16],
    landmask: &[bool],
    river_mask: &[u8],
    biome: &[u8],
    width: u32,
    height_dim: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<f32> {
    let n = (width * height_dim) as usize;

    on_progress(0.0, "Computing river proximity");

    // River proximity
    let river_bool: Vec<bool> = river_mask.iter().map(|&v| v > 0).collect();
    let river_dist = distance_transform(&river_bool, width, height_dim);

    on_progress(20.0, "Computing coast proximity");

    // Coast proximity (distance from sea)
    let coast_dist = distance_transform(landmask, width, height_dim);

    on_progress(40.0, "Computing slope");

    // Slope
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

    on_progress(60.0, "Computing suitability");

    let mut suitability = vec![0.0f32; n];

    for i in 0..n {
        if !landmask[i] {
            suitability[i] = 0.0;
            continue;
        }

        let river_prox = (1.0 - (river_dist[i] / 100.0).min(1.0)).max(0.0);
        let coast_prox = (1.0 - (coast_dist[i] / 150.0).min(1.0)).max(0.0);
        let elev = height[i] as f32 / 65535.0;
        let elev_mid = 1.0 - (elev - 0.3).abs() * 2.0; // Peak at elevation 0.3
        let flat = (1.0 - slope[i] * 20.0).max(0.0);

        // Biome weight
        let biome_weight = match biome[i] {
            BIOME_GRASSLAND => 0.9,
            BIOME_TEMPERATE => 0.8,
            BIOME_SAVANNA => 0.6,
            BIOME_TROPICAL => 0.5,
            BIOME_TAIGA => 0.3,
            BIOME_DESERT => 0.15,
            BIOME_TUNDRA => 0.1,
            BIOME_MOUNTAIN => 0.05,
            BIOME_ICE => 0.0,
            _ => 0.4,
        };

        suitability[i] = (0.30 * river_prox
            + 0.15 * coast_prox
            + 0.25 * flat
            + 0.10 * elev_mid.max(0.0)
            + 0.20 * biome_weight)
            .clamp(0.0, 1.0);
    }

    on_progress(100.0, "Suitability complete");
    suitability
}
