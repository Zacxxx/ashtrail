import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TerrainCell } from "../modules/geo/types";
import {
  pickTile,
  tileCell,
  type PlanetWorldData,
  type PlanetTiling,
  type ProvinceOverlay,
} from "../modules/planet/tiles";
import type { TilingWorkerRequest, TilingWorkerResponse } from "../workers/tiling.worker";

interface PlanetGlobeProps {
  world: PlanetWorldData;
  onCellHover?: (cell: TerrainCell | null) => void;
  onCellClick?: (cell: TerrainCell | null) => void;
  showHexGrid?: boolean;
  demoTravelEnabled?: boolean;
  demoTravelReplayToken?: string;
  demoTravelStartToken?: number;
}

interface TerrainMask {
  width: number;
  height: number;
  land: Uint8Array;
  quality: Float32Array;
}

interface TravelCandidate {
  x: number;
  y: number;
  lon: number;
  lat: number;
  vec: THREE.Vector3;
  quality: number;
}

interface RouteMetric {
  distance: number;
  waterFraction: number;
}

interface TravelRouteSegment {
  start: TravelCandidate;
  end: TravelCandidate;
  points: THREE.Vector3[];
  distance: number;
  waterFraction: number;
}

interface TravelRoute {
  nodes: TravelCandidate[];
  segments: TravelRouteSegment[];
}

interface LandRegionMap {
  ids: Int32Array;
  largestRegionId: number;
  sizes: Map<number, number>;
}

const WATER_BIOMES = new Set([
  "ABYSSAL_OCEAN",
  "DEEP_OCEAN",
  "OCEAN",
  "COASTAL_SHELF",
  "CORAL_REEF",
  "TIDAL_FLAT",
  "LAKE",
]);

const TRAVEL_NODE_COUNT = 5;
const ROUTE_SEARCH_PROFILES = [
  { targetDistance: 0.42, minDistance: 0.2, maxDistance: 0.68, maxWaterFraction: 0.2 },
  { targetDistance: 0.5, minDistance: 0.24, maxDistance: 0.82, maxWaterFraction: 0.32 },
  { targetDistance: 0.34, minDistance: 0.16, maxDistance: 0.62, maxWaterFraction: 0.42 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function lonLatToVec3(lon: number, lat: number, radius: number): THREE.Vector3 {
  const clat = Math.cos(lat);
  return new THREE.Vector3(
    radius * clat * Math.cos(lon),
    radius * Math.sin(lat),
    radius * clat * Math.sin(lon),
  );
}

function vec3ToLonLat(vector: THREE.Vector3): { lon: number; lat: number } {
  const normalized = vector.clone().normalize();
  return {
    lon: Math.atan2(normalized.z, normalized.x),
    lat: Math.asin(clamp(normalized.y, -1, 1)),
  };
}

function slerpUnitVectors(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const start = a.clone().normalize();
  const end = b.clone().normalize();
  const dot = clamp(start.dot(end), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-5) {
    return start.lerp(end, t).normalize();
  }
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return start.multiplyScalar(wa).add(end.multiplyScalar(wb)).normalize();
}

function angularDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1));
}

function wrapX(x: number, width: number): number {
  const wrapped = x % width;
  return wrapped < 0 ? wrapped + width : wrapped;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta > 0) {
    if (max === rn) {
      h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / delta + 2) / 6;
    } else {
      h = ((rn - gn) / delta + 4) / 6;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  return { h: h * 360, s, v: max };
}

function isLikelyLandFromPixel(r: number, g: number, b: number): boolean {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const { h, s, v } = rgbToHsv(r, g, b);
  const clearlyWaterHue = h >= 165 && h <= 255 && s > 0.12 && v > 0.08 && v < 0.82;
  const blueDominant = b > r * 1.08 && b > g * 1.03 && luminance < 0.76;
  return !(clearlyWaterHue || blueDominant);
}

function isLikelyLandCell(cell: PlanetWorldData["cellData"][number] | undefined): boolean {
  if (!cell) return false;
  const terrainCell = cell as Partial<TerrainCell>;
  if (typeof terrainCell.elevationMeters === "number") {
    return terrainCell.elevationMeters >= -75;
  }
  if (typeof terrainCell.biome === "string") {
    return !WATER_BIOMES.has(terrainCell.biome);
  }
  if (typeof cell.color === "string") {
    const [r, g, b] = hexToRgb(cell.color);
    return isLikelyLandFromPixel(r, g, b);
  }
  return false;
}

function buildTerrainMaskFromCellData(world: PlanetWorldData): TerrainMask | null {
  if (!world.cellData?.length || world.cellData.length !== world.cols * world.rows) {
    return null;
  }

  const land = new Uint8Array(world.cols * world.rows);
  for (let i = 0; i < world.cellData.length; i++) {
    land[i] = isLikelyLandCell(world.cellData[i]) ? 1 : 0;
  }

  return {
    width: world.cols,
    height: world.rows,
    land,
    quality: computeLandQuality(world.cols, world.rows, land),
  };
}

function buildTerrainMaskFromImage(image: HTMLImageElement | HTMLCanvasElement): TerrainMask | null {
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!width || !height) return null;

  const sampleWidth = Math.min(256, width);
  const sampleHeight = Math.max(64, Math.round(sampleWidth / 2));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const land = new Uint8Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const idx = (y * sampleWidth + x) * 4;
      land[y * sampleWidth + x] = isLikelyLandFromPixel(
        imageData.data[idx],
        imageData.data[idx + 1],
        imageData.data[idx + 2],
      ) ? 1 : 0;
    }
  }

  return {
    width: sampleWidth,
    height: sampleHeight,
    land,
    quality: computeLandQuality(sampleWidth, sampleHeight, land),
  };
}

function computeLandQuality(width: number, height: number, land: Uint8Array): Float32Array {
  const quality = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!land[idx]) continue;
      let landHits = 0;
      let sampleCount = 0;
      for (let dy = -3; dy <= 3; dy++) {
        const ny = clamp(y + dy, 0, height - 1);
        for (let dx = -3; dx <= 3; dx++) {
          const nx = wrapX(x + dx, width);
          sampleCount += 1;
          if (land[ny * width + nx]) {
            landHits += 1;
          }
        }
      }
      quality[idx] = landHits / sampleCount;
    }
  }
  return quality;
}

function buildLandRegionMap(mask: TerrainMask): LandRegionMap | null {
  const ids = new Int32Array(mask.width * mask.height);
  ids.fill(-1);
  const sizes = new Map<number, number>();
  let nextRegionId = 0;
  let largestRegionId = -1;
  let largestRegionSize = 0;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const startIndex = y * mask.width + x;
      if (!mask.land[startIndex] || ids[startIndex] !== -1) {
        continue;
      }

      const stack = [startIndex];
      ids[startIndex] = nextRegionId;
      let regionSize = 0;

      while (stack.length > 0) {
        const current = stack.pop()!;
        regionSize += 1;
        const currentY = Math.floor(current / mask.width);
        const currentX = current % mask.width;
        const neighbors = [
          [wrapX(currentX - 1, mask.width), currentY],
          [wrapX(currentX + 1, mask.width), currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ] as const;

        for (const [neighborX, neighborY] of neighbors) {
          if (neighborY < 0 || neighborY >= mask.height) continue;
          const neighborIndex = neighborY * mask.width + neighborX;
          if (!mask.land[neighborIndex] || ids[neighborIndex] !== -1) continue;
          ids[neighborIndex] = nextRegionId;
          stack.push(neighborIndex);
        }
      }

      sizes.set(nextRegionId, regionSize);
      if (regionSize > largestRegionSize) {
        largestRegionSize = regionSize;
        largestRegionId = nextRegionId;
      }
      nextRegionId += 1;
    }
  }

  if (largestRegionId === -1) {
    return null;
  }

  return { ids, largestRegionId, sizes };
}

function sampleLand(mask: TerrainMask, lon: number, lat: number): number {
  const x = wrapX(Math.round(((lon + Math.PI) / (Math.PI * 2)) * mask.width), mask.width);
  const y = clamp(Math.round((0.5 - lat / Math.PI) * mask.height), 0, mask.height - 1);
  return mask.land[y * mask.width + x];
}

function collectTravelCandidates(mask: TerrainMask, regionMap: LandRegionMap | null): TravelCandidate[] {
  const candidates: TravelCandidate[] = [];
  const xStep = Math.max(4, Math.round(mask.width / 40));
  const yStep = Math.max(4, Math.round(mask.height / 24));
  const yStart = Math.round(mask.height * 0.16);
  const yEnd = Math.round(mask.height * 0.84);

  for (let y = yStart; y < yEnd; y += yStep) {
    for (let x = 0; x < mask.width; x += xStep) {
      const idx = y * mask.width + x;
      if (!mask.land[idx]) continue;
      if (regionMap && regionMap.ids[idx] !== regionMap.largestRegionId) continue;
      const quality = mask.quality[idx];
      if (quality < 0.62) continue;
      const yNorm = (y + 0.5) / mask.height;
      const lat = (0.5 - yNorm) * Math.PI;
      const lon = ((x + 0.5) / mask.width) * Math.PI * 2 - Math.PI;
      const latPenalty = Math.abs(lat) / (Math.PI / 2);
      const weightedQuality = quality * (1 - latPenalty * 0.35);
      candidates.push({
        x,
        y,
        lon,
        lat,
        vec: lonLatToVec3(lon, lat, 1),
        quality: weightedQuality,
      });
    }
  }

  candidates.sort((a, b) => b.quality - a.quality || a.y - b.y || a.x - b.x);
  const spreadCandidates: TravelCandidate[] = [];
  for (const candidate of candidates) {
    const isFarEnough = spreadCandidates.every((existing) => angularDistance(existing.vec, candidate.vec) > 0.12);
    if (!isFarEnough) continue;
    spreadCandidates.push(candidate);
    if (spreadCandidates.length >= 140) break;
  }
  return spreadCandidates.length >= 40 ? spreadCandidates : candidates.slice(0, 80);
}

function computeRouteMetric(
  from: TravelCandidate,
  to: TravelCandidate,
  mask: TerrainMask,
  profile: (typeof ROUTE_SEARCH_PROFILES)[number],
): RouteMetric | null {
  const distance = angularDistance(from.vec, to.vec);
  if (distance < profile.minDistance || distance > profile.maxDistance) {
    return null;
  }

  let waterSamples = 0;
  const sampleCount = 18;
  for (let i = 1; i < sampleCount; i++) {
    const t = i / sampleCount;
    const point = slerpUnitVectors(from.vec, to.vec, t);
    const { lon, lat } = vec3ToLonLat(point);
    if (!sampleLand(mask, lon, lat)) {
      waterSamples += 1;
    }
  }

  const waterFraction = waterSamples / Math.max(1, sampleCount - 1);
  if (waterFraction > profile.maxWaterFraction) {
    return null;
  }

  return { distance, waterFraction };
}

function buildArcPoints(start: TravelCandidate, end: TravelCandidate): THREE.Vector3[] {
  const angle = angularDistance(start.vec, end.vec);
  const steps = Math.max(28, Math.round(36 + angle * 22));
  const arcLift = 0.03 + Math.min(0.05, angle * 0.05);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = slerpUnitVectors(start.vec, end.vec, t);
    const radius = 1.016 + Math.sin(Math.PI * t) * arcLift;
    points.push(point.multiplyScalar(radius));
  }
  return points;
}

function scorePath(
  path: number[],
  candidates: TravelCandidate[],
  metrics: RouteMetric[],
  profile: (typeof ROUTE_SEARCH_PROFILES)[number],
): number {
  const distances = metrics.map((metric) => metric.distance);
  const waterPenalty = metrics.reduce((sum, metric) => sum + metric.waterFraction, 0);
  const avgDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  const distanceVariance = distances.reduce((sum, distance) => sum + Math.abs(distance - avgDistance), 0) / distances.length;
  const targetPenalty = distances.reduce((sum, distance) => sum + Math.abs(distance - profile.targetDistance), 0);
  const qualityScore = path.reduce((sum, index) => sum + candidates[index].quality, 0);

  let turnPenalty = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const previous = candidates[path[i - 1]].vec;
    const current = candidates[path[i]].vec;
    const next = candidates[path[i + 1]].vec;
    const incoming = current.clone().sub(previous).normalize();
    const outgoing = next.clone().sub(current).normalize();
    const turnAngle = Math.acos(clamp(incoming.dot(outgoing), -1, 1));
    turnPenalty += Math.max(0, turnAngle - 1.1) * 2.2;
  }

  const pathDistance = distances.reduce((sum, distance) => sum + distance, 0);
  const directDistance = angularDistance(candidates[path[0]].vec, candidates[path[path.length - 1]].vec);
  const detourPenalty = directDistance > 0.001 ? Math.max(0, pathDistance / directDistance - 1.5) * 3.5 : 3.5;

  return qualityScore * 1.8 - distanceVariance * 7.5 - targetPenalty * 1.6 - waterPenalty * 4.2 - turnPenalty - detourPenalty;
}

function buildTravelRoute(mask: TerrainMask): TravelRoute | null {
  const regionMap = buildLandRegionMap(mask);
  const candidates = collectTravelCandidates(mask, regionMap);
  if (candidates.length < TRAVEL_NODE_COUNT) {
    return null;
  }

  let bestRoute: { path: number[]; metrics: RouteMetric[]; score: number } | null = null;

  for (const profile of ROUTE_SEARCH_PROFILES) {
    const edgeCache = new Map<string, RouteMetric | null>();
    const getMetric = (fromIndex: number, toIndex: number) => {
      const cacheKey = `${fromIndex}:${toIndex}`;
      if (edgeCache.has(cacheKey)) {
        return edgeCache.get(cacheKey) ?? null;
      }
      const metric = computeRouteMetric(candidates[fromIndex], candidates[toIndex], mask, profile);
      edgeCache.set(cacheKey, metric);
      edgeCache.set(`${toIndex}:${fromIndex}`, metric);
      return metric;
    };

    const neighborLists = candidates.map((candidate, index) => {
      const scoredNeighbors: Array<{ to: number; metric: RouteMetric; score: number }> = [];
      for (let otherIndex = 0; otherIndex < candidates.length; otherIndex++) {
        if (otherIndex === index) continue;
        const metric = getMetric(index, otherIndex);
        if (!metric) continue;
        const neighbor = candidates[otherIndex];
        const distanceScore = 1 - Math.abs(metric.distance - profile.targetDistance);
        const score = neighbor.quality * 1.2 + distanceScore * 0.9 - metric.waterFraction * 1.6;
        scoredNeighbors.push({ to: otherIndex, metric, score });
      }
      scoredNeighbors.sort((a, b) => b.score - a.score);
      return scoredNeighbors.slice(0, 9);
    });

    const startIndices = candidates
      .map((candidate, index) => ({ index, score: candidate.quality - Math.abs(candidate.lat) * 0.12 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map((entry) => entry.index);

    const visit = (path: number[], metricPath: RouteMetric[]) => {
      if (path.length === TRAVEL_NODE_COUNT) {
        const score = scorePath(path, candidates, metricPath, profile);
        if (!bestRoute || score > bestRoute.score) {
          bestRoute = { path: [...path], metrics: [...metricPath], score };
        }
        return;
      }

      const current = path[path.length - 1];
      for (const neighbor of neighborLists[current]) {
        if (path.includes(neighbor.to)) continue;
        if (path.length >= 2) {
          const previous = candidates[path[path.length - 2]].vec;
          const currentVec = candidates[current].vec;
          const nextVec = candidates[neighbor.to].vec;
          const incoming = currentVec.clone().sub(previous).normalize();
          const outgoing = nextVec.clone().sub(currentVec).normalize();
          const turnAngle = Math.acos(clamp(incoming.dot(outgoing), -1, 1));
          if (turnAngle > 1.65) continue;
        }
        path.push(neighbor.to);
        metricPath.push(neighbor.metric);
        visit(path, metricPath);
        path.pop();
        metricPath.pop();
      }
    };

    for (const startIndex of startIndices) {
      visit([startIndex], []);
      if (bestRoute && bestRoute.score > 4.5) {
        break;
      }
    }

    if (bestRoute) {
      break;
    }
  }

  if (!bestRoute) {
    return null;
  }

  const nodes = bestRoute.path.map((index) => candidates[index]);
  const segments = nodes.slice(0, -1).map((node, index) => ({
    start: node,
    end: nodes[index + 1],
    points: buildArcPoints(node, nodes[index + 1]),
    distance: bestRoute.metrics[index].distance,
    waterFraction: bestRoute.metrics[index].waterFraction,
  }));

  return { nodes, segments };
}

function makeTexture(world: PlanetWorldData): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = world.cols;
  canvas.height = world.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create texture canvas context");
  }

  const image = ctx.createImageData(world.cols, world.rows);
  const data = image.data;

  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      const idx = y * world.cols + x;
      const p = idx * 4;
      const [r, g, b] = hexToRgb(world.cellData[idx]?.color ?? "#000000");
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create glow canvas");
  }
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.32)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    const textureMaterial = entry as THREE.Material & {
      map?: THREE.Texture | null;
      alphaMap?: THREE.Texture | null;
      bumpMap?: THREE.Texture | null;
      displacementMap?: THREE.Texture | null;
    };
    textureMaterial.map?.dispose();
    textureMaterial.alphaMap?.dispose();
    textureMaterial.bumpMap?.dispose();
    textureMaterial.displacementMap?.dispose();
    entry.dispose();
  }
}

export function PlanetGlobe({
  world,
  onCellHover,
  onCellClick,
  showHexGrid,
  demoTravelEnabled = false,
  demoTravelReplayToken = "",
  demoTravelStartToken = 0,
}: PlanetGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [tiling, setTiling] = useState<PlanetTiling | null>(null);
  const [isGeneratingGeometry, setIsGeneratingGeometry] = useState(false);

  const showHexGridRef = useRef(showHexGrid);
  useEffect(() => {
    showHexGridRef.current = showHexGrid;
  }, [showHexGrid]);

  useEffect(() => {
    setIsGeneratingGeometry(true);
    setTiling(null);

    const worker = new Worker(new URL("../workers/tiling.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (e: MessageEvent<TilingWorkerResponse>) => {
      if (e.data.type === "TILING_COMPLETE") {
        setTiling(e.data.tiling);
        setIsGeneratingGeometry(false);
      } else if (e.data.type === "TILING_ERROR") {
        console.error("Worker failed:", e.data.error);
        setIsGeneratingGeometry(false);
      }
    };

    const req: TilingWorkerRequest = {
      type: "BUILD_TILING",
      world: {
        cols: world.cols,
        rows: world.rows,
        cellData: [],
      },
    };
    worker.postMessage(req);

    return () => worker.terminate();
  }, [world]);

  useEffect(() => {
    if (!tiling) return;
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050b14");

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(4, 2, 4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x6aa9ff, 0.45);
    rim.position.set(-3, -1.5, -2.5);
    scene.add(rim);

    function generateHeightmapFromImage(image: HTMLImageElement | HTMLCanvasElement): THREE.CanvasTexture {
      const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
      const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to create heightmap canvas context");
      }
      ctx.drawImage(image, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const src = imageData.data;
      const rawElevations = new Float32Array(w * h);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = src[i] / 255;
          const g = src[i + 1] / 255;
          const b = src[i + 2] / 255;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          let elevation: number;

          const isWater = b > r * 1.15 && b > g * 1.05 && luminance < 0.55;
          if (isWater) {
            elevation = 0.1 + luminance * 0.15;
          } else {
            const greenness = g - Math.max(r, b);
            if (greenness > 0.05) {
              elevation = 0.2 + luminance * 0.2;
            } else if (luminance > 0.7) {
              elevation = 0.35 + (luminance - 0.7) * 0.4;
            } else {
              elevation = 0.25 + luminance * 0.25;
            }
          }
          rawElevations[y * w + x] = elevation;
        }
      }

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const elevation = rawElevations[y * w + x];
          const v = Math.min(255, Math.max(0, Math.round(elevation * 255)));
          const i = (y * w + x) * 4;
          src[i] = v;
          src[i + 1] = v;
          src[i + 2] = v;
          src[i + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      const wrapCanvas = document.createElement("canvas");
      wrapCanvas.width = w * 3;
      wrapCanvas.height = h;
      const wrapCtx = wrapCanvas.getContext("2d");
      if (!wrapCtx) {
        throw new Error("Failed to create wrapping canvas context");
      }
      wrapCtx.drawImage(canvas, 0, 0);
      wrapCtx.drawImage(canvas, w, 0);
      wrapCtx.drawImage(canvas, w * 2, 0);

      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = w * 3;
      blurCanvas.height = h;
      const blurCtx = blurCanvas.getContext("2d");
      if (!blurCtx) {
        throw new Error("Failed to create blur canvas context");
      }
      blurCtx.filter = "blur(12px)";
      blurCtx.drawImage(wrapCanvas, 0, 0);

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = w;
      finalCanvas.height = h;
      const finalCtx = finalCanvas.getContext("2d");
      if (!finalCtx) {
        throw new Error("Failed to create final heightmap context");
      }
      finalCtx.drawImage(blurCanvas, -w, 0);

      const texture = new THREE.CanvasTexture(finalCanvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      return texture;
    }

    let globeMaterial: THREE.MeshStandardMaterial;
    let loadedColorImage: HTMLImageElement | HTMLCanvasElement | null = null;
    let overlayDisposed = false;

    if (world.textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      const texture = loader.load(world.textureUrl, (loadedTex) => {
        loadedColorImage = loadedTex.image;
        if (world.heightmapUrl) {
          loader.load(world.heightmapUrl, (heightTex) => {
            if (overlayDisposed) {
              heightTex.dispose();
              return;
            }
            heightTex.colorSpace = THREE.LinearSRGBColorSpace;
            globeMaterial.displacementMap = heightTex;
            globeMaterial.displacementScale = 0.3;
            globeMaterial.bumpMap = heightTex;
            globeMaterial.bumpScale = 0.05;
            globeMaterial.needsUpdate = true;
          });
        } else {
          try {
            const heightmap = generateHeightmapFromImage(loadedTex.image);
            globeMaterial.displacementMap = heightmap;
            globeMaterial.displacementScale = 0.06;
            globeMaterial.bumpMap = heightmap;
            globeMaterial.bumpScale = 0.04;
            globeMaterial.needsUpdate = true;
          } catch (error) {
            console.warn("Failed to generate heightmap due to CORS or tainted canvas:", error);
          }
        }
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      globeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0.0,
      });
    } else {
      const texture = makeTexture(world);
      texture.colorSpace = THREE.SRGBColorSpace;
      globeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0.0,
      });
    }

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), globeMaterial);
    scene.add(globe);

    const overlayGroup = new THREE.Group();
    scene.add(overlayGroup);
    const overlayMeshes: THREE.Mesh[] = [];

    const addOverlayMesh = (overlay: ProvinceOverlay) => {
      const sourceWidth = overlay.sourceWidth || world.cols;
      const sourceHeight = overlay.sourceHeight || world.rows;
      if (!sourceWidth || !sourceHeight) {
        return;
      }

      const u0 = Math.max(0, Math.min(1, overlay.bbox.x / sourceWidth));
      const v0 = Math.max(0, Math.min(1, overlay.bbox.y / sourceHeight));
      const u1 = Math.max(0, Math.min(1, (overlay.bbox.x + overlay.bbox.width) / sourceWidth));
      const v1 = Math.max(0, Math.min(1, (overlay.bbox.y + overlay.bbox.height) / sourceHeight));
      if (u1 <= u0 || v1 <= v0) {
        return;
      }

      const widthRatio = u1 - u0;
      const heightRatio = v1 - v0;
      const widthSegments = Math.max(8, Math.ceil(widthRatio * 220));
      const heightSegments = Math.max(8, Math.ceil(heightRatio * 110));
      const geometry = new THREE.SphereGeometry(
        1.002,
        widthSegments,
        heightSegments,
        u0 * Math.PI * 2,
        widthRatio * Math.PI * 2,
        v0 * Math.PI,
        heightRatio * Math.PI,
      );

      const overlayLoader = new THREE.TextureLoader();
      overlayLoader.setCrossOrigin("anonymous");
      overlayLoader.load(
        overlay.imageUrl,
        (texture) => {
          if (overlayDisposed) {
            texture.dispose();
            geometry.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          const material = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.02,
            depthWrite: false,
            roughness: 0.95,
            metalness: 0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          overlayMeshes.push(mesh);
          overlayGroup.add(mesh);
        },
        undefined,
        () => {
          geometry.dispose();
        },
      );
    };

    for (const overlay of world.provinceOverlays || []) {
      addOverlayMesh(overlay);
    }

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.03, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x76a9ff, transparent: true, opacity: 0.08 }),
    );
    scene.add(atmosphere);

    const tileOverlayVertices: number[] = [];
    const tileRadius = 1.006;
    for (const tile of tiling.tiles) {
      for (let i = 0; i < tile.vertices.length; i++) {
        const a = tile.vertices[i];
        const b = tile.vertices[(i + 1) % tile.vertices.length];
        if (Math.abs(a.lon - b.lon) > Math.PI * 0.9) continue;
        const av = lonLatToVec3(a.lon, a.lat, tileRadius);
        const bv = lonLatToVec3(b.lon, b.lat, tileRadius);
        tileOverlayVertices.push(av.x, av.y, av.z, bv.x, bv.y, bv.z);
      }
    }
    const tileOverlayGeo = new THREE.BufferGeometry();
    tileOverlayGeo.setAttribute("position", new THREE.Float32BufferAttribute(tileOverlayVertices, 3));
    const tileOverlay = new THREE.LineSegments(
      tileOverlayGeo,
      new THREE.LineBasicMaterial({
        color: 0xe0f0ff,
        transparent: true,
        opacity: 0.45,
      }),
    );
    scene.add(tileOverlay);

    const highlightGeo = new THREE.BufferGeometry();
    const highlightLine = new THREE.LineLoop(
      highlightGeo,
      new THREE.LineBasicMaterial({ color: 0x18d4d2, transparent: true, opacity: 0.95 }),
    );
    highlightLine.visible = false;
    scene.add(highlightLine);

    const stars = new THREE.Group();
    const starGeo = new THREE.SphereGeometry(0.01, 6, 6);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 450; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const radius = 10 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      star.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
      stars.add(star);
    }
    scene.add(stars);

    const glowTexture = makeGlowTexture();

    interface RuntimeTravelNode {
      core: THREE.Mesh;
      glow: THREE.Sprite;
      halo: THREE.Sprite;
      ring: THREE.Sprite;
      flash: THREE.Sprite;
      trigger: THREE.Sprite;
    }

    interface RuntimeTravelSegment {
      points: THREE.Vector3[];
      base: THREE.Line;
      progress: THREE.Line;
      highlight: THREE.Line;
    }

    interface RuntimeTravelOverlay {
      group: THREE.Group;
      nodes: RuntimeTravelNode[];
      segments: RuntimeTravelSegment[];
      head: THREE.Mesh;
      headGlow: THREE.Sprite;
      tail: THREE.Line;
    }

    let runtimeTravel: RuntimeTravelOverlay | null = null;
    const travelStartTime = demoTravelStartToken > 0 ? performance.now() : null;

    const createSpriteMaterial = (color: number, opacity: number) =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        opacity,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    const mountTravelOverlay = (route: TravelRoute) => {
      if (overlayDisposed || runtimeTravel) return;

      const group = new THREE.Group();
      overlayGroup.add(group);

      const nodeCoreGeometry = new THREE.SphereGeometry(0.017, 18, 18);
      const headGeometry = new THREE.SphereGeometry(0.014, 16, 16);
      const lineColor = 0xf7c36f;
      const baseColor = 0xeaa454;

      const nodes = route.nodes.map((node, index): RuntimeTravelNode => {
        const position = lonLatToVec3(node.lon, node.lat, 1.014);
        const core = new THREE.Mesh(
          nodeCoreGeometry.clone(),
          new THREE.MeshBasicMaterial({
            color: index === route.nodes.length - 1 ? 0xffd48e : 0xf9c97c,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          }),
        );
        core.position.copy(position);
        group.add(core);

        const glow = new THREE.Sprite(createSpriteMaterial(index === route.nodes.length - 1 ? 0xffc874 : 0xf4b15b, 0.42));
        glow.position.copy(position);
        glow.scale.setScalar(0.13);
        group.add(glow);

        const halo = new THREE.Sprite(createSpriteMaterial(index === route.nodes.length - 1 ? 0xffcf7d : 0xffb860, 0.14));
        halo.position.copy(position);
        halo.scale.setScalar(0.2);
        group.add(halo);

        const ring = new THREE.Sprite(createSpriteMaterial(index === route.nodes.length - 1 ? 0xffe2ac : 0xffd59a, 0.22));
        ring.position.copy(position);
        ring.scale.setScalar(0.09);
        group.add(ring);

        const flash = new THREE.Sprite(createSpriteMaterial(0xffe3a4, 0));
        flash.position.copy(position);
        flash.scale.setScalar(0.01);
        group.add(flash);

        const trigger = new THREE.Sprite(createSpriteMaterial(0xfff0c1, 0));
        trigger.position.copy(position);
        trigger.scale.setScalar(0.01);
        group.add(trigger);

        return { core, glow, halo, ring, flash, trigger };
      });

      const segments = route.segments.map((segment) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(segment.points);
        const base = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        group.add(base);

        const progress = new THREE.Line(
          geometry.clone(),
          new THREE.LineBasicMaterial({
            color: 0xffc26e,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        progress.geometry.setDrawRange(0, 0);
        group.add(progress);

        const highlight = new THREE.Line(
          geometry.clone(),
          new THREE.LineBasicMaterial({
            color: lineColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        highlight.geometry.setDrawRange(0, 0);
        group.add(highlight);

        return { points: segment.points, base, progress, highlight };
      });

      const head = new THREE.Mesh(
        headGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xfff0ca,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
        }),
      );
      head.visible = false;
      group.add(head);

      const headGlow = new THREE.Sprite(createSpriteMaterial(0xffd89f, 0.86));
      headGlow.scale.setScalar(0.14);
      headGlow.visible = false;
      group.add(headGlow);

      const tailGeometry = new THREE.BufferGeometry();
      tailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(15 * 3), 3));
      const tail = new THREE.Line(
        tailGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffd196,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      tail.visible = false;
      group.add(tail);

      runtimeTravel = { group, nodes, segments, head, headGlow, tail };
    };

    const maybeMountTravelOverlay = (mask: TerrainMask | null) => {
      if (!demoTravelEnabled || runtimeTravel || !mask) return;
      const route = buildTravelRoute(mask);
      if (route) {
        mountTravelOverlay(route);
      }
    };

    maybeMountTravelOverlay(buildTerrainMaskFromCellData(world));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const MIN_ZOOM = 1.5;
    const MAX_ZOOM = 6.0;
    let targetZoom = camera.position.z;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomSpeed = 0.15;
      const delta = event.deltaY > 0 ? zoomSpeed : -zoomSpeed;
      targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom + delta));
    };

    let dragging = false;
    let hasDragged = false;
    let lastX = 0;
    let lastY = 0;

    const syncRotations = () => {
      atmosphere.rotation.copy(globe.rotation);
      tileOverlay.rotation.copy(globe.rotation);
      highlightLine.rotation.copy(globe.rotation);
      overlayGroup.rotation.copy(globe.rotation);
    };

    const onDown = (event: PointerEvent) => {
      dragging = true;
      hasDragged = false;
      lastX = event.clientX;
      lastY = event.clientY;
      (event.target as Element).setPointerCapture?.(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          hasDragged = true;
        }
        lastX = event.clientX;
        lastY = event.clientY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x += dy * 0.003;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        syncRotations();
        return;
      }

      const ray = new THREE.Ray();
      raycaster.setFromCamera(pointer, camera);
      ray.copy(raycaster.ray);
      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
      const target = new THREE.Vector3();
      const hit = ray.intersectSphere(sphere, target);

      if (!hit) {
        setHoveredTileId(null);
        onCellHover?.(null);
        highlightLine.visible = false;
        return;
      }

      const localPoint = hit.clone().applyMatrix4(globe.matrixWorld.clone().invert()).normalize();
      const lon = Math.atan2(localPoint.z, localPoint.x);
      const lat = Math.asin(localPoint.y);
      const tile = pickTile(tiling, lon, lat);
      setHoveredTileId(tile?.id ?? null);

      if (tile) {
        onCellHover?.((tileCell(world, tile) as TerrainCell | null) ?? null);
        const vertices: number[] = [];
        for (const vertex of tile.vertices) {
          const point = lonLatToVec3(vertex.lon, vertex.lat, tileRadius + 0.006);
          vertices.push(point.x, point.y, point.z);
        }
        highlightGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        highlightGeo.computeBoundingSphere();
        highlightLine.visible = true;
      } else {
        onCellHover?.(null);
        highlightLine.visible = false;
      }
    };

    const onUp = () => {
      if (!hasDragged && dragging) {
        const ray = new THREE.Ray();
        raycaster.setFromCamera(pointer, camera);
        ray.copy(raycaster.ray);
        const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
        const target = new THREE.Vector3();
        const hit = ray.intersectSphere(sphere, target);

        if (hit && tiling) {
          const localPoint = hit.clone().applyMatrix4(globe.matrixWorld.clone().invert()).normalize();
          const lon = Math.atan2(localPoint.z, localPoint.x);
          const lat = Math.asin(localPoint.y);
          const tile = pickTile(tiling, lon, lat);
          if (tile) {
            onCellClick?.((tileCell(world, tile) as TerrainCell | null) ?? null);
          } else {
            onCellClick?.(null);
          }
        }
      }

      dragging = false;
      hasDragged = false;
    };

    const onLeave = () => {
      dragging = false;
      setHoveredTileId(null);
      onCellHover?.(null);
      highlightLine.visible = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);

    let imagePollingHandle: number | null = null;
    if (demoTravelEnabled && !runtimeTravel && world.textureUrl) {
      const waitForImage = () => {
        if (overlayDisposed || runtimeTravel) return;
        if (loadedColorImage) {
          try {
            maybeMountTravelOverlay(buildTerrainMaskFromImage(loadedColorImage));
          } catch (error) {
            console.warn("Failed to build demo travel route", error);
          }
          return;
        }
        imagePollingHandle = window.setTimeout(waitForImage, 120);
      };
      waitForImage();
    }

    let raf = 0;
    const introDuration = 0.7;
    const segmentDuration = 1.55;
    const segmentGap = 0.16;
    const arrivalDuration = 0.42;
    const finalTriggerDuration = 1.8;

    const tick = () => {
      const currentZ = camera.position.z;
      if (Math.abs(currentZ - targetZoom) > 0.001) {
        camera.position.z = currentZ + (targetZoom - currentZ) * 0.08;
      }

      if (!dragging) {
        globe.rotation.y += 0.0008;
        syncRotations();
      }

      tileOverlay.visible = showHexGridRef.current ?? false;

      if (demoTravelEnabled && runtimeTravel) {
        const now = performance.now();
        const elapsed = travelStartTime === null ? 0 : (now - travelStartTime) / 1000;
        const hasStarted = travelStartTime !== null;
        const totalSegmentTime = runtimeTravel.segments.length * (segmentDuration + segmentGap) - segmentGap;
        const finalStart = introDuration + totalSegmentTime;

        runtimeTravel.nodes.forEach((node, index) => {
          const pulse = 0.5 + 0.5 * Math.sin(now / 480 + index * 0.7);
          let arrivalBoost = 0;
          if (hasStarted && index > 0) {
            const arrivalAt = introDuration + (index - 1) * (segmentDuration + segmentGap) + segmentDuration;
            const arrivalT = 1 - clamp((elapsed - arrivalAt) / arrivalDuration, 0, 1);
            arrivalBoost = easeOutCubic(arrivalT);
          }
          const finalBoost = hasStarted && index === runtimeTravel.nodes.length - 1
            ? easeOutCubic(clamp((elapsed - finalStart) / finalTriggerDuration, 0, 1))
            : 0;

          node.core.scale.setScalar(0.98 + pulse * 0.12 + arrivalBoost * 0.22 + finalBoost * 0.32);
          (node.core.material as THREE.MeshBasicMaterial).opacity = 0.84 + pulse * 0.1 + finalBoost * 0.12;

          node.glow.scale.setScalar(0.12 + pulse * 0.026 + arrivalBoost * 0.08 + finalBoost * 0.16);
          (node.glow.material as THREE.SpriteMaterial).opacity = 0.26 + pulse * 0.11 + arrivalBoost * 0.22 + finalBoost * 0.24;

          node.halo.scale.setScalar(0.18 + pulse * 0.02 + finalBoost * 0.08);
          (node.halo.material as THREE.SpriteMaterial).opacity = 0.08 + pulse * 0.04 + finalBoost * 0.12;

          node.ring.scale.setScalar(0.11 + pulse * 0.08 + arrivalBoost * 0.04 + finalBoost * 0.05);
          (node.ring.material as THREE.SpriteMaterial).opacity = 0.14 + pulse * 0.08 + finalBoost * 0.06;

          node.flash.scale.setScalar(0.03 + arrivalBoost * 0.18);
          (node.flash.material as THREE.SpriteMaterial).opacity = arrivalBoost * 0.42;

          node.trigger.scale.setScalar(0.04 + finalBoost * 0.34 + pulse * 0.05);
          (node.trigger.material as THREE.SpriteMaterial).opacity = finalBoost * 0.55;
        });

        let activeSegmentIndex = -1;
        let activeProgress = 0;

        runtimeTravel.segments.forEach((segment, index) => {
          if (!hasStarted) {
            segment.base.geometry.setDrawRange(0, 0);
            segment.progress.geometry.setDrawRange(0, 0);
            segment.highlight.geometry.setDrawRange(0, 0);
            (segment.base.material as THREE.LineBasicMaterial).opacity = 0;
            (segment.progress.material as THREE.LineBasicMaterial).opacity = 0;
            (segment.highlight.material as THREE.LineBasicMaterial).opacity = 0;
            return;
          }
          const startAt = introDuration + index * (segmentDuration + segmentGap);
          const rawProgress = clamp((elapsed - startAt) / segmentDuration, 0, 1);
          const easedProgress = easeInOutCubic(rawProgress);
          const inGap = elapsed > startAt + segmentDuration && elapsed < startAt + segmentDuration + segmentGap;
          const isActive = rawProgress > 0 && rawProgress < 1;
          const isComplete = rawProgress >= 1;
          const drawCount = Math.max(0, Math.min(segment.points.length, Math.round(easedProgress * (segment.points.length - 1)) + 1));

          segment.progress.geometry.setDrawRange(0, isComplete ? segment.points.length : drawCount);
          segment.highlight.geometry.setDrawRange(0, isActive || inGap ? drawCount : 0);

          (segment.base.material as THREE.LineBasicMaterial).opacity = isComplete ? 0.14 : isActive || inGap ? 0.05 : 0;
          (segment.progress.material as THREE.LineBasicMaterial).opacity = isComplete ? 0.22 : isActive || inGap ? 0.2 : 0;
          (segment.highlight.material as THREE.LineBasicMaterial).opacity = isActive || inGap ? 0.88 : 0;

          if (isActive || inGap) {
            activeSegmentIndex = index;
            activeProgress = easedProgress;
          }
        });

        if (hasStarted && activeSegmentIndex >= 0) {
          const segment = runtimeTravel.segments[activeSegmentIndex];
          const pointIndex = Math.max(0, Math.min(segment.points.length - 1, Math.round(activeProgress * (segment.points.length - 1))));
          const headPoint = segment.points[pointIndex];
          runtimeTravel.head.visible = true;
          runtimeTravel.head.position.copy(headPoint);
          runtimeTravel.head.scale.setScalar(0.92 + Math.sin(now / 110) * 0.06);

          runtimeTravel.headGlow.visible = true;
          runtimeTravel.headGlow.position.copy(headPoint);
          runtimeTravel.headGlow.scale.setScalar(0.16 + Math.sin(now / 150) * 0.02);
          (runtimeTravel.headGlow.material as THREE.SpriteMaterial).opacity = 0.78;

          const trailPoints = segment.points.slice(Math.max(0, pointIndex - 10), pointIndex + 1);
          const trailAttr = runtimeTravel.tail.geometry.getAttribute("position") as THREE.BufferAttribute;
          const positions = trailAttr.array as Float32Array;
          positions.fill(0);
          for (let i = 0; i < trailPoints.length; i++) {
            const point = trailPoints[i];
            const offset = i * 3;
            positions[offset] = point.x;
            positions[offset + 1] = point.y;
            positions[offset + 2] = point.z;
          }
          trailAttr.needsUpdate = true;
          runtimeTravel.tail.visible = trailPoints.length > 1;
          runtimeTravel.tail.geometry.setDrawRange(0, trailPoints.length);
        } else {
          runtimeTravel.head.visible = false;
          runtimeTravel.headGlow.visible = false;
          runtimeTravel.tail.visible = false;
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      if (imagePollingHandle !== null) {
        window.clearTimeout(imagePollingHandle);
      }
      overlayDisposed = true;
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);

      for (const mesh of overlayMeshes) {
        mesh.geometry.dispose();
        disposeMaterial(mesh.material);
      }

      if (runtimeTravel) {
        runtimeTravel.group.traverse((object) => {
          const withGeometry = object as THREE.Mesh & { geometry?: THREE.BufferGeometry | THREE.SphereGeometry };
          if (withGeometry.geometry) {
            withGeometry.geometry.dispose();
          }
          disposeMaterial((object as THREE.Mesh).material);
        });
        overlayGroup.remove(runtimeTravel.group);
      }

      glowTexture.dispose();
      globeMaterial.map?.dispose();
      globeMaterial.displacementMap?.dispose();
      globeMaterial.bumpMap?.dispose();
      globeMaterial.dispose();
      tileOverlayGeo.dispose();
      highlightGeo.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [world, tiling, onCellHover, onCellClick, demoTravelEnabled, demoTravelReplayToken]);

  return (
    <div className="relative w-full h-full rounded-lg border border-[#1f2937] overflow-hidden bg-black">
      {isGeneratingGeometry && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <svg className="animate-spin w-12 h-12 text-purple-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400">CONSTRUCTING HEX MATRIX...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" data-hovered-tile={hoveredTileId ?? ""} />
    </div>
  );
}
