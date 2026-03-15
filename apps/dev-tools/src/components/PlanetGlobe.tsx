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
  onDemoTravelDestinationReady?: (payload: DemoTravelFinalTriggerPayload) => void;
  onDemoTravelFinalTrigger?: (payload: DemoTravelFinalTriggerPayload) => void;
  onDemoTravelUpdate?: (payload: { screenX: number; screenY: number; isVisibleOnScreen: boolean }) => void;
}

interface TerrainMask {
  width: number;
  height: number;
  land: Uint8Array;
  quality: Float32Array;
  distanceToWater: Float32Array;
  source: "cellData" | "image";
}

interface TravelCandidate {
  x: number;
  y: number;
  lon: number;
  lat: number;
  vec: THREE.Vector3;
  quality: number;
  inland: number;
  regionId: number;
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
  regionId: number;
  nodes: TravelCandidate[];
  segments: TravelRouteSegment[];
  focusVec: THREE.Vector3;
  focusLon: number;
  focusLat: number;
  maskWidth: number;
  maskHeight: number;
  source: TerrainMask["source"];
  routeId: string;
}

export interface DemoTravelFinalTriggerPayload {
  nodeIndex: number;
  lon: number;
  lat: number;
  normalizedX: number;
  normalizedY: number;
  worldX: number | null;
  worldY: number | null;
  cell: TerrainCell | null;
  routeId: string;
  triggeredAt: number;
  screenX: number;
  screenY: number;
  isVisibleOnScreen: boolean;
}

interface LandRegionMap {
  ids: Int32Array;
  largestRegionId: number;
  sizes: Map<number, number>;
  regionCount: number;
}

type DemoTravelSequenceState =
  | "idle"
  | "animating_segment_1"
  | "arrived_node_2"
  | "animating_segment_2"
  | "arrived_node_3"
  | "animating_segment_3"
  | "arrived_node_4"
  | "animating_segment_4"
  | "arrived_node_5"
  | "complete";

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
const TRAVEL_NODE_CORE_RADIUS = 1.045;
const TRAVEL_NODE_GLOW_RADIUS = 1.052;
const TRAVEL_NODE_WAVE_RADIUS = 1.06;
const TRAVEL_LINE_BASE_RADIUS = 1.04;
const ROUTE_SEARCH_PROFILES = [
  { targetDistance: 0.34, minDistance: 0.2, maxDistance: 0.52, maxWaterFraction: 0.04 },
  { targetDistance: 0.38, minDistance: 0.22, maxDistance: 0.56, maxWaterFraction: 0.07 },
  { targetDistance: 0.42, minDistance: 0.24, maxDistance: 0.62, maxWaterFraction: 0.1 },
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
  const waterHue = h >= 168 && h <= 255 && s > 0.14 && v > 0.05 && v < 0.88;
  const deepBlue = b > r * 1.12 && b > g * 1.05 && luminance < 0.86;
  const cyanShelf = h >= 180 && h <= 220 && s > 0.08 && b > g && g >= r;
  if (waterHue || deepBlue || cyanShelf) {
    return false;
  }

  const greenLand = g >= b * 0.92 && g >= r * 0.85 && s > 0.08 && v > 0.18;
  const warmLand = h >= 18 && h <= 150 && s > 0.12 && v > 0.15;
  const brightLand = luminance > 0.42 && (r + g) > b * 1.45;
  return greenLand || warmLand || brightLand;
}

function isLikelyLandCell(cell: PlanetWorldData["cellData"][number] | undefined): boolean {
  if (!cell) return false;
  const terrainCell = cell as Partial<TerrainCell>;
  if (terrainCell.isLake) {
    return false;
  }
  if (typeof terrainCell.biome === "string" && WATER_BIOMES.has(terrainCell.biome)) {
    return false;
  }
  if (typeof terrainCell.elevationMeters === "number") {
    return terrainCell.elevationMeters >= 0;
  }
  if (typeof terrainCell.elevation === "number") {
    return terrainCell.elevation >= 0.5;
  }
  if (typeof cell.color === "string") {
    const [r, g, b] = hexToRgb(cell.color);
    return isLikelyLandFromPixel(r, g, b);
  }
  return false;
}

function erodeLandMask(width: number, height: number, source: Uint8Array, radius = 1): Uint8Array {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!source[idx]) continue;
      let survives = true;
      for (let dy = -radius; dy <= radius && survives; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          survives = false;
          break;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = wrapX(x + dx, width);
          if (!source[ny * width + nx]) {
            survives = false;
            break;
          }
        }
      }
      if (survives) {
        result[idx] = 1;
      }
    }
  }
  return result;
}

function dilateLandMask(width: number, height: number, source: Uint8Array, radius = 1): Uint8Array {
  const result = new Uint8Array(source);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (source[idx]) continue;
      let shouldFill = false;
      for (let dy = -radius; dy <= radius && !shouldFill; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = wrapX(x + dx, width);
          if (source[ny * width + nx]) {
            shouldFill = true;
            break;
          }
        }
      }
      if (shouldFill) {
        result[idx] = 1;
      }
    }
  }
  return result;
}

function removeSmallLandMasses(width: number, height: number, source: Uint8Array, minRegionSize: number): Uint8Array {
  const ids = new Int32Array(width * height);
  ids.fill(-1);
  const regionSizes = new Map<number, number>();
  let nextRegionId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIndex = y * width + x;
      if (!source[startIndex] || ids[startIndex] !== -1) continue;
      const stack = [startIndex];
      ids[startIndex] = nextRegionId;
      let size = 0;

      while (stack.length > 0) {
        const current = stack.pop()!;
        size += 1;
        const currentY = Math.floor(current / width);
        const currentX = current % width;
        const neighbors = [
          [wrapX(currentX - 1, width), currentY],
          [wrapX(currentX + 1, width), currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ] as const;

        for (const [neighborX, neighborY] of neighbors) {
          if (neighborY < 0 || neighborY >= height) continue;
          const neighborIndex = neighborY * width + neighborX;
          if (!source[neighborIndex] || ids[neighborIndex] !== -1) continue;
          ids[neighborIndex] = nextRegionId;
          stack.push(neighborIndex);
        }
      }

      regionSizes.set(nextRegionId, size);
      nextRegionId += 1;
    }
  }

  const filtered = new Uint8Array(width * height);
  for (let i = 0; i < source.length; i++) {
    if (!source[i]) continue;
    const regionId = ids[i];
    if (regionId >= 0 && (regionSizes.get(regionId) ?? 0) >= minRegionSize) {
      filtered[i] = 1;
    }
  }
  return filtered;
}

function computeDistanceToWater(width: number, height: number, land: Uint8Array, maxRadius = 10): Float32Array {
  const distance = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!land[idx]) continue;
      let best = maxRadius + 1;
      for (let radius = 1; radius <= maxRadius; radius++) {
        let foundWater = false;
        for (let dy = -radius; dy <= radius && !foundWater; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) {
            foundWater = true;
            break;
          }
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = wrapX(x + dx, width);
            if (!land[ny * width + nx]) {
              foundWater = true;
              break;
            }
          }
        }
        if (foundWater) {
          best = radius;
          break;
        }
      }
      distance[idx] = best;
    }
  }
  return distance;
}

function computeLandQuality(width: number, height: number, land: Uint8Array, distanceToWater: Float32Array): Float32Array {
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
      const density = landHits / sampleCount;
      const inland = clamp(distanceToWater[idx] / 8, 0, 1);
      quality[idx] = density * 0.72 + inland * 0.28;
    }
  }
  return quality;
}

function createTerrainMask(width: number, height: number, rawLand: Uint8Array, source: TerrainMask["source"]): TerrainMask | null {
  if (!width || !height) return null;
  const minRegionSize = Math.max(18, Math.round((width * height) * 0.0035));
  let land = erodeLandMask(width, height, rawLand, 1);
  land = removeSmallLandMasses(width, height, land, minRegionSize);
  land = dilateLandMask(width, height, land, 1);
  const distanceToWater = computeDistanceToWater(width, height, land, 10);
  return {
    width,
    height,
    land,
    quality: computeLandQuality(width, height, land, distanceToWater),
    distanceToWater,
    source,
  };
}

function buildTerrainMaskFromCellData(world: PlanetWorldData): TerrainMask | null {
  if (!world.cellData?.length || world.cellData.length !== world.cols * world.rows) {
    return null;
  }

  const land = new Uint8Array(world.cols * world.rows);
  for (let i = 0; i < world.cellData.length; i++) {
    land[i] = isLikelyLandCell(world.cellData[i]) ? 1 : 0;
  }
  return createTerrainMask(world.cols, world.rows, land, "cellData");
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
  return createTerrainMask(sampleWidth, sampleHeight, land, "image");
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

  return { ids, largestRegionId, sizes, regionCount: nextRegionId };
}

function sampleLand(mask: TerrainMask, lon: number, lat: number): number {
  const x = wrapX(Math.round(((lon + Math.PI) / (Math.PI * 2)) * mask.width), mask.width);
  const y = clamp(Math.round((0.5 - lat / Math.PI) * mask.height), 0, mask.height - 1);
  return mask.land[y * mask.width + x];
}

function collectTravelCandidates(mask: TerrainMask, regionMap: LandRegionMap | null): TravelCandidate[] {
  if (!regionMap) {
    return [];
  }
  const candidates: TravelCandidate[] = [];
  const xStep = Math.max(3, Math.round(mask.width / 54));
  const yStep = Math.max(3, Math.round(mask.height / 30));
  const yStart = Math.round(mask.height * 0.14);
  const yEnd = Math.round(mask.height * 0.86);
  const largestRegionSize = regionMap.sizes.get(regionMap.largestRegionId) ?? 0;
  const minInland = mask.source === "cellData" ? 3 : 2;
  const minQuality = mask.source === "cellData" ? 0.76 : 0.8;
  if (largestRegionSize < 60) {
    return [];
  }

  for (let y = yStart; y < yEnd; y += yStep) {
    for (let x = 0; x < mask.width; x += xStep) {
      const idx = y * mask.width + x;
      if (!mask.land[idx]) continue;
      if (regionMap.ids[idx] !== regionMap.largestRegionId) continue;
      const quality = mask.quality[idx];
      const inland = mask.distanceToWater[idx];
      if (quality < minQuality || inland < minInland) continue;
      const yNorm = (y + 0.5) / mask.height;
      const lat = (0.5 - yNorm) * Math.PI;
      const lon = ((x + 0.5) / mask.width) * Math.PI * 2 - Math.PI;
      if (Math.abs(lat) > Math.PI * 0.34) continue;
      const latPenalty = Math.abs(lat) / (Math.PI / 2);
      const weightedQuality = quality * 0.78 + clamp(inland / 8, 0, 1) * 0.22 - latPenalty * 0.14;
      candidates.push({
        x,
        y,
        lon,
        lat,
        vec: lonLatToVec3(lon, lat, 1),
        quality: weightedQuality,
        inland,
        regionId: regionMap.largestRegionId,
      });
    }
  }

  candidates.sort((a, b) => b.quality - a.quality || a.y - b.y || a.x - b.x);
  const spreadCandidates: TravelCandidate[] = [];
  for (const candidate of candidates) {
    const isFarEnough = spreadCandidates.every((existing) => angularDistance(existing.vec, candidate.vec) > 0.1);
    if (!isFarEnough) continue;
    spreadCandidates.push(candidate);
    if (spreadCandidates.length >= 180) break;
  }
  return spreadCandidates.length >= 50 ? spreadCandidates : candidates.slice(0, 100);
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
  const steps = Math.max(40, Math.round(54 + angle * 30));
  const arcLift = 0.028 + Math.min(0.038, angle * 0.045);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = slerpUnitVectors(start.vec, end.vec, t);
    const radius = TRAVEL_LINE_BASE_RADIUS + Math.sin(Math.PI * t) * arcLift;
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
  const qualityScore = path.reduce((sum, index) => sum + candidates[index].quality * 1.2 + clamp(candidates[index].inland / 8, 0, 1) * 0.6, 0);

  let turnPenalty = 0;
  let turnReward = 0;
  let maxTurn = 0;
  let directionFlipPenalty = 0;
  let previousTurnSign = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const previous = candidates[path[i - 1]].vec;
    const current = candidates[path[i]].vec;
    const next = candidates[path[i + 1]].vec;
    const incoming = current.clone().sub(previous).normalize();
    const outgoing = next.clone().sub(current).normalize();
    const turnAngle = Math.acos(clamp(incoming.dot(outgoing), -1, 1));
    const turnCross = incoming.clone().cross(outgoing);
    const turnSign = Math.sign(turnCross.lengthSq() > 0 ? turnCross.y : 0);
    maxTurn = Math.max(maxTurn, turnAngle);
    if (turnAngle < 0.22) {
      turnPenalty += (0.22 - turnAngle) * 5.4;
    } else if (turnAngle > 1.15) {
      turnPenalty += (turnAngle - 1.15) * 4.8;
    } else {
      turnReward += Math.min(0.44, turnAngle) * 2.1;
    }
    if (previousTurnSign !== 0 && turnSign !== 0 && previousTurnSign !== turnSign) {
      directionFlipPenalty += 1.1;
    }
    if (turnSign !== 0) {
      previousTurnSign = turnSign;
    }
  }

  const pathDistance = distances.reduce((sum, distance) => sum + distance, 0);
  const directDistance = angularDistance(candidates[path[0]].vec, candidates[path[path.length - 1]].vec);
  const directness = directDistance > 0.001 ? pathDistance / directDistance : 2;
  const directnessPenalty = Math.abs(directness - 1.18) * 6.2;
  const focusVector = path.reduce((sum, candidateIndex) => sum.add(candidates[candidateIndex].vec.clone()), new THREE.Vector3()).normalize();
  const focusPenalty = path.reduce((sum, candidateIndex) => sum + angularDistance(candidates[candidateIndex].vec, focusVector), 0);
  const monotonyPenalty = maxTurn < 0.24 ? 3.2 : 0;

  return qualityScore * 2.15
    + turnReward
    - distanceVariance * 7.8
    - targetPenalty * 2.2
    - waterPenalty * 13
    - turnPenalty
    - directionFlipPenalty
    - directnessPenalty
    - focusPenalty * 0.7
    - monotonyPenalty;
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
        const score = neighbor.quality * 1.35 + clamp(neighbor.inland / 8, 0, 1) * 0.8 + distanceScore * 1.15 - metric.waterFraction * 4.4;
        scoredNeighbors.push({ to: otherIndex, metric, score });
      }
      scoredNeighbors.sort((a, b) => b.score - a.score);
      return scoredNeighbors.slice(0, 12);
    });

    const startIndices = candidates
      .map((candidate, index) => ({ index, score: candidate.quality + clamp(candidate.inland / 8, 0, 1) * 0.6 - Math.abs(candidate.lat) * 0.12 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
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
          if (turnAngle < 0.1 || turnAngle > 1.25) continue;
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
      if (bestRoute && bestRoute.score > 9.5) {
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
  const focusVec = nodes.reduce((sum, node) => sum.add(node.vec.clone()), new THREE.Vector3()).normalize();
  const { lon: focusLon, lat: focusLat } = vec3ToLonLat(focusVec);

  return {
    regionId: nodes[0]?.regionId ?? -1,
    nodes,
    segments,
    focusVec,
    focusLon,
    focusLat,
    maskWidth: mask.width,
    maskHeight: mask.height,
    source: mask.source,
    routeId: crypto.randomUUID(),
  };
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

function makeRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create ring canvas");
  }

  ctx.clearRect(0, 0, 128, 128);
  const outerGradient = ctx.createRadialGradient(64, 64, 28, 64, 64, 64);
  outerGradient.addColorStop(0, "rgba(255,255,255,0)");
  outerGradient.addColorStop(0.52, "rgba(255,255,255,0)");
  outerGradient.addColorStop(0.68, "rgba(255,255,255,0.92)");
  outerGradient.addColorStop(0.82, "rgba(255,255,255,0.16)");
  outerGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = outerGradient;
  ctx.fillRect(0, 0, 128, 128);

  ctx.beginPath();
  ctx.arc(64, 64, 22, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

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
  onDemoTravelDestinationReady,
  onDemoTravelFinalTrigger,
  onDemoTravelUpdate,
}: PlanetGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [tiling, setTiling] = useState<PlanetTiling | null>(null);
  const [isGeneratingGeometry, setIsGeneratingGeometry] = useState(false);
  const demoTravelStartTokenRef = useRef(demoTravelStartToken);

  const showHexGridRef = useRef(showHexGrid);
  useEffect(() => {
    showHexGridRef.current = showHexGrid;
  }, [showHexGrid]);

  useEffect(() => {
    demoTravelStartTokenRef.current = demoTravelStartToken;
  }, [demoTravelStartToken]);

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
    const ringTexture = makeRingTexture();

    interface RuntimeTravelNode {
      position: THREE.Vector3;
      core: THREE.Mesh;
      innerGlow: THREE.Sprite;
      breath: THREE.Sprite;
      ring: THREE.Sprite;
      wave: THREE.Sprite;
      halo: THREE.Sprite;
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
      route: TravelRoute;
      nodes: RuntimeTravelNode[];
      segments: RuntimeTravelSegment[];
      head: THREE.Mesh;
      headGlow: THREE.Sprite;
      tail: THREE.Line;
    }

    interface TravelSequenceRuntime {
      state: DemoTravelSequenceState;
      segmentIndex: number;
      segmentProgress: number;
      arrivalNodeIndex: number;
      arrivalProgress: number;
      finalProgress: number;
      activeNodeIndex: number;
      completedSegments: number;
      lastStartToken: number;
    }

    let runtimeTravel: RuntimeTravelOverlay | null = null;
    let hasManualOrbit = false;
    let lastPreparedRouteId: string | null = null;
    let lastEmittedTriggerKey: string | null = null;
    const sequence: TravelSequenceRuntime = {
      state: "idle",
      segmentIndex: 0,
      segmentProgress: 0,
      arrivalNodeIndex: -1,
      arrivalProgress: 0,
      finalProgress: 0,
      activeNodeIndex: 0,
      completedSegments: 0,
      lastStartToken: 0,
    };

    const createSpriteMaterial = (
      texture: THREE.Texture,
      color: number,
      opacity: number,
      blending: THREE.Blending = THREE.AdditiveBlending,
    ) =>
      new THREE.SpriteMaterial({
        map: texture,
        color,
        opacity,
        transparent: true,
        blending,
        depthWrite: false,
        depthTest: true,
      });

    const setLineDraw = (line: THREE.Line, count: number) => {
      line.geometry.setDrawRange(0, Math.max(0, count));
    };

    const buildRoutePayload = (route: TravelRoute): DemoTravelFinalTriggerPayload => {
      const finalNode = route.nodes[route.nodes.length - 1];
      const normalizedX = (finalNode.x + 0.5) / route.maskWidth;
      const normalizedY = (finalNode.y + 0.5) / route.maskHeight;
      const projectedWorldX = clamp(Math.round(normalizedX * world.cols - 0.5), 0, Math.max(0, world.cols - 1));
      const projectedWorldY = clamp(Math.round(normalizedY * world.rows - 0.5), 0, Math.max(0, world.rows - 1));
      const directWorldX = route.source === "cellData" && route.maskWidth === world.cols ? finalNode.x : null;
      const directWorldY = route.source === "cellData" && route.maskHeight === world.rows ? finalNode.y : null;
      const hasCellData = Array.isArray(world.cellData) && world.cellData.length === world.cols * world.rows;
      const resolvedCell = hasCellData ? (world.cellData[projectedWorldY * world.cols + projectedWorldX] as TerrainCell | undefined) ?? null : null;
      let projectedPosition = new THREE.Vector3();
      if (runtimeTravel && runtimeTravel.nodes[route.nodes.length - 1]) {
        runtimeTravel.nodes[route.nodes.length - 1].core.getWorldPosition(projectedPosition);
      } else {
        projectedPosition.copy(finalNode.vec).multiplyScalar(TRAVEL_NODE_CORE_RADIUS);
        overlayGroup.localToWorld(projectedPosition);
      }

      // Force matrix updates for precise projection
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      
      const projectedScreen = projectedPosition.clone().project(camera);
      const viewportWidth = Math.max(1, container.clientWidth || renderer.domElement.clientWidth || 1);
      const viewportHeight = Math.max(1, container.clientHeight || renderer.domElement.clientHeight || 1);
      const screenX = ((projectedScreen.x + 1) * 0.5) * viewportWidth;
      const screenY = ((1 - projectedScreen.y) * 0.5) * viewportHeight;
      const surfaceNormal = projectedPosition.clone().normalize();
      const viewDirection = camera.position.clone().sub(projectedPosition).normalize();
      const isVisibleOnScreen = projectedScreen.z >= -1
        && projectedScreen.z <= 1
        && screenX >= 0
        && screenX <= viewportWidth
        && screenY >= 0
        && screenY <= viewportHeight
        && surfaceNormal.dot(viewDirection) > 0.03;

      return {
        nodeIndex: route.nodes.length - 1,
        lon: finalNode.lon,
        lat: finalNode.lat,
        normalizedX,
        normalizedY,
        worldX: directWorldX,
        worldY: directWorldY,
        cell: resolvedCell,
        routeId: route.routeId,
        triggeredAt: performance.now(),
        screenX,
        screenY,
        isVisibleOnScreen,
      };
    };

    const animatingStateForSegment = (segmentIndex: number): DemoTravelSequenceState => {
      const states: DemoTravelSequenceState[] = [
        "animating_segment_1",
        "animating_segment_2",
        "animating_segment_3",
        "animating_segment_4",
      ];
      return states[segmentIndex] ?? "complete";
    };

    const arrivalStateForNode = (nodeIndex: number): DemoTravelSequenceState => {
      const states: DemoTravelSequenceState[] = [
        "idle",
        "arrived_node_2",
        "arrived_node_3",
        "arrived_node_4",
        "arrived_node_5",
      ];
      return states[nodeIndex] ?? "complete";
    };

    const resetTravelSequence = () => {
      sequence.state = "idle";
      sequence.segmentIndex = 0;
      sequence.segmentProgress = 0;
      sequence.arrivalNodeIndex = -1;
      sequence.arrivalProgress = 0;
      sequence.finalProgress = 0;
      sequence.activeNodeIndex = 0;
      sequence.completedSegments = 0;

      if (!runtimeTravel) return;
      for (const segment of runtimeTravel.segments) {
        setLineDraw(segment.base, 0);
        setLineDraw(segment.progress, 0);
        setLineDraw(segment.highlight, 0);
        (segment.base.material as THREE.LineBasicMaterial).opacity = 0;
        (segment.progress.material as THREE.LineBasicMaterial).opacity = 0;
        (segment.highlight.material as THREE.LineBasicMaterial).opacity = 0;
      }
      runtimeTravel.head.visible = false;
      runtimeTravel.headGlow.visible = false;
      runtimeTravel.tail.visible = false;
    };

    const startTravelSequence = (startToken: number) => {
      if (!runtimeTravel) return;
      resetTravelSequence();
      lastEmittedTriggerKey = null;
      sequence.state = "animating_segment_1";
      sequence.activeNodeIndex = 0;
      sequence.lastStartToken = startToken;
      if (!hasManualOrbit) {
        const targetNode = runtimeTravel.route.nodes[0];
        if (targetNode) {
          setTargetRotationFromLonLat(targetNode.lon, targetNode.lat);
        }
      }
    };

    const mountTravelOverlay = (route: TravelRoute) => {
      if (overlayDisposed || runtimeTravel) return;

      const group = new THREE.Group();
      group.renderOrder = 20;
      overlayGroup.add(group);

      const nodeCoreGeometry = new THREE.SphereGeometry(0.0155, 18, 18);
      const headGeometry = new THREE.SphereGeometry(0.013, 16, 16);
      const travelColor = 0xb3ebf2;
      const travelBaseColor = 0x6fbcc5;
      const finalColor = 0xffffff;

      const nodes = route.nodes.map((node, index): RuntimeTravelNode => {
        const corePosition = lonLatToVec3(node.lon, node.lat, TRAVEL_NODE_CORE_RADIUS);
        const glowPosition = lonLatToVec3(node.lon, node.lat, TRAVEL_NODE_GLOW_RADIUS);
        const wavePosition = lonLatToVec3(node.lon, node.lat, TRAVEL_NODE_WAVE_RADIUS);
        const isFinalNode = index === route.nodes.length - 1;
        const core = new THREE.Mesh(
          nodeCoreGeometry.clone(),
          new THREE.MeshBasicMaterial({
            color: isFinalNode ? finalColor : travelColor,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            depthTest: true,
          }),
        );
        core.position.copy(corePosition);
        core.renderOrder = 24;
        group.add(core);

        const innerGlow = new THREE.Sprite(createSpriteMaterial(glowTexture, isFinalNode ? finalColor : travelColor, isFinalNode ? 0.5 : 0.42));
        innerGlow.position.copy(glowPosition);
        innerGlow.scale.setScalar(0.105);
        innerGlow.renderOrder = 23;
        group.add(innerGlow);

        const breath = new THREE.Sprite(createSpriteMaterial(glowTexture, isFinalNode ? finalColor : travelColor, isFinalNode ? 0.2 : 0.16));
        breath.position.copy(glowPosition);
        breath.scale.setScalar(0.15);
        breath.renderOrder = 22;
        group.add(breath);

        const ring = new THREE.Sprite(createSpriteMaterial(ringTexture, isFinalNode ? finalColor : travelColor, isFinalNode ? 0.28 : 0.24));
        ring.position.copy(glowPosition);
        ring.scale.setScalar(0.1);
        ring.renderOrder = 25;
        group.add(ring);

        const wave = new THREE.Sprite(createSpriteMaterial(ringTexture, isFinalNode ? finalColor : travelColor, 0.1));
        wave.position.copy(wavePosition);
        wave.scale.setScalar(0.11);
        wave.renderOrder = 22;
        group.add(wave);

        const halo = new THREE.Sprite(createSpriteMaterial(glowTexture, isFinalNode ? finalColor : travelColor, isFinalNode ? 0.1 : 0.08));
        halo.position.copy(wavePosition);
        halo.scale.setScalar(0.21);
        halo.renderOrder = 21;
        group.add(halo);

        const flash = new THREE.Sprite(createSpriteMaterial(ringTexture, finalColor, 0));
        flash.position.copy(wavePosition);
        flash.scale.setScalar(0.08);
        flash.renderOrder = 26;
        group.add(flash);

        const trigger = new THREE.Sprite(createSpriteMaterial(glowTexture, finalColor, 0));
        trigger.position.copy(wavePosition);
        trigger.scale.setScalar(0.1);
        trigger.renderOrder = 27;
        group.add(trigger);

        return { position: wavePosition, core, innerGlow, breath, ring, wave, halo, flash, trigger };
      });

      const segments = route.segments.map((segment) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(segment.points);
        const base = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: travelBaseColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
          }),
        );
        base.renderOrder = 18;
        group.add(base);

        const progress = new THREE.Line(
          geometry.clone(),
          new THREE.LineBasicMaterial({
            color: travelColor,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
          }),
        );
        setLineDraw(progress, 0);
        progress.renderOrder = 19;
        group.add(progress);

        const highlight = new THREE.Line(
          geometry.clone(),
          new THREE.LineBasicMaterial({
            color: travelColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
          }),
        );
        setLineDraw(highlight, 0);
        highlight.renderOrder = 20;
        group.add(highlight);

        return { points: segment.points, base, progress, highlight };
      });

      const head = new THREE.Mesh(
        headGeometry,
        new THREE.MeshBasicMaterial({
          color: travelColor,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
          depthTest: true,
        }),
      );
      head.visible = false;
      head.renderOrder = 28;
      group.add(head);

      const headGlow = new THREE.Sprite(createSpriteMaterial(glowTexture, travelColor, 0.82));
      headGlow.scale.setScalar(0.12);
      headGlow.visible = false;
      headGlow.renderOrder = 29;
      group.add(headGlow);

      const tailGeometry = new THREE.BufferGeometry();
      tailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3));
      const tail = new THREE.Line(
        tailGeometry,
        new THREE.LineBasicMaterial({
          color: travelColor,
          transparent: true,
          opacity: 0.54,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: true,
        }),
      );
      tail.visible = false;
      tail.renderOrder = 19;
      group.add(tail);

      runtimeTravel = { group, route, nodes, segments, head, headGlow, tail };
      resetTravelSequence();
      if (onDemoTravelDestinationReady && lastPreparedRouteId !== route.routeId) {
        lastPreparedRouteId = route.routeId;
        onDemoTravelDestinationReady(buildRoutePayload(route));
      }

      if (demoTravelEnabled && !hasManualOrbit) {
        const firstNode = route.nodes[0];
        if (firstNode) {
          setTargetRotationFromLonLat(firstNode.lon, firstNode.lat);
        } else {
          setTargetRotationFromLonLat(route.focusLon, route.focusLat);
        }
        globe.rotation.x = targetGlobeRotationX;
        globe.rotation.y = targetGlobeRotationY;
        atmosphere.rotation.copy(globe.rotation);
        tileOverlay.rotation.copy(globe.rotation);
        highlightLine.rotation.copy(globe.rotation);
        overlayGroup.rotation.copy(globe.rotation);
      }
    };

    const maybeMountTravelOverlay = (mask: TerrainMask | null) => {
      if (!demoTravelEnabled || runtimeTravel || !mask) return;
      const route = buildTravelRoute(mask);
      if (route) {
        mountTravelOverlay(route);
      }
    };

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

    maybeMountTravelOverlay(buildTerrainMaskFromCellData(world));

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
          hasManualOrbit = true;
        }
        lastX = event.clientX;
        lastY = event.clientY;
        globe.rotation.y += dx * 0.005;
        globe.rotation.x += dy * 0.003;
        globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x));
        targetGlobeRotationX = globe.rotation.x;
        targetGlobeRotationY = globe.rotation.y;
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
    let previousFrameTime = performance.now();
    const segmentDuration = 1.2;
    const arrivalDuration = 0.42;
    const stateStartsWith = (value: string, prefix: string) => value.startsWith(prefix);
    const tempWorldPosition = new THREE.Vector3();
    const tempSurfaceNormal = new THREE.Vector3();
    const tempViewDirection = new THREE.Vector3();
    let targetGlobeRotationX = globe.rotation.x;
    let targetGlobeRotationY = globe.rotation.y;

    const setTargetRotationFromLonLat = (lon: number, lat: number) => {
      targetGlobeRotationX = clamp(lat, -0.95, 0.95);
      targetGlobeRotationY = lon - Math.PI / 2;
    };

    const updateTravelSequence = (deltaSeconds: number) => {
      if (!runtimeTravel) return;

      const requestedStartToken = demoTravelStartTokenRef.current;
      if (requestedStartToken > sequence.lastStartToken) {
        startTravelSequence(requestedStartToken);
      }

      if (sequence.state === "idle" || sequence.state === "complete") {
        if (sequence.state === "complete") {
          sequence.finalProgress = 1;
          sequence.activeNodeIndex = runtimeTravel.nodes.length - 1;
        }
        return;
      }

      if (stateStartsWith(sequence.state, "animating_segment")) {
        sequence.activeNodeIndex = sequence.segmentIndex;
        sequence.segmentProgress = clamp(sequence.segmentProgress + deltaSeconds / segmentDuration, 0, 1);
        if (sequence.segmentProgress >= 1) {
          sequence.completedSegments = Math.max(sequence.completedSegments, sequence.segmentIndex + 1);
          sequence.arrivalNodeIndex = sequence.segmentIndex + 1;
          sequence.arrivalProgress = 0;
          sequence.state = arrivalStateForNode(sequence.arrivalNodeIndex);
        }
        return;
      }

      if (stateStartsWith(sequence.state, "arrived_node")) {
        sequence.activeNodeIndex = Math.max(0, sequence.arrivalNodeIndex);
        sequence.arrivalProgress = clamp(sequence.arrivalProgress + deltaSeconds / arrivalDuration, 0, 1);
        if (sequence.arrivalNodeIndex === runtimeTravel.nodes.length - 1) {
          sequence.finalProgress = easeOutCubic(sequence.arrivalProgress);
        }
        if (sequence.arrivalProgress >= 1) {
          if (sequence.arrivalNodeIndex === runtimeTravel.nodes.length - 1) {
            sequence.state = "complete";
            sequence.finalProgress = 1;
          } else {
            sequence.segmentIndex = sequence.arrivalNodeIndex;
            sequence.segmentProgress = 0;
            sequence.state = animatingStateForSegment(sequence.segmentIndex);
          }
        }
      }
    };

    const tick = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.05, (now - previousFrameTime) / 1000);
      previousFrameTime = now;

      const currentZ = camera.position.z;
      if (Math.abs(currentZ - targetZoom) > 0.001) {
        camera.position.z = currentZ + (targetZoom - currentZ) * 0.08;
      }

      if (!dragging) {
        if (demoTravelEnabled) {
          if (!hasManualOrbit) {
            if (runtimeTravel) {
              let focusNode = runtimeTravel.route.nodes[0] ?? null;
              if (stateStartsWith(sequence.state, "animating_segment")) {
                focusNode = runtimeTravel.route.nodes[Math.min(runtimeTravel.route.nodes.length - 1, sequence.activeNodeIndex)] ?? focusNode;
              } else if (stateStartsWith(sequence.state, "arrived_node")) {
                focusNode = runtimeTravel.route.nodes[Math.min(runtimeTravel.route.nodes.length - 1, Math.max(0, sequence.arrivalNodeIndex))] ?? focusNode;
              } else if (sequence.state === "complete") {
                focusNode = runtimeTravel.route.nodes[runtimeTravel.route.nodes.length - 1] ?? focusNode;
              } else if (sequence.state === "idle") {
                focusNode = runtimeTravel.route.nodes[0] ?? focusNode;
              }

              if (focusNode) {
                setTargetRotationFromLonLat(focusNode.lon, focusNode.lat);
              }
            }

            const deltaY = targetGlobeRotationY - globe.rotation.y;
            const wrappedDeltaY = Math.atan2(Math.sin(deltaY), Math.cos(deltaY));
            globe.rotation.y += wrappedDeltaY * 0.06 + 0.00006;
            globe.rotation.x += (targetGlobeRotationX - globe.rotation.x) * 0.055;
            syncRotations();
          }
        } else {
          globe.rotation.y += 0.0008;
          syncRotations();
        }
      }

      tileOverlay.visible = showHexGridRef.current ?? false;

      if (demoTravelEnabled && runtimeTravel) {
        updateTravelSequence(deltaSeconds);

        if (sequence.state === "complete" && sequence.lastStartToken > 0) {
          const triggerKey = `${runtimeTravel.route.routeId}:${sequence.lastStartToken}`;
          if (lastEmittedTriggerKey !== triggerKey) {
            lastEmittedTriggerKey = triggerKey;
            if (onDemoTravelFinalTrigger) {
              onDemoTravelFinalTrigger({
                ...buildRoutePayload(runtimeTravel.route),
                triggeredAt: now,
              });
            }
          }
          
          // Continuous position update for the panel tracer
          if (onDemoTravelUpdate && runtimeTravel.nodes.length > 0) {
            const finalNodeIndex = runtimeTravel.nodes.length - 1;
            const finalNodeMesh = runtimeTravel.nodes[finalNodeIndex].core;
            finalNodeMesh.getWorldPosition(tempWorldPosition);
            
            // Re-project and update
            const projectedScreen = tempWorldPosition.clone().project(camera);
            const viewportWidth = Math.max(1, container.clientWidth || renderer.domElement.clientWidth || 1);
            const viewportHeight = Math.max(1, container.clientHeight || renderer.domElement.clientHeight || 1);
            const screenX = ((projectedScreen.x + 1) * 0.5) * viewportWidth;
            const screenY = ((1 - projectedScreen.y) * 0.5) * viewportHeight;
            
            tempSurfaceNormal.copy(tempWorldPosition).normalize();
            tempViewDirection.copy(camera.position).sub(tempWorldPosition).normalize();
            const facing = tempSurfaceNormal.dot(tempViewDirection);
            
            const isVisibleOnScreen = projectedScreen.z >= -1
              && projectedScreen.z <= 1
              && screenX >= 0
              && screenX <= viewportWidth
              && screenY >= 0
              && screenY <= viewportHeight
              && facing > 0.03;
              
            onDemoTravelUpdate({ screenX, screenY, isVisibleOnScreen });
          }
        }

        const isAnimating = stateStartsWith(sequence.state, "animating_segment");
        const currentSegmentIndex = isAnimating ? sequence.segmentIndex : -1;
        const easedSegmentProgress = easeInOutCubic(sequence.segmentProgress);

        runtimeTravel.nodes.forEach((node, index) => {
          node.core.getWorldPosition(tempWorldPosition);
          tempSurfaceNormal.copy(tempWorldPosition).normalize();
          tempViewDirection.copy(camera.position).sub(tempWorldPosition).normalize();
          const facing = tempSurfaceNormal.dot(tempViewDirection);
          const limbFade = easeInOutCubic(clamp((facing - 0.015) / 0.2, 0, 1));
          const haloFade = limbFade * limbFade;

          const pulse = 0.5 + 0.5 * Math.sin(now / 620 + index * 0.65);
          const breathPulse = 0.5 + 0.5 * Math.sin(now / 1180 + index * 0.4);
          const ringPulse = 0.5 + 0.5 * Math.sin(now / 980 + index * 0.5);
          const waveCycle = ((now / 1650) + index * 0.17) % 1;
          const waveEase = easeOutCubic(waveCycle);
          const activeBoost = sequence.state !== "idle" && index === sequence.activeNodeIndex
            ? (isAnimating ? 0.32 : 0.2)
            : 0;
          const arrivalBoost = index === sequence.arrivalNodeIndex
            ? easeOutCubic(1 - sequence.arrivalProgress)
            : 0;
          const finalBoost = index === runtimeTravel.nodes.length - 1 ? sequence.finalProgress : 0;

          node.core.scale.setScalar(0.95 + pulse * 0.08 + activeBoost * 0.16 + arrivalBoost * 0.16 + finalBoost * 0.22);
          (node.core.material as THREE.MeshBasicMaterial).opacity = (0.84 + pulse * 0.08 + activeBoost * 0.08 + finalBoost * 0.1) * Math.max(0.18, limbFade);

          node.innerGlow.scale.setScalar(0.1 + breathPulse * 0.018 + activeBoost * 0.05 + arrivalBoost * 0.04 + finalBoost * 0.08);
          (node.innerGlow.material as THREE.SpriteMaterial).opacity = (0.28 + breathPulse * 0.1 + activeBoost * 0.16 + arrivalBoost * 0.18 + finalBoost * 0.18) * haloFade;

          node.breath.scale.setScalar(0.145 + breathPulse * 0.04 + activeBoost * 0.05 + finalBoost * 0.08);
          (node.breath.material as THREE.SpriteMaterial).opacity = (0.08 + breathPulse * 0.06 + activeBoost * 0.06 + finalBoost * 0.1) * haloFade;

          node.ring.scale.setScalar(0.095 + ringPulse * 0.03 + activeBoost * 0.045 + arrivalBoost * 0.05 + finalBoost * 0.07);
          (node.ring.material as THREE.SpriteMaterial).opacity = (0.18 + ringPulse * 0.08 + activeBoost * 0.08 + finalBoost * 0.08) * haloFade;

          node.wave.scale.setScalar(0.11 + waveEase * (0.11 + finalBoost * 0.06));
          (node.wave.material as THREE.SpriteMaterial).opacity = (1 - waveCycle) * (0.12 + activeBoost * 0.08 + finalBoost * 0.08) * haloFade;

          node.halo.scale.setScalar(0.19 + breathPulse * 0.03 + arrivalBoost * 0.04 + finalBoost * 0.08);
          (node.halo.material as THREE.SpriteMaterial).opacity = (0.04 + breathPulse * 0.03 + arrivalBoost * 0.08 + finalBoost * 0.12) * haloFade;

          node.flash.scale.setScalar(0.08 + arrivalBoost * 0.18);
          (node.flash.material as THREE.SpriteMaterial).opacity = arrivalBoost * 0.58 * haloFade;

          node.trigger.scale.setScalar(0.12 + finalBoost * 0.24 + pulse * 0.02);
          (node.trigger.material as THREE.SpriteMaterial).opacity = finalBoost * 0.52 * haloFade;
        });

        runtimeTravel.segments.forEach((segment, index) => {
          const isComplete = index < sequence.completedSegments;
          const isCurrent = index === currentSegmentIndex;
          const drawProgress = isCurrent ? easedSegmentProgress : isComplete ? 1 : 0;
          const drawCount = Math.max(0, Math.min(segment.points.length, Math.round(drawProgress * (segment.points.length - 1)) + (drawProgress > 0 ? 1 : 0)));

          setLineDraw(segment.base, isCurrent || isComplete ? segment.points.length : 0);
          setLineDraw(segment.progress, isCurrent || isComplete ? drawCount : 0);
          setLineDraw(segment.highlight, isCurrent ? drawCount : 0);

          (segment.base.material as THREE.LineBasicMaterial).opacity = isComplete ? 0.18 : isCurrent ? 0.08 : 0;
          (segment.progress.material as THREE.LineBasicMaterial).opacity = isComplete ? 0.26 : isCurrent ? 0.28 : 0;
          (segment.highlight.material as THREE.LineBasicMaterial).opacity = isCurrent ? 0.92 : 0;
        });

        if (isAnimating && currentSegmentIndex >= 0) {
          const segment = runtimeTravel.segments[currentSegmentIndex];
          const pointIndex = Math.max(0, Math.min(segment.points.length - 1, Math.round(easedSegmentProgress * (segment.points.length - 1))));
          const headPoint = segment.points[pointIndex];
          runtimeTravel.head.visible = true;
          runtimeTravel.head.position.copy(headPoint);
          runtimeTravel.head.scale.setScalar(0.96 + Math.sin(now / 130) * 0.05);

          runtimeTravel.headGlow.visible = true;
          runtimeTravel.headGlow.position.copy(headPoint);
          runtimeTravel.headGlow.scale.setScalar(0.125 + Math.sin(now / 160) * 0.015);
          runtimeTravel.head.getWorldPosition(tempWorldPosition);
          tempSurfaceNormal.copy(tempWorldPosition).normalize();
          tempViewDirection.copy(camera.position).sub(tempWorldPosition).normalize();
          const headFacing = tempSurfaceNormal.dot(tempViewDirection);
          const headGlowFade = easeInOutCubic(clamp((headFacing - 0.015) / 0.2, 0, 1));
          (runtimeTravel.headGlow.material as THREE.SpriteMaterial).opacity = 0.86 * headGlowFade * headGlowFade;

          const trailPoints = segment.points.slice(Math.max(0, pointIndex - 14), pointIndex + 1);
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
      ringTexture.dispose();
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
  }, [world, tiling, onCellHover, onCellClick, demoTravelEnabled, demoTravelReplayToken, onDemoTravelDestinationReady, onDemoTravelFinalTrigger]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
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
