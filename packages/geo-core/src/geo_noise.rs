use crate::types::GeoConfig;
use noise::{NoiseFn, OpenSimplex};
use rand::prelude::*;
use rand_pcg::Pcg64;

/// Type of tectonic boundary between two plates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BoundaryKind {
    /// Plates pushing together — mountain building / subduction
    Convergent,
    /// Plates pulling apart — rift valleys / mid-ocean ridges
    Divergent,
    /// Plates sliding past each other — lateral stress
    Transform,
}

pub struct PlateSeed {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub is_continental: bool,
    pub base_elevation: f64,
    /// Unit velocity vector on the sphere surface
    pub vel_x: f64,
    pub vel_y: f64,
    pub vel_z: f64,
    pub speed: f64,
}

pub struct NoiseManager {
    pub continental_noise: OpenSimplex,
    pub mountain_noise: OpenSimplex,
    pub detail_noise: OpenSimplex,
    pub warp_noise: OpenSimplex,
    pub climate_noise: OpenSimplex,
    /// Dedicated noise for mountain ridge lines (RimWorld-style)
    pub mountain_lines_noise: OpenSimplex,
    /// Secondary warp field for domain warping
    pub warp_noise_2: OpenSimplex,
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

    /// Generate a tangent velocity vector on the sphere surface at point (x,y,z).
    fn random_tangent_velocity<R: Rng + ?Sized>(
        rng: &mut R,
        x: f64,
        y: f64,
        z: f64,
    ) -> (f64, f64, f64, f64) {
        // Pick a random direction, then project it onto the tangent plane
        let [rx, ry, rz] = Self::random_unit_vector(rng);
        // Normal at point is (x, y, z) (already on unit sphere)
        let dot = rx * x + ry * y + rz * z;
        let tx = rx - dot * x;
        let ty = ry - dot * y;
        let tz = rz - dot * z;
        let len = (tx * tx + ty * ty + tz * tz).sqrt().max(1e-8);
        let speed = rng.gen_range(0.3..1.0);
        (tx / len, ty / len, tz / len, speed)
    }

    pub fn new(seed: u32, geo_config: GeoConfig) -> Self {
        let mut rng = Pcg64::seed_from_u64(seed as u64);

        // Seeds for different noise layers
        let continental_noise = OpenSimplex::new(rng.gen());
        let mountain_noise = OpenSimplex::new(rng.gen());
        let detail_noise = OpenSimplex::new(rng.gen());
        let warp_noise = OpenSimplex::new(rng.gen());
        let climate_noise = OpenSimplex::new(rng.gen());
        let mountain_lines_noise = OpenSimplex::new(rng.gen());
        let warp_noise_2 = OpenSimplex::new(rng.gen());

        // Plate seeds with velocity vectors
        let mut plate_seeds = Vec::new();

        for _ in 0..geo_config.plate_count {
            let [x, y, z] = Self::random_unit_vector(&mut rng);
            let is_continental = rng.gen_bool(0.45);

            let base_elevation = if is_continental {
                rng.gen_range(0.52..0.72)
            } else {
                rng.gen_range(0.18..0.38)
            };

            let (vel_x, vel_y, vel_z, speed) = Self::random_tangent_velocity(&mut rng, x, y, z);

            plate_seeds.push(PlateSeed {
                x,
                y,
                z,
                is_continental,
                base_elevation,
                vel_x,
                vel_y,
                vel_z,
                speed,
            });
        }

        Self {
            continental_noise,
            mountain_noise,
            detail_noise,
            warp_noise,
            climate_noise,
            mountain_lines_noise,
            warp_noise_2,
            plate_seeds,
            geo_config,
        }
    }

    /// Get plate info with boundary classification.
    /// Returns (nearest_plate_idx, second_plate_idx, boundary_proximity, boundary_kind).
    pub fn get_plate_info_extended(&self, nx: f64, ny: f64) -> (usize, usize, f64, BoundaryKind) {
        let base = Self::sphere_coords(nx, ny);
        let warp_freq = (220.0 / self.geo_config.continental_scale.max(1.0)).clamp(0.2, 2.0);
        let warp_amt = (65.0 / self.geo_config.continental_scale.max(1.0)).clamp(0.015, 0.09);

        let warp_x = self.warp_noise.get([
            base[0] * warp_freq,
            base[1] * warp_freq,
            base[2] * warp_freq,
        ]) * warp_amt;
        let warp_y = self.warp_noise.get([
            base[2] * warp_freq,
            base[0] * warp_freq,
            base[1] * warp_freq,
        ]) * warp_amt;
        let warped = Self::sphere_coords(nx + warp_x, ny + warp_y);

        let mut d1 = f64::INFINITY;
        let mut d2 = f64::INFINITY;
        let mut nearest_idx = 0;
        let mut second_idx = 0;

        for (i, plate) in self.plate_seeds.iter().enumerate() {
            let dx = warped[0] - plate.x;
            let dy = warped[1] - plate.y;
            let dz = warped[2] - plate.z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();

            if dist < d1 {
                d2 = d1;
                second_idx = nearest_idx;
                d1 = dist;
                nearest_idx = i;
            } else if dist < d2 {
                d2 = dist;
                second_idx = i;
            }
        }

        // Boundary proximity: 1.0 at boundary, 0.0 deep interior
        let boundary_proximity = if d2.is_finite() && d2 > 0.0 {
            (1.0 - (d2 - d1) / (d2 * 0.65)).clamp(0.0, 1.0)
        } else {
            0.0
        };

        // Classify boundary type using relative plate velocities
        let boundary_kind = self.classify_boundary(nearest_idx, second_idx, nx, ny);

        (nearest_idx, second_idx, boundary_proximity, boundary_kind)
    }

    /// Legacy compatibility wrapper.
    pub fn get_plate_info(&self, nx: f64, ny: f64) -> (usize, f64, f64) {
        let (idx, _second, bp, _kind) = self.get_plate_info_extended(nx, ny);
        // Compute d1 for backward compat (not really used anymore)
        let base = Self::sphere_coords(nx, ny);
        let p = &self.plate_seeds[idx];
        let dx = base[0] - p.x;
        let dy = base[1] - p.y;
        let dz = base[2] - p.z;
        let d1 = (dx * dx + dy * dy + dz * dz).sqrt();
        (idx, d1, bp)
    }

    /// Classify the boundary between two plates based on their relative velocity.
    fn classify_boundary(&self, plate_a: usize, plate_b: usize, nx: f64, ny: f64) -> BoundaryKind {
        if plate_a >= self.plate_seeds.len()
            || plate_b >= self.plate_seeds.len()
            || plate_a == plate_b
        {
            return BoundaryKind::Transform;
        }

        let a = &self.plate_seeds[plate_a];
        let b = &self.plate_seeds[plate_b];

        // Boundary normal: direction from plate A center to plate B center
        let bx = b.x - a.x;
        let by = b.y - a.y;
        let bz = b.z - a.z;
        let blen = (bx * bx + by * by + bz * bz).sqrt().max(1e-8);
        let bnx = bx / blen;
        let bny = by / blen;
        let bnz = bz / blen;

        // Relative velocity of plate A towards plate B
        let rel_vx = a.vel_x * a.speed - b.vel_x * b.speed;
        let rel_vy = a.vel_y * a.speed - b.vel_y * b.speed;
        let rel_vz = a.vel_z * a.speed - b.vel_z * b.speed;

        // Dot product: positive = converging, negative = diverging
        let convergence = rel_vx * bnx + rel_vy * bny + rel_vz * bnz;

        if convergence > 0.15 {
            BoundaryKind::Convergent
        } else if convergence < -0.15 {
            BoundaryKind::Divergent
        } else {
            BoundaryKind::Transform
        }
    }

    /// Domain-warped 3D noise sampling.
    /// Warps the input coordinates through a secondary noise field before sampling,
    /// producing more organic, natural shapes.
    pub fn sample_warped_3d(
        &self,
        noise: &OpenSimplex,
        nx: f64,
        ny: f64,
        frequency: f64,
        warp_strength: f64,
    ) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);

        // First warp pass: offset coordinates using secondary warp noise
        let wx = self.warp_noise_2.get([
            sx * frequency * 0.7,
            sy * frequency * 0.7,
            sz * frequency * 0.7,
        ]) * warp_strength;
        let wy = self.warp_noise_2.get([
            sy * frequency * 0.7 + 31.7,
            sz * frequency * 0.7 + 47.3,
            sx * frequency * 0.7 + 13.1,
        ]) * warp_strength;
        let wz = self.warp_noise_2.get([
            sz * frequency * 0.7 + 71.9,
            sx * frequency * 0.7 + 23.5,
            sy * frequency * 0.7 + 59.7,
        ]) * warp_strength;

        noise.get([
            (sx + wx) * frequency,
            (sy + wy) * frequency,
            (sz + wz) * frequency,
        ])
    }

    /// Mountain ridge lines using RimWorld's technique: 1 - |perlin|
    /// Creates sharp ridges where noise crosses zero.
    pub fn get_mountain_lines(&self, nx: f64, ny: f64, frequency: f64) -> f64 {
        let [sx, sy, sz] = Self::sphere_coords(nx, ny);
        let raw = self
            .mountain_lines_noise
            .get([sx * frequency, sy * frequency, sz * frequency]);

        // Sharp ridge: 1 at zero-crossings, 0 at peaks/valleys
        let ridge = 1.0 - raw.abs();

        // Hole-masking noise to create gaps in mountain chains
        let holes = self.mountain_noise.get([
            sx * frequency * 2.4,
            sy * frequency * 2.4,
            sz * frequency * 2.4,
        ]);
        let mask = if holes > -0.3 { 1.0 } else { 0.0 };

        (ridge * mask).clamp(0.0, 1.0)
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
        self.climate_noise
            .get([sx * frequency, sy * frequency, sz * frequency])
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
