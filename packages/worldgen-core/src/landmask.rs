use crate::WorldgenConfig;
use image::RgbImage;

pub fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let r_f = r as f32 / 255.0;
    let g_f = g as f32 / 255.0;
    let b_f = b as f32 / 255.0;
    let max = r_f.max(g_f).max(b_f);
    let min = r_f.min(g_f).min(b_f);
    let delta = max - min;

    let mut hue = if delta < 0.00001 {
        0.0
    } else if max == r_f {
        60.0 * ((g_f - b_f) / delta)
    } else if max == g_f {
        60.0 * ((b_f - r_f) / delta + 2.0)
    } else {
        60.0 * ((r_f - g_f) / delta + 4.0)
    };

    if hue < 0.0 {
        hue += 360.0;
    }

    let sat = if max == 0.0 { 0.0 } else { delta / max };
    let val = max;

    (hue, sat, val)
}

/// Stage 2: Generate land mask from RGB image.
/// Uses HSV thresholding for water detection. Land if pixel is NOT water.
/// Then applies morphological cleanup.
pub fn extract_landmask(
    img: &RgbImage,
    config: &WorldgenConfig,
    min_island_area: u32,
    min_hole_area: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> Vec<bool> {
    let (width, height) = img.dimensions();
    let n = (width * height) as usize;

    on_progress(0.0, "Computing HSV water score");

    // Initial classification
    let mut mask = vec![false; n];
    for (i, pixel) in img.pixels().enumerate() {
        let (h, s, v) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);

        let r_val = pixel[0] as f32;
        let g_val = pixel[1] as f32;
        let b_val = pixel[2] as f32;

        let is_dominant_blue = b_val > r_val.max(g_val) && s > 0.1;

        // Circular distance for hue
        let mut hue_diff = (h - config.water_hue).abs();
        if hue_diff > 180.0 {
            hue_diff = 360.0 - hue_diff;
        }

        // Ice/Snow heuristic: extremely bright and relatively low saturation.
        let is_ice = v > 0.8 && s < 0.25;

        // Water must match hue/sat/val OR be dominantly blue, AND must not be ice.
        let is_water = ((hue_diff <= config.water_hue_tolerance
            && s >= config.water_sat_min
            && v >= config.water_val_min)
            || is_dominant_blue)
            && !is_ice;

        mask[i] = !is_water; // land = true
    }

    on_progress(30.0, "Morphological closing");

    // Morphological closing (dilate then erode) to fill small gaps in coastlines
    mask = dilate(&mask, width, height, 2);
    mask = erode(&mask, width, height, 2);

    on_progress(50.0, "Morphological opening");

    // Morphological opening (erode then dilate) to remove noise
    mask = erode(&mask, width, height, 1);
    mask = dilate(&mask, width, height, 1);

    on_progress(70.0, "Removing small islands");

    // Remove tiny islands (land blobs below min_island_area)
    remove_small_components(&mut mask, width, height, min_island_area, true);

    on_progress(85.0, "Filling small holes");

    // Fill tiny holes in land (water blobs below min_hole_area surrounded by land)
    remove_small_components(&mut mask, width, height, min_hole_area, false);

    on_progress(100.0, "Landmask complete");
    mask
}

/// Convert land mask to u8 buffer for PNG export (0 = sea, 255 = land).
pub fn landmask_to_u8(mask: &[bool]) -> Vec<u8> {
    mask.iter().map(|&v| if v { 255u8 } else { 0u8 }).collect()
}

fn dilate(mask: &[bool], width: u32, height: u32, radius: u32) -> Vec<bool> {
    let n = (width * height) as usize;
    let mut out = vec![false; n];
    let r = radius as i32;

    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let i = (y as u32 * width + ((x as u32) % width)) as usize;
            if mask[i] {
                out[i] = true;
                continue;
            }
            // Check if any neighbor within radius is filled
            'outer: for dy in -r..=r {
                for dx in -r..=r {
                    let ny = y + dy;
                    let nx = x + dx;
                    if ny < 0 || ny >= height as i32 {
                        continue;
                    }
                    let wx = ((nx % width as i32) + width as i32) as u32 % width;
                    let ni = (ny as u32 * width + wx) as usize;
                    if mask[ni] {
                        out[i] = true;
                        break 'outer;
                    }
                }
            }
        }
    }
    out
}

fn erode(mask: &[bool], width: u32, height: u32, radius: u32) -> Vec<bool> {
    let n = (width * height) as usize;
    let mut out = vec![true; n];
    let r = radius as i32;

    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let i = (y as u32 * width + ((x as u32) % width)) as usize;
            if !mask[i] {
                out[i] = false;
                continue;
            }
            // Check if all neighbors within radius are filled
            for dy in -r..=r {
                for dx in -r..=r {
                    let ny = y + dy;
                    let nx = x + dx;
                    if ny < 0 || ny >= height as i32 {
                        out[i] = false;
                        continue;
                    }
                    let wx = ((nx % width as i32) + width as i32) as u32 % width;
                    let ni = (ny as u32 * width + wx) as usize;
                    if !mask[ni] {
                        out[i] = false;
                    }
                }
            }
        }
    }
    out
}

/// Remove connected components smaller than `min_area`.
/// If `target_value` is true, removes small land blobs (islands).
/// If `target_value` is false, removes small water blobs (holes in land).
fn remove_small_components(
    mask: &mut [bool],
    width: u32,
    height: u32,
    min_area: u32,
    target_value: bool,
) {
    let n = (width * height) as usize;
    let mut visited = vec![false; n];

    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            if visited[i] || mask[i] != target_value {
                continue;
            }

            // Flood fill to find component
            let mut component = Vec::new();
            let mut stack = vec![(x, y)];
            visited[i] = true;

            while let Some((cx, cy)) = stack.pop() {
                let ci = (cy * width + cx) as usize;
                component.push(ci);

                for (dx, dy) in [(-1i32, 0), (1, 0), (0, -1i32), (0, 1)] {
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if ny < 0 || ny >= height as i32 {
                        continue;
                    }
                    let wx = ((nx % width as i32) + width as i32) as u32 % width;
                    let ni = (ny as u32 * width + wx) as usize;
                    if !visited[ni] && mask[ni] == target_value {
                        visited[ni] = true;
                        stack.push((wx, ny as u32));
                    }
                }
            }

            // If component too small, flip all pixels
            if (component.len() as u32) < min_area {
                for ci in component {
                    mask[ci] = !target_value;
                }
            }
        }
    }
}
