export interface Tile {
    type: string;
    walkable: boolean;
    moveCost: number; // 1.0 is normal, higher is slower, 0 is impassable
    textureUrl?: string;
    isSpawnZone?: "player" | "neutral" | "enemy";
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
}
