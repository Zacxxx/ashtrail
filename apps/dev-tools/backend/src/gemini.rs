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

pub async fn generate_image_bytes(prompt: &str, temperature: Option<f32>, cols: u32, rows: u32, aspect_ratio: Option<&str>) -> Result<Vec<u8>, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={}",
        api_key
    );

    let client = Client::new();
    
    let image_size = match cols {
        1024..=2047 => "1K",
        2048..=4095 => "2K",
        4096..=u32::MAX => "4K",
        _ => "1K",
    }.to_string();

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

    info!("Calling Gemini Imagen 3 API with prompt: {}", prompt);

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
                            let bytes = general_purpose::STANDARD.decode(&inline_data.data).map_err(|e| {
                                error!("Failed to decode base64 image: {}", e);
                                (StatusCode::INTERNAL_SERVER_ERROR, "Invalid base64 from Gemini".to_string())
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
            temperature: Some(0.9), // Higher variance
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

pub async fn generate_image_edit_bytes(prompt: &str, image_base64: &str, mime_type: &str, temperature: Option<f32>, aspect_ratio: Option<&str>) -> Result<Vec<u8>, (StatusCode, String)> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| {
        let msg = "GEMINI_API_KEY environment variable not set";
        error!(msg);
        (StatusCode::INTERNAL_SERVER_ERROR, msg.to_string())
    })?;

    // Use the 3 pro active image preview model (or edit endpoint if we want)
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={}",
        api_key
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

    info!("Calling Gemini Imagen API with vision input + prompt: {}", prompt);

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
                            let bytes = general_purpose::STANDARD.decode(&inline_data.data).map_err(|e| {
                                error!("Failed to decode base64 image: {}", e);
                                (StatusCode::INTERNAL_SERVER_ERROR, "Invalid base64 from Gemini".to_string())
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
