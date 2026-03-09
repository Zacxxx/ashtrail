use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Copy, Clone, PartialEq)]
struct Node {
    point: Point,
    priority: f32,
}

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .priority
            .partial_cmp(&self.priority)
            .unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for Node {}

pub fn astar(
    start: Point,
    goal: Point,
    width: i32,
    height: i32,
    is_walkable: impl Fn(Point) -> bool,
    get_cost: impl Fn(Point, Point) -> f32,
) -> Option<Vec<Point>> {
    let mut open_set = BinaryHeap::new();
    let mut came_from: HashMap<Point, Point> = HashMap::new();
    let mut cost_so_far: HashMap<Point, f32> = HashMap::new();

    open_set.push(Node {
        point: start,
        priority: heuristic(start, goal),
    });
    cost_so_far.insert(start, 0.0);

    while let Some(current) = open_set.pop() {
        if current.point == goal {
            let mut path = vec![goal];
            let mut curr = goal;
            while let Some(&prev) = came_from.get(&curr) {
                path.push(prev);
                curr = prev;
            }
            path.reverse();
            return Some(path);
        }

        for next in neighbors(current.point, width, height) {
            if !is_walkable(next) {
                continue;
            }

            let new_cost = cost_so_far[&current.point] + get_cost(current.point, next);
            if !cost_so_far.contains_key(&next) || new_cost < cost_so_far[&next] {
                cost_so_far.insert(next, new_cost);
                let priority = new_cost + heuristic(next, goal);
                open_set.push(Node {
                    point: next,
                    priority,
                });
                came_from.insert(next, current.point);
            }
        }
    }

    None
}

fn heuristic(a: Point, b: Point) -> f32 {
    (((a.x - b.x).abs() + (a.y - b.y).abs()) as f32)
}

fn neighbors(p: Point, width: i32, height: i32) -> Vec<Point> {
    let mut res = Vec::with_capacity(4);
    for (dx, dy) in &[(-1, 0), (1, 0), (0, -1), (0, 1)] {
        let nx = p.x + dx;
        let ny = p.y + dy;
        if nx >= 0 && nx < width && ny >= 0 && ny < height {
            res.push(Point { x: nx, y: ny });
        }
    }
    res
}
