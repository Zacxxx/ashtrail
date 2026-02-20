// ──────────────────────────────────────────────────────────────
// World Generation Web Worker
// Runs the GeoEngine off the main thread to avoid UI freezes
// ──────────────────────────────────────────────────────────────

import type { SimulationConfig, LODLevel, VisualizationMode } from "./modules/geo/types";
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
    cellData: Array<{
        x: number; y: number;
        elevation: number; elevationMeters: number;
        temperature: number; moisture: number; precipitation: number;
        windExposure: number; slope: number;
        tectonicStress: number; volcanicActivity: number;
        radiationLevel: number; vegetationDensity: number;
        waterTableDepth: number; riverFlow: number; isLake: boolean;
        soilType: string; mineralDeposits: string[];
        biome: string; color: string;
    }>;
    cols: number;
    rows: number;
}

// ── Worker message handler ──
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
    const { config, cols, rows, lodLevel, visualizationMode } = e.data;

    const engine = new GeoEngine(config);
    const world = engine.generateWorld(cols, rows, lodLevel);

    // Apply visualization recoloring
    let cells = world.cells;
    if (visualizationMode !== "BIOME") {
        cells = GeoEngine.recolorCells(world.cells, visualizationMode);
    }

    // Serialize cell data for the main thread
    const cellData = cells.map(c => ({
        x: c.x, y: c.y,
        elevation: c.elevation, elevationMeters: c.elevationMeters,
        temperature: c.temperature, moisture: c.moisture,
        precipitation: c.precipitation, windExposure: c.windExposure,
        slope: c.slope, tectonicStress: c.tectonicStress,
        volcanicActivity: c.volcanicActivity, radiationLevel: c.radiationLevel,
        vegetationDensity: c.vegetationDensity, waterTableDepth: c.waterTableDepth,
        riverFlow: c.riverFlow, isLake: c.isLake,
        soilType: c.soilType, mineralDeposits: c.mineralDeposits,
        biome: c.biome, color: c.color,
    }));

    const cellColors = cells.map(c => c.color);

    const response: WorkerResponse = {
        type: "result",
        pixels: new Uint8ClampedArray(0), // We'll render on main thread from colors
        cellColors,
        cellData,
        cols,
        rows,
    };

    self.postMessage(response);
};
