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

#[wasm_bindgen]
pub fn find_path_wasm(
    start_x: i32,
    start_y: i32,
    goal_x: i32,
    goal_y: i32,
    width: i32,
    height: i32,
    walkable_grid_js: JsValue,
) -> Result<JsValue, JsValue> {
    use geo_core::pathfinding::{astar, Point};

    let start = Point {
        x: start_x,
        y: start_y,
    };
    let goal = Point {
        x: goal_x,
        y: goal_y,
    };

    let walkable_grid: Vec<bool> = serde_wasm_bindgen::from_value(walkable_grid_js)?;

    let is_walkable = |p: Point| {
        let idx = (p.y * width + p.x) as usize;
        walkable_grid.get(idx).copied().unwrap_or(false)
    };

    let get_cost = |_p1: Point, _p2: Point| 1.0f32;

    let path = astar(start, goal, width, height, is_walkable, get_cost);

    match path {
        Some(p) => {
            let pts: Vec<[i32; 2]> = p.into_iter().map(|pt| [pt.x, pt.y]).collect();
            Ok(serde_wasm_bindgen::to_value(&pts)?)
        }
        None => Ok(JsValue::NULL),
    }
}
