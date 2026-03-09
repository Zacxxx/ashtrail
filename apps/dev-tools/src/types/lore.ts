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

export interface GmSettings {
    worldId: string;
    contextSources: GmContextSources;
    maxLoreSnippets: number;
    systemDirective: string;
    ambienceDirective: string;
    negativeDirective: string;
    eventPromptPrefix: string;
    updatedAt: number;
}

export interface CompiledGmContext {
    worldId: string;
    worldName: string;
    worldPrompt?: string;
    settings: GmSettings;
    snippets: LoreSnippet[];
    promptBlock: string;
    sourceSummary: {
        enabledSources: string[];
        loreCounts: Record<LorePriority, number>;
        usedLoreCounts: Record<LorePriority, number>;
        maxLoreSnippets: number;
    };
}

