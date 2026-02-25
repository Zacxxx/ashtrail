import type { SimulationConfig, TerrainCell } from "../modules/geo/types";

// ── Pipeline Steps ──
export type WorkflowStep = "GEO" | "GEOGRAPHY" | "ECO" | "HUMANITY";
export const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "GEOGRAPHY", "ECO", "HUMANITY"];
export const WORKFLOW_LABELS: Record<WorkflowStep, string> = {
    GEO: "Geology",
    GEOGRAPHY: "Geography",
    ECO: "Ecology",
    HUMANITY: "Humanity",
};

export type ViewMode = "3d" | "2d" | "provinces" | "map3d";
export type InspectorTab = "base" | "world" | "continents" | "geology" | "climate";

export interface ContinentConfig {
    id: string;
    name: string;
    prompt: string;
    size: number;
}

export interface PlanetWorld {
    cols: number;
    rows: number;
    cellData: TerrainCell[];
    textureUrl?: string;
    heightmapUrl?: string;
}

export interface GenerationProgress {
    isActive: boolean;
    progress: number;
    stage: string;
    jobId: string | null;
}

// ── Region Segmentation ──
export type RegionType =
    | "continent" | "subcontinent" | "island" | "archipelago" | "peninsula" | "isthmus"
    | "ocean" | "sea" | "gulf" | "bay" | "strait" | "lake" | "river_basin"
    | "tundra" | "taiga" | "temperate_forest" | "rainforest" | "savanna" | "steppe" | "desert" | "shrubland" | "wetland"
    | "mountain_range" | "plateau" | "valley" | "canyon" | "volcano" | "crater" | "glacier"
    | "custom";

export type GeographyTool = "lasso" | "magic_wand" | "select" | "pan";

export interface GeoRegion {
    id: string;
    parentId?: string;
    name: string;
    type: RegionType;
    color: string;
    polygon: [number, number][]; // normalized [x, y] points (0-1)
    metadata?: {
        areaPercent?: number;
        avgElevation?: number;
        avgTemperature?: number;
        description?: string;
    };
}

export const REGION_CATEGORIES: { label: string; types: RegionType[] }[] = [
    { label: "Landmasses", types: ["continent", "subcontinent", "island", "archipelago", "peninsula", "isthmus"] },
    { label: "Waterbodies", types: ["ocean", "sea", "gulf", "bay", "strait", "lake", "river_basin"] },
    { label: "Biomes", types: ["tundra", "taiga", "temperate_forest", "rainforest", "savanna", "steppe", "desert", "shrubland", "wetland"] },
    { label: "Geological Features", types: ["mountain_range", "plateau", "valley", "canyon", "volcano", "crater", "glacier"] },
    { label: "Other", types: ["custom"] },
];

export const REGION_TYPE_COLORS: Record<RegionType, string> = {
    // Landmasses (Earthy)
    continent: "#8B7355", subcontinent: "#A0522D", island: "#CD853F", archipelago: "#DEB887", peninsula: "#D2B48C", isthmus: "#F4A460",
    // Waterbodies (Blues)
    ocean: "#0f3e66", sea: "#1E6091", gulf: "#1C86EE", bay: "#3498DB", strait: "#4682B4", lake: "#5CACEE", river_basin: "#7EC0EE",
    // Biomes (Greens & Yellows/Whites)
    tundra: "#E0FFFF", taiga: "#4A7023", temperate_forest: "#228B22", rainforest: "#006400",
    savanna: "#DAA520", steppe: "#BDB76B", desert: "#EDC9AF", shrubland: "#8FBC8F", wetland: "#556B2F",
    // Geological (Grays, Reds, Whites)
    mountain_range: "#808080", plateau: "#A9A9A9", valley: "#6B8E23", canyon: "#CD5C5C",
    volcano: "#B22222", crater: "#8B4513", glacier: "#F0F8FF",
    // Other
    custom: "#E6E6FA",
};
