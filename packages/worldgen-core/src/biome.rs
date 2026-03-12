use crate::biome_archetype::BiomeRegistry;
use crate::landmask::rgb_to_hsv;
use crate::raster::distance_transform;
use crate::WorldgenConfig;
use image::RgbImage;

/// Stage 5: Biome classification.
/// Uses the provided BiomeRegistry to match environmental conditions and colors.
pub fn classify_biomes(
    height: &[u16],
    landmask: &[bool],
    img: &RgbImage,
    config: &WorldgenConfig,
    registry: &BiomeRegistry,
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

    let mut biome_indices = vec![0u8; n]; // Default to first biome (usually ocean)

    for y in 0..height_dim {
        for x in 0..width {
            let i = (y * width + x) as usize;

            if !landmask[i] {
                // Find "ocean" in registry if it exists, otherwise 0
                biome_indices[i] = registry
                    .archetypes
                    .iter()
                    .position(|a| a.id.contains("ocean"))
                    .unwrap_or(0) as u8;
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

            // Rainfall estimate: base 0.3, coast bonus 0.5, elevation penalty 0.3
            let rain = (0.3 + coast_prox * 0.5 - elev * 0.3).clamp(0.0, 1.0);

            let h: f32;
            let satellite_s: f32;
            let satellite_v: f32;

            if config.color_based_biomes {
                let pixel = img.get_pixel(x, y);
                let (ph, ps, pv) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);
                h = ph;
                satellite_s = ps;
                satellite_v = pv;
            } else {
                h = 0.0;
                satellite_s = 0.0;
                satellite_v = 0.0;
            }

            if let Some(best) = registry.find_best_match(
                temp,
                rain,
                elev,
                s,
                h,
                satellite_s,
                satellite_v,
                config.color_based_biomes,
            ) {
                // Find index in registry for map storage
                let idx = registry
                    .archetypes
                    .iter()
                    .position(|a| a.id == best.id)
                    .unwrap_or(0);
                biome_indices[i] = idx as u8;
            }
        }
    }

    on_progress(100.0, "Biome classification complete");
    biome_indices
}
