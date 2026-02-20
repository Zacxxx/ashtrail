// ──────────────────────────────────────────────────────────────
// World Simulation Type System
// Research-grade geological, climatic, and ecological models
// ──────────────────────────────────────────────────────────────

// ── Planetary Baseline ──────────────────────────────────────

export interface WorldConfig {
  /** Deterministic seed for all RNG */
  seed: number;
  /** Planet radius in km — affects latitude gradient scale */
  planetRadius: number;
  /** Axial tilt in degrees — affects seasonal extremes */
  axialTilt: number;
  /** Solar luminosity multiplier (1.0 = Earth-like) */
  solarLuminosity: number;
  /** Atmospheric density multiplier (1.0 = Earth-like) */
  atmosphericDensity: number;
  /** Base ocean coverage ratio [0–1] */
  oceanCoverage: number;
}

// ── Geology Configuration ───────────────────────────────────

export interface GeoConfig {
  /** Noise scale for continental shapes */
  continentalScale: number;
  /** Number of tectonic plate regions */
  plateCount: number;
  /** Tectonic collision intensity — higher = taller mountains */
  tectonicIntensity: number;
  /** Volcanic hotspot density [0–1] */
  volcanicDensity: number;
  /** Erosion iterations — higher = smoother, more river valleys */
  erosionIterations: number;
  /** Fractal noise octaves for detail */
  octaves: number;
  /** Persistence for fractal noise */
  persistence: number;
  /** Lacunarity for fractal noise */
  lacunarity: number;
}

// ── Climate Configuration ───────────────────────────────────

export interface ClimateConfig {
  /** Global mean temperature in °C */
  globalMeanTemp: number;
  /** Temperature variation from equator to pole in °C */
  latitudeGradient: number;
  /** Prevailing wind direction in degrees (0 = north) */
  prevailingWindDir: number;
  /** Wind strength multiplier */
  windStrength: number;
  /** Global precipitation multiplier */
  precipitationMultiplier: number;
  /** Ocean current warmth effect */
  oceanWarmthFactor: number;
}

// ── Biome Types ─────────────────────────────────────────────

export const BIOME_TYPES = [
  // Aquatic
  "ABYSSAL_OCEAN",
  "DEEP_OCEAN",
  "OCEAN",
  "COASTAL_SHELF",
  "CORAL_REEF",
  // Transitional water
  "TIDAL_FLAT",
  "BEACH",
  "MANGROVE",
  "SALT_MARSH",
  "RIVER_DELTA",
  // Tropical
  "TROPICAL_RAINFOREST",
  "TROPICAL_SAVANNA",
  "SUBTROPICAL_DESERT",
  // Temperate
  "TEMPERATE_DECIDUOUS_FOREST",
  "TEMPERATE_GRASSLAND",
  "MEDITERRANEAN",
  // Cold
  "BOREAL_FOREST",
  "TUNDRA",
  "ICE_SHEET",
  // Altitude
  "ALPINE_MEADOW",
  "ALPINE_BARE",
  // Special / Olaas-specific
  "VOLCANIC_WASTELAND",
  "IRRADIATED_ZONE",
  "SALT_FLAT",
  "TOXIC_SWAMP",
  "ASH_DESERT",
] as const;

export type BiomeType = (typeof BIOME_TYPES)[number];

// ── Mineral & Resource Types ────────────────────────────────

export type MineralType =
  | "IRON"
  | "COPPER"
  | "FUEL_DEPOSIT"
  | "RARE_EARTH"
  | "SALT"
  | "CRYSTAL"
  | "SCRAP_METAL";

export type SoilType =
  | "BEDROCK"
  | "ROCKY"
  | "SANDY"
  | "CLAY"
  | "LOAM"
  | "SILT"
  | "PEAT"
  | "ASH"
  | "IRRADIATED";

// ── Terrain Cell (per-hex data) ─────────────────────────────

export interface TerrainCell {
  // Grid position
  x: number;
  y: number;

  // Geology
  elevation: number;            // [0–1] normalized
  elevationMeters: number;      // Actual meters (-11000 to +8848 range)
  tectonicStress: number;       // [0–1] proximity to plate boundary
  volcanicActivity: number;     // [0–1]
  slope: number;                // [0–1] steepness

  // Climate
  temperature: number;          // °C
  moisture: number;             // [0–1] available water
  precipitation: number;        // mm/year equivalent [0–1 normalized]
  windExposure: number;         // [0–1]

  // Hydrology
  waterTableDepth: number;      // [0–1] (0 = surface water, 1 = deep)
  riverFlow: number;            // [0–1] accumulated flow (0 = none, 1 = major river)
  isLake: boolean;

  // Ecology
  vegetationDensity: number;    // [0–1]
  soilType: SoilType;
  mineralDeposits: MineralType[];
  radiationLevel: number;       // [0–1]

  // Classification
  biome: BiomeType;
  color: string;                // Render color for this cell
}

// ── Level of Detail ─────────────────────────────────────────

export type LODLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface LODConfig {
  level: LODLevel;
  name: string;
  /** Approximate real-world km per cell */
  kmPerCell: number;
  /** Noise octaves to use at this scale */
  octaves: number;
  /** Pixels per terrain cell (higher = blockier, lower = more detail) */
  pixelsPerCell: number;
}

export const LOD_LEVELS: Record<LODLevel, LODConfig> = {
  0: { level: 0, name: "Whole planet", kmPerCell: 100, octaves: 2, pixelsPerCell: 3 },
  1: { level: 1, name: "Continents", kmPerCell: 25, octaves: 3, pixelsPerCell: 4 },
  2: { level: 2, name: "Countries", kmPerCell: 8, octaves: 4, pixelsPerCell: 5 },
  3: { level: 3, name: "Regions", kmPerCell: 2, octaves: 5, pixelsPerCell: 7 },
  4: { level: 4, name: "Area", kmPerCell: 0.5, octaves: 6, pixelsPerCell: 10 },
  5: { level: 5, name: "Local", kmPerCell: 0.12, octaves: 7, pixelsPerCell: 12 },
};

// ── Visualization Modes ─────────────────────────────────────

export type VisualizationMode =
  | "BIOME"
  | "ELEVATION"
  | "TEMPERATURE"
  | "MOISTURE"
  | "WIND"
  | "RADIATION"
  | "TECTONIC"
  | "VOLCANIC"
  | "SOIL"
  | "MINERALS"
  | "VEGETATION"
  | "RIVERS";

// ── Full World Simulation Config ────────────────────────────

export interface SimulationConfig {
  world: WorldConfig;
  geo: GeoConfig;
  climate: ClimateConfig;
}
