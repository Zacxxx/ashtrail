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

export interface ExplorationPawn {
    id: string;
    name: string;
    x: number;
    y: number;
    targetX?: number;
    targetY?: number;
    path?: { x: number; y: number }[];
    speed: number; // tiles per second
    factionId: string;
    type: "human" | "animal" | "mechanoid";
    textureUrl?: string;
    sprite?: DirectionalSpriteBinding;
    facing?: SpriteDirection;
    isNpc?: boolean;
    interactionLabel?: string;
    homeInteriorId?: string;
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

export interface ExplorationSessionConfig {
    sessionName?: string;
    tickRateHz?: number;
}

export interface ExplorationSessionSnapshot {
    map: ExplorationMap;
    selectedPawnId: string | null;
    tick: number;
    connectionState: "active";
}

export type ExplorationClientAction =
    | { type: "start_session"; map: ExplorationMap; selectedPawnId?: string | null; config?: ExplorationSessionConfig }
    | { type: "move_to"; pawnId: string; targetRow: number; targetCol: number }
    | { type: "set_selected_pawn"; pawnId?: string | null }
    | { type: "interact"; row?: number; col?: number; objectId?: string; actorId?: string }
    | { type: "ping" };

export type ExplorationSessionEvent =
    | { type: "state_sync"; state: ExplorationSessionSnapshot }
    | { type: "pawn_sync"; pawns: ExplorationPawn[]; selectedPawnId: string | null; tick: number; connectionState: "active" }
    | { type: "interaction"; label: string; row?: number; col?: number; objectId?: string; actorId?: string }
    | { type: "pong"; tick: number }
    | { type: "error"; message: string };
