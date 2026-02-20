use geo_core::{generate_world, SimulationConfig};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn generate_world_wasm(
    config_js: JsValue,
    cols: u32,
    rows: u32,
    km_per_cell: f64,
    octaves: u32,
) -> Result<JsValue, JsValue> {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&config_js);

    let config: SimulationConfig = serde_wasm_bindgen::from_value(config_js)?;
    let result = generate_world(config, cols, rows, km_per_cell, octaves)
        .map_err(|err| JsValue::from_str(&err))?;

    Ok(serde_wasm_bindgen::to_value(&result)?)
}
