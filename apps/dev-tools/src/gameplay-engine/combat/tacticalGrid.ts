// ═══════════════════════════════════════════════════════════
// tacticalGrid.ts — Pure logic for the isometric tactical grid
// No React dependencies. Portable game engine layer.
// ═══════════════════════════════════════════════════════════

export interface GridCell {
    row: number;
    col: number;
    walkable: boolean;
    occupantId: string | null;
    isSpawnZone?: 'player' | 'enemy';
    highlight?: 'move' | 'attack' | 'path' | null;
}

export type Grid = GridCell[][];

// ── Grid Generation ──

export function generateGrid(rows: number, cols: number, obstacleRatio: number = 0.15): Grid {
    const grid: Grid = [];
    for (let r = 0; r < rows; r++) {
        const row: GridCell[] = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                row: r,
                col: c,
                walkable: Math.random() > obstacleRatio,
                occupantId: null,
            });
        }
        grid.push(row);
    }

    // Ensure spawn zones are always walkable
    // Player spawns: bottom-left quadrant
    for (let r = rows - 3; r < rows; r++) {
        for (let c = 0; c < 3; c++) {
            if (r >= 0 && r < rows && c >= 0 && c < cols) {
                grid[r][c].walkable = true;
                grid[r][c].isSpawnZone = 'player';
            }
        }
    }
    // Enemy spawns: top-right quadrant
    for (let r = 0; r < 3; r++) {
        for (let c = cols - 3; c < cols; c++) {
            if (r >= 0 && r < rows && c >= 0 && c < cols) {
                grid[r][c].walkable = true;
                grid[r][c].isSpawnZone = 'enemy';
            }
        }
    }

    return grid;
}

// ── Neighbors (4-directional: up, down, left, right) ──

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export function getNeighbors(grid: Grid, row: number, col: number): GridCell[] {
    const rows = grid.length;
    const cols = grid[0].length;
    const neighbors: GridCell[] = [];
    for (const [dr, dc] of DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            neighbors.push(grid[nr][nc]);
        }
    }
    return neighbors;
}

// ── BFS: Get all reachable cells within MP budget ──

export function getReachableCells(grid: Grid, startRow: number, startCol: number, mp: number): GridCell[] {
    const visited = new Set<string>();
    const queue: { row: number; col: number; cost: number }[] = [{ row: startRow, col: startCol, cost: 0 }];
    const reachable: GridCell[] = [];
    visited.add(`${startRow},${startCol}`);

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.cost > 0) {
            reachable.push(grid[current.row][current.col]);
        }

        if (current.cost >= mp) continue;

        for (const neighbor of getNeighbors(grid, current.row, current.col)) {
            const key = `${neighbor.row},${neighbor.col}`;
            if (!visited.has(key) && neighbor.walkable && !neighbor.occupantId) {
                visited.add(key);
                queue.push({ row: neighbor.row, col: neighbor.col, cost: current.cost + 1 });
            }
        }
    }

    return reachable;
}

// ── BFS shortest path ──

export function findPath(grid: Grid, fromRow: number, fromCol: number, toRow: number, toCol: number): GridCell[] | null {
    if (fromRow === toRow && fromCol === toCol) return [];

    const visited = new Set<string>();
    const queue: { row: number; col: number; path: GridCell[] }[] = [{ row: fromRow, col: fromCol, path: [] }];
    visited.add(`${fromRow},${fromCol}`);

    while (queue.length > 0) {
        const current = queue.shift()!;

        for (const neighbor of getNeighbors(grid, current.row, current.col)) {
            const key = `${neighbor.row},${neighbor.col}`;
            if (visited.has(key)) continue;
            if (!neighbor.walkable) continue;

            const newPath = [...current.path, neighbor];

            if (neighbor.row === toRow && neighbor.col === toCol) {
                return newPath;
            }

            // Don't path through occupied cells (but we can path TO them if they are the target)
            if (neighbor.occupantId) continue;

            visited.add(key);
            queue.push({ row: neighbor.row, col: neighbor.col, path: newPath });
        }
    }

    return null; // No path exists
}

// ── Attack range: cells within N manhattan distance with LoS ──

export function getAttackableCells(grid: Grid, row: number, col: number, minRange: number, maxRange: number): GridCell[] {
    const results: GridCell[] = [];
    const rows = grid.length;
    const cols = grid[0].length;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c].walkable) continue; // Skip obstacles

            const dist = Math.abs(r - row) + Math.abs(c - col);
            if (dist >= minRange && dist <= maxRange) {
                results.push(grid[r][c]);
            }
        }
    }

    return results;
}

// ── Grid Mutations ──

export function placeEntity(grid: Grid, entityId: string, row: number, col: number): Grid {
    const newGrid = cloneGrid(grid);
    newGrid[row][col].occupantId = entityId;
    return newGrid;
}

export function moveEntityOnGrid(grid: Grid, entityId: string, fromRow: number, fromCol: number, toRow: number, toCol: number): Grid {
    const newGrid = cloneGrid(grid);
    newGrid[fromRow][fromCol].occupantId = null;
    newGrid[toRow][toCol].occupantId = entityId;
    return newGrid;
}

export function removeEntity(grid: Grid, row: number, col: number): Grid {
    const newGrid = cloneGrid(grid);
    newGrid[row][col].occupantId = null;
    return newGrid;
}

export function clearHighlights(grid: Grid): Grid {
    const newGrid = cloneGrid(grid);
    for (const row of newGrid) {
        for (const cell of row) {
            cell.highlight = null;
        }
    }
    return newGrid;
}

export function highlightCells(grid: Grid, cells: GridCell[], type: 'move' | 'attack' | 'path'): Grid {
    const newGrid = clearHighlights(grid);
    for (const cell of cells) {
        newGrid[cell.row][cell.col].highlight = type;
    }
    return newGrid;
}

// ── Isometric coordinate conversion ──

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export function gridToScreen(row: number, col: number): { x: number; y: number } {
    return {
        x: (col - row) * (TILE_WIDTH / 2),
        y: (col + row) * (TILE_HEIGHT / 2),
    };
}

export function screenToGrid(screenX: number, screenY: number): { row: number; col: number } {
    // Reverse the isometric transform
    const col = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
    const row = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
    return { row: Math.round(row), col: Math.round(col) };
}

// ── Helpers ──

function cloneGrid(grid: Grid): Grid {
    return grid.map(row => row.map(cell => ({ ...cell })));
}

// ── AI Map Generation ──

/**
 * Build a structured prompt that asks the AI to return a JSON grid layout.
 * The AI outputs a JSON object with a 2D tiles array (0 = walkable, 1 = obstacle)
 * and spawn zone positions.
 */
export function buildMapPrompt(description: string, rows: number = 12, cols: number = 12): string {
    return `You are a tactical combat map designer for an isometric turn-based RPG.

Given the following battlefield description, generate a ${rows}x${cols} grid map as JSON.

BATTLEFIELD DESCRIPTION: "${description}"

RULES:
- The grid is ${rows} rows by ${cols} columns.
- Each cell is either 0 (walkable) or 1 (obstacle/wall).
- Place obstacles to create interesting tactical terrain matching the description.
- Obstacles should form logical shapes (walls, pillars, furniture, rocks etc).
- Leave clear paths between the two spawn zones so combat is possible.
- Keep obstacle ratio between 10-25% of total cells.
- Player spawn zone: 3x3 area in the bottom-left corner (rows ${rows - 3}-${rows - 1}, cols 0-2). These MUST be 0.
- Enemy spawn zone: 3x3 area in the top-right corner (rows 0-2, cols ${cols - 3}-${cols - 1}). These MUST be 0.

OUTPUT FORMAT (respond with ONLY this JSON, no markdown fences, no explanation):
{
  "name": "Short map name",
  "tiles": [
    [0,0,1,0,...],
    [0,1,0,0,...],
    ...
  ]
}

The "tiles" array must have exactly ${rows} rows, each with exactly ${cols} values.
Respond with ONLY the raw JSON object, nothing else.`;
}

/**
 * Parse the AI's JSON response into our Grid type.
 * Handles common AI quirks: markdown fences, trailing commas, etc.
 */
export function parseAIGridResponse(raw: string, rows: number = 12, cols: number = 12): Grid | null {
    try {
        // Strip markdown code fences if present
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        // Remove trailing commas before ] or } (common AI mistake)
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

        const parsed = JSON.parse(cleaned);

        if (!parsed.tiles || !Array.isArray(parsed.tiles)) {
            console.error('AI grid response missing "tiles" array');
            return null;
        }

        const tiles: number[][] = parsed.tiles;

        // Validate dimensions — resize if needed
        const grid: Grid = [];
        for (let r = 0; r < rows; r++) {
            const row: GridCell[] = [];
            for (let c = 0; c < cols; c++) {
                const tileValue = tiles[r]?.[c] ?? 0;
                row.push({
                    row: r,
                    col: c,
                    walkable: tileValue === 0,
                    occupantId: null,
                });
            }
            grid.push(row);
        }

        // Enforce spawn zones are walkable
        for (let r = rows - 3; r < rows; r++) {
            for (let c = 0; c < 3; c++) {
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    grid[r][c].walkable = true;
                    grid[r][c].isSpawnZone = 'player';
                }
            }
        }
        for (let r = 0; r < 3; r++) {
            for (let c = cols - 3; c < cols; c++) {
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    grid[r][c].walkable = true;
                    grid[r][c].isSpawnZone = 'enemy';
                }
            }
        }

        return grid;
    } catch (e) {
        console.error('Failed to parse AI grid response:', e, '\nRaw:', raw);
        return null;
    }
}

