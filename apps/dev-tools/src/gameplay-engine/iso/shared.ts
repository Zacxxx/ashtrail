export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const TILE_ELEVATION = 24;

export function gridToScreen(row: number, col: number): { x: number; y: number } {
    return {
        x: (col - row) * (TILE_WIDTH / 2),
        y: (col + row) * (TILE_HEIGHT / 2),
    };
}

export function screenToGrid(screenX: number, screenY: number): { row: number; col: number } {
    const col = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2;
    const row = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2;
    return {
        row: Math.round(row),
        col: Math.round(col),
    };
}

export function gridBounds(rows: number, cols: number) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const { x, y } = gridToScreen(row, col);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + TILE_WIDTH);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + TILE_HEIGHT);
        }
    }

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
