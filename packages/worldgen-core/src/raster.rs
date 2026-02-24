/// Shared raster/grid utilities for equirectangular projection.
/// All operations assume pixel x = longitude, pixel y = latitude.
/// x wraps around (left-right), y is clamped (top-bottom).

/// Get a flat index from (x, y) with x-wrapping.
#[inline]
pub fn idx(x: i32, y: i32, width: u32, height: u32) -> Option<usize> {
    if y < 0 || y >= height as i32 {
        return None;
    }
    let wx = ((x % width as i32) + width as i32) % width as i32;
    Some((y as u32 * width + wx as u32) as usize)
}

/// Get the 8 neighbors (indices) of a pixel, with x-wrapping and y-clamping.
pub fn neighbors8(x: u32, y: u32, width: u32, height: u32) -> Vec<(u32, u32, usize)> {
    let mut out = Vec::with_capacity(8);
    for dy in [-1i32, 0, 1] {
        for dx in [-1i32, 0, 1] {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if let Some(i) = idx(nx, ny, width, height) {
                let wx = ((nx % width as i32) + width as i32) as u32 % width;
                out.push((wx, ny as u32, i));
            }
        }
    }
    out
}

/// Get the 4 cardinal neighbors with wrapping.
pub fn neighbors4(x: u32, y: u32, width: u32, height: u32) -> Vec<(u32, u32, usize)> {
    let mut out = Vec::with_capacity(4);
    for (dx, dy) in [(-1i32, 0), (1, 0), (0, -1i32), (0, 1)] {
        let nx = x as i32 + dx;
        let ny = y as i32 + dy;
        if let Some(i) = idx(nx, ny, width, height) {
            let wx = ((nx % width as i32) + width as i32) as u32 % width;
            out.push((wx, ny as u32, i));
        }
    }
    out
}

/// Compute Euclidean distance transform from a binary mask.
/// Returns a buffer where each pixel has the distance to the nearest `true` pixel.
/// Uses a two-pass approximation that's fast and good enough.
pub fn distance_transform(mask: &[bool], width: u32, height: u32) -> Vec<f32> {
    let n = (width * height) as usize;
    let mut dist = vec![f32::MAX; n];

    // Forward pass
    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) as usize;
            if mask[i] {
                dist[i] = 0.0;
            } else {
                if y > 0 {
                    let up = ((y - 1) * width + x) as usize;
                    dist[i] = dist[i].min(dist[up] + 1.0);
                }
                if x > 0 {
                    let left = (y * width + x - 1) as usize;
                    dist[i] = dist[i].min(dist[left] + 1.0);
                }
            }
        }
    }

    // Backward pass
    for y in (0..height).rev() {
        for x in (0..width).rev() {
            let i = (y * width + x) as usize;
            if y + 1 < height {
                let down = ((y + 1) * width + x) as usize;
                dist[i] = dist[i].min(dist[down] + 1.0);
            }
            if x + 1 < width {
                let right = (y * width + x + 1) as usize;
                dist[i] = dist[i].min(dist[right] + 1.0);
            }
        }
    }

    dist
}

/// Simple box blur for a float buffer.
pub fn box_blur(data: &[f32], width: u32, height: u32, radius: u32) -> Vec<f32> {
    let n = (width * height) as usize;
    let mut temp = vec![0.0f32; n];
    let mut out = vec![0.0f32; n];
    let r = radius as i32;

    // Horizontal pass
    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let mut sum = 0.0f32;
            let mut count = 0u32;
            for dx in -r..=r {
                if let Some(i) = idx(x + dx, y, width, height) {
                    sum += data[i];
                    count += 1;
                }
            }
            temp[(y as u32 * width + x as u32) as usize] = sum / count as f32;
        }
    }

    // Vertical pass
    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let mut sum = 0.0f32;
            let mut count = 0u32;
            for dy in -r..=r {
                let ny = y + dy;
                if ny >= 0 && ny < height as i32 {
                    sum += temp[(ny as u32 * width + x as u32) as usize];
                    count += 1;
                }
            }
            out[(y as u32 * width + x as u32) as usize] = sum / count as f32;
        }
    }

    out
}

/// Approximate Gaussian blur using repeated box blurs.
/// 3 passes of box blur approximates a Gaussian well.
pub fn gaussian_blur_approx(data: &[f32], width: u32, height: u32, sigma: f32) -> Vec<f32> {
    // Box blur radius for 3-pass Gaussian approximation
    let radius = ((sigma * 3.0_f32.sqrt()).round() as u32).max(1);
    let mut result = data.to_vec();
    for _ in 0..3 {
        result = box_blur(&result, width, height, radius);
    }
    result
}
