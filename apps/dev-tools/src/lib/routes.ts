export const DEMO_ROUTE = "/";
export const DEMO_ALIAS_ROUTE = "/demo";
export const DEMO_STEP_ROUTE = "/demo/:step";
export const DEMO_STEP_ONE_ROUTE = "/demo/1";
export const DEMO_STEP_TWO_ROUTE = "/demo/2";
export const DEMO_STEP_THREE_ROUTE = "/demo/3";
export const DEVTOOLS_BASE = "/devtools";

export const DEVTOOLS_ROUTES = {
    root: DEVTOOLS_BASE,
    worldgen: `${DEVTOOLS_BASE}/worldgen`,
    assetGenerator: `${DEVTOOLS_BASE}/asset-generator`,
    gameMaster: `${DEVTOOLS_BASE}/game-master`,
    gallery: `${DEVTOOLS_BASE}/gallery`,
    gameplayEngine: `${DEVTOOLS_BASE}/gameplay-engine`,
    characterBuilder: `${DEVTOOLS_BASE}/character-builder`,
    history: `${DEVTOOLS_BASE}/history`,
    ecology: `${DEVTOOLS_BASE}/ecology`,
    quests: `${DEVTOOLS_BASE}/quests`,
    jobCenter: `${DEVTOOLS_BASE}/jobcenter`,
    storyLoop: `${DEVTOOLS_BASE}/story-loop`,
} as const;

export const DEVTOOLS_TOOL_ROUTE_BY_ID = {
    worldgen: DEVTOOLS_ROUTES.worldgen,
    "asset-generator": DEVTOOLS_ROUTES.assetGenerator,
    "game-master": DEVTOOLS_ROUTES.gameMaster,
    gallery: DEVTOOLS_ROUTES.gallery,
    "gameplay-engine": DEVTOOLS_ROUTES.gameplayEngine,
    "character-builder": DEVTOOLS_ROUTES.characterBuilder,
    history: DEVTOOLS_ROUTES.history,
    ecology: DEVTOOLS_ROUTES.ecology,
    quests: DEVTOOLS_ROUTES.quests,
    jobcenter: DEVTOOLS_ROUTES.jobCenter,
    "story-loop": DEVTOOLS_ROUTES.storyLoop,
} as const;

export const LEGACY_DEVTOOLS_REDIRECTS = {
    "/worldgen": DEVTOOLS_ROUTES.worldgen,
    "/asset-generator": DEVTOOLS_ROUTES.assetGenerator,
    "/game-master": DEVTOOLS_ROUTES.gameMaster,
    "/gallery": DEVTOOLS_ROUTES.gallery,
    "/gameplay-engine": DEVTOOLS_ROUTES.gameplayEngine,
    "/character-builder": DEVTOOLS_ROUTES.characterBuilder,
    "/history": DEVTOOLS_ROUTES.history,
    "/ecology": DEVTOOLS_ROUTES.ecology,
    "/quests": DEVTOOLS_ROUTES.quests,
    "/jobcenter": DEVTOOLS_ROUTES.jobCenter,
    "/story-loop": DEVTOOLS_ROUTES.storyLoop,
} as const;

export type RouteSearchValue = string | number | boolean | null | undefined;
export type RouteSearch = Record<string, RouteSearchValue>;
export type QuestTab = "seed" | "run" | "archive";

function buildRoute(path: string, search?: RouteSearch): string {
    if (!search) return path;

    const params = new URLSearchParams();
    Object.entries(search).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        params.set(key, String(value));
    });

    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

export function buildGameMasterRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.gameMaster, search);
}

export function buildHistoryRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.history, search);
}

export function buildEcologyRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.ecology, search);
}

export function buildGameplayEngineRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.gameplayEngine, search);
}

export function buildCharacterBuilderRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.characterBuilder, search);
}

export function buildAssetGeneratorRoute(search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.assetGenerator, search);
}

export function buildQuestsRoute(tab?: QuestTab, search?: RouteSearch) {
    return buildRoute(DEVTOOLS_ROUTES.quests, {
        ...(tab ? { tab } : {}),
        ...search,
    });
}

export function buildExplorationRoute(worldId?: string | null, locationId?: string | null) {
    const search: RouteSearch = {
        step: "EXPLORATION",
        explorationTab: "location",
    };
    if (worldId && locationId) {
        search.mode = "manifest";
        search.worldId = worldId;
        search.locationId = locationId;
    }
    return buildGameplayEngineRoute(search);
}
