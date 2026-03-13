use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;

use crate::media::library::LibraryObject;

use super::models::{
    PlayRequest, PlaybackStateResponse, QueueAddRequest, QueueStateResponse, QueueTrackResponse,
    RepeatModeRequest, SeekRequest, SessionInfoResponse, SessionPlayRequest, ShuffleModeRequest,
};
use super::session::{PlaySession, RepeatMode, ShuffleMode};
use super::state::ControlState;

pub async fn get_state(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<Json<PlaybackStateResponse>, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;

    // Use standard UPnP actions that work with any MediaRenderer
    let (playing, elapsed, duration) = if device.capabilities.av_transport {
        let transport = device.av_transport.get_transport_info().await.ok();
        let position = device.av_transport.get_position_info().await.ok();

        let playing = transport
            .as_ref()
            .map(|t| t.current_transport_state == "PLAYING")
            .unwrap_or(false);
        let elapsed = position
            .as_ref()
            .map(|p| parse_duration(&p.rel_time))
            .unwrap_or(0.0);
        let dur = position
            .as_ref()
            .map(|p| parse_duration(&p.track_duration))
            .unwrap_or(0.0);

        (playing, elapsed, dur)
    } else {
        (false, 0.0, 0.0)
    };

    // Check for active session first, fall back to queue.
    let session_lock = state.sessions.get_or_create(&target);
    let session_guard = session_lock.read();
    let (current_track, position, queue_length, shuffle_mode, repeat_mode, session_info) =
        if let Some(ref session) = *session_guard {
            let track = session.current_track_id().and_then(|tid| {
                let library = state.library.read();
                if let Some(LibraryObject::Track(t)) = library.get(tid) {
                    Some(QueueTrackResponse {
                        id: t.id.clone(),
                        title: t.meta.title.clone(),
                        artist: Some(t.meta.artist.clone()),
                        album: Some(t.meta.album.clone()),
                        duration: t
                            .meta
                            .duration
                            .map(|d| format_duration(d.as_secs_f64())),
                        stream_url: Some(format!("{}/media/{}", state.base_url, t.id)),
                    })
                } else {
                    None
                }
            });
            let info = session_to_info(session);
            (
                track,
                session.flat_position(),
                session.total_tracks(),
                serde_json::to_value(session.shuffle_mode)
                    .ok()
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "off".to_string()),
                serde_json::to_value(session.repeat_mode)
                    .ok()
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "off".to_string()),
                Some(info),
            )
        } else {
            let queue = state.queues.get_or_create(&target);
            let q = queue.read();
            (
                q.current().cloned(),
                q.position(),
                q.tracks().len(),
                q.shuffle_mode().to_string(),
                q.repeat_mode().to_string(),
                None,
            )
        };
    drop(session_guard);

    Ok(Json(PlaybackStateResponse {
        target_id: target,
        playing,
        current_track,
        position,
        queue_length,
        shuffle_mode,
        repeat_mode,
        elapsed_seconds: elapsed,
        duration_seconds: duration,
        session: session_info,
    }))
}

pub async fn play(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<PlayRequest>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    let start_index = body.start_index.unwrap_or(0);

    // Resolve track IDs from the request — supports single track, multiple tracks, or container
    let resolved_ids = {
        let library = state.library.read();
        resolve_track_ids(&body, &library)
    };

    if resolved_ids.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let tracks = {
        let library = state.library.read();
        resolved_ids
            .iter()
            .filter_map(|id| {
                if let Some(LibraryObject::Track(track)) = library.get(id) {
                    Some(QueueTrackResponse {
                        id: track.id.clone(),
                        title: track.meta.title.clone(),
                        artist: Some(track.meta.artist.clone()),
                        album: Some(track.meta.album.clone()),
                        duration: track
                            .meta
                            .duration
                            .map(|d| format_duration(d.as_secs_f64())),
                        stream_url: Some(format!("{}/media/{}", state.base_url, track.id)),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    };

    if tracks.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let queue = state.queues.get_or_create(&target);
    {
        let mut q = queue.write();
        q.set_tracks(tracks, start_index);
    }

    // Play the first track — extract URL before await to avoid holding guard across await
    let stream_url = {
        let q = queue.read();
        q.current().and_then(|t| t.stream_url.clone())
    };

    if let Some(url) = stream_url {
        device
            .av_transport
            .set_av_transport_uri(&url, "")
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;
        device
            .av_transport
            .play()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;
    }

    state.events.publish(
        "playback_started",
        &serde_json::json!({ "device_id": target }),
    );

    Ok(StatusCode::OK)
}

/// Resolve a PlayRequest into a flat list of track IDs.
fn resolve_track_ids(body: &PlayRequest, library: &crate::media::library::Library) -> Vec<String> {
    // Prefer track_ids if provided
    if let Some(ref ids) = body.track_ids {
        if !ids.is_empty() {
            return ids.clone();
        }
    }

    // Single track_id
    if let Some(ref id) = body.track_id {
        return vec![id.clone()];
    }

    // Container — collect all tracks recursively
    if let Some(ref container_id) = body.container_id {
        let mut track_ids = Vec::new();
        collect_tracks_recursive(library, container_id, &mut track_ids);
        return track_ids;
    }

    Vec::new()
}

/// Recursively collect all track IDs from a container.
fn collect_tracks_recursive(
    library: &crate::media::library::Library,
    container_id: &str,
    out: &mut Vec<String>,
) {
    for child in library.children_of(container_id) {
        match child {
            LibraryObject::Track(t) => out.push(t.id.clone()),
            LibraryObject::Container(c) => collect_tracks_recursive(library, &c.id, out),
        }
    }
}

pub async fn stop(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    device
        .av_transport
        .stop()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    state.events.publish(
        "playback_stopped",
        &serde_json::json!({ "device_id": target }),
    );
    Ok(StatusCode::OK)
}

pub async fn pause(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    device
        .av_transport
        .pause()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(StatusCode::OK)
}

pub async fn resume(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    device
        .av_transport
        .play()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(StatusCode::OK)
}

pub async fn next_track(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    device
        .av_transport
        .next()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(StatusCode::OK)
}

pub async fn prev_track(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    device
        .av_transport
        .previous()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(StatusCode::OK)
}

pub async fn seek(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<SeekRequest>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;
    let target_time = format_duration(body.position_seconds);
    device
        .av_transport
        .seek(&target_time)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(StatusCode::OK)
}

pub async fn set_shuffle(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<ShuffleModeRequest>,
) -> Result<StatusCode, StatusCode> {
    let queue = state.queues.get_or_create(&target);
    queue.write().set_shuffle_mode(body.mode);
    Ok(StatusCode::OK)
}

pub async fn set_repeat(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<RepeatModeRequest>,
) -> Result<StatusCode, StatusCode> {
    let queue = state.queues.get_or_create(&target);
    queue.write().set_repeat_mode(body.mode);
    Ok(StatusCode::OK)
}

pub async fn get_queue(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Json<QueueStateResponse> {
    let queue = state.queues.get_or_create(&target);
    let q = queue.read();
    Json(QueueStateResponse {
        tracks: q.tracks().to_vec(),
        position: q.position(),
    })
}

pub async fn add_to_queue(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<QueueAddRequest>,
) -> StatusCode {
    let library = state.library.read();
    let mut tracks = Vec::new();
    for id in &body.track_ids {
        if let Some(LibraryObject::Track(track)) = library.get(id) {
            tracks.push(QueueTrackResponse {
                id: track.id.clone(),
                title: track.meta.title.clone(),
                artist: Some(track.meta.artist.clone()),
                album: Some(track.meta.album.clone()),
                duration: track
                    .meta
                    .duration
                    .map(|d| format_duration(d.as_secs_f64())),
                stream_url: None,
            });
        }
    }
    drop(library);

    let queue = state.queues.get_or_create(&target);
    queue.write().add_tracks(tracks, &body.position);
    StatusCode::OK
}

pub async fn remove_from_queue(
    State(state): State<ControlState>,
    Path((target, index)): Path<(String, usize)>,
) -> StatusCode {
    let queue = state.queues.get_or_create(&target);
    queue.write().remove_track(index);
    StatusCode::OK
}

pub async fn clear_queue(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> StatusCode {
    let queue = state.queues.get_or_create(&target);
    queue.write().clear();
    StatusCode::OK
}

fn parse_duration(s: &str) -> f64 {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        3 => {
            let h: f64 = parts[0].parse().unwrap_or(0.0);
            let m: f64 = parts[1].parse().unwrap_or(0.0);
            let s: f64 = parts[2].parse().unwrap_or(0.0);
            h * 3600.0 + m * 60.0 + s
        }
        2 => {
            let m: f64 = parts[0].parse().unwrap_or(0.0);
            let s: f64 = parts[1].parse().unwrap_or(0.0);
            m * 60.0 + s
        }
        _ => s.parse().unwrap_or(0.0),
    }
}

fn format_duration(seconds: f64) -> String {
    let total = seconds as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn session_to_info(session: &PlaySession) -> SessionInfoResponse {
    SessionInfoResponse {
        source_id: session.source.id.clone(),
        label: session.source.label.clone(),
        class: session.source.class.clone(),
        artist: session.source.artist.clone(),
        album: session.source.album.clone(),
        shuffle_mode: serde_json::to_value(session.shuffle_mode)
            .ok()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "off".to_string()),
        repeat_mode: serde_json::to_value(session.repeat_mode)
            .ok()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "off".to_string()),
        total_tracks: session.total_tracks(),
        position: session.flat_position(),
    }
}

// === Session-based playback endpoints ===

pub async fn session_play(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<SessionPlayRequest>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;

    let session = {
        let library = state.library.read();
        PlaySession::new(
            &body.source_id,
            body.start_track_id.as_deref(),
            &library,
        )
    };

    let session = session.ok_or(StatusCode::BAD_REQUEST)?;

    let track_id = session
        .current_track_id()
        .map(|s| s.to_string())
        .ok_or(StatusCode::BAD_REQUEST)?;

    let stream_url = {
        let library = state.library.read();
        match library.get(&track_id) {
            Some(LibraryObject::Track(t)) => {
                format!("{}/media/{}", state.base_url, t.id)
            }
            _ => return Err(StatusCode::BAD_REQUEST),
        }
    };

    let info = session_to_info(&session);

    // Store session, clear queue for this device (mutual exclusion).
    {
        let lock = state.sessions.get_or_create(&target);
        *lock.write() = Some(session);
    }
    {
        let queue = state.queues.get_or_create(&target);
        queue.write().clear();
    }

    // Start playback on device.
    device
        .av_transport
        .set_av_transport_uri(&stream_url, "")
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    device
        .av_transport
        .play()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    state.events.publish(
        "session_started",
        &serde_json::json!({
            "device_id": target,
            "session": info,
            "track": { "id": track_id }
        }),
    );

    Ok(StatusCode::OK)
}

pub async fn session_next(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;

    let next_track_id = {
        let lock = state.sessions.get_or_create(&target);
        let mut guard = lock.write();
        match guard.as_mut() {
            Some(session) => session.advance(),
            None => return Err(StatusCode::NOT_FOUND),
        }
    };

    match next_track_id {
        Some(track_id) => {
            let stream_url = {
                let library = state.library.read();
                match library.get(&track_id) {
                    Some(LibraryObject::Track(t)) => {
                        format!("{}/media/{}", state.base_url, t.id)
                    }
                    _ => return Err(StatusCode::INTERNAL_SERVER_ERROR),
                }
            };

            device
                .av_transport
                .set_av_transport_uri(&stream_url, "")
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;
            device
                .av_transport
                .play()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            state.events.publish(
                "track_changed",
                &serde_json::json!({
                    "device_id": target,
                    "track": { "id": track_id }
                }),
            );
            Ok(StatusCode::OK)
        }
        None => {
            state.events.publish(
                "session_ended",
                &serde_json::json!({ "device_id": target }),
            );
            Ok(StatusCode::OK)
        }
    }
}

pub async fn session_prev(
    State(state): State<ControlState>,
    Path(target): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&target).ok_or(StatusCode::NOT_FOUND)?;

    let prev_track_id = {
        let lock = state.sessions.get_or_create(&target);
        let mut guard = lock.write();
        match guard.as_mut() {
            Some(session) => session.go_back(),
            None => return Err(StatusCode::NOT_FOUND),
        }
    };

    if let Some(track_id) = prev_track_id {
        let stream_url = {
            let library = state.library.read();
            match library.get(&track_id) {
                Some(LibraryObject::Track(t)) => format!("{}/media/{}", state.base_url, t.id),
                _ => return Err(StatusCode::INTERNAL_SERVER_ERROR),
            }
        };

        device
            .av_transport
            .set_av_transport_uri(&stream_url, "")
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;
        device
            .av_transport
            .play()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;

        state.events.publish(
            "track_changed",
            &serde_json::json!({
                "device_id": target,
                "track": { "id": track_id }
            }),
        );
    }

    Ok(StatusCode::OK)
}

pub async fn session_set_shuffle(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<ShuffleModeRequest>,
) -> Result<StatusCode, StatusCode> {
    let mode: ShuffleMode =
        serde_json::from_value(serde_json::Value::String(body.mode)).map_err(|_| StatusCode::BAD_REQUEST)?;
    let lock = state.sessions.get_or_create(&target);
    let mut guard = lock.write();
    match guard.as_mut() {
        Some(session) => {
            session.set_shuffle(mode);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn session_set_repeat(
    State(state): State<ControlState>,
    Path(target): Path<String>,
    Json(body): Json<RepeatModeRequest>,
) -> Result<StatusCode, StatusCode> {
    let mode: RepeatMode =
        serde_json::from_value(serde_json::Value::String(body.mode)).map_err(|_| StatusCode::BAD_REQUEST)?;
    let lock = state.sessions.get_or_create(&target);
    let mut guard = lock.write();
    match guard.as_mut() {
        Some(session) => {
            session.set_repeat(mode);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}
