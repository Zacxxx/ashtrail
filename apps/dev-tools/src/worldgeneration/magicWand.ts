import type { RegionType } from "./types";
import { REGION_TYPE_COLORS } from "./types";

/**
 * Parses hex into [r,g,b]
 */
function hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
}

/**
 * Find the closest matching RegionType based on euclidean distance in RGB space.
 */
export function guessRegionTypeFromColor(r: number, g: number, b: number): RegionType {
    let bestType: RegionType = "custom";
    let minDistance = Infinity;

    for (const [type, hex] of Object.entries(REGION_TYPE_COLORS)) {
        if (type === "custom") continue;
        const [tr, tg, tb] = hexToRgb(hex);
        const distSq = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
        if (distSq < minDistance) {
            minDistance = distSq;
            bestType = type as RegionType;
        }
    }
    return bestType;
}

/**
 * Flood fills from (startX, startY) on the given imagedata.
 * Returns a Uint8ClampedArray mask (1 for filled, 0 for not) and the avg [r,g,b] of the filled area.
 */
export function floodFillMatch(
    imageData: ImageData,
    startX: number,
    startY: number,
    tolerance: number = 30
): { mask: Uint8Array; avgColor: [number, number, number] } {
    const { width, height, data } = imageData;
    const mask = new Uint8Array(width * height);

    const startIdx = (startY * width + startX) * 4;
    const startR = data[startIdx];
    const startG = data[startIdx + 1];
    const startB = data[startIdx + 2];

    const stack: [number, number][] = [[startX, startY]];

    let sumR = 0, sumG = 0, sumB = 0;
    let count = 0;

    const colorMatch = (r: number, g: number, b: number) => {
        return Math.abs(r - startR) <= tolerance &&
            Math.abs(g - startG) <= tolerance &&
            Math.abs(b - startB) <= tolerance;
    };

    while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        const idx = y * width + x;

        if (x < 0 || x >= width || y < 0 || y >= height || mask[idx] === 1) {
            continue;
        }

        const dataIdx = idx * 4;
        if (colorMatch(data[dataIdx], data[dataIdx + 1], data[dataIdx + 2])) {
            mask[idx] = 1;
            sumR += data[dataIdx];
            sumG += data[dataIdx + 1];
            sumB += data[dataIdx + 2];
            count++;

            stack.push([x - 1, y]);
            stack.push([x + 1, y]);
            stack.push([x, y - 1]);
            stack.push([x, y + 1]);
        }
    }

    // Default to start color if nothing filled
    if (count === 0) return { mask, avgColor: [startR, startG, startB] };

    return {
        mask,
        avgColor: [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)]
    };
}

/**
 * Traces the OUTLINE of a boolean 1D array mask using Marching Squares / Contour tracing.
 * Returns array of [nx, ny] points bounded [0..1]
 */
export function traceBoundary(mask: Uint8Array, width: number, height: number): [number, number][] {
    // 1. Find a starting border pixel
    let startX = -1, startY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 1) {
                startX = x;
                startY = y;
                break;
            }
        }
        if (startX !== -1) break;
    }

    if (startX === -1) return [];

    // Direction vectors: Right, Down, Left, Up
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let dir = 0; // Start facing right
    const boundary: [number, number][] = [];

    let cx = startX;
    let cy = startY;

    // To prevent infinite loops on weird 1px artifacts
    let steps = 0;
    const maxSteps = width * height;

    const isFilled = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return mask[y * width + x] === 1;
    };

    do {
        boundary.push([cx / width, cy / height]);

        // Right hand wall follower algorithm
        // 1. Check right turn
        const rightDir = (dir + 1) % 4;
        let nx = cx + DIRS[rightDir][0];
        let ny = cy + DIRS[rightDir][1];

        if (isFilled(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = rightDir;
        } else {
            // 2. Check straight
            nx = cx + DIRS[dir][0];
            ny = cy + DIRS[dir][1];
            if (isFilled(nx, ny)) {
                cx = nx;
                cy = ny;
            } else {
                // 3. Turn Left
                dir = (dir + 3) % 4;
            }
        }
        steps++;
    } while ((cx !== startX || cy !== startY) && steps < maxSteps);

    // Close the loop
    if (boundary.length > 0) {
        boundary.push([startX / width, startY / height]);
    }

    return boundary;
}
