import type { AshtrailDate } from "../lib/calendar";

export type LorePriority = "main" | "critical" | "major" | "minor";

export interface LoreSnippet {
    id: string;
    title?: string | null;
    priority: LorePriority;
    date: AshtrailDate | null;
    location: string;
    content: string;
    involvedFactions?: string[];
    involvedCharacters?: string[];
}

export interface GmContextSources {
    mainLore: boolean;
    criticalLore: boolean;
    majorLore: boolean;
    minorLore: boolean;
    regions: boolean;
    locations: boolean;
    factions: boolean;
    characters: boolean;
    temporality: boolean;
}

export type GmIntensity = "low" | "medium" | "high";

export interface GmAmbienceSettings {
    atmosphere: GmIntensity;
    pressure: GmIntensity;
    scarcity: GmIntensity;
    socialTension: GmIntensity;
    groundedConsequences: GmIntensity;
    tones: string[];
    notes: string;
}

export interface GmSettings {
    worldId: string;
    worldPrompt: string;
    contextSources: GmContextSources;
    maxLoreSnippets: number;
    systemDirective: string;
    ambience: GmAmbienceSettings;
    ambienceDirective: string;
    negativeDirective: string;
    eventPromptPrefix: string;
    updatedAt: number;
}

export interface GmContextSectionSummary {
    key: string;
    label: string;
    enabled: boolean;
    itemCount: number;
    preview: string;
    meta?: string;
}

export interface CompiledGmContext {
    worldId: string;
    worldName: string;
    worldPrompt?: string;
    worldSeedPrompt?: string;
    ambience?: GmAmbienceSettings;
    settings: GmSettings;
    snippets: LoreSnippet[];
    promptBlock: string;
    compiledSections?: {
        framework: string;
        authoring: string;
        dynamicContext: string;
    };
    sourceSummary: {
        enabledSources: string[];
        loreCounts: Record<LorePriority, number>;
        usedLoreCounts: Record<LorePriority, number>;
        maxLoreSnippets: number;
        sections: GmContextSectionSummary[];
    };
}
