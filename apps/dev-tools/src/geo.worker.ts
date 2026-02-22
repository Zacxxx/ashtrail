// ──────────────────────────────────────────────────────────────
// World Generation Web Worker (Rust WASM Edition)
// Runs the GeoEngine in Rust off the main thread
// ──────────────────────────────────────────────────────────────

import init, { generate_world_wasm } from "@ashtrail/geo-wasm";
// Import the WASM file as a URL to ensure Vite handles it as a static asset
import wasmUrl from "@ashtrail/geo-wasm/geo_wasm_bg.wasm?url";

import type { SimulationConfig, LODLevel, VisualizationMode } from "./modules/geo/types";
import { LOD_LEVELS } from "./modules/geo/types";
import { GeoEngine } from "./modules/geo/engine";

export interface WorkerRequest {
    type: "generate";
    config: SimulationConfig;
    cols: number;
    rows: number;
    lodLevel: LODLevel;
    visualizationMode: VisualizationMode;
}

export interface WorkerResponse {
    type: "result";
    /** Flat RGBA pixel buffer ready for ImageData */
    pixels: Uint8ClampedArray;
    /** Cell data serialized for hover lookups */
    cellColors: string[];
    cellData: any[];
    cols: number;
    rows: number;
}

let wasmInitialized = false;

// ── Worker message handler ──
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { config, cols, rows, lodLevel, visualizationMode } = e.data;

    try {
        if (!wasmInitialized) {
            // Initialize WASM module using the explicit URL handled by Vite
            await init(wasmUrl);
            wasmInitialized = true;
        }

        const lod = LOD_LEVELS[lodLevel];

        // Call Rust WASM Engine
        const result = generate_world_wasm(
            config,
            cols,
            rows,
            lod.kmPerCell,
            lod.octaves
        );

        let cells = (result as any).cells;

        // Recolor if needed
        if (visualizationMode !== "BIOME") {
            cells = GeoEngine.recolorCells(cells, visualizationMode);
        }

        const cellColors = cells.map((c: any) => c.color);

        const response: WorkerResponse = {
            type: "result",
            pixels: new Uint8ClampedArray(0),
            cellColors,
            cellData: cells,
            cols,
            rows,
        };

        self.postMessage(response);
    } catch (error) {
        console.error("WASM Generation Error:", error);
        // Optionally send error message back to UI
    }
};
