use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
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
        }
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
