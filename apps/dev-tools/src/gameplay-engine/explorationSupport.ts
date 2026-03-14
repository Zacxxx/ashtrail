import {
    Character,
    ExplorationChunk,
    ExplorationManifestDescriptor,
    ExplorationMap,
    ExplorationPawn,
    GameRegistry,
} from "@ashtrail/core";

export const TEST_EXPLORATION_LOCATION_ID = "__test_exploration__";

export interface GenerateExplorationLocationRequest extends Record<string, unknown> {
    worldId: string;
    locationId: string;
    locationName?: string | null;
    prompt: string;
    rows: number;
    cols: number;
    selectedCharIds: string[];
    biomePackId?: string | null;
    biomeSource?: string | null;
    biomeName?: string | null;
    structurePackIds: string[];
    structureSourceMap: Record<string, string>;
    structureNames: string[];
    seed?: number;
    generationMode?: string | null;
    blockPaletteId?: string | null;
    assetMode?: string | null;
}

export interface ExplorationJobAcceptedResponse {
    jobId: string;
    kind: string;
}

export interface ExplorationManifestListItem {
    locationId: string;
    name: string;
    manifestName?: string | null;
    builtIn: boolean;
}

export interface ExplorationLaunchConfig {
    worldId: string;
    locationId: string;
    selectedCharIds: string[];
    jobId?: string | null;
}

function getPawnType(character: Character | null | undefined): ExplorationPawn["type"] {
    if (!character) return "human";
    if (character.explorationSprite?.actorType === "animal") return "animal";
    if (character.explorationSprite?.actorType === "construct") return "mechanoid";
    if (character.type === "Animal") return "animal";
    if (character.type === "Construct") return "mechanoid";
    return "human";
}

function findSpawnPositions(map: ExplorationMap, count: number): Array<{ x: number; y: number }> {
    const centerX = Math.floor(map.width / 2);
    const centerY = Math.floor(map.height / 2);
    const candidates: Array<{ x: number; y: number }> = [];
    const occupied = new Set<string>();

    map.pawns.forEach((pawn) => {
        occupied.add(`${Math.round(pawn.x)}:${Math.round(pawn.y)}`);
    });

    for (let radius = 0; radius < Math.max(map.width, map.height) && candidates.length < count; radius += 1) {
        for (let dy = -radius; dy <= radius && candidates.length < count; dy += 1) {
            for (let dx = -radius; dx <= radius && candidates.length < count; dx += 1) {
                const x = centerX + dx;
                const y = centerY + dy;
                if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
                const tile = map.tiles[y * map.width + x];
                if (!tile?.walkable) continue;
                if (occupied.has(`${x}:${y}`)) continue;
                if (candidates.some((candidate) => candidate.x === x && candidate.y === y)) continue;
                candidates.push({ x, y });
            }
        }
    }

    if (candidates.length === 0) {
        candidates.push({ x: centerX, y: centerY });
    }

    while (candidates.length < count) {
        candidates.push(candidates[candidates.length - 1]);
    }

    return candidates;
}

export function attachSelectedPawns(
    sourceMap: ExplorationMap,
    selectedCharIds: string[],
): { map: ExplorationMap; selectedPawnId: string | null } {
    const npcPawns = sourceMap.pawns.map((pawn) => ({ ...pawn }));
    const map: ExplorationMap = {
        ...sourceMap,
        pawns: npcPawns,
        objects: [...sourceMap.objects],
        tiles: [...sourceMap.tiles],
    };

    const positions = findSpawnPositions(map, Math.max(1, selectedCharIds.length));
    const pawns: ExplorationPawn[] = selectedCharIds.map((id, index) => {
        const character = GameRegistry.getCharacter(id);
        const position = positions[index] || positions[0];
        return {
            id: character?.id || id,
            name: character?.name || "Colonist",
            x: position.x,
            y: position.y,
            tileRow: position.y,
            tileCol: position.x,
            route: [],
            routeIndex: 0,
            segmentProgress: 0,
            moving: false,
            moveSpeedTilesPerSecond: 6.5,
            speed: 4.5,
            factionId: "player",
            type: getPawnType(character),
            sprite: character?.explorationSprite,
            facing: "south",
        };
    });

    map.pawns = [...pawns, ...npcPawns];
    return {
        map,
        selectedPawnId: pawns[0]?.id || null,
    };
}

export async function fetchExplorationManifest(worldId: string, locationId: string): Promise<ExplorationManifestDescriptor | null> {
    const response = await fetch(`/api/planet/locations/${worldId}/${locationId}/exploration-manifest`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Failed to load exploration manifest (${response.status})`);
    }
    return response.json();
}

export async function fetchExplorationChunk(
    worldId: string,
    locationId: string,
    chunkRow: number,
    chunkCol: number,
): Promise<ExplorationChunk | null> {
    const response = await fetch(
        `/api/planet/locations/${worldId}/${locationId}/exploration-chunks/${chunkRow}/${chunkCol}`,
    );
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Failed to load exploration chunk (${response.status})`);
    }
    return response.json();
}

export async function fetchExplorationManifestIndex(worldId: string): Promise<ExplorationManifestListItem[]> {
    const response = await fetch(`/api/planet/locations/${worldId}/exploration-manifests`);
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Failed to load exploration manifest index (${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}
