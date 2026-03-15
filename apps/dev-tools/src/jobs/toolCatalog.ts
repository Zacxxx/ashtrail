import { DEMO_STEP_ONE_ROUTE, DEMO_STEP_TWO_ROUTE, DEVTOOLS_ROUTES } from "../lib/routes";
import type { JobModality } from "./types";

export type TechnicalToolCategory =
    | "generation"
    | "ai-text"
    | "ai-image"
    | "simulation"
    | "content-canon"
    | "assets"
    | "system"
    | "uncatalogued";

export type ProductToolArea =
    | "world-building"
    | "narrative-ai"
    | "gameplay"
    | "characters"
    | "quests"
    | "assets"
    | "operations"
    | "uncatalogued";

export interface ToolCatalogEntry {
    id: string;
    label: string;
    description: string;
    technicalCategory: TechnicalToolCategory;
    productAreas: ProductToolArea[];
    defaultModalities?: JobModality[];
    route?: string;
    isEnabled?: boolean;
}

export const TECHNICAL_TOOL_CATEGORY_ORDER: TechnicalToolCategory[] = [
    "generation",
    "ai-text",
    "ai-image",
    "simulation",
    "content-canon",
    "assets",
    "system",
    "uncatalogued",
];

export const PRODUCT_TOOL_AREA_ORDER: ProductToolArea[] = [
    "world-building",
    "narrative-ai",
    "gameplay",
    "characters",
    "quests",
    "assets",
    "operations",
    "uncatalogued",
];

export const TECHNICAL_TOOL_CATEGORY_LABELS: Record<TechnicalToolCategory, string> = {
    generation: "Generation",
    "ai-text": "AI Text",
    "ai-image": "AI Image",
    simulation: "Simulation",
    "content-canon": "Content Canon",
    assets: "Assets",
    system: "System",
    uncatalogued: "Uncatalogued",
};

export const PRODUCT_TOOL_AREA_LABELS: Record<ProductToolArea, string> = {
    "world-building": "World Building",
    "narrative-ai": "Narrative AI",
    gameplay: "Gameplay",
    characters: "Characters",
    quests: "Quests",
    assets: "Assets",
    operations: "Operations",
    uncatalogued: "Uncatalogued",
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
    {
        id: "worldgen",
        label: "World Generator",
        description: "AI-driven planetary simulation, terrain synthesis, and world construction workflows.",
        technicalCategory: "generation",
        productAreas: ["world-building"],
        defaultModalities: ["text", "asset"],
        route: DEVTOOLS_ROUTES.worldgen,
    },
    {
        id: "ecology",
        label: "Ecology",
        description: "World-scoped flora, fauna, climate, and province canon generation.",
        technicalCategory: "content-canon",
        productAreas: ["world-building"],
        defaultModalities: ["text"],
        route: DEVTOOLS_ROUTES.ecology,
    },
    {
        id: "history",
        label: "History",
        description: "Lore, timeline, and faction canon generation for world history.",
        technicalCategory: "content-canon",
        productAreas: ["world-building", "narrative-ai"],
        defaultModalities: ["text"],
        route: DEVTOOLS_ROUTES.history,
    },
    {
        id: "game-master",
        label: "Game Master",
        description: "Narrative orchestration, canon-aware scene direction, and event guidance.",
        technicalCategory: "ai-text",
        productAreas: ["narrative-ai"],
        defaultModalities: ["text"],
        route: DEVTOOLS_ROUTES.gameMaster,
    },
    {
        id: "quests",
        label: "Quests",
        description: "Quest generation, branching run management, and run progression flows.",
        technicalCategory: "ai-text",
        productAreas: ["quests", "narrative-ai"],
        defaultModalities: ["text", "image"],
        route: DEVTOOLS_ROUTES.quests,
    },
    {
        id: "gameplay-engine",
        label: "Gameplay Engine",
        description: "Exploration, combat, and encounter simulation tooling for runtime systems.",
        technicalCategory: "simulation",
        productAreas: ["gameplay"],
        defaultModalities: ["text", "route"],
        route: DEVTOOLS_ROUTES.gameplayEngine,
    },
    {
        id: "exploration",
        label: "Exploration",
        description: "Location-scoped exploration generation, scene setup, and multimodal traversal beats.",
        technicalCategory: "simulation",
        productAreas: ["gameplay", "world-building"],
        defaultModalities: ["text", "image", "route"],
        route: DEVTOOLS_ROUTES.gameplayEngine,
    },
    {
        id: "character-builder",
        label: "Character Builder",
        description: "Character generation, editing, and export workflows for NPCs and archetypes.",
        technicalCategory: "ai-text",
        productAreas: ["characters"],
        defaultModalities: ["text", "image"],
        route: DEVTOOLS_ROUTES.characterBuilder,
    },
    {
        id: "generatemedia.audio",
        label: "Generate Media Audio",
        description: "Gemini 3 interleaved media demo that calls one business tool to produce a unified audio artifact with image and metadata.",
        technicalCategory: "assets",
        productAreas: ["assets", "narrative-ai"],
        defaultModalities: ["mixed"],
        route: `${DEVTOOLS_ROUTES.assetGenerator}?tab=songs`,
    },
    {
        id: "demo.step1.interleaved",
        label: "Demo Step 1",
        description: "Tracked interleaved scene-package generation for the first Ashtrail demo beat.",
        technicalCategory: "assets",
        productAreas: ["assets", "narrative-ai", "operations"],
        defaultModalities: ["mixed"],
        route: DEMO_STEP_ONE_ROUTE,
    },
    {
        id: "demo.step1.selection",
        label: "Demo Step 1 Selection",
        description: "Tracked narrative continuation for the chosen world direction in demo step 1.",
        technicalCategory: "ai-text",
        productAreas: ["narrative-ai", "operations"],
        defaultModalities: ["text"],
        route: DEMO_STEP_ONE_ROUTE,
    },
    {
        id: "demo.step2.interleaved",
        label: "Demo Step 2",
        description: "Tracked interleaved hero-package generation for the second Ashtrail demo beat.",
        technicalCategory: "ai-text",
        productAreas: ["characters", "narrative-ai", "operations"],
        defaultModalities: ["mixed"],
        route: DEMO_STEP_TWO_ROUTE,
    },
    {
        id: "demo.step2.weapon",
        label: "Demo Step 2 Weapon",
        description: "Manual equipment-generation pass for the demo hero, including weapon data, lore, and illustration.",
        technicalCategory: "assets",
        productAreas: ["characters", "assets", "operations"],
        defaultModalities: ["mixed"],
        route: DEMO_STEP_TWO_ROUTE,
    },
    {
        id: "demo.step2.voice",
        label: "Demo Step 2 Voice",
        description: "Manual TTS narration pass for the generated step-2 lore panel.",
        technicalCategory: "ai-text",
        productAreas: ["characters", "narrative-ai", "operations"],
        defaultModalities: ["asset", "text"],
        route: DEMO_STEP_TWO_ROUTE,
    },
    {
        id: "demo.step2.lore-illustrations",
        label: "Demo Step 2 Lore Illustrations",
        description: "Narrative scene illustrations generated from the step-2 lore and injected into the demo reading flow.",
        technicalCategory: "assets",
        productAreas: ["characters", "assets", "narrative-ai"],
        defaultModalities: ["image", "asset"],
        route: DEMO_STEP_TWO_ROUTE,
    },
    {
        id: "demo.step2.lore-insight",
        label: "Demo Step 2 Lore Insight",
        description: "Interactive hover-driven lore snippet expansion with an explanatory illustration for the demo reading panel.",
        technicalCategory: "ai-text",
        productAreas: ["characters", "narrative-ai", "assets"],
        defaultModalities: ["mixed"],
        route: DEMO_STEP_TWO_ROUTE,
    },
    {
        id: "asset-generator",
        label: "Asset Generator",
        description: "Icon, texture, and asset image generation workflows.",
        technicalCategory: "assets",
        productAreas: ["assets"],
        defaultModalities: ["image", "asset"],
        route: DEVTOOLS_ROUTES.assetGenerator,
    },
    {
        id: "gallery",
        label: "Gallery",
        description: "Browsing and inspection surface for generated artifacts and synced outputs.",
        technicalCategory: "system",
        productAreas: ["assets", "operations"],
        defaultModalities: ["asset", "image"],
        route: DEVTOOLS_ROUTES.gallery,
    },
    {
        id: "story-loop",
        label: "Story Loop",
        description: "Hybrid loop planning for scenes, inserts, quest beats, and mixed-media stories.",
        technicalCategory: "ai-text",
        productAreas: ["narrative-ai", "quests"],
        defaultModalities: ["text", "image"],
        route: DEVTOOLS_ROUTES.storyLoop,
    },
];

export const TOOL_CATALOG_BY_ID = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool]));
