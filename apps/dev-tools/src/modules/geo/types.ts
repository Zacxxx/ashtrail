export interface GeoConfig {
  seed: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  waterLevel: number;
}

export interface TerrainCell {
  x: number;
  y: number;
  elevation: number;
  biome: "DEEP_WATER" | "WATER" | "SAND" | "ROCK" | "PEAK";
  color: string;
}
