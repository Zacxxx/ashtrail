use crate::raster::gaussian_blur_approx;
use image::{ImageBuffer, Rgb, RgbImage};

/// Stage 1: Normalize the input albedo image.
/// Removes baked lighting by dividing by a large-blur low-frequency estimate.
/// Uses the landmask to protect coastlines from being darkened by the ocean.
pub fn normalize_albedo(
    img: &RgbImage,
    mask: &[bool],
    sigma: f32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> RgbImage {
    let (width, height) = img.dimensions();
    let n = (width * height) as usize;

    on_progress(0.0, "Extracting channels");

    // Extract per-channel float arrays
    let mut r_chan = vec![0.0f32; n];
    let mut g_chan = vec![0.0f32; n];
    let mut b_chan = vec![0.0f32; n];

    let mut sum_r = 0.0f32;
    let mut sum_g = 0.0f32;
    let mut sum_b = 0.0f32;
    let mut land_count = 0;

    for (i, pixel) in img.pixels().enumerate() {
        // Convert sRGB to linear approximation
        r_chan[i] = (pixel[0] as f32 / 255.0).powf(2.2);
        g_chan[i] = (pixel[1] as f32 / 255.0).powf(2.2);
        b_chan[i] = (pixel[2] as f32 / 255.0).powf(2.2);

        // Accumulate land color
        if mask[i] {
            sum_r += r_chan[i];
            sum_g += g_chan[i];
            sum_b += b_chan[i];
            land_count += 1;
        }
    }

    // Fill ocean pixels with average land color so the blur doesn't drag down coastal brightness
    if land_count > 0 {
        let avg_r = sum_r / land_count as f32;
        let avg_g = sum_g / land_count as f32;
        let avg_b = sum_b / land_count as f32;

        for i in 0..n {
            if !mask[i] {
                r_chan[i] = avg_r;
                g_chan[i] = avg_g;
                b_chan[i] = avg_b;
            }
        }
    }

    on_progress(10.0, "Blurring R channel");
    let r_blur = gaussian_blur_approx(&r_chan, width, height, sigma);
    on_progress(30.0, "Blurring G channel");
    let g_blur = gaussian_blur_approx(&g_chan, width, height, sigma);
    on_progress(50.0, "Blurring B channel");
    let b_blur = gaussian_blur_approx(&b_chan, width, height, sigma);

    on_progress(70.0, "Dividing out illumination");

    // I_flat = I / (L + eps), then re-normalize
    let eps = 0.01f32;

    let mut r_flat = vec![0.0f32; n];
    let mut g_flat = vec![0.0f32; n];
    let mut b_flat = vec![0.0f32; n];

    for i in 0..n {
        r_flat[i] = r_chan[i] / (r_blur[i] + eps);
        g_flat[i] = g_chan[i] / (g_blur[i] + eps);
        b_flat[i] = b_chan[i] / (b_blur[i] + eps);
    }

    // Find max for re-normalization
    let max_val = r_flat
        .iter()
        .chain(g_flat.iter())
        .chain(b_flat.iter())
        .cloned()
        .fold(0.0f32, f32::max)
        .max(1.0);

    on_progress(85.0, "Converting back to sRGB");

    let mut out = ImageBuffer::new(width, height);
    for (i, pixel) in out.pixels_mut().enumerate() {
        let r = (r_flat[i] / max_val).clamp(0.0, 1.0).powf(1.0 / 2.2);
        let g = (g_flat[i] / max_val).clamp(0.0, 1.0).powf(1.0 / 2.2);
        let b = (b_flat[i] / max_val).clamp(0.0, 1.0).powf(1.0 / 2.2);

        // If it is water, let's preserve the original image color completely! No lighting flattening required for water.
        if !mask[i] {
            let x = (i as u32) % width;
            let y = (i as u32) / width;
            let orig_pixel = img.get_pixel(x, y);

            *pixel = Rgb([orig_pixel[0], orig_pixel[1], orig_pixel[2]]);
        } else {
            *pixel = Rgb([(r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8]);
        }
    }

    on_progress(100.0, "Normalize complete");
    out
}
