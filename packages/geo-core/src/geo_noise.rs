use crate::types::GeoConfig;
use noise::{NoiseFn, OpenSimplex, Seedable};
use rand::prelude::*;
use rand_pcg::Pcg64;

pub struct PlateSeed {
    pub x: f64,
    pub y: f64,
    pub is_continental: bool,
    pub base_elevation: f64,
}

pub struct NoiseManager {
    pub continental_noise: OpenSimplex,
    pub mountain_noise: OpenSimplex,
    pub detail_noise: OpenSimplex,
    pub warp_noise: OpenSimplex,
    pub climate_noise: OpenSimplex,
    pub plate_seeds: Vec<PlateSeed>,
    pub geo_config: GeoConfig,
}

impl NoiseManager {
    pub fn new(seed: u32, geo_config: GeoConfig) -> Self {
        let mut rng = Pcg64::seed_from_u64(seed as u64);

        // Seeds for different noise layers
        let continental_noise = OpenSimplex::new(rng.gen());
        let mountain_noise = OpenSimplex::new(rng.gen());
        let detail_noise = OpenSimplex::new(rng.gen());
        let warp_noise = OpenSimplex::new(rng.gen());
        let climate_noise = OpenSimplex::new(rng.gen());

        // Plate seeds
        let mut plate_seeds = Vec::new();
        let world_bound = geo_config.continental_scale * 5.0; // 5000 units roughly

        for _ in 0..geo_config.plate_count {
            let x = rng.gen_range(-world_bound..world_bound);
            let y = rng.gen_range(-world_bound..world_bound);
            let is_continental = rng.gen_bool(0.45); // 45% continents

            let base_elevation = if is_continental {
                rng.gen_range(0.5..0.7)
            } else {
                rng.gen_range(0.2..0.4)
            };

            plate_seeds.push(PlateSeed {
                x,
                y,
                is_continental,
                base_elevation,
            });
        }

        Self {
            continental_noise,
            mountain_noise,
            detail_noise,
            warp_noise,
            climate_noise,
            plate_seeds,
            geo_config,
        }
    }

    pub fn get_plate_info(&self, wx: f64, wy: f64) -> (usize, f64, f64) {
        // Domain warp
        let warp_scale = self.geo_config.continental_scale * 0.8;
        let warp_amt = self.geo_config.continental_scale * 0.4;

        let warp_x = self.warp_noise.get([wx / warp_scale, wy / warp_scale]) * warp_amt;
        let warp_y = self
            .warp_noise
            .get([(wx + 1000.0) / warp_scale, (wy + 1000.0) / warp_scale])
            * warp_amt;

        let warped_x = wx + warp_x;
        let warped_y = wy + warp_y;

        let mut d1 = f64::INFINITY;
        let mut d2 = f64::INFINITY;
        let mut nearest_idx = 0;

        for (i, plate) in self.plate_seeds.iter().enumerate() {
            let dx = warped_x - plate.x;
            let dy = warped_y - plate.y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist < d1 {
                d2 = d1;
                d1 = dist;
                nearest_idx = i;
            } else if dist < d2 {
                d2 = dist;
            }
        }

        // Boundary proximity: 1.0 at boundary, 0.0 deep interior
        let boundary_proximity = if d2 > 0.0 {
            (1.0 - (d2 - d1) / (d2 * 0.5)).max(0.0)
        } else {
            0.0
        };

        (nearest_idx, d1, boundary_proximity)
    }

    pub fn get_fbm(
        &self,
        noise: &OpenSimplex,
        x: f64,
        y: f64,
        scale: f64,
        octaves: u32,
        persistence: f64,
        lacunarity: f64,
    ) -> f64 {
        let mut amp = 1.0;
        let mut freq = 1.0;
        let mut val = 0.0;
        let mut max_a = 0.0;

        for _ in 0..octaves {
            val += noise.get([x * freq / scale, y * freq / scale]) * amp;
            max_a += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        val / max_a
    }
}
