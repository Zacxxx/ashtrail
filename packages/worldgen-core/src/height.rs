use crate::raster::{distance_transform, gaussian_blur_approx, neighbors8};
use image::RgbImage;
use rand::Rng;
use rand::SeedableRng;
use rand_pcg::Pcg64;

/// Stage 3: Height reconstruction from albedo features.
/// Uses mountain_score = grayness * local_variance, plus multi-octave noise.
/// Enforces sea level at landmask=0 and smooths coast transition.
pub fn reconstruct_height(
    flat_img: &RgbImage,
    landmask: &[bool],
    seed: u64,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<u16> {
    let (width, height) = flat_img.dimensions();
    let n = (width * height) as usize;

    on_progress(0.0, "Computing luminance");

    // Compute luminance and saturation
    let mut luminance = vec![0.0f32; n];
    let mut saturation = vec![0.0f32; n];

    for (i, pixel) in flat_img.pixels().enumerate() {
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let max_c = r.max(g).max(b);
        let min_c = r.min(g).min(b);
        let sat = if max_c > 0.0 {
            (max_c - min_c) / max_c
        } else {
            0.0
        };
        luminance[i] = lum;
        saturation[i] = sat;
    }

    on_progress(15.0, "Computing local variance (texture)");

    // Compute local variance of luminance (texture metric)
    let mut texture = vec![0.0f32; n];
    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            let neighbors = neighbors8(x, y, width, height);
            let center = luminance[i];
            let mut var_sum = 0.0f32;
            let mut count = 0u32;
            for (_, _, ni) in &neighbors {
                let diff = luminance[*ni] - center;
                var_sum += diff * diff;
                count += 1;
            }
            texture[i] = if count > 0 {
                (var_sum / count as f32).sqrt()
            } else {
                0.0
            };
        }
    }

    on_progress(25.0, "Computing shading (high-pass luminance)");
    let smoothed_luminance = gaussian_blur_approx(&luminance, width, height, 3.0);

    on_progress(35.0, "Computing mountain score");

    // Mountain score: combine texture (local variance) with shading (high-frequency luminance)
    // independent of color saturation.
    let mut mountain_score = vec![0.0f32; n];
    for i in 0..n {
        let shade = (luminance[i] - smoothed_luminance[i]).abs();
        mountain_score[i] = texture[i] * shade;
    }

    // Normalize mountain_score to 0..1
    let max_ms = mountain_score
        .iter()
        .cloned()
        .fold(0.0f32, f32::max)
        .max(0.001);
    for v in mountain_score.iter_mut() {
        *v /= max_ms;
    }

    on_progress(45.0, "Smoothing mountain score");

    // Smooth the mountain score
    mountain_score = gaussian_blur_approx(&mountain_score, width, height, 5.0);

    on_progress(55.0, "Computing coast distance");

    // Distance transforms for coast and ocean depth
    let water_mask: Vec<bool> = landmask.iter().map(|&v| !v).collect();
    let dist_from_water = distance_transform(&water_mask, width, height);
    let dist_from_land = distance_transform(landmask, width, height);

    let max_coast_dist = 80.0f32; // pixels for full transition
    let max_ocean_dist = 150.0f32;

    on_progress(65.0, "Adding noise variation");

    // Simple multi-octave hash noise for micro variation
    let mut rng = Pcg64::seed_from_u64(seed);
    let noise_buf: Vec<f32> = (0..n).map(|_| rng.gen::<f32>()).collect();
    let noise_smooth = gaussian_blur_approx(&noise_buf, width, height, 10.0);

    on_progress(80.0, "Assembling height field");

    // Base height from mountain score
    let mut height_f = vec![0.0f32; n];
    for i in 0..n {
        if !landmask[i] {
            let noise = noise_smooth[i] * 0.15;
            let depth_factor = (dist_from_land[i] / max_ocean_dist).clamp(0.0, 1.0);
            let shelf = depth_factor.powf(0.5);
            let base_ocean = -0.3;
            height_f[i] = base_ocean * shelf + noise * 0.5;
            continue;
        }

        // Smoothstep the mountain score for more dramatic peaks
        let ms = mountain_score[i];
        let h = ms * ms * (3.0 - 2.0 * ms); // smoothstep

        // Add noise variation (subtle)
        let noise = noise_smooth[i] * 0.15;

        // Base land elevation (ensure all land is above 0)
        let base = 0.15;

        // Coast fade: smooth transition to sea level
        let coast_factor = (dist_from_water[i] / max_coast_dist).clamp(0.0, 1.0);
        let coast_smooth = coast_factor * coast_factor * (3.0 - 2.0 * coast_factor);

        height_f[i] = (base + h * 0.7 + noise) * coast_smooth;
    }

    on_progress(90.0, "Encoding 16-bit");

    // Normalize to 16-bit with sea level at exactly 32768
    let max_h = height_f.iter().cloned().fold(0.0f32, f32::max).max(0.001);
    let min_h = height_f.iter().cloned().fold(0.0f32, f32::min).min(-0.001);

    let result: Vec<u16> = height_f
        .iter()
        .map(|&h| {
            if h >= 0.0 {
                let norm = (h / max_h).clamp(0.0, 1.0);
                (32768.0 + norm * 32767.0) as u16
            } else {
                let norm = (h / min_h).clamp(0.0, 1.0);
                (32768.0 - norm * 32768.0) as u16
            }
        })
        .collect();

    on_progress(100.0, "Height reconstruction complete");
    result
}
