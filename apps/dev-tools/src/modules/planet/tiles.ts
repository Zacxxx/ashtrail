export interface PlanetCellLike {
  x: number;
  y: number;
  color: string;
}

export interface PlanetWorldData {
  cols: number;
  rows: number;
  cellData: PlanetCellLike[];
}

export interface PlanetTile {
  id: string;
  index: number;
  centerLon: number;
  centerLat: number;
  sampleX: number;
  sampleY: number;
  vertices: Array<{ lon: number; lat: number }>;
  sides: number;
  kind: "hex" | "pent";
}

export interface PlanetTiling {
  tiles: PlanetTile[];
  tileById: Record<string, PlanetTile>;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const GOLDEN = (1 + Math.sqrt(5)) / 2;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapLon(lon: number): number {
  let out = lon;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return v3(a.x * s, a.y * s, a.z * s);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n <= 1e-12) return v3(0, 0, 1);
  return scale(a, 1 / n);
}

function lonLatFromVec3(p: Vec3): { lon: number; lat: number } {
  const n = normalize(p);
  return { lon: Math.atan2(n.z, n.x), lat: Math.asin(clamp(n.y, -1, 1)) };
}

function vec3FromLonLat(lon: number, lat: number): Vec3 {
  const clat = Math.cos(lat);
  return v3(clat * Math.cos(lon), Math.sin(lat), clat * Math.sin(lon));
}

function vertexKey(p: Vec3): string {
  const s = 1e6;
  return `${Math.round(p.x * s)}:${Math.round(p.y * s)}:${Math.round(p.z * s)}`;
}

function angularDistanceSq(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const a = vec3FromLonLat(aLon, aLat);
  const b = vec3FromLonLat(bLon, bLat);
  const d = 1 - dot(a, b);
  return d * d;
}

function cellAt(world: PlanetWorldData, x: number, y: number): PlanetCellLike | null {
  const ix = clamp(Math.round(x), 0, world.cols - 1);
  const iy = clamp(Math.round(y), 0, world.rows - 1);
  const idx = iy * world.cols + ix;
  return world.cellData[idx] ?? null;
}

function icosahedron() {
  const vertices = [
    v3(-1, GOLDEN, 0),
    v3(1, GOLDEN, 0),
    v3(-1, -GOLDEN, 0),
    v3(1, -GOLDEN, 0),
    v3(0, -1, GOLDEN),
    v3(0, 1, GOLDEN),
    v3(0, -1, -GOLDEN),
    v3(0, 1, -GOLDEN),
    v3(GOLDEN, 0, -1),
    v3(GOLDEN, 0, 1),
    v3(-GOLDEN, 0, -1),
    v3(-GOLDEN, 0, 1),
  ].map(normalize);

  const faces: Array<[number, number, number]> = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  return { vertices, faces };
}

function geodesicDual(frequency: number) {
  const freq = clamp(Math.round(frequency), 1, 12);
  const base = icosahedron();
  const vertices: Vec3[] = [];
  const faces: Array<[number, number, number]> = [];
  const indexByKey = new Map<string, number>();

  const indexFor = (p: Vec3): number => {
    const n = normalize(p);
    const key = vertexKey(n);
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;
    const idx = vertices.length;
    vertices.push(n);
    indexByKey.set(key, idx);
    return idx;
  };

  for (const [ia, ib, ic] of base.faces) {
    const a = base.vertices[ia];
    const b = base.vertices[ib];
    const c = base.vertices[ic];
    const grid: number[][] = [];

    for (let i = 0; i <= freq; i++) {
      const row: number[] = [];
      for (let j = 0; j <= freq - i; j++) {
        const u = i / freq;
        const v = j / freq;
        const w = 1 - u - v;
        const p = normalize(add(add(scale(a, w), scale(b, u)), scale(c, v)));
        row.push(indexFor(p));
      }
      grid.push(row);
    }

    for (let i = 0; i < freq; i++) {
      for (let j = 0; j < freq - i; j++) {
        const v0 = grid[i][j];
        const v1 = grid[i + 1][j];
        const v2 = grid[i][j + 1];
        faces.push([v0, v1, v2]);

        if (j < freq - i - 1) {
          const v3 = grid[i + 1][j + 1];
          faces.push([v1, v3, v2]);
        }
      }
    }
  }

  return { vertices, faces };
}

function chooseFrequency(world: PlanetWorldData): number {
  const targetTiles = clamp(Math.round((world.cols * world.rows) / 340), 300, 2400);
  // Number of vertices in geodesic grid: 10*f^2 + 2
  const f = Math.sqrt((targetTiles - 2) / 10);
  return clamp(Math.round(f), 5, 16);
}

export function buildPlanetTiling(world: PlanetWorldData): PlanetTiling {
  const frequency = chooseFrequency(world);
  const mesh = geodesicDual(frequency);
  const faceCenters = mesh.faces.map(([a, b, c]) =>
    normalize(scale(add(add(mesh.vertices[a], mesh.vertices[b]), mesh.vertices[c]), 1 / 3))
  );

  const adjacentFaces: number[][] = Array.from({ length: mesh.vertices.length }, () => []);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const [a, b, c] = mesh.faces[fi];
    adjacentFaces[a].push(fi);
    adjacentFaces[b].push(fi);
    adjacentFaces[c].push(fi);
  }

  const tiles: PlanetTile[] = [];
  const tileById: Record<string, PlanetTile> = {};

  for (let vi = 0; vi < mesh.vertices.length; vi++) {
    const center = mesh.vertices[vi];
    const centerLonLat = lonLatFromVec3(center);
    const around = adjacentFaces[vi];
    if (around.length < 5) continue;

    let tangentX = cross(center, v3(0, 1, 0));
    if (norm(tangentX) < 1e-8) tangentX = cross(center, v3(1, 0, 0));
    tangentX = normalize(tangentX);
    const tangentY = normalize(cross(center, tangentX));

    const sorted = around
      .map((fi) => {
        const p = faceCenters[fi];
        const tangential = normalize(add(p, scale(center, -dot(p, center))));
        const ax = dot(tangential, tangentX);
        const ay = dot(tangential, tangentY);
        const angle = Math.atan2(ay, ax);
        return { fi, angle };
      })
      .sort((a, b) => a.angle - b.angle);

    const vertices = sorted.map(({ fi }) => lonLatFromVec3(faceCenters[fi]));
    const sampleX = ((centerLonLat.lon + Math.PI) / (Math.PI * 2)) * (world.cols - 1);
    const sampleY = ((centerLonLat.lat + Math.PI / 2) / Math.PI) * (world.rows - 1);
    const sides = vertices.length;
    const kind: "hex" | "pent" = sides <= 5 ? "pent" : "hex";

    const tile: PlanetTile = {
      id: `t${vi}`,
      index: vi,
      centerLon: centerLonLat.lon,
      centerLat: centerLonLat.lat,
      sampleX,
      sampleY,
      vertices,
      sides,
      kind,
    };
    tiles.push(tile);
    tileById[tile.id] = tile;
  }

  return { tiles, tileById };
}

export function pickTile(tiling: PlanetTiling, lon: number, lat: number): PlanetTile | null {
  if (tiling.tiles.length === 0) return null;
  let best: PlanetTile | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const tile of tiling.tiles) {
    const d = angularDistanceSq(lon, lat, tile.centerLon, tile.centerLat);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  }
  return best;
}

export function tileCell(world: PlanetWorldData, tile: PlanetTile | null): PlanetCellLike | null {
  if (!tile) return null;
  return cellAt(world, tile.sampleX, tile.sampleY);
}
