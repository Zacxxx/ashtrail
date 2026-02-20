use crate::types::GeoConfig;
use noise::{NoiseFn, OpenSimplex};
use rand::prelude::*;
use rand_pcg::Pcg64;

pub struct PlateSeed {
    pub x: f64,
    pub y: f64,
    pub z: f64,
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
    fn sphere_coords(nx: f64, ny: f64) -> [f64; 3] {
        let lon = nx.fract() * std::f64::consts::TAU - std::f64::consts::PI;
        let lat = (ny.clamp(0.0, 1.0) - 0.5) * std::f64::consts::PI;
        let clat = lat.cos();
        [clat * lon.cos(), lat.sin(), clat * lon.sin()]
    }

    fn random_unit_vector<R: Rng + ?Sized>(rng: &mut R) -> [f64; 3] {
        let z = rng.gen_range(-1.0..1.0);
        let theta = rng.gen_range(0.0..std::f64::consts::TAU);
        let r = (1.0_f64 - z * z).sqrt();
        [r * theta.cos(), z, r * theta.sin()]
    }

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

        for _ in 0..geo_config.plate_count {
            let [x, y, z] = Self::random_unit_vector(&mut rng);
            let is_continental = rng.gen_bool(0.45); // 45% continents

            let base_elevation = if is_continental {
                rng.gen_range(0.5..0.7)
            } else {
                rng.gen_range(0.2..0.4)
            };

            plate_seeds.push(PlateSeed {
                x,
                y,
                z,
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

    pub fn get_plate_info(&self, nx: f64, ny: f64) -> (usize, f64, f64) {
        let base = Self::sphere_coords(nx, ny);
        let warp_freq = (220.0 / self.geo_config.continental_scale.max(1.0)).clamp(0.2, 2.0);
        let warp_amt = (65.0 / self.geo_config.continental_scale.max(1.0)).clamp(0.015, 0.09);

        let warp_x = self
            .warp_noise
            .get([base[0] * warp_freq, base[1] * warp_freq, base[2] * warp_freq])
            * warp_amt;
        let warp_y = self
            .warp_noise
            .get([base[2] * warp_freq, base[0] * warp_freq, base[1] * warp_freq])
            * warp_amt;
        let warped = Self::sphere_coords(nx + warp_x, ny + warp_y);

        let mut d1 = f64::INFINITY;
        let mut d2 = f64::INFINITY;
        let mut nearest_idx = 0;

        for (i, plate) in self.plate_seeds.iter().enumerate() {
            let dx = warped[0] - plate.x;
            let dy = warped[1] - plate.y;
            let dz = warped[2] - plate.z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();

            if dist < d1 {
                d2 = d1;
                d1 = dist;
                nearest_idx = i;
            } else if dist < d2 {
                d2 = dist;
            }
        }

        // Boundary proximity: 1.0 at boundary, 0.0 deep interior
        let boundary_proximity = if d2.is_finite() && d2 > 0.0 {
            (1.0 - (d2 - d1) / (d2 * 0.65)).clamp(0.0, 1.0)
        } else {
            0.0
        };

        (nearest_idx, d1, boundary_proximity)
    }

    pub fn get_fbm(
        &self,
        noise: &OpenSimplex,
        nx: f64,
        ny: f64,
        scale: f64,
        octaves: u32,
        persistence: f64,
        lacunarity: f64,
    ) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);
        let base_freq = (120.0 / scale.max(1.0)).clamp(0.04, 2.8);
        let mut amp = 1.0;
        let mut freq = base_freq;
        let mut val = 0.0;
        let mut max_a = 0.0;

        for _ in 0..octaves {
            val += noise.get([sx * freq, sy * freq, sz * freq]) * amp;
            max_a += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        val / max_a
    }

    pub fn sample_climate(&self, nx: f64, ny: f64, frequency: f64) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);
        self.climate_noise.get([sx * frequency, sy * frequency, sz * frequency])
    }

    pub fn sample_noise3d(&self, noise: &OpenSimplex, nx: f64, ny: f64, frequency: f64) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);
        noise.get([sx * frequency, sy * frequency, sz * frequency])
    }

    pub fn get_ridged_fbm(
        &self,
        noise: &OpenSimplex,
        nx: f64,
        ny: f64,
        scale: f64,
        octaves: u32,
        persistence: f64,
        lacunarity: f64,
    ) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);
        let base_freq = (120.0 / scale.max(1.0)).clamp(0.04, 2.8);
        let mut amp = 1.0;
        let mut freq = base_freq;
        let mut val = 0.0;
        let mut max_a = 0.0;

        for _ in 0..octaves {
            let n = noise.get([sx * freq, sy * freq, sz * freq]);
            let ridged = 1.0 - n.abs();
            val += ridged * amp;
            max_a += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        ((val / max_a) * 2.0 - 1.0).clamp(-1.0, 1.0)
    }
}
