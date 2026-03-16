use axum::http::StatusCode;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::gemini;
use crate::jobs::{JobOutputRef, JobRecord, JobStatus};

#[derive(Clone)]
pub struct QuestRuntime {
    pub jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    pub config: QuestAiExecutorConfig,
    pub global_limiter: QuestWorkLimiter,
    pub text_limiter: QuestWorkLimiter,
    pub image_limiter: QuestWorkLimiter,
    pub glossary_limiter: QuestWorkLimiter,
    pub enabled: bool,
}

#[derive(Clone)]
pub struct QuestWorkLimiter {
    pub semaphore: Arc<Semaphore>,
    pub max_concurrent: usize,
    pub max_queue: usize,
    pub outstanding: Arc<AtomicUsize>,
}

#[derive(Clone)]
pub struct QuestAiExecutorConfig {
    pub max_retries_text: usize,
    pub max_retries_image: usize,
    pub max_retries_glossary: usize,
    pub backoff_text_ms: Vec<u64>,
    pub backoff_image_ms: Vec<u64>,
    pub backoff_glossary_ms: Vec<u64>,
}

impl QuestAiExecutorConfig {
    pub fn from_env() -> Self {
        Self {
            max_retries_text: 2,
            max_retries_image: 1,
            max_retries_glossary: 1,
            backoff_text_ms: vec![500, 1500],
            backoff_image_ms: vec![1000],
            backoff_glossary_ms: vec![1000],
        }
    }
}

impl QuestRuntime {
    pub fn from_env(enabled: bool, jobs: Arc<Mutex<HashMap<String, JobRecord>>>) -> Self {
        Self {
            jobs,
            config: QuestAiExecutorConfig::from_env(),
            global_limiter: QuestWorkLimiter::new(
                read_usize_env("QUEST_GEMINI_MAX_CONCURRENT", 3),
                read_usize_env("QUEST_GEMINI_MAX_QUEUE", 16),
            ),
            text_limiter: QuestWorkLimiter::new(
                read_usize_env("QUEST_TEXT_MAX_CONCURRENT", 2),
                read_usize_env("QUEST_TEXT_MAX_QUEUE", 8),
            ),
            image_limiter: QuestWorkLimiter::new(
                read_usize_env("QUEST_IMAGE_MAX_CONCURRENT", 1),
                read_usize_env("QUEST_IMAGE_MAX_QUEUE", 4),
            ),
            glossary_limiter: QuestWorkLimiter::new(
                read_usize_env("QUEST_GLOSSARY_MAX_CONCURRENT", 1),
                read_usize_env("QUEST_GLOSSARY_MAX_QUEUE", 16),
            ),
            enabled,
        }
    }

    pub fn create_job(
        &self,
        kind: QuestJobKind,
        world_id: &str,
        run_id: Option<String>,
    ) -> Result<String, (StatusCode, String)> {
        let job_id = format!("qjob-{}", uuid::Uuid::new_v4());
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let (shared_kind, title) = quest_job_kind_meta(&kind);
        let mut job = JobRecord::new(shared_kind, title, "quests");
        job.world_id = Some(world_id.to_string());
        job.run_id = run_id;
        jobs.insert(job_id.clone(), job);
        Ok(job_id)
    }

    pub fn create_custom_job(
        &self,
        job_id: String,
        kind: &str,
        title: &str,
        world_id: &str,
        run_id: Option<String>,
        parent_job_id: Option<String>,
        metadata: Option<Value>,
        output_refs: Vec<JobOutputRef>,
    ) -> Result<String, (StatusCode, String)> {
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let mut job = JobRecord::new(kind, title, "quests");
        job.world_id = Some(world_id.to_string());
        job.run_id = run_id;
        job.parent_job_id = parent_job_id;
        job.metadata = metadata;
        job.output_refs = output_refs;
        jobs.insert(job_id.clone(), job);
        Ok(job_id)
    }

    pub fn get_job(&self, job_id: &str) -> Result<Option<QuestJobRecord>, (StatusCode, String)> {
        let jobs = self.jobs.lock().map_err(lock_error)?;
        Ok(jobs
            .get(job_id)
            .and_then(|job| map_shared_job_to_quest_record(job_id, job)))
    }

    pub fn update_job(
        &self,
        job_id: &str,
        status: QuestJobStatus,
        progress: f32,
        stage: &str,
        result: Option<Value>,
        error: Option<String>,
    ) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.transition(
                    map_quest_status_to_job_status(&status),
                    progress,
                    stage.to_string(),
                );
                if result.is_some() {
                    job.result = result;
                }
                job.error = error;
            }
        }
    }

    pub fn set_job_metadata(&self, job_id: &str, metadata: Value) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.metadata = Some(metadata);
                job.updated_at = now_ms();
            }
        }
    }

    pub fn merge_job_metadata(&self, job_id: &str, metadata: Map<String, Value>) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                let mut merged = match job.metadata.take() {
                    Some(Value::Object(existing)) => existing,
                    _ => Map::new(),
                };
                for (key, value) in metadata {
                    merged.insert(key, value);
                }
                job.metadata = Some(Value::Object(merged));
                job.updated_at = now_ms();
            }
        }
    }

    pub fn set_output_refs(&self, job_id: &str, output_refs: Vec<JobOutputRef>) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.output_refs = output_refs;
                job.updated_at = now_ms();
            }
        }
    }

    pub fn set_parent_job(&self, job_id: &str, parent_job_id: Option<String>) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.parent_job_id = parent_job_id;
                job.updated_at = now_ms();
            }
        }
    }

    pub fn set_run_id(&self, job_id: &str, run_id: Option<String>) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.get_mut(job_id) {
                job.run_id = run_id;
                job.updated_at = now_ms();
            }
        }
    }

    pub fn cancel_job(&self, job_id: &str) -> Result<bool, (StatusCode, String)> {
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let Some(job) = jobs.get_mut(job_id) else {
            return Ok(false);
        };
        job.set_cancel_requested("Cancellation requested");
        Ok(true)
    }

    pub fn is_cancel_requested(&self, job_id: &str) -> bool {
        self.jobs
            .lock()
            .ok()
            .and_then(|jobs| jobs.get(job_id).map(|job| job.cancel_requested))
            .unwrap_or(false)
    }

    pub async fn wait_for_text_permits(
        &self,
        job_id: &str,
    ) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
        wait_for_permits(
            self,
            job_id,
            &self.global_limiter,
            &self.text_limiter,
            "Waiting for quest text capacity",
        )
        .await
    }

    pub async fn wait_for_image_permits(
        &self,
        job_id: &str,
    ) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
        wait_for_permits(
            self,
            job_id,
            &self.global_limiter,
            &self.image_limiter,
            "Waiting for quest image capacity",
        )
        .await
    }

    pub async fn wait_for_glossary_permits(
        &self,
        job_id: &str,
    ) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
        wait_for_permits(
            self,
            job_id,
            &self.global_limiter,
            &self.glossary_limiter,
            "Waiting for glossary capacity",
        )
        .await
    }

    pub async fn generate_text(
        &self,
        work_kind: QuestAiWorkKind,
        prompt: &str,
        temperature: f32,
    ) -> Result<String, (StatusCode, String)> {
        let (retries, backoffs) = match work_kind {
            QuestAiWorkKind::QuestGlossary => (
                self.config.max_retries_glossary,
                self.config.backoff_glossary_ms.clone(),
            ),
            QuestAiWorkKind::QuestImage => unreachable!("generate_text called for image work"),
            _ => (
                self.config.max_retries_text,
                self.config.backoff_text_ms.clone(),
            ),
        };
        let mut attempt = 0usize;
        loop {
            match gemini::generate_text_with_options(prompt, temperature).await {
                Ok(text) => return Ok(text),
                Err((status, _message)) if should_retry(status) && attempt < retries => {
                    let delay_ms = backoffs
                        .get(attempt)
                        .copied()
                        .or_else(|| backoffs.last().copied())
                        .unwrap_or(500);
                    attempt += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    continue;
                }
                Err(err) => return Err(err),
            }
        }
    }

    pub async fn generate_image(
        &self,
        prompt: &str,
        temperature: f32,
        cols: u32,
        rows: u32,
        aspect_ratio: Option<&str>,
        preferred_model: Option<&str>,
    ) -> Result<(Vec<u8>, String), (StatusCode, String)> {
        let model_catalog = gemini::image_model_catalog();
        let mut model_chain = Vec::new();
        if let Some(preferred) = preferred_model
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            model_chain.push(preferred.to_string());
        } else if !model_catalog.default_model_id.is_empty() {
            model_chain.push(model_catalog.default_model_id.clone());
        }
        for model_id in &model_catalog.fallback_chain {
            if !model_chain.contains(model_id) {
                model_chain.push(model_id.clone());
            }
        }
        if model_chain.is_empty() {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "No configured quest image models found.".to_string(),
            ));
        }

        let mut first_error: Option<(StatusCode, String)> = None;
        for model_id in model_chain {
            let mut attempt = 0usize;
            loop {
                match gemini::generate_image_bytes_with_model(
                    prompt,
                    Some(temperature),
                    cols,
                    rows,
                    aspect_ratio,
                    &model_id,
                )
                .await
                {
                    Ok(bytes) => return Ok((bytes, model_id)),
                    Err((status, _message))
                        if should_retry(status) && attempt < self.config.max_retries_image =>
                    {
                        let delay_ms = self
                            .config
                            .backoff_image_ms
                            .get(attempt)
                            .copied()
                            .or_else(|| self.config.backoff_image_ms.last().copied())
                            .unwrap_or(1000);
                        attempt += 1;
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    }
                    Err(err) => {
                        if first_error.is_none() {
                            first_error = Some(err.clone());
                        }
                        break;
                    }
                }
            }
        }

        Err(first_error.unwrap_or((
            StatusCode::BAD_GATEWAY,
            "All quest image models failed.".to_string(),
        )))
    }
}

impl QuestWorkLimiter {
    pub fn new(max_concurrent: usize, max_queue: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent.max(1))),
            max_concurrent: max_concurrent.max(1),
            max_queue,
            outstanding: Arc::new(AtomicUsize::new(0)),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QuestJobStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuestJobKind {
    GenerateRun,
    AdvanceRun,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestJobRecord {
    pub job_id: String,
    pub kind: QuestJobKind,
    pub status: QuestJobStatus,
    pub progress: f32,
    pub stage: String,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub world_id: String,
    pub run_id: Option<String>,
    pub cancel_requested: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestJobAcceptedResponse {
    pub job_id: String,
    pub kind: QuestJobKind,
}

#[derive(Clone, Copy)]
pub enum QuestAiWorkKind {
    QuestOutline,
    QuestNode,
    QuestImage,
    QuestGlossary,
    JsonRepair,
}

pub struct QuestQueueReservation {
    outstanding: Arc<AtomicUsize>,
}

impl Drop for QuestQueueReservation {
    fn drop(&mut self) {
        self.outstanding.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn try_reserve_capacity(limiter: &QuestWorkLimiter) -> Option<QuestQueueReservation> {
    let max_total = limiter.max_concurrent.saturating_add(limiter.max_queue);
    loop {
        let current = limiter.outstanding.load(Ordering::SeqCst);
        if current >= max_total {
            return None;
        }
        if limiter
            .outstanding
            .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            return Some(QuestQueueReservation {
                outstanding: limiter.outstanding.clone(),
            });
        }
    }
}

fn lock_error<T>(_error: std::sync::PoisonError<T>) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "quest job store lock poisoned".to_string(),
    )
}

fn quest_job_kind_meta(kind: &QuestJobKind) -> (&'static str, &'static str) {
    match kind {
        QuestJobKind::GenerateRun => ("quests.generate-run.v2", "Generate Quest Run"),
        QuestJobKind::AdvanceRun => ("quests.advance-run.v2", "Advance Quest Run"),
    }
}

fn map_shared_kind_to_quest_kind(kind: &str) -> Option<QuestJobKind> {
    match kind {
        "quests.generate-run.v2" => Some(QuestJobKind::GenerateRun),
        "quests.advance-run.v2" => Some(QuestJobKind::AdvanceRun),
        _ => None,
    }
}

fn map_quest_status_to_job_status(status: &QuestJobStatus) -> JobStatus {
    match status {
        QuestJobStatus::Queued => JobStatus::Queued,
        QuestJobStatus::Running => JobStatus::Running,
        QuestJobStatus::Completed => JobStatus::Completed,
        QuestJobStatus::Cancelled => JobStatus::Cancelled,
        QuestJobStatus::Failed => JobStatus::Failed,
    }
}

fn map_job_status_to_quest_status(status: &JobStatus) -> QuestJobStatus {
    match status {
        JobStatus::Queued => QuestJobStatus::Queued,
        JobStatus::Running => QuestJobStatus::Running,
        JobStatus::Completed => QuestJobStatus::Completed,
        JobStatus::Cancelled => QuestJobStatus::Cancelled,
        JobStatus::Failed => QuestJobStatus::Failed,
    }
}

fn map_shared_job_to_quest_record(job_id: &str, job: &JobRecord) -> Option<QuestJobRecord> {
    let kind = map_shared_kind_to_quest_kind(&job.kind)?;
    Some(QuestJobRecord {
        job_id: job_id.to_string(),
        kind,
        status: map_job_status_to_quest_status(&job.status),
        progress: job.progress,
        stage: job.current_stage.clone(),
        result: job.result.clone(),
        error: job.error.clone(),
        world_id: job.world_id.clone().unwrap_or_default(),
        run_id: job.run_id.clone(),
        cancel_requested: job.cancel_requested,
        created_at: job.created_at,
        updated_at: job.updated_at,
    })
}

async fn wait_for_permits(
    runtime: &QuestRuntime,
    job_id: &str,
    global: &QuestWorkLimiter,
    local: &QuestWorkLimiter,
    stage: &str,
) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), String> {
    runtime.update_job(job_id, QuestJobStatus::Queued, 0.0, stage, None, None);
    if runtime.is_cancel_requested(job_id) {
        runtime.update_job(
            job_id,
            QuestJobStatus::Cancelled,
            0.0,
            "Cancelled",
            None,
            None,
        );
        return Err("cancelled".to_string());
    }

    let global_permit = global
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "global quest capacity unavailable".to_string())?;
    let local_permit = match local.semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            drop(global_permit);
            return Err("local quest capacity unavailable".to_string());
        }
    };
    Ok((global_permit, local_permit))
}

fn should_retry(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn read_usize_env(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
