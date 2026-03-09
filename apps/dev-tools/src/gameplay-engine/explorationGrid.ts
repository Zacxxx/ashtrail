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
    };
}

/**
 * Build a prompt for generating an exploration map.
 */
export function buildExplorationMapPrompt(description: string, rows: number, cols: number): string {
    return `You are a level designer for a Rimworld-like colony simulator.
Generate a ${rows}x${cols} exploration map based on this description: "${description}"

RULES:
- Grid size: ${rows} rows x ${cols} columns.
- Use 'floor' for walkable areas and 'wall' for obstacles.
- Create logical structures: rooms, corridors, natural rock formations, or ruins.
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
        };
    } catch (e) {
        console.error("Failed to parse AI exploration map:", e);
        return null;
    }
}
