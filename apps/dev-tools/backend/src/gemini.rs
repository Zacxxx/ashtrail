use axum::http::StatusCode;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{error, info};

#[derive(Serialize)]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(rename = "inlineData", skip_serializing_if = "Option::is_none")]
    inline_data: Option<GeminiInlineDataRequest>,
}

#[derive(Serialize)]
struct GeminiInlineDataRequest {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct ImageConfig {
    #[serde(rename = "aspectRatio", skip_serializing_if = "Option::is_none")]
    aspect_ratio: Option<String>,
    #[serde(rename = "imageSize", skip_serializing_if = "Option::is_none")]
    image_size: Option<String>,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(rename = "responseModalities")]
    response_modalities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(rename = "imageConfig", skip_serializing_if = "Option::is_none")]
    image_config: Option<ImageConfig>,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Deserialize, Debug)]
struct GeminiCandidate {
    content: Option<GeminiMessageContent>,
}

#[derive(Deserialize, Debug)]
struct GeminiMessageContent {
    parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Deserialize, Debug)]
struct GeminiResponsePart {
    #[serde(rename = "inlineData")]
    inline_data: Option<GeminiInlineData>,
    text: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GeminiInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Deserialize, Debug)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiError>,
}

#[derive(Deserialize, Debug)]
struct GeminiError {
    message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModelInfo {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModelStatus {
    pub id: String,
    pub label: String,
    pub available: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModelCatalog {
    pub models: Vec<ImageModelStatus>,
    pub default_model_id: String,
    pub fallback_chain: Vec<String>,
}

#[derive(Clone)]
pub struct ImageModelConfig {
    pub models: Vec<ImageModelInfo>,
    pub default_model_id: String,
    pub fallback_chain: Vec<String>,
}

fn default_image_models() -> Vec<ImageModelInfo> {
    vec![
        ImageModelInfo {
            id: "gemini-3.1-flash-image-preview".to_string(),
            label: "Nano Banana 2".to_string(),
        },
        ImageModelInfo {
            id: "gemini-3-pro-image-preview".to_string(),
            label: "Gemini 3 Pro Image Preview".to_string(),
        },
        ImageModelInfo {
            id: "gemini-2.5-flash-image".to_string(),
            label: "Gemini 2.5 Flash Image".to_string(),
        },
    ]
}

fn parse_image_models_env(raw: &str) -> Vec<ImageModelInfo> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|entry| {
            let mut parts = entry.splitn(2, '|');
            let id = parts.next().unwrap_or("").trim().to_string();
            let label = parts
                .next()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .unwrap_or_else(|| id.clone());
            ImageModelInfo { id, label }
        })
        .filter(|m| !m.id.is_empty())
        .collect()
}

fn parse_fallback_env(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub fn image_model_config() -> ImageModelConfig {
    let models = env::var("AI_IMAGE_MODELS")
        .ok()
        .map(|raw| parse_image_models_env(&raw))
        .filter(|items| !items.is_empty())
        .unwrap_or_else(default_image_models);

    let fallback_chain_from_env = env::var("AI_IMAGE_FALLBACK_CHAIN")
        .ok()
        .map(|raw| parse_fallback_env(&raw))
        .unwrap_or_default();

    let mut default_model_id = env::var("AI_IMAGE_DEFAULT_MODEL")
        .ok()
        .filter(|id| models.iter().any(|m| m.id == *id))
        .unwrap_or_else(|| models.first().map(|m| m.id.clone()).unwrap_or_default());

    if default_model_id.is_empty() && !models.is_empty() {
        default_model_id = models[0].id.clone();
    }

    let fallback_chain = if fallback_chain_from_env.is_empty() {
        models
            .iter()
            .map(|m| m.id.clone())
            .filter(|id| id != &default_model_id)
            .collect::<Vec<_>>()
    } else {
        fallback_chain_from_env
            .into_iter()
            .filter(|id| id != &default_model_id)
            .collect::<Vec<_>>()
    };

    ImageModelConfig {
        models,
        default_model_id,
        fallback_chain,
    }
}

pub fn image_model_catalog() -> ImageModelCatalog {
    let cfg = image_model_config();
    let has_api_key = env::var("GEMINI_API_KEY").is_ok();
    let models = cfg
        .models
        .into_iter()
        .map(|m| ImageModelStatus {
            id: m.id,
            label: m.label,
            available: has_api_key,
        })
        .collect::<Vec<_>>();

    ImageModelCatalog {
        models,
        default_model_id: cfg.default_model_id,
        fallback_chain: cfg.fallback_chain,
    }
}

pub async fn generate_image_bytes(
    prompt: &str,
    temperature: Option<f32>,
    cols: u32,
    rows: u32,
    aspect_ratio: Option<&str>,
) -> Result<Vec<u8>, (StatusCode, String)> {
    let model_catalog = image_model_catalog();
    let mut model_chain = Vec::new();
    if !model_catalog.default_model_id.is_empty() {
        model_chain.push(model_catalog.default_model_id);
    }
    for model_id in model_catalog.fallback_chain {
        if !model_chain.contains(&model_id) {
            model_chain.push(model_id);
        }
    }

    let mut first_error: Option<(StatusCode, String)> = None;
    for model_id in model_chain {
        match generate_image_bytes_with_model(
            prompt,
            temperature,
            cols,
            rows,
            aspect_ratio,
            &model_id,
        )
        .await
        {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                if first_error.is_none() {
                    first_error = Some(err);
                }
            }
        }
    }

    Err(first_error.unwrap_or((
        StatusCode::INTERNAL_SERVER_ERROR,
        "No configured image models available".to_string(),
    )))
}

pub async fn generate_image_bytes_with_model(
    prompt: &str,
    temperature: Option<f32>,
    cols: u32,
    rows: u32,
    aspect_ratio: Option<&str>,
    model_id: &str,
) -> Result<Vec<u8>, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_id, api_key
    );

    let client = Client::new();

    let image_size = match cols {
        1024..=2047 => "1K",
        2048..=4095 => "2K",
        4096..=u32::MAX => "4K",
        _ => "1K",
    }
    .to_string();

    let req_body = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: Some(prompt.to_string()),
                inline_data: None,
            }],
        }],
        generation_config: GenerationConfig {
            response_modalities: vec!["IMAGE".to_string()],
            temperature,
            image_config: Some(ImageConfig {
                aspect_ratio: aspect_ratio.map(|s| s.to_string()),
                image_size: Some(image_size),
            }),
        },
    };

    info!("Calling Gemini image API model={} with prompt: {}", model_id, prompt);

    let res = client
        .post(&url)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            error!("Reqwest error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    let status = res.status();
    let gemini_resp: GeminiResponse = res.json().await.map_err(|e| {
        error!("Failed to parse Gemini response: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if !status.is_success() {
        let err_msg = gemini_resp
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown API error".to_string());
        error!("Gemini API error: {}", err_msg);
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    if let Some(candidates) = gemini_resp.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                if let Some(parts) = &content.parts {
                    if let Some(part) = parts.first() {
                        if let Some(inline_data) = &part.inline_data {
                            use base64::{engine::general_purpose, Engine as _};
                            let bytes = general_purpose::STANDARD
                                .decode(&inline_data.data)
                                .map_err(|e| {
                                    error!("Failed to decode base64 image: {}", e);
                                    (
                                        StatusCode::INTERNAL_SERVER_ERROR,
                                        "Invalid base64 from Gemini".to_string(),
                                    )
                                })?;
                            return Ok(bytes);
                        }
                    }
                }
            }
        }
    }

    error!("No predictions returned from Gemini");
    Err((
        StatusCode::INTERNAL_SERVER_ERROR,
        "No predictions returned".to_string(),
    ))
}

pub async fn generate_text(prompt: &str) -> Result<String, (StatusCode, String)> {
    generate_text_with_options(prompt, 0.9).await
}

pub async fn generate_text_with_options(
    prompt: &str,
    temperature: f32,
) -> Result<String, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let req_body = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: Some(prompt.to_string()),
                inline_data: None,
            }],
        }],
        generation_config: GenerationConfig {
            response_modalities: vec!["TEXT".to_string()],
            temperature: Some(temperature),
            image_config: None,
        },
    };

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            error!("Reqwest error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    let status = res.status();
    let gemini_resp: GeminiResponse = res.json().await.map_err(|e| {
        error!("Failed to parse Gemini text response: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if !status.is_success() {
        let err_msg = gemini_resp
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown API error".to_string());
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    if let Some(candidates) = gemini_resp.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                if let Some(parts) = &content.parts {
                    if let Some(part) = parts.first() {
                        if let Some(txt) = &part.text {
                            return Ok(txt.clone());
                        }
                    }
                }
            }
        }
    }

    Err((
        StatusCode::INTERNAL_SERVER_ERROR,
        "No text generated".to_string(),
    ))
}

pub async fn generate_text_with_inline_image(
    prompt: &str,
    image_base64: &str,
    mime_type: &str,
) -> Result<String, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let req_body = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![
                GeminiPart {
                    text: Some(prompt.to_string()),
                    inline_data: None,
                },
                GeminiPart {
                    text: None,
                    inline_data: Some(GeminiInlineDataRequest {
                        mime_type: mime_type.to_string(),
                        data: image_base64.to_string(),
                    }),
                },
            ],
        }],
        generation_config: GenerationConfig {
            response_modalities: vec!["TEXT".to_string()],
            temperature: Some(0.5),
            image_config: None,
        },
    };

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            error!("Reqwest error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    let status = res.status();
    let gemini_resp: GeminiResponse = res.json().await.map_err(|e| {
        error!("Failed to parse Gemini text+image response: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if !status.is_success() {
        let err_msg = gemini_resp
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown API error".to_string());
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    if let Some(candidates) = gemini_resp.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                if let Some(parts) = &content.parts {
                    let mut output = String::new();
                    for part in parts {
                        if let Some(text) = &part.text {
                            output.push_str(text);
                        }
                    }
                    if !output.trim().is_empty() {
                        return Ok(output);
                    }
                }
            }
        }
    }

    Err((
        StatusCode::INTERNAL_SERVER_ERROR,
        "No text generated".to_string(),
    ))
}

pub async fn generate_image_edit_bytes_with_model(
    prompt: &str,
    image_base64: &str,
    mime_type: &str,
    temperature: Option<f32>,
    aspect_ratio: Option<&str>,
    model_id: &str,
) -> Result<Vec<u8>, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_id, api_key
    );

    let client = Client::new();
    let req_body = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![
                GeminiPart {
                    text: None,
                    inline_data: Some(GeminiInlineDataRequest {
                        mime_type: mime_type.to_string(),
                        data: image_base64.to_string(),
                    }),
                },
                GeminiPart {
                    text: Some(prompt.to_string()),
                    inline_data: None,
                },
            ],
        }],
        generation_config: GenerationConfig {
            response_modalities: vec!["IMAGE".to_string()],
            temperature,
            image_config: Some(ImageConfig {
                aspect_ratio: aspect_ratio.map(|s| s.to_string()),
                image_size: None,
            }),
        },
    };

    info!(
        "Calling Gemini image edit API model={} with vision input + prompt: {}",
        model_id, prompt
    );

    let res = client
        .post(&url)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| {
            error!("Reqwest error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    let status = res.status();
    let gemini_resp: GeminiResponse = res.json().await.map_err(|e| {
        error!("Failed to parse Gemini response: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if !status.is_success() {
        let err_msg = gemini_resp
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown API error".to_string());
        error!("Gemini API error: {}", err_msg);
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    if let Some(candidates) = gemini_resp.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(content) = &candidate.content {
                if let Some(parts) = &content.parts {
                    if let Some(part) = parts.first() {
                        if let Some(inline_data) = &part.inline_data {
                            use base64::{engine::general_purpose, Engine as _};
                            let bytes = general_purpose::STANDARD
                                .decode(&inline_data.data)
                                .map_err(|e| {
                                    error!("Failed to decode base64 image: {}", e);
                                    (
                                        StatusCode::INTERNAL_SERVER_ERROR,
                                        "Invalid base64 from Gemini".to_string(),
                                    )
                                })?;
                            return Ok(bytes);
                        }
                    }
                }
            }
        }
    }

    error!("No predictions returned from Gemini vision endpoint");
    Err((
        StatusCode::INTERNAL_SERVER_ERROR,
        "No predictions returned".to_string(),
    ))
}

pub async fn generate_image_edit_bytes(
    prompt: &str,
    image_base64: &str,
    mime_type: &str,
    temperature: Option<f32>,
    aspect_ratio: Option<&str>,
) -> Result<Vec<u8>, (StatusCode, String)> {
    generate_image_edit_bytes_with_model(
        prompt,
        image_base64,
        mime_type,
        temperature,
        aspect_ratio,
        "gemini-3-pro-image-preview",
    )
    .await
}
