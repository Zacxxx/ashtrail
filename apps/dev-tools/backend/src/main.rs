mod generator;

use axum::{http::StatusCode, response::IntoResponse, routing::get, routing::post, Json, Router};
use generator::{generate_world, GenerateTerrainRequest};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/terrain/generate", post(generate))
        .layer(CorsLayer::new().allow_methods(Any).allow_origin(Any).allow_headers(Any));

    let addr: SocketAddr = "127.0.0.1:8787".parse().expect("valid socket address");
    println!("dev-tools backend listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind listener");

    axum::serve(listener, app)
        .await
        .expect("server failed");
}

async fn health() -> &'static str {
    "ok"
}

async fn generate(
    Json(request): Json<GenerateTerrainRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let task = tokio::task::spawn_blocking(move || generate_world(request));

    match task.await {
        Ok(Ok(response)) => Ok(Json(response)),
        Ok(Err(err)) => Err((StatusCode::BAD_REQUEST, err)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("terrain worker task failed: {err}"),
        )),
    }
}
