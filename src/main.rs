mod api;
mod config;
mod media;
mod services;
mod ssdp;
mod streaming;
mod upnp;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use std::net::SocketAddr;
use tracing::{error, info};

#[derive(Clone)]
struct AppState {
    config: config::Config,
    library: media::library::SharedLibrary,
    uuid: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wiim_dlna=info".parse().unwrap()),
        )
        .init();

    let config_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "config.toml".to_string());

    let cfg = match config::Config::load(&config_path) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to load config from {config_path}: {e}");
            std::process::exit(1);
        }
    };

    info!(
        "Starting {} on {}:{}",
        cfg.server.friendly_name,
        cfg.effective_ip(),
        cfg.network.port
    );

    // Generate a stable UUID based on friendly name (deterministic across restarts)
    let uuid = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_DNS,
        cfg.server.friendly_name.as_bytes(),
    )
    .to_string();

    let library = media::library::new_shared();

    // Initial scan
    {
        let dirs = cfg.media.music_dirs.clone();
        let lib = library.clone();
        let new_lib = tokio::task::spawn_blocking(move || media::library::scan(&dirs))
            .await
            .expect("initial scan panicked");
        *lib.write() = new_lib;
    }

    let state = AppState {
        config: cfg.clone(),
        library: library.clone(),
        uuid: uuid.clone(),
    };

    let api_state = api::ApiState {
        config: cfg.clone(),
        library: library.clone(),
    };

    let api_router = Router::new()
        .route("/status", get(api::get_status))
        .route("/config", get(api::get_config))
        .route("/rescan", post(api::rescan))
        .with_state(api_state);

    let app = Router::new()
        // UPnP device/service descriptions
        .route("/device.xml", get(device_description))
        .route("/ContentDirectory.xml", get(content_directory_scpd))
        .route("/ConnectionManager.xml", get(connection_manager_scpd))
        // SOAP control endpoints
        .route("/control/ContentDirectory", post(control_content_directory))
        .route(
            "/control/ConnectionManager",
            post(control_connection_manager),
        )
        // Event subscription (minimal stub)
        .route("/event/ContentDirectory", get(event_stub))
        .route("/event/ConnectionManager", get(event_stub))
        // Media streaming
        .route("/media/{id}", get(stream_media))
        // Admin/config API
        .nest("/api", api_router)
        .with_state(state);

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], cfg.network.port));
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .expect("failed to bind TCP listener");
    info!("HTTP server listening on {bind_addr}");

    // Start background tasks
    let scan_lib = library.clone();
    let scan_dirs = cfg.media.music_dirs.clone();
    let scan_interval = cfg.media.scan_interval_secs;
    tokio::spawn(media::library::scan_loop(
        scan_lib,
        scan_dirs,
        scan_interval,
    ));

    let ssdp_uuid = uuid.clone();
    let ssdp_base = cfg.base_url();
    let ssdp_ip = cfg.effective_ip();
    tokio::spawn(ssdp::run(ssdp_uuid, ssdp_base, ssdp_ip));

    axum::serve(listener, app)
        .await
        .expect("HTTP server failed");
}

async fn device_description(State(state): State<AppState>) -> impl IntoResponse {
    let xml = upnp::xml::device_description(
        &state.uuid,
        &state.config.server.friendly_name,
        &state.config.base_url(),
    );
    Response::builder()
        .header(header::CONTENT_TYPE, "text/xml; charset=utf-8")
        .body(Body::from(xml))
        .unwrap()
}

async fn content_directory_scpd() -> impl IntoResponse {
    Response::builder()
        .header(header::CONTENT_TYPE, "text/xml; charset=utf-8")
        .body(Body::from(upnp::xml::content_directory_scpd()))
        .unwrap()
}

async fn connection_manager_scpd() -> impl IntoResponse {
    Response::builder()
        .header(header::CONTENT_TYPE, "text/xml; charset=utf-8")
        .body(Body::from(upnp::xml::connection_manager_scpd()))
        .unwrap()
}

async fn control_content_directory(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    handle_soap_control(&headers, &body, |action| {
        services::content_directory::handle_action(action, &state.library, &state.config.base_url())
    })
}

async fn control_connection_manager(
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    handle_soap_control(&headers, &body, |action| {
        services::connection_manager::handle_action(action)
    })
}

fn handle_soap_control(
    headers: &HeaderMap,
    body: &[u8],
    handler: impl FnOnce(&upnp::soap::SoapAction) -> Result<(String, u16), (String, u16)>,
) -> Response {
    let soap_action = headers
        .get("SOAPAction")
        .or_else(|| headers.get("soapaction"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    match upnp::soap::parse_soap_action(soap_action, body) {
        Ok(action) => {
            let (xml, status) = match handler(&action) {
                Ok(r) => r,
                Err(r) => r,
            };
            Response::builder()
                .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR))
                .header(header::CONTENT_TYPE, "text/xml; charset=utf-8")
                .body(Body::from(xml))
                .unwrap()
        }
        Err(e) => {
            let fault = upnp::soap::soap_fault("s:Client", "UPnPError", 401, &e);
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "text/xml; charset=utf-8")
                .body(Body::from(fault))
                .unwrap()
        }
    }
}

async fn event_stub() -> impl IntoResponse {
    StatusCode::OK
}

async fn stream_media(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let path = {
        let lib = state.library.read();
        match lib.get(&id) {
            Some(media::library::LibraryObject::Track(track)) => track.path.clone(),
            _ => return StatusCode::NOT_FOUND.into_response(),
        }
    };
    streaming::serve_file(&path, &headers).await
}
