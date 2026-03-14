// ──────────────────────────────────────────────────────────────
// Biome Classification Engine
// Whittaker-diagram-based biome assignment with Olaas overrides
// ──────────────────────────────────────────────────────────────

import { BiomeType, TerrainCell, SoilType } from "./types";

// ── Biome Color Palette ─────────────────────────────────────
// Research-grade palette — distinct, readable at any zoom

export const BIOME_COLORS: Record<BiomeType, string> = {
    // Aquatic
    ABYSSAL_OCEAN: "#0a1628",
    DEEP_OCEAN: "#0f2847",
    OCEAN: "#1a5276",
    COASTAL_SHELF: "#2e86c1",
    CORAL_REEF: "#48c9b0",
    // Transitional
    TIDAL_FLAT: "#7fb3d3",
    BEACH: "#f0d9b5",
    MANGROVE: "#1e7845",
    SALT_MARSH: "#8fbc8f",
    RIVER_DELTA: "#5dade2",
    // Tropical
    TROPICAL_RAINFOREST: "#0b6623",
    TROPICAL_SAVANNA: "#c4a747",
    SUBTROPICAL_DESERT: "#e8c872",
    // Temperate
    TEMPERATE_DECIDUOUS_FOREST: "#2d7d46",
    TEMPERATE_GRASSLAND: "#7db46c",
    MEDITERRANEAN: "#b8a94a",
    // Cold
    BOREAL_FOREST: "#3b5e2f",
    TUNDRA: "#8b9f8e",
    ICE_SHEET: "#dce6f0",
    // Altitude
    ALPINE_MEADOW: "#7b8f6a",
    ALPINE_BARE: "#9e9e9e",
    // Olaas-specific
    VOLCANIC_WASTELAND: "#4a2c2a",
    IRRADIATED_ZONE: "#5e3f71",
    SALT_FLAT: "#d4c8a8",
    TOXIC_SWAMP: "#4a6741",
    ASH_DESERT: "#8b7d6b",
};

// ── Biome Metadata ──────────────────────────────────────────

export interface BiomeMeta {
    name: string;
    description: string;
    typicalFlora: string[];
    typicalFauna: string[];
    resourcePotential: number; // 0–1
    habitability: number;      // 0–1
    threatLevel: number;       // 0–1
}

export const BIOME_META: Record<BiomeType, BiomeMeta> = {
    ABYSSAL_OCEAN: { name: "Abyssal Ocean", description: "Crushing depths, no light", typicalFlora: [], typicalFauna: ["deep-sea creatures"], resourcePotential: 0.1, habitability: 0.0, threatLevel: 0.9 },
    DEEP_OCEAN: { name: "Deep Ocean", description: "Open deep water", typicalFlora: ["kelp forests"], typicalFauna: ["fish schools"], resourcePotential: 0.2, habitability: 0.0, threatLevel: 0.7 },
    OCEAN: { name: "Ocean", description: "Open water", typicalFlora: ["algae"], typicalFauna: ["fish", "sea birds"], resourcePotential: 0.3, habitability: 0.0, threatLevel: 0.5 },
    COASTAL_SHELF: { name: "Coastal Shelf", description: "Shallow productive waters", typicalFlora: ["seagrass"], typicalFauna: ["shellfish", "fish"], resourcePotential: 0.6, habitability: 0.1, threatLevel: 0.3 },
    CORAL_REEF: { name: "Coral Reef", description: "Biodiversity hotspot", typicalFlora: ["coral", "algae"], typicalFauna: ["reef fish", "crustaceans"], resourcePotential: 0.5, habitability: 0.1, threatLevel: 0.2 },
    TIDAL_FLAT: { name: "Tidal Flat", description: "Periodic flooding, rich nutrients", typicalFlora: ["marsh grass"], typicalFauna: ["crabs", "wading birds"], resourcePotential: 0.4, habitability: 0.3, threatLevel: 0.3 },
    BEACH: { name: "Beach", description: "Sandy or rocky shore", typicalFlora: ["dune grass"], typicalFauna: ["seabirds"], resourcePotential: 0.2, habitability: 0.5, threatLevel: 0.2 },
    MANGROVE: { name: "Mangrove", description: "Dense coastal swamp forest", typicalFlora: ["mangrove trees"], typicalFauna: ["mudskipper", "snakes"], resourcePotential: 0.5, habitability: 0.3, threatLevel: 0.4 },
    SALT_MARSH: { name: "Salt Marsh", description: "Brackish wetland", typicalFlora: ["salt grass", "reeds"], typicalFauna: ["insects", "frogs"], resourcePotential: 0.3, habitability: 0.3, threatLevel: 0.3 },
    RIVER_DELTA: { name: "River Delta", description: "Fertile floodplain where rivers meet sea", typicalFlora: ["papyrus", "crops"], typicalFauna: ["birds", "fish"], resourcePotential: 0.8, habitability: 0.8, threatLevel: 0.2 },
    TROPICAL_RAINFOREST: { name: "Tropical Rainforest", description: "Dense, hot, wet jungle", typicalFlora: ["hardwood", "vines"], typicalFauna: ["primates", "reptiles"], resourcePotential: 0.7, habitability: 0.5, threatLevel: 0.5 },
    TROPICAL_SAVANNA: { name: "Tropical Savanna", description: "Warm grassland with scattered trees", typicalFlora: ["tall grass", "acacia"], typicalFauna: ["grazers", "predators"], resourcePotential: 0.5, habitability: 0.7, threatLevel: 0.4 },
    SUBTROPICAL_DESERT: { name: "Subtropical Desert", description: "Arid, extreme temperatures", typicalFlora: ["cacti", "scrub"], typicalFauna: ["scorpions", "lizards"], resourcePotential: 0.2, habitability: 0.2, threatLevel: 0.6 },
    TEMPERATE_DECIDUOUS_FOREST: { name: "Temperate Forest", description: "Seasonal broadleaf forest", typicalFlora: ["oak", "maple"], typicalFauna: ["deer", "wolves"], resourcePotential: 0.7, habitability: 0.8, threatLevel: 0.2 },
    TEMPERATE_GRASSLAND: { name: "Temperate Grassland", description: "Prairie or steppe", typicalFlora: ["grass", "wildflowers"], typicalFauna: ["bison", "hawks"], resourcePotential: 0.5, habitability: 0.8, threatLevel: 0.2 },
    MEDITERRANEAN: { name: "Mediterranean", description: "Warm dry summers, mild wet winters", typicalFlora: ["olive", "herbs"], typicalFauna: ["goats", "songbirds"], resourcePotential: 0.6, habitability: 0.9, threatLevel: 0.1 },
    BOREAL_FOREST: { name: "Boreal Forest", description: "Cold coniferous taiga", typicalFlora: ["spruce", "pine"], typicalFauna: ["moose", "bears"], resourcePotential: 0.5, habitability: 0.5, threatLevel: 0.4 },
    TUNDRA: { name: "Tundra", description: "Frozen, sparse vegetation", typicalFlora: ["lichen", "moss"], typicalFauna: ["caribou", "arctic fox"], resourcePotential: 0.2, habitability: 0.2, threatLevel: 0.6 },
    ICE_SHEET: { name: "Ice Sheet", description: "Permanent ice and snow", typicalFlora: [], typicalFauna: ["polar fauna"], resourcePotential: 0.0, habitability: 0.0, threatLevel: 0.9 },
    ALPINE_MEADOW: { name: "Alpine Meadow", description: "High altitude grassland above treeline", typicalFlora: ["alpine flowers"], typicalFauna: ["mountain goats"], resourcePotential: 0.3, habitability: 0.3, threatLevel: 0.5 },
    ALPINE_BARE: { name: "Alpine Bare", description: "High altitude rock and scree", typicalFlora: [], typicalFauna: ["eagles"], resourcePotential: 0.3, habitability: 0.1, threatLevel: 0.7 },
    VOLCANIC_WASTELAND: { name: "Volcanic Wasteland", description: "Active volcanic terrain, lava flows", typicalFlora: ["thermophiles"], typicalFauna: [], resourcePotential: 0.4, habitability: 0.0, threatLevel: 1.0 },
    IRRADIATED_ZONE: { name: "Irradiated Zone", description: "Lethal radiation from old-world event", typicalFlora: ["mutant lichen"], typicalFauna: ["mutant creatures"], resourcePotential: 0.6, habitability: 0.0, threatLevel: 1.0 },
    SALT_FLAT: { name: "Salt Flat", description: "Dried lake bed, mineral-rich", typicalFlora: [], typicalFauna: ["insects"], resourcePotential: 0.4, habitability: 0.1, threatLevel: 0.5 },
    TOXIC_SWAMP: { name: "Toxic Swamp", description: "Chemically contaminated wetland", typicalFlora: ["mutant moss"], typicalFauna: ["amphibians"], resourcePotential: 0.3, habitability: 0.1, threatLevel: 0.8 },
    ASH_DESERT: { name: "Ash Desert", description: "Post-eruption ash wasteland", typicalFlora: ["pioneer moss"], typicalFauna: ["scavengers"], resourcePotential: 0.2, habitability: 0.1, threatLevel: 0.7 },
};

// ── Whittaker Biome Classification ──────────────────────────

/**
 * Classifies a biome using a simplified Whittaker diagram.
 * Temperature (°C) × Precipitation (normalized 0–1) → BiomeType
 * 
 * Elevation and special conditions override the base classification.
 */
export function classifyBiome(
    temperature: number,
    precipitation: number,
    elevation: number,
    volcanicActivity: number,
    radiationLevel: number,
    waterLevel: number,
): BiomeType {
    // ── Special overrides ──
    if (radiationLevel > 0.7) return "IRRADIATED_ZONE";
    if (volcanicActivity > 0.7) return "VOLCANIC_WASTELAND";

    // ── Aquatic biomes ──
    if (elevation < waterLevel) {
        const depth = waterLevel - elevation;
        if (depth > 0.35) return "ABYSSAL_OCEAN";
        if (depth > 0.25) return "DEEP_OCEAN";
        if (depth > 0.10) return "OCEAN";
        if (depth > 0.05) {
            if (temperature > 22 && precipitation > 0.5) return "CORAL_REEF";
            return "COASTAL_SHELF";
        }
        return "TIDAL_FLAT";
    }

    // ── Transitional / coastal ──
    const coastProximity = elevation - waterLevel;
    if (coastProximity < 0.02) {
        if (precipitation > 0.6 && temperature > 20) return "MANGROVE";
        if (precipitation > 0.7) return "SALT_MARSH";
        return "BEACH";
    }

    // ── Altitude overrides ──
    const normalizedAlt = elevation; // already 0–1
    if (normalizedAlt > 0.85) return "ICE_SHEET";
    if (normalizedAlt > 0.75) return "ALPINE_BARE";
    if (normalizedAlt > 0.65) return "ALPINE_MEADOW";

    // ── Ash / special desert ──
    if (volcanicActivity > 0.4 && precipitation < 0.2) return "ASH_DESERT";
    if (precipitation < 0.08 && temperature > 10) return "SALT_FLAT";

    // ── Whittaker diagram ──
    // Hot biomes (temp > 20°C)
    if (temperature > 20) {
        if (precipitation > 0.65) return "TROPICAL_RAINFOREST";
        if (precipitation > 0.3) return "TROPICAL_SAVANNA";
        return "SUBTROPICAL_DESERT";
    }

    // Warm biomes (10–20°C)
    if (temperature > 10) {
        if (precipitation > 0.6) return "TEMPERATE_DECIDUOUS_FOREST";
        if (precipitation > 0.3) return "MEDITERRANEAN";
        return "TEMPERATE_GRASSLAND";
    }

    // Cool biomes (0–10°C)
    if (temperature > 0) {
        if (precipitation > 0.4) return "BOREAL_FOREST";
        if (precipitation > 0.15) return "TUNDRA";
        return "TUNDRA";
    }

    // Freezing (< 0°C)
    if (precipitation > 0.3) return "ICE_SHEET";
    return "TUNDRA";
}

// ── Soil Classification ─────────────────────────────────────

export function classifySoil(
    elevation: number,
    moisture: number,
    temperature: number,
    volcanicActivity: number,
    radiationLevel: number,
): SoilType {
    if (radiationLevel > 0.7) return "IRRADIATED";
    if (volcanicActivity > 0.5) return "ASH";
    if (elevation > 0.75) return "BEDROCK";
    if (elevation > 0.6) return "ROCKY";
    if (moisture > 0.8 && temperature > 10) return "PEAT";
    if (moisture > 0.6) return "SILT";
    if (moisture > 0.4) return "LOAM";
    if (temperature > 25 && moisture < 0.2) return "SANDY";
    if (moisture > 0.3) return "CLAY";
    return "SANDY";
}

// ── Visualization Colors by Mode ────────────────────────────

export function getElevationColor(elevation: number): string {
    // Hypsometric tinting: ocean blue → green → brown → white
    if (elevation < 0.35) {
        const t = elevation / 0.35;
        return lerpColor("#0a1628", "#2e86c1", t);
    }
    if (elevation < 0.45) {
        const t = (elevation - 0.35) / 0.1;
        return lerpColor("#2d7d46", "#7db46c", t);
    }
    if (elevation < 0.65) {
        const t = (elevation - 0.45) / 0.2;
        return lerpColor("#7db46c", "#8b7d6b", t);
    }
    if (elevation < 0.8) {
        const t = (elevation - 0.65) / 0.15;
        return lerpColor("#8b7d6b", "#b8a89a", t);
    }
    const t = (elevation - 0.8) / 0.2;
    return lerpColor("#b8a89a", "#f0eee8", Math.min(t, 1));
}

export function getTemperatureColor(temperature: number): string {
    // -30 to +40°C range mapped to blue → red
    const t = Math.max(0, Math.min(1, (temperature + 30) / 70));
    if (t < 0.25) return lerpColor("#1a237e", "#0288d1", t / 0.25);
    if (t < 0.5) return lerpColor("#0288d1", "#4caf50", (t - 0.25) / 0.25);
    if (t < 0.75) return lerpColor("#4caf50", "#ff9800", (t - 0.5) / 0.25);
    return lerpColor("#ff9800", "#b71c1c", (t - 0.75) / 0.25);
}

export function getMoistureColor(moisture: number): string {
    return lerpColor("#f5deb3", "#1565c0", Math.max(0, Math.min(1, moisture)));
}

export function getWindColor(windExposure: number): string {
    return lerpColor("#e8eaf6", "#283593", Math.max(0, Math.min(1, windExposure)));
}

export function getRadiationColor(radiation: number): string {
    if (radiation < 0.1) return "#1b2631";
    return lerpColor("#2e7d32", "#ff6f00", Math.min(1, radiation));
}

export function getVegetationColor(density: number): string {
    return lerpColor("#5d4037", "#1b5e20", Math.max(0, Math.min(1, density)));
}

export function getRiverColor(riverFlow: number, isLake: boolean): string {
    if (isLake) return "#1565c0";
    if (riverFlow > 0.5) return "#1976d2";
    if (riverFlow > 0.2) return "#42a5f5";
    if (riverFlow > 0.05) return "#90caf9";
    return "#1b2631"; // no river
}

// ── Color Utility ───────────────────────────────────────────

function lerpColor(a: string, b: string, t: number): string {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);

    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;

    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);

    return `#${((rr << 16) | (rg << 8) | rb).toString(16).padStart(6, "0")}`;
}
