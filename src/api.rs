use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use crate::config::Config;
use crate::media::library::SharedLibrary;

#[derive(Clone)]
pub struct ApiState {
    pub config: Config,
    pub library: SharedLibrary,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub friendly_name: String,
    pub total_tracks: u32,
    pub advertise_ip: String,
    pub port: u16,
    pub version: String,
}

#[derive(Serialize)]
pub struct ConfigResponse {
    pub config: Config,
}

pub async fn get_status(State(state): State<ApiState>) -> impl IntoResponse {
    let lib = state.library.read();
    Json(StatusResponse {
        friendly_name: state.config.server.friendly_name.clone(),
        total_tracks: lib.total_tracks,
        advertise_ip: state.config.effective_ip().to_string(),
        port: state.config.network.port,
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn get_config(State(state): State<ApiState>) -> impl IntoResponse {
    Json(ConfigResponse {
        config: state.config.clone(),
    })
}

pub async fn rescan(State(state): State<ApiState>) -> impl IntoResponse {
    let dirs = state.config.media.music_dirs.clone();
    let library = state.library.clone();
    tokio::task::spawn_blocking(move || {
        let new_lib = crate::media::library::scan(&dirs);
        *library.write() = new_lib;
    })
    .await
    .ok();
    StatusCode::OK
}
