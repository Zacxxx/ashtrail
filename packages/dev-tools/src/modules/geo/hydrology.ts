// ──────────────────────────────────────────────────────────────
// Hydrology Simulation Module
// River flow accumulation, lake detection, water table
// ──────────────────────────────────────────────────────────────

/**
 * Simulates river flow using downhill flow accumulation.
 * Each cell drains to its lowest neighbor; flow accumulates downstream.
 * 
 * @param elevations - 2D grid of elevation values [0–1]
 * @param moisture - 2D grid of precipitation/moisture values [0–1]
 * @param waterLevel - elevation threshold for water
 * @returns Object containing riverFlow grid, lake detection, and water table
 */
export function simulateHydrology(
    elevations: Float32Array,
    moisture: Float32Array,
    cols: number,
    rows: number,
    waterLevel: number,
): HydrologyResult {
    const totalCells = cols * rows;
    const flow = new Float32Array(totalCells);
    const isLake = new Uint8Array(totalCells);
    const waterTable = new Float32Array(totalCells);

    // ── Step 1: Sort cells by elevation (highest first) ──
    const indices = Array.from({ length: totalCells }, (_, i) => i);
    indices.sort((a, b) => elevations[b] - elevations[a]);

    // ── Step 2: Flow accumulation (D8 algorithm) ──
    // For each cell starting from highest, add its rain + accumulated flow
    // to its lowest neighbor
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

    for (const idx of indices) {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        const elev = elevations[idx];

        // Only simulate flow on land
        if (elev < waterLevel) continue;

        // Add local rainfall to flow
        flow[idx] += moisture[idx] * 0.01;

        // Find the lowest neighbor
        let lowestElev = elev;
        let lowestIdx = -1;

        for (let d = 0; d < 8; d++) {
            const nx = x + dx[d];
            const ny = y + dy[d];
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const nIdx = ny * cols + nx;
            if (elevations[nIdx] < lowestElev) {
                lowestElev = elevations[nIdx];
                lowestIdx = nIdx;
            }
        }

        if (lowestIdx >= 0) {
            // Drain flow downhill
            flow[lowestIdx] += flow[idx];
        } else {
            // No lower neighbor → depression / lake
            isLake[idx] = 1;
        }
    }

    // ── Step 3: Normalize flow values ──
    let maxFlow = 0;
    for (let i = 0; i < totalCells; i++) {
        if (flow[i] > maxFlow) maxFlow = flow[i];
    }
    if (maxFlow > 0) {
        for (let i = 0; i < totalCells; i++) {
            flow[i] = flow[i] / maxFlow;
        }
    }

    // ── Step 4: Water table estimation ──
    // Water table depth is influenced by elevation, moisture, and proximity to rivers
    for (let i = 0; i < totalCells; i++) {
        const elev = elevations[i];
        const moist = moisture[i];
        const riverProximity = flow[i];

        // Higher elevation + less moisture = deeper water table
        waterTable[i] = Math.max(0, Math.min(1,
            elev * 0.6 - moist * 0.3 - riverProximity * 0.3 + 0.2
        ));
    }

    // ── Step 5: Detect lake basins (flood fill depressions) ──
    for (let i = 0; i < totalCells; i++) {
        if (isLake[i] === 1 && elevations[i] >= waterLevel) {
            // Flood fill: mark all connected cells at similar elevation as lake
            const queue = [i];
            const visited = new Set<number>();
            visited.add(i);

            while (queue.length > 0) {
                const current = queue.pop()!;
                const cx = current % cols;
                const cy = Math.floor(current / cols);

                for (let d = 0; d < 8; d++) {
                    const nx = cx + dx[d];
                    const ny = cy + dy[d];
                    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                    const nIdx = ny * cols + nx;
                    if (visited.has(nIdx)) continue;

                    // Include neighbors that are slightly lower or at same height
                    if (Math.abs(elevations[nIdx] - elevations[current]) < 0.01) {
                        isLake[nIdx] = 1;
                        visited.add(nIdx);
                        queue.push(nIdx);
                    }
                }
            }
        }
    }

    return { flow, isLake, waterTable };
}

export interface HydrologyResult {
    /** Accumulated flow per cell [0–1], higher = bigger river */
    flow: Float32Array;
    /** 1 if cell is a lake, 0 otherwise */
    isLake: Uint8Array;
    /** Water table depth [0–1], lower = closer to surface */
    waterTable: Float32Array;
}
