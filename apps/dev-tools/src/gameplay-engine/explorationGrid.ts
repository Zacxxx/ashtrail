import { Tile, ExplorationMap } from "@ashtrail/core";

export interface ExplorationGrid {
    rows: number;
    cols: number;
    tiles: Tile[];
}

/**
 * Generate a random exploration grid as a fallback.
 */
export function generateExplorationGrid(rows: number, cols: number, obstacleRatio: number = 0.15): ExplorationMap {
    const tiles: Tile[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const isWall = Math.random() < obstacleRatio;
            tiles.push({
                type: isWall ? "wall" : "floor",
                walkable: !isWall,
                moveCost: isWall ? 0 : 1.0,
            });
        }
    }

    // Ensure spawn zones are walkable
    // Center spawn for player
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    for (let y = centerY - 2; y <= centerY + 2; y++) {
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            if (x >= 0 && x < cols && y >= 0 && y < rows) {
                const idx = y * cols + x;
                tiles[idx].walkable = true;
                tiles[idx].type = "floor";
                tiles[idx].isSpawnZone = "player";
            }
        }
    }

    return {
        id: `map-${Date.now()}`,
        width: cols,
        height: rows,
        tiles,
        pawns: [],
        objects: [],
    };
}

/**
 * Build a prompt for generating an exploration map.
 */
export function buildExplorationMapPrompt(
    description: string,
    rows: number,
    cols: number,
    biome?: { name: string },
    structures?: { name: string, description?: string }[]
): string {
    const biomeText = biome ? `The map belongs to the "${biome.name}" BIOME.` : "";
    const structuresText = structures && structures.length > 0
        ? `Incorporate the following STRUCTURES and related objects into the map layout:\n${structures.map(s => `- ${s.name}: ${s.description || "Generic structure"}`).join('\n')}`
        : "";

    return `You are a level designer for a Rimworld-like colony simulator.
Generate a ${rows}x${cols} exploration map based on this description: "${description}"

CONTEXT:
${biomeText}
${structuresText}

RULES:
- Grid size: ${rows} rows x ${cols} columns.
- Use 'floor' (0) for walkable areas and 'wall' (1) for obstacles/buildings/walls.
- Create logical structures: rooms, corridors, natural rock formations, or ruins based on the provided structures and biome.
- In addition to tiles, you can place 'objects' (e.g., furniture, specialized machines, sarcophagi, trees, or decorative ruins).
- Ensure the center area (around row ${Math.floor(rows / 2)}, col ${Math.floor(cols / 2)}) is clear of obstacles for the player's initial landing.
- Obstacle density should be around 15-25%.
- Output MUST be valid JSON.

OUTPUT FORMAT:
{
  "name": "Map Name",
  "tiles": [
    [0, 0, 1, ...],
    [0, 1, 0, ...],
    ...
  ],
  "objects": [
    { "type": "object_type_name", "x": 5, "y": 8, "width": 1, "height": 1, "passable": false, "isNatural": true/false }
  ]
}
where 0 is floor and 1 is wall.
The 'tiles' array must have exactly ${rows} rows and ${cols} columns.`;
}

/**
 * Parse AI response into an ExplorationMap.
 */
export function parseAIExplorationResponse(raw: string, rows: number, cols: number): ExplorationMap | null {
    try {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

        const parsed = JSON.parse(cleaned);
        if (!parsed.tiles || !Array.isArray(parsed.tiles)) return null;

        const aiTiles: number[][] = parsed.tiles;
        const tiles: Tile[] = [];

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const val = aiTiles[y]?.[x] ?? 0;
                const isWall = val === 1;
                tiles.push({
                    type: isWall ? "wall" : "floor",
                    walkable: !isWall,
                    moveCost: isWall ? 0 : 1.0,
                });
            }
        }

        const objects = (parsed.objects || []).map((obj: any, idx: number) => ({
            id: `obj-${idx}-${Date.now()}`,
            type: obj.type || "unknown",
            x: obj.x || 0,
            y: obj.y || 0,
            width: obj.width || 1,
            height: obj.height || 1,
            passable: obj.passable ?? false,
            isNatural: obj.isNatural ?? false,
            isHidden: obj.isHidden ?? false
        }));

        // Enforce center spawn
        const centerX = Math.floor(cols / 2);
        const centerY = Math.floor(rows / 2);
        for (let y = centerY - 1; y <= centerY + 1; y++) {
            for (let x = centerX - 1; x <= centerX + 1; x++) {
                if (x >= 0 && x < cols && y >= 0 && y < rows) {
                    const idx = y * cols + x;
                    tiles[idx].walkable = true;
                    tiles[idx].type = "floor";
                    tiles[idx].isSpawnZone = "player";
                }
            }
        }

        return {
            id: `ai-map-${Date.now()}`,
            name: parsed.name || "AI Generated Map",
            width: cols,
            height: rows,
            tiles,
            pawns: [],
            objects,
        };
    } catch (e) {
        console.error("Failed to parse AI exploration map:", e);
        return null;
    }
}
