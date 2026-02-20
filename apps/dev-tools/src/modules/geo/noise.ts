import { createNoise2D } from "simplex-noise";
import { GeoConfig, TerrainCell } from "./types";

// A simple deterministic PRNG for the seed
function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export class GeoGenerator {
  private noise2D: (x: number, y: number) => number;
  
  constructor(private config: GeoConfig) {
    const prng = mulberry32(config.seed);
    this.noise2D = createNoise2D(prng);
  }

  // Returns normalized elevation [0, 1]
  public getElevation(x: number, y: number): number {
    let amplitude = 1;
    let frequency = 1;
    let noiseHeight = 0;
    
    // Calculate fractal noise
    for (let i = 0; i < this.config.octaves; i++) {
        const sampleX = x / this.config.scale * frequency;
        const sampleY = y / this.config.scale * frequency;
        
        // Simplex noise returns [-1, 1], map to [0, 1] for easier math
        const simplexValue = this.noise2D(sampleX, sampleY) * 0.5 + 0.5;
        noiseHeight += simplexValue * amplitude;
        
        amplitude *= this.config.persistence;
        frequency *= this.config.lacunarity;
    }
    
    // Normalize based on max possible amplitude (rough approximation)
    let maxPossibleHeight = 0;
    let ampTemp = 1;
    for (let i=0; i<this.config.octaves; i++) {
        maxPossibleHeight += ampTemp;
        ampTemp *= this.config.persistence;
    }
    
    return noiseHeight / maxPossibleHeight;
  }

  public getBiome(elevation: number): TerrainCell["biome"] {
    if (elevation < this.config.waterLevel - 0.15) return "DEEP_WATER";
    if (elevation < this.config.waterLevel) return "WATER";
    if (elevation < this.config.waterLevel + 0.05) return "SAND";
    if (elevation < 0.7) return "ROCK";
    return "PEAK";
  }

  public getBiomeColor(biome: TerrainCell["biome"]): string {
    switch (biome) {
      case "DEEP_WATER": return "#1e3a8a"; // deep blue
      case "WATER": return "#3b82f6"; // blue
      case "SAND": return "#d97706"; // amber
      case "ROCK": return "#4b5563"; // gray-600
      case "PEAK": return "#e5e7eb"; // gray-200 (snow/ash)
    }
  }

  public generateCell(x: number, y: number): TerrainCell {
    const elevation = this.getElevation(x, y);
    const biome = this.getBiome(elevation);
    const color = this.getBiomeColor(biome);

    return {
      x, y, elevation, biome, color
    };
  }
}
