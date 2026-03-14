import type { DirectionalSpriteBinding, SpriteDirection } from "../../types";

export interface Tile {
    type: string;
    walkable: boolean;
    moveCost: number; // 1.0 is normal, higher is slower, 0 is impassable
    textureUrl?: string;
    isSpawnZone?: "player" | "neutral" | "enemy";
    interiorId?: string;
    lightLevel?: number;
    blocksLight?: boolean;
    doorId?: string;
}

export interface ExplorationRouteNode {
    row: number;
    col: number;
}

export type ExplorationNpcIntent =
    | "idle"
    | "walking_to_anchor"
    | "waiting"
    | "wandering_local"
    | "using_door";

export interface ExplorationPawn {
    id: string;
    name: string;
    x: number;
    y: number;
    tileRow: number;
    tileCol: number;
    targetX?: number;
    targetY?: number;
    path?: { x: number; y: number }[];
    route: ExplorationRouteNode[];
    routeIndex: number;
    segmentProgress: number;
    moving: boolean;
    moveSpeedTilesPerSecond: number;
    speed: number; // tiles per second
    factionId: string;
    type: "human" | "animal" | "mechanoid";
    textureUrl?: string;
    sprite?: DirectionalSpriteBinding;
    facing?: SpriteDirection;
    isNpc?: boolean;
    interactionLabel?: string;
    homeInteriorId?: string;
    scheduleId?: string;
    currentAnchorId?: string;
    currentIntent?: ExplorationNpcIntent;
    nextDecisionAtTick?: number;
}

export interface MapObject {
    id: string;
    type: string; // e.g., 'building', 'tree', 'rock'
    x: number;
    y: number;
    width: number;
    height: number;
    passable: boolean;
    textureUrl?: string;
    isNatural?: boolean;
    isHidden?: boolean;
    moveCost?: number;
    fertility?: number;
    doorId?: string;
    interiorId?: string;
    roofGroupId?: string;
    heightTiles?: number;
    blocksLight?: boolean;
}

export interface ExplorationMap {
    id: string;
    width: number;
    height: number;
    tiles: Tile[];
    pawns: ExplorationPawn[];
    objects: MapObject[];
    name?: string;
    fogOfWar?: boolean[]; // true = revealed, false = hidden
    ambientLight?: number;
    version?: number;
    renderMode?: "isometric";
    metadata?: Record<string, unknown>;
}

export interface ExplorationSpawnPoint {
    row: number;
    col: number;
}

export interface ExplorationManifestDescriptor {
    id: string;
    worldId: string;
    locationId: string;
    name: string;
    width: number;
    height: number;
    chunkSize: number;
    version: 3;
    renderMode: "isometric";
    ambientLight: number;
    spawn: ExplorationSpawnPoint;
    metadata?: Record<string, unknown>;
}

export interface ExplorationChunk {
    id: string;
    chunkRow: number;
    chunkCol: number;
    originRow: number;
    originCol: number;
    width: number;
    height: number;
    tiles: Tile[];
    objects: MapObject[];
}

export interface ExplorationChunkSync {
    descriptorId: string;
    chunks: ExplorationChunk[];
}

export interface ExplorationVisibilityState {
    revealedInteriorId: string | null;
    revealedRoofGroupIds: string[];
    openedDoorIds: string[];
}

export interface ExplorationSessionConfig {
    sessionName?: string;
    tickRateHz?: number;
}

export interface ExplorationSessionSnapshot {
    descriptor: ExplorationManifestDescriptor;
    chunks: ExplorationChunk[];
    pawns: ExplorationPawn[];
    selectedPawnId: string | null;
    visibility: ExplorationVisibilityState;
    tick: number;
    connectionState: "active" | "reconnecting";
}

export type ExplorationClientAction =
    | { type: "start_session"; worldId: string; locationId: string; selectedCharacterIds: string[]; config?: ExplorationSessionConfig }
    | { type: "subscribe_view"; centerRow: number; centerCol: number; radius: number }
    | { type: "subscribe_chunks"; centerRow: number; centerCol: number; radius: number }
    | { type: "move_to"; pawnId: string; targetRow: number; targetCol: number }
    | { type: "set_selected_pawn"; pawnId?: string | null }
    | { type: "interact"; row?: number; col?: number; objectId?: string; actorId?: string }
    | { type: "ping" };

export type ExplorationSessionEvent =
    | { type: "session_ready"; state: ExplorationSessionSnapshot }
    | { type: "chunk_delta"; descriptorId: string; chunks: ExplorationChunk[]; removedChunkIds: string[] }
    | { type: "chunk_sync"; sync: ExplorationChunkSync }
    | {
        type: "pawn_delta";
        pawns: ExplorationPawn[];
        removedPawnIds: string[];
        selectedPawnId: string | null;
        visibility: ExplorationVisibilityState;
        tick: number;
        connectionState: "active" | "reconnecting";
    }
    | { type: "pawn_sync"; pawns: ExplorationPawn[]; selectedPawnId: string | null; visibility: ExplorationVisibilityState; tick: number; connectionState: "active" | "reconnecting" }
    | { type: "interaction"; label: string; row?: number; col?: number; objectId?: string; actorId?: string }
    | { type: "pong"; tick: number }
    | { type: "error"; message: string };
