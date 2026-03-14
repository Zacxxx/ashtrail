use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStageEvent {
    pub stage: String,
    pub status: JobStatus,
    pub progress: f32,
    pub at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRouteRef {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<Map<String, Value>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobOutputRef {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<JobRouteRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_text: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub kind: String,
    pub title: String,
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub world_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_job_id: Option<String>,
    pub status: JobStatus,
    pub progress: f32,
    pub current_stage: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub cancel_requested: bool,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
    #[serde(default)]
    pub output_refs: Vec<JobOutputRef>,
    #[serde(default)]
    pub stage_history: Vec<JobStageEvent>,
}

impl JobRecord {
    pub fn new(kind: impl Into<String>, title: impl Into<String>, tool: impl Into<String>) -> Self {
        let now = now_ms();
        Self {
            kind: kind.into(),
            title: title.into(),
            tool: tool.into(),
            world_id: None,
            run_id: None,
            parent_job_id: None,
            status: JobStatus::Queued,
            progress: 0.0,
            current_stage: "Queued".to_string(),
            result: None,
            error: None,
            cancel_requested: false,
            created_at: now,
            updated_at: now,
            metadata: None,
            output_refs: Vec::new(),
            stage_history: vec![JobStageEvent {
                stage: "Queued".to_string(),
                status: JobStatus::Queued,
                progress: 0.0,
                at: now,
            }],
        }
    }

    pub fn transition(&mut self, status: JobStatus, progress: f32, stage: impl Into<String>) {
        let stage = stage.into();
        let now = now_ms();
        let should_record = self
            .stage_history
            .last()
            .map(|event| event.stage != stage || event.status != status)
            .unwrap_or(true);

        self.status = status.clone();
        self.progress = progress;
        self.current_stage = stage.clone();
        self.updated_at = now;

        if should_record {
            self.stage_history.push(JobStageEvent {
                stage,
                status,
                progress,
                at: now,
            });
        }
    }

    pub fn set_cancel_requested(&mut self, stage: &str) {
        self.cancel_requested = true;
        if matches!(self.status, JobStatus::Queued | JobStatus::Running) {
            self.transition(self.status.clone(), self.progress, stage.to_string());
        } else {
            self.updated_at = now_ms();
        }
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transition_records_stage_history_only_when_stage_or_status_changes() {
        let mut job = JobRecord::new("kind", "Title", "tool");

        assert_eq!(job.stage_history.len(), 1);
        assert_eq!(job.stage_history[0].stage, "Queued");

        job.transition(JobStatus::Queued, 42.0, "Queued");
        assert_eq!(job.stage_history.len(), 1);
        assert_eq!(job.progress, 42.0);

        job.transition(JobStatus::Running, 50.0, "Starting");
        job.transition(JobStatus::Running, 75.0, "Starting");
        job.transition(JobStatus::Completed, 100.0, "Completed");

        assert_eq!(job.stage_history.len(), 3);
        assert_eq!(job.stage_history[1].stage, "Starting");
        assert_eq!(job.stage_history[1].status, JobStatus::Running);
        assert_eq!(job.stage_history[2].stage, "Completed");
        assert_eq!(job.stage_history[2].status, JobStatus::Completed);
    }
}
