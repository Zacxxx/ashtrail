export type LocationCategory =
    | "settlement"
    | "infrastructure"
    | "resource"
    | "military"
    | "religious"
    | "ruin"
    | "wild"
    | "hazard"
    | "landmark";

export type LocationStatus =
    | "thriving"
    | "stable"
    | "struggling"
    | "declining"
    | "seasonal"
    | "contested"
    | "abandoned"
    | "ruined"
    | "forbidden";

export type LocationScale = "minor" | "small" | "medium" | "major" | "grand";

export interface LocationHistoryHooks {
    foundingReason: string;
    currentTension: string;
    storySeeds: string[];
    linkedLoreSnippetIds: string[];
}

export interface WorldLocation {
    id: string;
    name: string;
    category: LocationCategory;
    subtype: string;
    status: LocationStatus;
    scale: LocationScale;
    provinceId: number;
    provinceRegionId: string;
    provinceName: string;
    duchyId?: number;
    kingdomId?: number;
    continentId?: number;
    x: number;
    y: number;
    populationEstimate: number | null;
    importance: number;
    habitabilityScore: number;
    economicScore: number;
    strategicScore: number;
    hazardScore: number;
    rulingFaction: string;
    tags: string[];
    placementDrivers: string[];
    historyHooks: LocationHistoryHooks;
    lore: string;
    type: string;
}

export type Area = WorldLocation;

export interface LocationGenerationConfig {
    prompt: string;
    settlementDensity: number;
    techLevel: number;
    generatedAt: number;
}

export interface LocationCoverageSummary {
    totalLocations: number;
    settlementCount: number;
    nonSettlementCount: number;
    viableProvinceCount: number;
    coveredViableProvinceCount: number;
}

export interface AiDetailPassSummary {
    status: string;
    attemptedBatches: number;
    successfulBatches: number;
    refinedLocations: number;
    totalLocations: number;
}

export interface LocationGenerationMetadata {
    worldId: string;
    config: LocationGenerationConfig;
    coverage: LocationCoverageSummary;
    countsByCategory: Record<string, number>;
    countsBySubtype: Record<string, number>;
    uncoveredProvinceIds: number[];
    deterministicSeedHash: string;
    aiDetailPass: AiDetailPassSummary;
}

export const LOCATION_CATEGORY_OPTIONS: LocationCategory[] = [
    "settlement",
    "infrastructure",
    "resource",
    "military",
    "religious",
    "ruin",
    "wild",
    "hazard",
    "landmark",
];

export const LOCATION_STATUS_OPTIONS: LocationStatus[] = [
    "thriving",
    "stable",
    "struggling",
    "declining",
    "seasonal",
    "contested",
    "abandoned",
    "ruined",
    "forbidden",
];

export const LOCATION_SCALE_OPTIONS: LocationScale[] = ["minor", "small", "medium", "major", "grand"];

export function titleCaseLocation(value: string) {
    return value
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
}

export function defaultLocationHistoryHooks(): LocationHistoryHooks {
    return {
        foundingReason: "",
        currentTension: "",
        storySeeds: [],
        linkedLoreSnippetIds: [],
    };
}

export function normalizeLocation(input: Partial<WorldLocation> & { id?: string; name?: string }): WorldLocation {
    return {
        id: input.id || crypto.randomUUID(),
        name: input.name || "Unnamed Location",
        category: input.category || "wild",
        subtype: input.subtype || "outpost",
        status: input.status || "stable",
        scale: input.scale || "small",
        provinceId: input.provinceId ?? 0,
        provinceRegionId: input.provinceRegionId || `wgen_provinces_${input.provinceId ?? 0}`,
        provinceName: input.provinceName || "Unknown Province",
        duchyId: input.duchyId,
        kingdomId: input.kingdomId,
        continentId: input.continentId,
        x: Math.max(0, Math.min(1, input.x ?? 0.5)),
        y: Math.max(0, Math.min(1, input.y ?? 0.5)),
        populationEstimate: input.populationEstimate ?? null,
        importance: input.importance ?? 40,
        habitabilityScore: input.habitabilityScore ?? 40,
        economicScore: input.economicScore ?? 35,
        strategicScore: input.strategicScore ?? 30,
        hazardScore: input.hazardScore ?? 30,
        rulingFaction: input.rulingFaction || "None",
        tags: Array.isArray(input.tags) ? input.tags : [],
        placementDrivers: Array.isArray(input.placementDrivers) ? input.placementDrivers : [],
        historyHooks: input.historyHooks || defaultLocationHistoryHooks(),
        lore: input.lore || "",
        type: input.type || titleCaseLocation(input.subtype || "outpost"),
    };
}
