// ──────────────────────────────────────────────────────────────
// GeoEngine — Multi-Layer World Simulation Orchestrator
// Continent-based world generation with Worley noise plates
// ──────────────────────────────────────────────────────────────

import { createNoise2D } from "simplex-noise";
import type {
    SimulationConfig,
    TerrainCell,
    MineralType,
    LODLevel,
    VisualizationMode,
} from "./types";
import { LOD_LEVELS as LOD_CONFIGS } from "./types";
import { ClimateSimulator } from "./climate";
import { simulateHydrology, type HydrologyResult } from "./hydrology";
import {
    classifyBiome,
    classifySoil,
    BIOME_COLORS,
    getElevationColor,
    getTemperatureColor,
    getMoistureColor,
    getWindColor,
    getRadiationColor,
    getVegetationColor,
    getRiverColor,
} from "./biomes";

// ── Deterministic PRNG ──────────────────────────────────────

function mulberry32(a: number) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Plate Seed Point ────────────────────────────────────────

interface PlateSeed {
    x: number;
    y: number;
    /** true = continental (land), false = oceanic */
    isContinental: boolean;
    /** base elevation offset for this plate */
    baseElevation: number;
}

// ── World Data ──────────────────────────────────────────────

export interface WorldData {
    cols: number;
    rows: number;
    cells: TerrainCell[];
    hydrology: HydrologyResult;
}

// ── Main Engine ─────────────────────────────────────────────

export class GeoEngine {
    private prng: () => number;

    // Noise layers
    private continentalNoise: (x: number, y: number) => number;
    private mountainNoise: (x: number, y: number) => number;
    private detailNoise: (x: number, y: number) => number;
    private tectonicNoise: (x: number, y: number) => number;
    private volcanicNoise: (x: number, y: number) => number;
    private radiationNoise: (x: number, y: number) => number;
    private mineralNoise: (x: number, y: number) => number;
    private warpNoise: (x: number, y: number) => number;

    private climate: ClimateSimulator;
    private plateSeeds: PlateSeed[] = [];

    constructor(private config: SimulationConfig) {
        this.prng = mulberry32(config.world.seed);

        this.continentalNoise = createNoise2D(this.prng);
        this.mountainNoise = createNoise2D(this.prng);
        this.detailNoise = createNoise2D(this.prng);
        this.tectonicNoise = createNoise2D(this.prng);
        this.volcanicNoise = createNoise2D(this.prng);
        this.radiationNoise = createNoise2D(this.prng);
        this.mineralNoise = createNoise2D(this.prng);
        this.warpNoise = createNoise2D(this.prng);

        this.climate = new ClimateSimulator(config.climate, this.prng);

        // Generate tectonic plate seeds
        this.generatePlateSeeds();
    }

    // ── Plate Generation (Worley-based continents) ────────────

    /**
     * Generate random plate seed points.
     * ~55% of plates are continental (land), rest are oceanic.
     * This ratio combined with oceanCoverage controls land/ocean balance.
     */
    private generatePlateSeeds(): void {
        const count = this.config.geo.plateCount;
        // Distribute plates across a large abstract space
        const spread = this.config.geo.continentalScale * 3;

        for (let i = 0; i < count; i++) {
            const isContinental = this.prng() > this.config.world.oceanCoverage;
            this.plateSeeds.push({
                x: (this.prng() - 0.5) * spread * 2,
                y: (this.prng() - 0.5) * spread * 2,
                isContinental,
                baseElevation: isContinental
                    ? 0.45 + this.prng() * 0.15  // land plates: 0.45–0.60
                    : 0.10 + this.prng() * 0.15, // ocean plates: 0.10–0.25
            });
        }
    }

    /**
     * Find the nearest and second-nearest plate for a world coordinate.
     * Returns: nearest plate, distance to nearest, distance to second nearest.
     * The ratio dist1/dist2 gives the boundary proximity.
     */
    private getPlateInfo(wx: number, wy: number): {
        plate: PlateSeed;
        dist1: number;
        dist2: number;
        boundaryProximity: number;
    } {
        // Domain warp: distort coordinates for more organic plate shapes
        const warpScale = this.config.geo.continentalScale * 0.8;
        const warpAmt = this.config.geo.continentalScale * 0.4;
        const warpX = this.warpNoise(wx / warpScale, wy / warpScale) * warpAmt;
        const warpY = this.warpNoise(
            (wx + 1000) / warpScale,
            (wy + 1000) / warpScale,
        ) * warpAmt;

        const warpedX = wx + warpX;
        const warpedY = wy + warpY;

        let d1 = Infinity;
        let d2 = Infinity;
        let nearestPlate = this.plateSeeds[0];

        for (const plate of this.plateSeeds) {
            const dx = warpedX - plate.x;
            const dy = warpedY - plate.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < d1) {
                d2 = d1;
                d1 = dist;
                nearestPlate = plate;
            } else if (dist < d2) {
                d2 = dist;
            }
        }

        // Boundary proximity: 1.0 at boundary, 0.0 deep in plate interior
        const boundaryProximity = d2 > 0 ? Math.max(0, 1 - (d2 - d1) / (d2 * 0.5)) : 0;

        return { plate: nearestPlate, dist1: d1, dist2: d2, boundaryProximity };
    }

    // ── Continental Elevation ─────────────────────────────────

    private getContinentalElevation(wx: number, wy: number, octaves: number): number {
        const { plate, boundaryProximity } = this.getPlateInfo(wx, wy);

        // Base elevation from plate type
        let elevation = plate.baseElevation;

        // Add continental shape noise (large scale variation within the plate)
        const scale = this.config.geo.continentalScale;
        let amp = 1, freq = 1, val = 0, maxAmp = 0;
        for (let i = 0; i < Math.min(octaves, 3); i++) {
            val += this.continentalNoise(wx * freq / scale, wy * freq / scale) * amp;
            maxAmp += amp;
            amp *= this.config.geo.persistence;
            freq *= this.config.geo.lacunarity;
        }
        const shapeNoise = (val / maxAmp) * 0.12; // ±0.12 variation
        elevation += shapeNoise;

        // Continental shelves: land plates that are near ocean boundaries
        // get a gradual drop-off toward the edge
        if (plate.isContinental && boundaryProximity > 0.6) {
            const shelfDrop = (boundaryProximity - 0.6) / 0.4; // 0 at 0.6, 1 at 1.0
            elevation -= shelfDrop * 0.15;
        }

        return Math.max(0, Math.min(1, elevation));
    }

    // ── Tectonic Stress (plate boundary effects) ──────────────

    private getTectonicStress(wx: number, wy: number): number {
        const { boundaryProximity } = this.getPlateInfo(wx, wy);

        // High stress at plate boundaries
        const stress = Math.pow(Math.max(0, boundaryProximity), 2);

        return Math.min(1, stress * this.config.geo.tectonicIntensity);
    }

    // ── Mountain Ridges (collision zones) ─────────────────────

    private getMountainRidgeElevation(
        wx: number, wy: number,
        tectonicStress: number,
        octaves: number,
    ): number {
        if (tectonicStress < 0.15) return 0;

        const scale = this.config.geo.continentalScale * 0.3;
        let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;

        for (let i = 0; i < Math.min(octaves, 5); i++) {
            value += this.mountainNoise(
                wx * frequency / scale,
                wy * frequency / scale,
            ) * amplitude;
            maxAmp += amplitude;
            amplitude *= 0.45;
            frequency *= 2.2;
        }

        const ridgeHeight = (value / maxAmp + 1) / 2;
        // Mountains scaled by tectonic stress — only at boundaries
        return ridgeHeight * tectonicStress * 0.45;
    }

    // ── Detail / Erosion-like Noise ───────────────────────────

    private getDetailNoise(wx: number, wy: number, octaves: number): number {
        const scale = this.config.geo.continentalScale * 0.15;
        let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;

        for (let i = 0; i < octaves; i++) {
            value += this.detailNoise(
                wx * frequency / scale,
                wy * frequency / scale,
            ) * amplitude;
            maxAmp += amplitude;
            amplitude *= this.config.geo.persistence;
            frequency *= this.config.geo.lacunarity;
        }

        return (value / maxAmp + 1) / 2;
    }

    // ── Volcanic Activity ─────────────────────────────────────

    private getVolcanicActivity(wx: number, wy: number, tectonicStress: number): number {
        const volcanicBase = (this.volcanicNoise(wx / 200, wy / 200) + 1) / 2;
        const tectonicInfluence = tectonicStress * 0.6;
        const hotspot = Math.pow(volcanicBase, 3) * this.config.geo.volcanicDensity;
        return Math.min(1, tectonicInfluence + hotspot);
    }

    // ── Radiation (Olaas-specific) ────────────────────────────

    private getRadiation(wx: number, wy: number): number {
        const rad = (this.radiationNoise(wx / 400, wy / 400) + 1) / 2;
        return Math.pow(Math.max(0, rad - 0.7) / 0.3, 2);
    }

    // ── Mineral Deposits ──────────────────────────────────────

    private getMinerals(
        wx: number, wy: number,
        elevation: number,
        tectonicStress: number,
        volcanicActivity: number,
    ): MineralType[] {
        const minerals: MineralType[] = [];
        const v = (this.mineralNoise(wx / 150, wy / 150) + 1) / 2;

        if (tectonicStress > 0.5 && v > 0.6) minerals.push("IRON");
        if (elevation > 0.35 && elevation < 0.5 && volcanicActivity < 0.2 && v > 0.7)
            minerals.push("FUEL_DEPOSIT");
        if (elevation > 0.45 && elevation < 0.65 && v > 0.75) minerals.push("COPPER");
        if (volcanicActivity > 0.4 && v > 0.8) minerals.push("RARE_EARTH");
        if (elevation > 0.35 && elevation < 0.42 && v < 0.3) minerals.push("SALT");
        if (elevation > 0.38 && elevation < 0.55 && v > 0.85) minerals.push("SCRAP_METAL");

        return minerals;
    }

    // ── Slope Calculation ─────────────────────────────────────

    private getSlope(
        elevations: Float32Array, idx: number, cols: number, rows: number,
    ): number {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        const e = elevations[idx];
        let maxDiff = 0;

        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                maxDiff = Math.max(maxDiff, Math.abs(e - elevations[ny * cols + nx]));
            }
        }
        return Math.min(1, maxDiff * 10);
    }

    // ── Elevation Gradient ────────────────────────────────────

    private getElevationGradient(
        elevations: Float32Array, idx: number, cols: number, rows: number,
    ): [number, number] {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        const left = x > 0 ? elevations[idx - 1] : elevations[idx];
        const right = x < cols - 1 ? elevations[idx + 1] : elevations[idx];
        const up = y > 0 ? elevations[idx - cols] : elevations[idx];
        const down = y < rows - 1 ? elevations[idx + cols] : elevations[idx];
        return [right - left, down - up];
    }

    // ── Ocean Proximity (BFS) ─────────────────────────────────

    private computeOceanProximity(
        elevations: Float32Array, cols: number, rows: number, waterLevel: number,
    ): Float32Array {
        const total = cols * rows;
        const dist = new Float32Array(total).fill(Infinity);
        const queue: number[] = [];
        const maxDist = 20;

        for (let i = 0; i < total; i++) {
            if (elevations[i] < waterLevel) { dist[i] = 0; queue.push(i); }
        }

        let head = 0;
        while (head < queue.length) {
            const idx = queue[head++];
            if (dist[idx] >= maxDist) continue;
            const cx = idx % cols, cy = Math.floor(idx / cols);
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                const nIdx = ny * cols + nx;
                if (dist[nIdx] > dist[idx] + 1) {
                    dist[nIdx] = dist[idx] + 1;
                    queue.push(nIdx);
                }
            }
        }

        const prox = new Float32Array(total);
        for (let i = 0; i < total; i++) prox[i] = Math.max(0, 1 - dist[i] / maxDist);
        return prox;
    }

    // ══════════════════════════════════════════════════════════
    // PUBLIC: Generate complete world
    // ══════════════════════════════════════════════════════════

    generateWorld(cols: number, rows: number, lodLevel: LODLevel = 2): WorldData {
        const lod = LOD_CONFIGS[lodLevel];
        const total = cols * rows;
        const waterLevel = this.config.world.oceanCoverage;
        const octaves = lod.octaves;

        // ── Pass 1: Elevation ──
        const elevations = new Float32Array(total);
        const tectonicStress = new Float32Array(total);
        const volcanicActivity = new Float32Array(total);
        const radiation = new Float32Array(total);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const idx = y * cols + x;
                const wx = x * lod.kmPerCell;
                const wy = y * lod.kmPerCell;

                // Single plate lookup per cell (was 3x before)
                const plateInfo = this.getPlateInfo(wx, wy);

                // Continental elevation from plate type + shape noise
                let elev = plateInfo.plate.baseElevation;
                const scale = this.config.geo.continentalScale;
                let amp = 1, freq = 1, val = 0, maxA = 0;
                for (let i = 0; i < Math.min(octaves, 3); i++) {
                    val += this.continentalNoise(wx * freq / scale, wy * freq / scale) * amp;
                    maxA += amp;
                    amp *= this.config.geo.persistence;
                    freq *= this.config.geo.lacunarity;
                }
                elev += (val / maxA) * 0.12;
                if (plateInfo.plate.isContinental && plateInfo.boundaryProximity > 0.6) {
                    elev -= ((plateInfo.boundaryProximity - 0.6) / 0.4) * 0.15;
                }
                elev = Math.max(0, Math.min(1, elev));

                // Tectonic stress from boundary proximity (no second plate lookup)
                const stress = Math.min(1,
                    Math.pow(Math.max(0, plateInfo.boundaryProximity), 2) * this.config.geo.tectonicIntensity
                );
                tectonicStress[idx] = stress;

                // Mountain ridges at plate collision zones
                let ridges = 0;
                if (stress >= 0.15) {
                    const mScale = this.config.geo.continentalScale * 0.3;
                    let mv = 0, ma = 1, mf = 1, mMax = 0;
                    for (let i = 0; i < Math.min(octaves, 5); i++) {
                        mv += this.mountainNoise(wx * mf / mScale, wy * mf / mScale) * ma;
                        mMax += ma;
                        ma *= 0.45;
                        mf *= 2.2;
                    }
                    ridges = ((mv / mMax + 1) / 2) * stress * 0.45;
                }

                // Fine terrain detail
                const detail = this.getDetailNoise(wx, wy, octaves) * 0.06;

                elevations[idx] = Math.max(0, Math.min(1, elev + ridges + detail));
                volcanicActivity[idx] = this.getVolcanicActivity(wx, wy, stress);
                radiation[idx] = this.getRadiation(wx, wy);
            }
        }

        // ── Pass 2: Hydrology ──
        const moistureBase = new Float32Array(total);
        for (let i = 0; i < total; i++) {
            const x = (i % cols) * lod.kmPerCell;
            const y = Math.floor(i / cols) * lod.kmPerCell;
            moistureBase[i] = this.climate.getPrecipitation(elevations[i], 0.5, true, x, y);
        }
        const hydrology = simulateHydrology(elevations, moistureBase, cols, rows, waterLevel);

        // ── Pass 3: Ocean proximity ──
        const oceanProximity = this.computeOceanProximity(elevations, cols, rows, waterLevel);

        // ── Pass 4: Full cell assembly ──
        const cells: TerrainCell[] = new Array(total);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const idx = y * cols + x;
                const wx = x * lod.kmPerCell;
                const wy = y * lod.kmPerCell;

                const elevation = elevations[idx];
                const stress = tectonicStress[idx];
                const volcanic = volcanicActivity[idx];
                const rad = radiation[idx];
                const ocean = oceanProximity[idx];
                const normalizedY = y / rows;

                const slope = this.getSlope(elevations, idx, cols, rows);
                const [gradX, gradY] = this.getElevationGradient(elevations, idx, cols, rows);
                const windward = this.climate.isWindward(gradX, gradY);

                const temperature = this.climate.getTemperature(normalizedY, elevation, ocean, wx, wy);
                const precipitation = this.climate.getPrecipitation(elevation, ocean, windward, wx, wy);
                const windExposure = this.climate.getWindExposure(elevation, slope, wx, wy);
                const moisture = Math.min(1, precipitation + hydrology.flow[idx] * 0.3);

                const vegetationDensity = elevation >= waterLevel
                    ? Math.max(0, Math.min(1,
                        moisture * 0.5 +
                        (temperature > 0 && temperature < 35 ? 0.3 : 0) +
                        (precipitation > 0.3 ? 0.2 : 0) -
                        rad * 0.5 - volcanic * 0.5 - slope * 0.3
                    ))
                    : 0;

                const biome = classifyBiome(
                    temperature, precipitation, elevation, volcanic, rad, waterLevel,
                );
                const soilType = classifySoil(elevation, moisture, temperature, volcanic, rad);
                const mineralDeposits = this.getMinerals(wx, wy, elevation, stress, volcanic);

                const elevationMeters = elevation < waterLevel
                    ? -11000 * (1 - elevation / waterLevel)
                    : ((elevation - waterLevel) / (1 - waterLevel)) * 8848;

                cells[idx] = {
                    x, y, elevation, elevationMeters,
                    tectonicStress: stress, volcanicActivity: volcanic, slope,
                    temperature, moisture, precipitation, windExposure,
                    waterTableDepth: hydrology.waterTable[idx],
                    riverFlow: hydrology.flow[idx],
                    isLake: hydrology.isLake[idx] === 1,
                    vegetationDensity, soilType, mineralDeposits,
                    radiationLevel: rad,
                    biome, color: BIOME_COLORS[biome],
                };
            }
        }

        return { cols, rows, cells, hydrology };
    }

    // ══════════════════════════════════════════════════════════
    // Recolor cells by visualization mode
    // ══════════════════════════════════════════════════════════

    static recolorCells(cells: TerrainCell[], mode: VisualizationMode): TerrainCell[] {
        return cells.map(cell => {
            let color: string;
            switch (mode) {
                case "BIOME": color = BIOME_COLORS[cell.biome]; break;
                case "ELEVATION": color = getElevationColor(cell.elevation); break;
                case "TEMPERATURE": color = getTemperatureColor(cell.temperature); break;
                case "MOISTURE": color = getMoistureColor(cell.moisture); break;
                case "WIND": color = getWindColor(cell.windExposure); break;
                case "RADIATION": color = getRadiationColor(cell.radiationLevel); break;
                case "TECTONIC": color = getMoistureColor(cell.tectonicStress); break;
                case "VOLCANIC": color = getRadiationColor(cell.volcanicActivity); break;
                case "SOIL": color = getElevationColor(cell.elevation); break;
                case "MINERALS": color = cell.mineralDeposits.length > 0 ? "#ffb300" : "#1b2631"; break;
                case "VEGETATION": color = getVegetationColor(cell.vegetationDensity); break;
                case "RIVERS": color = getRiverColor(cell.riverFlow, cell.isLake); break;
                default: color = BIOME_COLORS[cell.biome];
            }
            return { ...cell, color };
        });
    }
}

// ── Default Configuration ───────────────────────────────────

export const DEFAULT_CONFIG: SimulationConfig = {
    world: {
        seed: 42,
        planetRadius: 6371,
        axialTilt: 23.5,
        solarLuminosity: 1.0,
        atmosphericDensity: 1.0,
        oceanCoverage: 0.45,
    },
    geo: {
        continentalScale: 500,
        plateCount: 8,
        tectonicIntensity: 1.3,
        volcanicDensity: 0.25,
        erosionIterations: 50,
        octaves: 6,
        persistence: 0.5,
        lacunarity: 2.0,
    },
    climate: {
        globalMeanTemp: 15,
        latitudeGradient: 50,
        prevailingWindDir: 270,
        windStrength: 1.0,
        precipitationMultiplier: 1.0,
        oceanWarmthFactor: 0.5,
    },
};
