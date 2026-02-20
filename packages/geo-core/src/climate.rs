use crate::geo_noise::NoiseManager;
use crate::types::ClimateConfig;

pub struct ClimateSimulator<'a> {
    config: &'a ClimateConfig,
    noise: &'a NoiseManager,
}

fn eval_curve(x: f64, points: &[(f64, f64)]) -> f64 {
    if points.is_empty() {
        return 0.0;
    }
    if x <= points[0].0 {
        return points[0].1;
    }
    for w in points.windows(2) {
        let (x0, y0) = w[0];
        let (x1, y1) = w[1];
        if x <= x1 {
            let t = ((x - x0) / (x1 - x0)).clamp(0.0, 1.0);
            return y0 + (y1 - y0) * t;
        }
    }
    points[points.len() - 1].1
}

impl<'a> ClimateSimulator<'a> {
    pub fn new(config: &'a ClimateConfig, noise: &'a NoiseManager) -> Self {
        Self { config, noise }
    }

    pub fn get_temperature(
        &self,
        normalized_y: f64,
        elevation: f64,
        ocean_proximity: f64,
        nx: f64,
        ny: f64,
    ) -> f64 {
        let lat_abs = (2.0 * normalized_y - 1.0).abs();
        let base_curve = eval_curve(
            lat_abs,
            &[(0.0, 30.0), (0.1, 29.0), (0.5, 7.0), (1.0, -37.0)],
        );
        let gradient_scale = (self.config.latitude_gradient / 60.0).clamp(0.35, 1.85);
        let global_shift = self.config.global_mean_temp - 15.0;
        let base_temp = base_curve * gradient_scale + global_shift;

        let elevation_above_sea = (elevation - 0.34).max(0.0) / 0.66;
        let elevation_meters = elevation_above_sea * 8848.0;
        let lapse_rate = -6.0 * (elevation_meters / 1000.0);

        let ocean_moderation = ocean_proximity * self.config.ocean_warmth_factor * 2.2;
        let local_variation = self.noise.sample_climate(nx, ny, 0.8) * 4.0;

        base_temp + lapse_rate + ocean_moderation + local_variation
    }

    pub fn get_precipitation(
        &self,
        elevation: f64,
        ocean_proximity: f64,
        windward: bool,
        normalized_y: f64,
        nx: f64,
        ny: f64,
    ) -> f64 {
        let base_noise = ((self.noise.sample_climate(nx, ny, 1.35) + 1.0) / 2.0).powf(1.2);
        let lat_abs_deg = ((2.0 * normalized_y - 1.0).abs() * 90.0).clamp(0.0, 90.0);
        let lat_factor = eval_curve(
            lat_abs_deg,
            &[
                (0.0, 1.12),
                (25.0, 0.94),
                (45.0, 0.70),
                (70.0, 0.30),
                (80.0, 0.05),
                (90.0, 0.05),
            ],
        );
        let ocean_effect = ocean_proximity * 0.34;

        let orographic_effect = if windward {
            (elevation * 0.42).min(0.26)
        } else {
            -(elevation * 0.34).min(0.24)
        };

        let altitude_reduction = if elevation > 0.62 { -(elevation - 0.62) * 1.2 } else { 0.0 };

        let result = ((base_noise * lat_factor) + ocean_effect + orographic_effect + altitude_reduction)
            .max(0.0)
            .powf(1.15)
            * self.config.precipitation_multiplier;

        result.max(0.0).min(1.0)
    }

    pub fn get_wind_exposure(&self, elevation: f64, slope_angle: f64, nx: f64, ny: f64) -> f64 {
        let base_wind = (self.noise.sample_climate(nx, ny, 1.0) + 1.0) / 2.0;
        let elevation_boost = elevation * 0.4;
        let slope_boost = slope_angle * 0.3;

        (base_wind * self.config.wind_strength * 0.5 + elevation_boost + slope_boost)
            .max(0.0)
            .min(1.0)
    }

    pub fn is_windward(&self, grad_x: f64, grad_y: f64) -> bool {
        let wind_dir_rad = (self.config.prevailing_wind_dir * std::f64::consts::PI) / 180.0;
        let wind_x = wind_dir_rad.sin();
        let wind_y = -wind_dir_rad.cos();

        let dot = grad_x * wind_x + grad_y * wind_y;
        dot > 0.0
    }
}
