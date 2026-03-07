// ═══════════════════════════════════════════════════════════
// combat_engine/grid.rs — Pure grid logic ported from tacticalGrid.ts
// BFS pathfinding, reachability, AoE, grid mutations.
// ═══════════════════════════════════════════════════════════

use std::collections::{HashSet, VecDeque};

use super::types::*;

const DIRS: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];

// ── Grid Generation ─────────────────────────────────────────

pub fn generate_grid(rows: usize, cols: usize, obstacle_ratio: f64) -> Grid {
    use rand::Rng;
    let mut rng = rand::rng();

    let mut grid: Grid = Vec::with_capacity(rows);
    for r in 0..rows {
        let mut row = Vec::with_capacity(cols);
        for c in 0..cols {
            row.push(GridCell {
                row: r,
                col: c,
                walkable: rng.random::<f64>() > obstacle_ratio,
                occupant_id: None,
                is_spawn_zone: None,
                highlight: None,
                texture_url: None,
            });
        }
        grid.push(row);
    }

    // Player spawns: bottom-left 3×3
    for r in rows.saturating_sub(3)..rows {
        for c in 0..3.min(cols) {
            grid[r][c].walkable = true;
            grid[r][c].is_spawn_zone = Some(SpawnZone::Player);
        }
    }
    // Enemy spawns: top-right 3×3
    for r in 0..3.min(rows) {
        for c in cols.saturating_sub(3)..cols {
            grid[r][c].walkable = true;
            grid[r][c].is_spawn_zone = Some(SpawnZone::Enemy);
        }
    }

    grid
}

// ── Neighbors (4-directional) ───────────────────────────────

pub fn get_neighbors(grid: &Grid, row: usize, col: usize) -> Vec<(usize, usize)> {
    let rows = grid.len();
    let cols = if rows > 0 { grid[0].len() } else { 0 };
    let mut neighbors = Vec::with_capacity(4);

    for &(dr, dc) in &DIRS {
        let nr = row as i32 + dr;
        let nc = col as i32 + dc;
        if nr >= 0 && (nr as usize) < rows && nc >= 0 && (nc as usize) < cols {
            neighbors.push((nr as usize, nc as usize));
        }
    }
    neighbors
}

// ── BFS: Reachable cells within MP budget ───────────────────

pub fn get_reachable_cells(
    grid: &Grid,
    start_row: usize,
    start_col: usize,
    mp: i32,
) -> Vec<GridPos> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    let mut reachable = Vec::new();

    visited.insert((start_row, start_col));
    queue.push_back((start_row, start_col, 0i32));

    while let Some((r, c, cost)) = queue.pop_front() {
        if cost > 0 {
            reachable.push(GridPos { row: r, col: c });
        }
        if cost >= mp {
            continue;
        }
        for (nr, nc) in get_neighbors(grid, r, c) {
            if visited.contains(&(nr, nc)) {
                continue;
            }
            let cell = &grid[nr][nc];
            if cell.walkable && cell.occupant_id.is_none() {
                visited.insert((nr, nc));
                queue.push_back((nr, nc, cost + 1));
            }
        }
    }

    reachable
}

// ── BFS shortest path ───────────────────────────────────────

/// Returns the path from (from_row, from_col) to (to_row, to_col) exclusive of the
/// start cell but inclusive of the end cell, or None if no path exists.
pub fn find_path(
    grid: &Grid,
    from_row: usize,
    from_col: usize,
    to_row: usize,
    to_col: usize,
) -> Option<Vec<GridPos>> {
    if from_row == to_row && from_col == to_col {
        return Some(vec![]);
    }

    let mut visited = HashSet::new();
    // (row, col, path_so_far)
    let mut queue: VecDeque<(usize, usize, Vec<GridPos>)> = VecDeque::new();
    visited.insert((from_row, from_col));
    queue.push_back((from_row, from_col, vec![]));

    while let Some((r, c, path)) = queue.pop_front() {
        for (nr, nc) in get_neighbors(grid, r, c) {
            if visited.contains(&(nr, nc)) {
                continue;
            }
            let cell = &grid[nr][nc];
            if !cell.walkable {
                continue;
            }

            let mut new_path = path.clone();
            new_path.push(GridPos { row: nr, col: nc });

            if nr == to_row && nc == to_col {
                return Some(new_path);
            }

            // Don't path through occupied cells (but we can path TO them)
            if cell.occupant_id.is_some() {
                continue;
            }

            visited.insert((nr, nc));
            queue.push_back((nr, nc, new_path));
        }
    }

    None
}

// ── Attack range: cells within manhattan distance ───────────

pub fn get_attackable_cells(
    grid: &Grid,
    row: usize,
    col: usize,
    min_range: i32,
    max_range: i32,
) -> Vec<GridPos> {
    let rows = grid.len();
    let cols = if rows > 0 { grid[0].len() } else { 0 };
    let mut results = Vec::new();

    for r in 0..rows {
        for c in 0..cols {
            let cell = &grid[r][c];
            // Skip empty obstacles
            if !cell.walkable && cell.occupant_id.is_none() {
                continue;
            }
            let dist = (r as i32 - row as i32).abs() + (c as i32 - col as i32).abs();
            if dist >= min_range && dist <= max_range {
                results.push(GridPos { row: r, col: c });
            }
        }
    }

    results
}

// ── AoE Calculation ─────────────────────────────────────────

pub fn get_aoe_cells(
    grid: &Grid,
    center_row: usize,
    center_col: usize,
    area_type: &SkillAreaType,
    size: i32,
    dir_r: i32,
    dir_c: i32,
) -> Vec<GridPos> {
    let rows = grid.len();
    let cols = if rows > 0 { grid[0].len() } else { 0 };
    let mut results = Vec::new();

    if size == 0 || *area_type == SkillAreaType::Single {
        if center_row < rows && center_col < cols {
            results.push(GridPos {
                row: center_row,
                col: center_col,
            });
        }
        return results;
    }

    let cr = center_row as i32;
    let cc = center_col as i32;

    for r in 0..rows {
        for c in 0..cols {
            let ri = r as i32;
            let ci = c as i32;
            let dist = (ri - cr).abs() + (ci - cc).abs();
            let in_area = match area_type {
                SkillAreaType::Circle => dist <= size,
                SkillAreaType::Cross => (ri == cr || ci == cc) && dist <= size,
                SkillAreaType::Line => {
                    if dir_r != 0 && dir_c == 0 {
                        ci == cc && (ri - cr) * dir_r >= 0 && (ri - cr).abs() <= size
                    } else if dir_c != 0 && dir_r == 0 {
                        ri == cr && (ci - cc) * dir_c >= 0 && (ci - cc).abs() <= size
                    } else {
                        // Fallback to cross
                        (ri == cr || ci == cc) && dist <= size
                    }
                }
                SkillAreaType::Single => false, // Already handled above
            };

            if in_area {
                results.push(GridPos { row: r, col: c });
            }
        }
    }

    results
}

// ── Grid Mutations ──────────────────────────────────────────

pub fn place_entity(grid: &mut Grid, entity_id: &str, row: usize, col: usize) {
    grid[row][col].occupant_id = Some(entity_id.to_string());
}

pub fn move_entity_on_grid(
    grid: &mut Grid,
    _entity_id: &str,
    from_row: usize,
    from_col: usize,
    to_row: usize,
    to_col: usize,
) {
    let id = grid[from_row][from_col].occupant_id.take();
    grid[to_row][to_col].occupant_id = id;
}

pub fn remove_entity(grid: &mut Grid, row: usize, col: usize) {
    grid[row][col].occupant_id = None;
}

pub fn clear_highlights(grid: &mut Grid) {
    for row in grid.iter_mut() {
        for cell in row.iter_mut() {
            cell.highlight = None;
        }
    }
}

pub fn highlight_cells(grid: &mut Grid, cells: &[GridPos], highlight_type: HighlightType) {
    clear_highlights(grid);
    for pos in cells {
        grid[pos.row][pos.col].highlight = Some(highlight_type.clone());
    }
}

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_grid_dimensions() {
        let grid = generate_grid(10, 8, 0.15);
        assert_eq!(grid.len(), 10);
        assert_eq!(grid[0].len(), 8);
    }

    #[test]
    fn test_generate_grid_spawn_zones() {
        let grid = generate_grid(12, 12, 0.15);
        // Player spawn: bottom-left 3×3
        for r in 9..12 {
            for c in 0..3 {
                assert!(
                    grid[r][c].walkable,
                    "Player spawn [{r},{c}] must be walkable"
                );
                assert_eq!(grid[r][c].is_spawn_zone, Some(SpawnZone::Player));
            }
        }
        // Enemy spawn: top-right 3×3
        for r in 0..3 {
            for c in 9..12 {
                assert!(
                    grid[r][c].walkable,
                    "Enemy spawn [{r},{c}] must be walkable"
                );
                assert_eq!(grid[r][c].is_spawn_zone, Some(SpawnZone::Enemy));
            }
        }
    }

    fn make_open_grid(rows: usize, cols: usize) -> Grid {
        let mut grid = Vec::with_capacity(rows);
        for r in 0..rows {
            let mut row = Vec::with_capacity(cols);
            for c in 0..cols {
                row.push(GridCell {
                    row: r,
                    col: c,
                    walkable: true,
                    occupant_id: None,
                    is_spawn_zone: None,
                    highlight: None,
                    texture_url: None,
                });
            }
            grid.push(row);
        }
        grid
    }

    #[test]
    fn test_find_path_basic() {
        let grid = make_open_grid(5, 5);
        let path = find_path(&grid, 0, 0, 4, 4);
        assert!(path.is_some());
        let path = path.unwrap();
        // Manhattan distance is 8, so path length should be 8
        assert_eq!(path.len(), 8);
        // Last cell should be the target
        assert_eq!(path.last().unwrap().row, 4);
        assert_eq!(path.last().unwrap().col, 4);
    }

    #[test]
    fn test_find_path_around_obstacle() {
        let mut grid = make_open_grid(5, 5);
        // Block the direct path with a wall
        grid[0][1].walkable = false;
        grid[1][1].walkable = false;
        grid[2][1].walkable = false;
        // Should still find a path going around
        let path = find_path(&grid, 0, 0, 0, 2);
        assert!(path.is_some());
        let path = path.unwrap();
        assert!(path.len() > 2, "Path should go around the wall");
    }

    #[test]
    fn test_find_path_no_path() {
        let mut grid = make_open_grid(3, 3);
        // Box in the target completely
        grid[0][1].walkable = false;
        grid[1][0].walkable = false;
        grid[1][1].walkable = false;
        let path = find_path(&grid, 2, 2, 0, 0);
        assert!(path.is_none());
    }

    #[test]
    fn test_get_reachable_cells() {
        let grid = make_open_grid(5, 5);
        let reachable = get_reachable_cells(&grid, 2, 2, 2);
        // With MP=2, should be able to reach cells within 2 manhattan distance
        // Excluding the starting cell: 4 (dist=1) + 8 (dist=2) = 12
        assert_eq!(reachable.len(), 12);
    }

    #[test]
    fn test_get_aoe_cells_cross() {
        let grid = make_open_grid(7, 7);
        let cells = get_aoe_cells(&grid, 3, 3, &SkillAreaType::Cross, 2, 0, 0);
        // Cross with size 2: center + 2 in each cardinal direction = 1 + 4*2 = 9
        assert_eq!(cells.len(), 9);
    }

    #[test]
    fn test_get_aoe_cells_circle() {
        let grid = make_open_grid(7, 7);
        let cells = get_aoe_cells(&grid, 3, 3, &SkillAreaType::Circle, 1, 0, 0);
        // Circle radius 1 (manhattan): center + 4 adjacent = 5
        assert_eq!(cells.len(), 5);
    }

    #[test]
    fn test_place_and_move_entity() {
        let mut grid = make_open_grid(5, 5);
        place_entity(&mut grid, "player_1", 0, 0);
        assert_eq!(grid[0][0].occupant_id, Some("player_1".to_string()));

        move_entity_on_grid(&mut grid, "player_1", 0, 0, 2, 3);
        assert_eq!(grid[0][0].occupant_id, None);
        assert_eq!(grid[2][3].occupant_id, Some("player_1".to_string()));

        remove_entity(&mut grid, 2, 3);
        assert_eq!(grid[2][3].occupant_id, None);
    }

    #[test]
    fn test_highlight_and_clear() {
        let mut grid = make_open_grid(3, 3);
        let cells = vec![GridPos { row: 0, col: 1 }, GridPos { row: 1, col: 0 }];
        highlight_cells(&mut grid, &cells, HighlightType::Move);

        assert_eq!(grid[0][1].highlight, Some(HighlightType::Move));
        assert_eq!(grid[1][0].highlight, Some(HighlightType::Move));
        assert_eq!(grid[0][0].highlight, None);

        clear_highlights(&mut grid);
        assert_eq!(grid[0][1].highlight, None);
        assert_eq!(grid[1][0].highlight, None);
    }
}
