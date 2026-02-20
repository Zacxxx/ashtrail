pub fn lerp_color(a: &str, b: &str, t: f64) -> String {
    let t = t.max(0.0).min(1.0);
    let ah = u32::from_str_radix(&a[1..], 16).unwrap_or(0);
    let bh = u32::from_str_radix(&b[1..], 16).unwrap_or(0);

    let ar = (ah >> 16) & 0xff;
    let ag = (ah >> 8) & 0xff;
    let ab = ah & 0xff;

    let br = (bh >> 16) & 0xff;
    let bg = (bh >> 8) & 0xff;
    let bb = bh & 0xff;

    let rr = (ar as f64 + (br as f64 - ar as f64) * t).round() as u32;
    let rg = (ag as f64 + (bg as f64 - ag as f64) * t).round() as u32;
    let rb = (ab as f64 + (bb as f64 - ab as f64) * t).round() as u32;

    format!("#{:02x}{:02x}{:02x}", rr, rg, rb)
}
