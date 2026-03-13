import type { DirectionalSpriteBinding } from "@ashtrail/core";

export type EcologyStatus = "missing" | "draft" | "approved";
export type EntryStatus = "draft" | "approved";
export type BaselineScope = "world" | "kingdom" | "duchy";
export type BaselineEntityId = number | "world";

export interface EcologyBaseline {
    scope: BaselineScope;
    entityId: BaselineEntityId;
    parentEntityId?: BaselineEntityId;
    status: EcologyStatus;
    summary: string;
    climateDirectives: string[];
    floraDirectives: string[];
    faunaDirectives: string[];
    agricultureDirectives: string[];
    consistencyRules: string[];
    generatedAt?: string;
    approvedAt?: string;
}

export type FloraCategory = "tree" | "shrub" | "grass" | "crop" | "fungus" | "aquatic" | "alien_other";
export type FloraEdibility = "none" | "limited" | "common";
export type EcologyStatSource = "backfilled" | "generated" | "manual";
export type FaunaSizeClass = "tiny" | "small" | "medium" | "large" | "huge";
export type FloraSizeClass = "tiny" | "small" | "medium" | "large" | "massive";
export type FaunaLocomotion = "walker" | "runner" | "climber" | "burrower" | "swimmer" | "flier" | "slitherer" | "amphibious";
export type FaunaNaturalWeapon = "none" | "bite" | "claw" | "horn" | "hoof" | "tail" | "beak" | "venom" | "constrict" | "spines";
export type FaunaArmorClass = "soft" | "furred" | "scaled" | "shelled" | "plated" | "rocky";
export type FaunaTemperament = "docile" | "skittish" | "territorial" | "aggressive" | "apex";
export type ActivityCycle = "diurnal" | "nocturnal" | "crepuscular" | "any";

export interface AssetImageRef {
    batchId: string;
    filename: string;
}

export interface FloraBodyProfile {
    sizeClass: FloraSizeClass;
    heightMeters: number;
    spreadMeters: number;
    rootDepthMeters: number;
    biomassKg: number;
    lifespanYears: number;
    growthRate: number;
}

export interface FloraResourceProfile {
    rarity: number;
    yieldPerHarvest: number;
    regrowthDays: number;
    harvestDifficulty: number;
    nutritionValue: number;
    medicinalValue: number;
    fuelValue: number;
    structuralValue: number;
    concealmentValue: number;
}

export interface FloraHazardProfile {
    toxicity: number;
    irritation: number;
    thorniness: number;
    flammability: number;
    resilience: number;
}

export interface FloraEntry {
    id: string;
    status: EntryStatus;
    name: string;
    category: FloraCategory;
    description: string;
    ecologicalRoles: string[];
    adaptations: string[];
    edibility: FloraEdibility;
    agricultureValue: number;
    biomeIds: string[];
    vegetationAssetBatchIds: string[];
    illustrationAssetBatchIds: string[];
    illustrationAssets: AssetImageRef[];
    bodyProfile: FloraBodyProfile;
    resourceProfile: FloraResourceProfile;
    hazardProfile: FloraHazardProfile;
    statsVersion: string;
    statsSource: EcologyStatSource;
    approvedAt?: string;
}

export type FaunaCategory =
    | "herbivore"
    | "predator"
    | "omnivore"
    | "scavenger"
    | "avian"
    | "aquatic"
    | "beast_of_burden"
    | "companion"
    | "alien_other";

export interface FaunaEntry {
    id: string;
    status: EntryStatus;
    name: string;
    category: FaunaCategory;
    description: string;
    ecologicalRoles: string[];
    adaptations: string[];
    domesticationPotential: number;
    dangerLevel: number;
    biomeIds: string[];
    earthAnalog: string;
    ancestralStock: string;
    evolutionaryPressures: string[];
    mutationSummary: string;
    divergenceSummary: string;
    familyId?: string;
    familyName?: string;
    illustrationAssetBatchIds: string[];
    illustrationAssets: AssetImageRef[];
    combatProfile: FaunaCombatProfile;
    bodyProfile: FaunaBodyProfile;
    behaviorProfile: FaunaBehaviorProfile;
    skillIds: string[];
    statsVersion: string;
    statsSource: EcologyStatSource;
    explorationSprite?: DirectionalSpriteBinding;
    approvedAt?: string;
}

export interface FaunaCombatProfile {
    level: number;
    strength: number;
    agility: number;
    intelligence: number;
    wisdom: number;
    endurance: number;
    charisma: number;
    critChance: number;
    resistance: number;
    socialBonus: number;
    baseEvasion: number;
    baseDefense: number;
    baseHpBonus: number;
    baseApBonus: number;
    baseMpBonus: number;
}

export interface FaunaBodyProfile {
    sizeClass: FaunaSizeClass;
    heightMeters: number;
    lengthMeters: number;
    weightKg: number;
    locomotion: FaunaLocomotion;
    naturalWeapon: FaunaNaturalWeapon;
    armorClass: FaunaArmorClass;
}

export interface FaunaBehaviorProfile {
    temperament: FaunaTemperament;
    activityCycle: ActivityCycle;
    packSizeMin: number;
    packSizeMax: number;
    perception: number;
    stealth: number;
    trainability: number;
}

export interface EnvironmentalEnvelope {
    temperatureMin: number;
    temperatureMax: number;
    precipitationMin: number;
    precipitationMax: number;
    elevationMin: number;
    elevationMax: number;
    slopeMin: number;
    slopeMax: number;
}

export interface ColorProfile {
    h: number;
    s: number;
    v: number;
}

export interface BiomeArchetypeCalibration {
    enabled: boolean;
    temperatureOffset: number;
    precipitationOffset: number;
    elevationOffset: number;
    slopeOffset: number;
    hueTolerance: number;
    satTolerance: number;
    valTolerance: number;
    scoreBias: number;
}

export interface BiomeArchetype {
    id: string;
    name: string;
    hexColor: string;
    envConditions: EnvironmentalEnvelope;
    colorProfile: ColorProfile;
    suitabilityWeight: number;
    calibration: BiomeArchetypeCalibration;
}

export interface BiomeRegistry {
    archetypes: BiomeArchetype[];
}

export interface BiomeEntry {
    id: string;
    archetypeId: string;
    status: EntryStatus;
    name: string;
    biomeType: string;
    description: string;
    typicalFloraIds: string[];
    typicalFaunaIds: string[];
    provinceIds: number[];
    provinceCount: number;
    pixelShare: number;
    avgConfidence: number;
    topCandidateIds: string[];
    approvedAt?: string;
}

export interface BiomeModelSettings {
    deterministicWeight: number;
    colorWeight: number;
    visionWeight: number;
    smoothingPasses: number;
    confidenceFloor: number;
    visionModelId: string;
    visionTileSize: number;
    analysisVersion: string;
}

export interface BiomeCoverageSummary {
    biomeId: string;
    name: string;
    hexColor: string;
    pixelCount: number;
    pixelShare: number;
    avgConfidence: number;
    provinceCount: number;
    topCandidateIds: string[];
}

export interface BiomeMixEntry {
    biomeId: string;
    pixelCount: number;
    pixelShare: number;
}

export interface BiomeProvinceSummary {
    provinceId: number;
    biomePrimaryId: string;
    biomeConfidence: number;
    biomeCandidateIds: string[];
    biomeMix: BiomeMixEntry[];
}

export interface BiomeReport {
    width: number;
    height: number;
    analysisVersion: string;
    sourceImageHash?: string | null;
    visionAvailable: boolean;
    visionModelId?: string | null;
    confidenceFloor: number;
    averageConfidence: number;
    lowConfidencePixelCount: number;
    activeBiomes: BiomeCoverageSummary[];
    provinceSummaries: BiomeProvinceSummary[];
}

export interface EcologyBundle {
    worldId: string;
    updatedAt: string;
    baselines: EcologyBaseline[];
    flora: FloraEntry[];
    fauna: FaunaEntry[];
    biomes: BiomeEntry[];
    archetypes: BiomeRegistry;
    biomeModelSettings: BiomeModelSettings;
}

export interface RefreshDerivedStatsResponse {
    updatedFloraCount: number;
    updatedFaunaCount: number;
    assignedSkillCount: number;
    statsVersion: string;
}

export interface WorldgenRegion {
    id: string;
    rawId?: number;
    name: string;
    type: "Continent" | "Kingdom" | "Duchy" | "Province";
    kingdomId?: number;
    duchyId?: number;
    kingdomIds?: number[];
    duchyIds?: number[];
    provinceIds?: number[];
    area?: number;
    biomePrimary?: number;
    biomePrimaryId?: string | null;
    biomeConfidence?: number | null;
    biomeCandidateIds?: string[];
}

export interface EcologyJobState {
    jobId: string | null;
    status: "idle" | "queued" | "running" | "completed" | "failed";
    progress: number;
    stage: string;
    error?: string | null;
}
