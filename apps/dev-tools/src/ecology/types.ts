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

export interface ClimateProfile {
    id: string;
    status: EntryStatus;
    name: string;
    classification: string;
    temperatureSummary: string;
    precipitationSummary: string;
    seasonality: string;
    agricultureNotes: string;
    provinceIds: number[];
    approvedAt?: string;
}

export type FloraCategory = "tree" | "shrub" | "grass" | "crop" | "fungus" | "aquatic" | "alien_other";
export type FloraEdibility = "none" | "limited" | "common";

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
    climateProfileIds: string[];
    biomeIds: string[];
    provinceIds: number[];
    vegetationAssetBatchIds: string[];
    illustrationAssetBatchIds: string[];
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
    climateProfileIds: string[];
    biomeIds: string[];
    provinceIds: number[];
    earthAnalog: string;
    ancestralStock: string;
    evolutionaryPressures: string[];
    mutationSummary: string;
    divergenceSummary: string;
    familyId?: string;
    familyName?: string;
    illustrationAssetBatchIds: string[];
    explorationSprite?: DirectionalSpriteBinding;
    approvedAt?: string;
}

export interface ProvinceEcologyRecord {
    provinceId: number;
    duchyId: number;
    kingdomId: number;
    status: EcologyStatus;
    sourceIsolatedImageUrl: string;
    description: string;
    climateProfileIds: string[];
    floraIds: string[];
    faunaIds: string[];
    biomeId?: string;
    ecologicalPotential: number;
    agriculturePotential: number;
    consistencyNotes: string[];
    generatedAt?: string;
    approvedAt?: string;
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

export interface BiomeArchetype {
    id: string;
    name: string;
    hexColor: string;
    envConditions: EnvironmentalEnvelope;
    colorProfile: ColorProfile;
    suitabilityWeight: number;
}

export interface BiomeRegistry {
    archetypes: BiomeArchetype[];
}

export interface BiomeEntry {
    id: string;
    status: EntryStatus;
    name: string;
    biomeType: string;
    description: string;
    typicalFloraIds: string[];
    typicalFaunaIds: string[];
    provinceIds: number[];
    approvedAt?: string;
}

export interface EcologyBundle {
    worldId: string;
    updatedAt: string;
    baselines: EcologyBaseline[];
    climates: ClimateProfile[];
    flora: FloraEntry[];
    fauna: FaunaEntry[];
    biomes: BiomeEntry[];
    archetypes: BiomeRegistry;
    provinces: ProvinceEcologyRecord[];
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
}

export interface EcologyJobState {
    jobId: string | null;
    status: "idle" | "queued" | "running" | "completed" | "failed";
    progress: number;
    stage: string;
    error?: string | null;
}
