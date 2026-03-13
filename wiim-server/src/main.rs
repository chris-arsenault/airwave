mod api;
mod config;
mod control;
mod media;
mod services;
mod ssdp;
mod streaming;
mod upnp;
mod wiim;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::Router;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower_http::trace::TraceLayer;
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
                .unwrap_or_else(|_| "wiim_server=info,tower_http=info".parse().unwrap()),
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

    // Control API state
    let device_manager = Arc::new(wiim::device::DeviceManager::new());
    let event_bus = control::events::EventBus::new();
    let playlist_store = Arc::new(control::playlists::PlaylistStore::new("playlists.db"));
    let queue_manager = Arc::new(control::queue::QueueManager::new());

    let control_state = control::state::ControlState {
        devices: device_manager.clone(),
        library: library.clone(),
        events: event_bus.clone(),
        playlists: playlist_store,
        queues: queue_manager.clone(),
        base_url: cfg.base_url(),
    };

    // Routes match frontend API client paths (relative to /api/)
    let control_router = Router::new()
        // Health
        .route("/health", get(control::health::health))
        // SSE events
        .route("/events", get(control::events::sse_handler))
        // Devices
        .route("/devices", get(control::devices::list_devices))
        .route("/devices/{id}", get(control::devices::get_device))
        .route("/devices/{id}/volume", post(control::devices::set_volume))
        .route("/devices/{id}/mute", post(control::devices::toggle_mute))
        .route("/devices/{id}/enabled", post(control::devices::set_enabled))
        // Playback (under /playback/{target} to match frontend)
        .route("/playback/{id}", get(control::playback::get_state))
        .route("/playback/{id}/play", post(control::playback::play))
        .route("/playback/{id}/stop", post(control::playback::stop))
        .route("/playback/{id}/pause", post(control::playback::pause))
        .route("/playback/{id}/resume", post(control::playback::resume))
        .route("/playback/{id}/next", post(control::playback::next_track))
        .route("/playback/{id}/prev", post(control::playback::prev_track))
        .route("/playback/{id}/seek", post(control::playback::seek))
        .route(
            "/playback/{id}/shuffle",
            post(control::playback::set_shuffle),
        )
        .route("/playback/{id}/repeat", post(control::playback::set_repeat))
        // Queue (under /playback/{target}/queue)
        .route(
            "/playback/{id}/queue",
            get(control::playback::get_queue).delete(control::playback::clear_queue),
        )
        .route(
            "/playback/{id}/queue/add",
            post(control::playback::add_to_queue),
        )
        .route(
            "/playback/{id}/queue/{index}",
            delete(control::playback::remove_from_queue),
        )
        // EQ / Presets
        .route("/eq/{id}/presets", get(control::eq::get_presets))
        .route("/eq/{id}/preset", post(control::eq::set_preset))
        .route("/eq/{id}/equalizer", get(control::eq::get_equalizer))
        .route("/eq/{id}/peq/presets", get(control::eq::get_peq_presets))
        .route(
            "/eq/{id}/peq/presets/{name}/load",
            post(control::eq::load_peq_preset),
        )
        // Playlists
        .route(
            "/playlists",
            get(control::playlists::list_playlists).post(control::playlists::create_playlist),
        )
        .route(
            "/playlists/{id}",
            get(control::playlists::get_playlist).delete(control::playlists::delete_playlist),
        )
        // Groups
        .route("/groups", post(control::groups::create_group))
        .route("/groups/{id}", delete(control::groups::dissolve_group))
        // Library
        .route("/library/browse", get(control::library::browse))
        .route("/library/search", get(control::library::search))
        .with_state(control_state);

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
        // Control API (routes match frontend expectations)
        .nest("/api", control_router)
        // Admin/config API (separate prefix to avoid nest collision)
        .nest("/admin", api_router)
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], cfg.network.port));
    let listener = {
        let socket = socket2::Socket::new(socket2::Domain::IPV4, socket2::Type::STREAM, None)
            .expect("failed to create TCP socket");
        socket.set_reuse_address(true).expect("SO_REUSEADDR");
        socket.set_nonblocking(true).expect("set_nonblocking");
        socket
            .bind(&socket2::SockAddr::from(bind_addr))
            .expect("failed to bind TCP socket");
        socket.listen(1024).expect("TCP listen");
        tokio::net::TcpListener::from_std(socket.into()).expect("tokio TcpListener from std")
    };
    info!("HTTP server listening on {bind_addr}");

    // Start background tasks

    // Library periodic rescan
    let scan_lib = library.clone();
    let scan_dirs = cfg.media.music_dirs.clone();
    let scan_interval = cfg.media.scan_interval_secs;
    tokio::spawn(media::library::scan_loop(
        scan_lib,
        scan_dirs,
        scan_interval,
    ));

    // SSDP advertisement (this server as a MediaServer)
    let ssdp_uuid = uuid.clone();
    let ssdp_base = cfg.base_url();
    let ssdp_ip = cfg.effective_ip();
    tokio::spawn(ssdp::run(ssdp_uuid, ssdp_base, ssdp_ip));

    // SSDP discovery (find WiiM MediaRenderer devices)
    let disc_devices = device_manager.clone();
    let disc_events = event_bus.clone();
    let disc_ip = cfg.effective_ip();
    tokio::spawn(wiim::discovery::run_discovery(
        disc_devices,
        disc_events,
        disc_ip,
        Duration::from_secs(30),
    ));

    // Playback monitor (auto-advance queue on track end)
    let mon_devices = device_manager;
    let mon_queues = queue_manager;
    let mon_events = event_bus;
    let mon_base = cfg.base_url();
    tokio::spawn(control::playback_monitor::run_playback_monitor(
        mon_devices,
        mon_queues,
        mon_events,
        mon_base,
    ));

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
