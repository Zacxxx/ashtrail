use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use crate::media_audio::InterleavedTranscript;

pub const DEMO_OUTPUT_API_ROOT: &str = "/api/demo-output";

#[derive(Clone, Debug)]
pub struct DemoReplayConfig {
    pub base_dir: PathBuf,
    pub use_pregenerated: bool,
    pub pregenerated_run_id: Option<String>,
    pub legacy_step_one_use_pregenerated: bool,
    pub legacy_step_one_folder: String,
}

impl DemoReplayConfig {
    pub fn resolve_run_id(
        &self,
        step: u8,
        requested_run_id: Option<&str>,
        fallback_job_id: &str,
    ) -> String {
        requested_run_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| self.pregenerated_run_id_for_step(step))
            .unwrap_or_else(|| fallback_job_id.to_string())
    }

    pub fn pregenerated_run_id_for_step(&self, step: u8) -> Option<String> {
        if self.use_pregenerated {
            return self.pregenerated_run_id.clone();
        }
        if step == 1 && self.legacy_step_one_use_pregenerated {
            return Some(self.legacy_step_one_folder.clone());
        }
        None
    }

    pub fn should_attempt_pregenerated(&self, step: u8) -> bool {
        self.pregenerated_run_id_for_step(step).is_some()
    }

    pub fn step_output_dir(&self, run_id: &str, step_slug: &str) -> PathBuf {
        self.base_dir.join(run_id).join(step_slug)
    }

    pub fn legacy_step_one_root(&self) -> PathBuf {
        self.base_dir.join(&self.legacy_step_one_folder)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoStoredArtifactEnvelope<T> {
    #[serde(rename = "type")]
    pub envelope_type: String,
    pub step: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    pub run_id: String,
    pub source: String,
    pub created_at: String,
    pub artifact: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript: Option<InterleavedTranscript>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<Value>,
}

pub fn artifact_path(output_root: &Path) -> PathBuf {
    output_root.join("artifact.json")
}

pub fn has_artifact(output_root: &Path) -> bool {
    artifact_path(output_root).exists()
}

pub fn api_asset_url(base_dir: &Path, output_root: &Path, file_name: &str) -> String {
    let relative = output_root
        .strip_prefix(base_dir)
        .unwrap_or(output_root)
        .to_string_lossy()
        .replace('\\', "/");
    format!("{DEMO_OUTPUT_API_ROOT}/{relative}/{file_name}")
}

pub fn now_created_at() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub fn persist_demo_artifact<T: Serialize>(
    output_root: &Path,
    envelope: &DemoStoredArtifactEnvelope<T>,
) -> Result<(), String> {
    fs::create_dir_all(output_root)
        .map_err(|error| format!("Failed to create demo artifact directory: {error}"))?;
    let bytes = serde_json::to_vec_pretty(envelope)
        .map_err(|error| format!("Failed to serialize demo artifact envelope: {error}"))?;
    fs::write(artifact_path(output_root), bytes)
        .map_err(|error| format!("Failed to write demo artifact envelope: {error}"))
}

pub fn load_demo_artifact<T: DeserializeOwned>(
    output_root: &Path,
) -> Result<DemoStoredArtifactEnvelope<T>, String> {
    let path = artifact_path(output_root);
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    serde_json::from_str::<DemoStoredArtifactEnvelope<T>>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}
