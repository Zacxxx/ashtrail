// ──────────────────────────────────────────────────────────────
// Climate Simulation Module
// Temperature, wind, and precipitation from geology + latitude
// ──────────────────────────────────────────────────────────────

import { createNoise2D } from "simplex-noise";
import { ClimateConfig } from "./types";

export class ClimateSimulator {
    private windNoise: (x: number, y: number) => number;
    private moistureNoise: (x: number, y: number) => number;
    private tempVariation: (x: number, y: number) => number;

    constructor(
        private config: ClimateConfig,
        prng: () => number,
    ) {
        this.windNoise = createNoise2D(prng);
        this.moistureNoise = createNoise2D(prng);
        this.tempVariation = createNoise2D(prng);
    }

    /**
     * Calculate temperature at a point.
     * Factors: latitude, elevation, ocean proximity, local variation.
     * 
     * @param normalizedY - [0–1] Y position (0 = north pole, 1 = south pole)
     * @param elevation - [0–1] normalized elevation
     * @param oceanProximity - [0–1] how close to ocean (1 = at coast)
     * @param x, y - world coordinates for noise variation
     */
    getTemperature(
        normalizedY: number,
        elevation: number,
        oceanProximity: number,
        x: number,
        y: number,
    ): number {
        // Latitude gradient: hottest at equator (y ≈ 0.5), coldest at poles
        const latitudeFactor = 1 - 2 * Math.abs(normalizedY - 0.5); // 0 at poles, 1 at equator
        const baseTemp = this.config.globalMeanTemp +
            this.config.latitudeGradient * (latitudeFactor - 0.5);

        // Elevation lapse rate: -6.5°C per 1000m (assuming max elevation = 8848m)
        const elevationAboveSea = Math.max(0, elevation - 0.35) / 0.65; // normalize land elevation
        const elevationMeters = elevationAboveSea * 8848;
        const lapseRate = -6.5 * (elevationMeters / 1000);

        // Ocean moderation: coastal areas are milder
        const oceanModeration = oceanProximity * this.config.oceanWarmthFactor * 3;

        // Local random variation (±3°C)
        const localVariation = this.tempVariation(x / 500, y / 500) * 3;

        return baseTemp + lapseRate + oceanModeration + localVariation;
    }

    /**
     * Calculate precipitation / moisture availability.
     * Factors: base moisture noise, rain shadow from mountains, ocean proximity.
     * 
     * @param elevation - [0–1]
     * @param oceanProximity - [0–1]
     * @param windward - whether this point is on the windward side of mountains
     * @param x, y - world coordinates
     */
    getPrecipitation(
        elevation: number,
        oceanProximity: number,
        windward: boolean,
        x: number,
        y: number,
    ): number {
        // Base moisture from noise field
        const baseMoisture = (this.moistureNoise(x / 300, y / 300) + 1) / 2;

        // Ocean proximity increases moisture
        const oceanEffect = oceanProximity * 0.4;

        // Orographic effect: windward = wet, leeward = dry (rain shadow)
        const orographicEffect = windward
            ? Math.min(0.3, elevation * 0.5)   // uplift → rain
            : -Math.min(0.3, elevation * 0.4);  // rain shadow

        // Altitude reduction: very high = less precipitation
        const altitudeReduction = elevation > 0.7 ? -(elevation - 0.7) * 1.5 : 0;

        const result = (baseMoisture + oceanEffect + orographicEffect + altitudeReduction)
            * this.config.precipitationMultiplier;

        return Math.max(0, Math.min(1, result));
    }

    /**
     * Calculate wind exposure at a point.
     * Higher elevations and open terrain = more wind exposure.
     */
    getWindExposure(
        elevation: number,
        slopeAngle: number,
        x: number,
        y: number,
    ): number {
        const baseWind = (this.windNoise(x / 400, y / 400) + 1) / 2;
        const elevationBoost = elevation * 0.4;
        const slopeBoost = slopeAngle * 0.3;

        return Math.max(0, Math.min(1,
            baseWind * this.config.windStrength * 0.5 + elevationBoost + slopeBoost
        ));
    }

    /**
     * Determine if a point is on the windward side of terrain.
     * Simple approximation: compare elevation gradient against prevailing wind direction.
     */
    isWindward(
        elevationGradientX: number,
        elevationGradientY: number,
    ): boolean {
        const windDirRad = (this.config.prevailingWindDir * Math.PI) / 180;
        const windX = Math.sin(windDirRad);
        const windY = -Math.cos(windDirRad);

        // Dot product: positive means gradient faces the wind (windward)
        const dot = elevationGradientX * windX + elevationGradientY * windY;
        return dot > 0;
    }
}
