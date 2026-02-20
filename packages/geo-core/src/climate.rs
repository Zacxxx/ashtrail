use crate::geo_noise::NoiseManager;
use crate::types::ClimateConfig;
use noise::NoiseFn;

pub struct ClimateSimulator<'a> {
    config: &'a ClimateConfig,
    noise: &'a NoiseManager,
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
        wx: f64,
        wy: f64,
    ) -> f64 {
        let latitude_factor = 1.0 - 2.0 * (normalized_y - 0.5).abs();
        let base_temp =
            self.config.global_mean_temp + self.config.latitude_gradient * (latitude_factor - 0.5);

        let elevation_above_sea = (elevation - 0.35).max(0.0) / 0.65;
        let elevation_meters = elevation_above_sea * 8848.0;
        let lapse_rate = -6.5 * (elevation_meters / 1000.0);

        let ocean_moderation = ocean_proximity * self.config.ocean_warmth_factor * 3.0;
        let local_variation = self.noise.climate_noise.get([wx / 500.0, wy / 500.0]) * 3.0;

        base_temp + lapse_rate + ocean_moderation + local_variation
    }

    pub fn get_precipitation(
        &self,
        elevation: f64,
        ocean_proximity: f64,
        windward: bool,
        wx: f64,
        wy: f64,
    ) -> f64 {
        let base_moisture = (self.noise.climate_noise.get([wx / 300.0, wy / 300.0]) + 1.0) / 2.0;
        let ocean_effect = ocean_proximity * 0.4;

        let orographic_effect = if windward {
            (elevation * 0.5).min(0.3)
        } else {
            -(elevation * 0.4).min(0.3)
        };

        let altitude_reduction = if elevation > 0.7 {
            -(elevation - 0.7) * 1.5
        } else {
            0.0
        };

        let result = (base_moisture + ocean_effect + orographic_effect + altitude_reduction)
            * self.config.precipitation_multiplier;

        result.max(0.0).min(1.0)
    }

    pub fn get_wind_exposure(&self, elevation: f64, slope_angle: f64, wx: f64, wy: f64) -> f64 {
        let base_wind = (self.noise.climate_noise.get([wx / 400.0, wy / 400.0]) + 1.0) / 2.0;
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
