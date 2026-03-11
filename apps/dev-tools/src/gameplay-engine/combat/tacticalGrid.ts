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
    highlight?: 'move' | 'attack' | 'attack-blocked' | 'path' | null;
    textureUrl?: string;
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

// ── Line of Sight Calculation (Bresenham) ──

export function checkLoS(grid: Grid, r0: number, c0: number, r1: number, c1: number): boolean {
    if (r0 === r1 && c0 === c1) return true;

    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dr - dc;

    let r = r0;
    let c = c0;

    while (true) {
        if (r === r1 && c === c1) break;

        if (r !== r0 || c !== c0) {
            const cell = grid[r]?.[c];
            if (!cell) return false;
            if (!cell.walkable || cell.occupantId) return false;
        }

        const e2 = 2 * err;
        if (e2 > -dc) {
            err -= dc;
            r += sr;
        }
        if (e2 < dr) {
            err += dr;
            c += sc;
        }
    }

    return true;
}

// ── Attack range: cells within N manhattan distance with LoS ──

import { SkillAreaType } from '@ashtrail/core';

export function getAttackableCells(grid: Grid, row: number, col: number, minRange: number, maxRange: number, ignoreLoS: boolean = false): { valid: GridCell[], blocked: GridCell[] } {
    const valid: GridCell[] = [];
    const blocked: GridCell[] = [];
    const rows = grid.length;
    const cols = grid[0].length;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c].walkable && !grid[r][c].occupantId) continue; // Skip empty obstacles

            const dist = Math.abs(r - row) + Math.abs(c - col);
            if (dist >= minRange && dist <= maxRange) {
                if (ignoreLoS || checkLoS(grid, row, col, r, c)) {
                    valid.push(grid[r][c]);
                } else {
                    blocked.push(grid[r][c]);
                }
            }
        }
    }

    return { valid, blocked };
}

// ── AoE Calculation ──

export function getAoECells(grid: Grid, centerRow: number, centerCol: number, areaType: SkillAreaType, size: number, dirR: number = 0, dirC: number = 0): GridCell[] {
    const results: GridCell[] = [];
    const rows = grid.length;
    const cols = grid[0].length;

    if (size === 0 || areaType === 'single') {
        if (grid[centerRow]?.[centerCol]) results.push(grid[centerRow][centerCol]);
        return results;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const dr = r - centerRow;
            const dc = c - centerCol;
            const dist = Math.abs(dr) + Math.abs(dc);
            let inArea = false;

            if (areaType === 'circle') {
                if (dist <= size) inArea = true;
            } else if (areaType === 'splash') {
                if (Math.max(Math.abs(dr), Math.abs(dc)) <= size) inArea = true;
            } else if (areaType === 'cross') {
                // Original Dofus Cross: Grid axes strictly
                if ((dr === 0 || dc === 0) && dist <= size) inArea = true;
            } else if (areaType === 'line') {
                if (dirR !== 0 && dirC === 0) {
                    if (dc === 0 && dr * dirR >= 0 && Math.abs(dr) <= size) inArea = true;
                } else if (dirC !== 0 && dirR === 0) {
                    if (dr === 0 && dc * dirC >= 0 && Math.abs(dc) <= size) inArea = true;
                } else {
                    if ((dr === 0 || dc === 0) && dist <= size) inArea = true; // fallback
                }
            } else if (areaType === 'cone') {
                if (dirR !== 0 && dirC === 0) {
                    const depth = dr * dirR;
                    if (depth >= 0 && depth <= size && Math.abs(dc) <= depth) inArea = true;
                } else if (dirC !== 0 && dirR === 0) {
                    const depth = dc * dirC;
                    if (depth >= 0 && depth <= size && Math.abs(dr) <= depth) inArea = true;
                } else {
                    if (dist <= size) inArea = true; // fallback
                }
            } else if (areaType === 'perpendicular') {
                if (dirR !== 0 && dirC === 0) {
                    if (dr === 0 && Math.abs(dc) <= size) inArea = true;
                } else if (dirC !== 0 && dirR === 0) {
                    if (dc === 0 && Math.abs(dr) <= size) inArea = true;
                } else {
                    if (dist <= size) inArea = true; // fallback
                }
            }

            if (inArea) {
                if (checkLoS(grid, centerRow, centerCol, r, c)) {
                    results.push(grid[r][c]);
                }
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

export function highlightCells(grid: Grid, cells: GridCell[], type: 'move' | 'attack' | 'attack-blocked' | 'path', clearExisting: boolean = true): Grid {
    const newGrid = clearExisting ? clearHighlights(grid) : cloneGrid(grid);
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

