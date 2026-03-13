use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tracing::debug;

use super::events::EventBus;
use super::models::QueueTrackResponse;
use super::queue::QueueManager;
use super::session::SessionManager;
use crate::media::library::{LibraryObject, SharedLibrary};
use crate::wiim::device::DeviceManager;

/// Background task that monitors playback state, auto-advances
/// sessions/queues when a track finishes, and broadcasts state over SSE.
pub async fn run_playback_monitor(
    devices: Arc<DeviceManager>,
    queues: Arc<QueueManager>,
    sessions: Arc<SessionManager>,
    events: EventBus,
    base_url: String,
    library: SharedLibrary,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(2));
    let mut last_states: HashMap<String, String> = HashMap::new();
    let mut initialized: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        interval.tick().await;

        // Prune initialized set — re-sync settings if a device reconnects
        let current_device_ids: std::collections::HashSet<String> =
            devices.list_all().iter().map(|d| d.id.clone()).collect();
        initialized.retain(|id| current_device_ids.contains(id));

        for device in devices.list_all() {
            if !device.capabilities.av_transport {
                continue;
            }

            // Skip slaves — only monitor master devices (slaves follow via firmware).
            if device.group_id.is_some() && !device.is_master {
                continue;
            }

            // Phase 5: On first tick per device, sync initial transport settings.
            if initialized.insert(device.id.clone()) {
                if let Ok(settings) = device.av_transport.get_transport_settings().await {
                    let (shuffle, repeat) = parse_upnp_play_mode(&settings.play_mode);
                    // Apply to session if active, else to queue.
                    let session_lock = sessions.get_or_create(&device.id);
                    let has_session = session_lock.read().is_some();
                    if !has_session {
                        let queue = queues.get_or_create(&device.id);
                        let mut q = queue.write();
                        q.set_shuffle_mode(shuffle.to_string());
                        q.set_repeat_mode(repeat.to_string());
                    }
                    debug!(
                        "Synced initial transport settings for {}: {}",
                        device.id, settings.play_mode
                    );
                }
            }

            // Query device state once per tick.
            let transport = device.av_transport.get_transport_info().await.ok();
            let position = device.av_transport.get_position_info().await.ok();

            let transport_state = transport
                .as_ref()
                .map(|t| t.current_transport_state.clone())
                .unwrap_or_default();
            let playing = transport_state == "PLAYING";
            let elapsed = position
                .as_ref()
                .map(|p| parse_duration(&p.rel_time))
                .unwrap_or(0.0);
            let duration = position
                .as_ref()
                .map(|p| parse_duration(&p.track_duration))
                .unwrap_or(0.0);

            let session_lock = sessions.get_or_create(&device.id);
            let has_session = session_lock.read().is_some();

            if has_session {
                handle_session_device(
                    &device,
                    &session_lock,
                    &library,
                    &base_url,
                    &events,
                    &mut last_states,
                    &transport_state,
                    playing,
                    elapsed,
                    duration,
                )
                .await;
            } else {
                handle_queue_device(
                    &device,
                    &queues,
                    &base_url,
                    &events,
                    &mut last_states,
                    &transport_state,
                )
                .await;
            }

            // Phase 4: Fetch allowed transport actions for SSE broadcast.
            let allowed_actions = device
                .av_transport
                .get_current_transport_actions()
                .await
                .ok();

            // Broadcast full playback state over SSE.
            broadcast_playback_state(
                &device,
                &session_lock,
                &queues,
                &library,
                &base_url,
                &events,
                playing,
                elapsed,
                duration,
                allowed_actions.as_ref(),
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn handle_session_device(
    device: &crate::wiim::device::WiimDevice,
    session_lock: &parking_lot::RwLock<Option<super::session::PlaySession>>,
    library: &SharedLibrary,
    base_url: &str,
    events: &EventBus,
    last_states: &mut HashMap<String, String>,
    transport_state: &str,
    playing: bool,
    elapsed: f64,
    duration: f64,
) {
    let prev = last_states.get(&device.id).cloned().unwrap_or_default();

    // Pre-fetch: if playing and within 5s of track end, send next URI.
    if playing && duration > 0.0 && (duration - elapsed) <= 5.0 {
        // Resolve the next track URL while holding locks, then drop before await.
        let prefetch_url = {
            let session = session_lock.read();
            if let Some(ref s) = *session {
                if !s.is_next_sent() {
                    s.peek_next().and_then(|next_id| {
                        let lib = library.read();
                        if let Some(LibraryObject::Track(track)) = lib.get(&next_id) {
                            Some((next_id, format!("{}/media/{}", base_url, track.id)))
                        } else {
                            None
                        }
                    })
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some((next_id, url)) = prefetch_url {
            let _ = device
                .av_transport
                .set_next_av_transport_uri(&url, "")
                .await;
            let mut session = session_lock.write();
            if let Some(ref mut s) = *session {
                s.mark_next_sent();
            }
            debug!(
                "Pre-fetched next track {} for device {}",
                next_id, device.id
            );
        }
    }

    // Detect track end: PLAYING/TRANSITIONING → STOPPED/NO_MEDIA_PRESENT.
    if (prev == "PLAYING" || prev == "TRANSITIONING")
        && (transport_state == "STOPPED" || transport_state == "NO_MEDIA_PRESENT")
    {
        debug!("Track ended on device {}, advancing session", device.id);

        let next_track_id = {
            let mut session = session_lock.write();
            if let Some(ref mut s) = *session {
                s.clear_next_sent();
                s.advance()
            } else {
                None
            }
        };

        if let Some(track_id) = next_track_id {
            let stream_url = {
                let lib = library.read();
                match lib.get(&track_id) {
                    Some(LibraryObject::Track(track)) => {
                        format!("{}/media/{}", base_url, track.id)
                    }
                    _ => {
                        last_states.insert(device.id.clone(), transport_state.to_string());
                        return;
                    }
                }
            };

            if device
                .av_transport
                .set_av_transport_uri(&stream_url, "")
                .await
                .is_ok()
            {
                let _ = device.av_transport.play().await;
            }

            events.publish(
                "track_changed",
                &serde_json::json!({
                    "device_id": device.id,
                    "track": { "id": track_id }
                }),
            );
        } else {
            events.publish(
                "session_ended",
                &serde_json::json!({ "device_id": device.id }),
            );
        }
    }

    last_states.insert(device.id.clone(), transport_state.to_string());
}

async fn handle_queue_device(
    device: &crate::wiim::device::WiimDevice,
    queues: &QueueManager,
    base_url: &str,
    events: &EventBus,
    last_states: &mut HashMap<String, String>,
    transport_state: &str,
) {
    let queue_lock = queues.get_or_create(&device.id);

    // Skip devices with empty queues.
    {
        let q = queue_lock.read();
        if q.tracks().is_empty() {
            return;
        }
    }

    let prev = last_states.get(&device.id).cloned().unwrap_or_default();

    // Detect transition from PLAYING/TRANSITIONING to STOPPED.
    if (prev == "PLAYING" || prev == "TRANSITIONING")
        && (transport_state == "STOPPED" || transport_state == "NO_MEDIA_PRESENT")
    {
        debug!("Track ended on device {}, advancing queue", device.id);

        let next_track = {
            let mut q = queue_lock.write();
            q.advance().cloned()
        };

        if let Some(track) = next_track {
            let stream_url = track
                .stream_url
                .clone()
                .unwrap_or_else(|| format!("{}/media/{}", base_url, track.id));

            if device
                .av_transport
                .set_av_transport_uri(&stream_url, "")
                .await
                .is_ok()
            {
                let _ = device.av_transport.play().await;
            }

            events.publish(
                "track_changed",
                &serde_json::json!({
                    "device_id": device.id,
                    "track": {
                        "id": track.id,
                        "title": track.title,
                        "artist": track.artist,
                    }
                }),
            );
        } else {
            events.publish(
                "queue_ended",
                &serde_json::json!({ "device_id": device.id }),
            );
        }
    }

    last_states.insert(device.id.clone(), transport_state.to_string());
}

#[allow(clippy::too_many_arguments)]
fn broadcast_playback_state(
    device: &crate::wiim::device::WiimDevice,
    session_lock: &parking_lot::RwLock<Option<super::session::PlaySession>>,
    queues: &QueueManager,
    library: &SharedLibrary,
    base_url: &str,
    events: &EventBus,
    playing: bool,
    elapsed: f64,
    duration: f64,
    allowed_actions: Option<&Vec<String>>,
) {
    let session_guard = session_lock.read();
    let (current_track, pos, queue_length, shuffle_mode, repeat_mode, session_info) =
        if let Some(ref session) = *session_guard {
            let track = session.current_track_id().and_then(|tid| {
                let lib = library.read();
                if let Some(LibraryObject::Track(t)) = lib.get(tid) {
                    Some(QueueTrackResponse {
                        id: t.id.clone(),
                        title: t.meta.title.clone(),
                        artist: Some(t.meta.artist.clone()),
                        album: Some(t.meta.album.clone()),
                        duration: t.meta.duration.map(|d| format_duration(d.as_secs_f64())),
                        stream_url: Some(format!("{}/media/{}", base_url, t.id)),
                    })
                } else {
                    None
                }
            });
            let info = serde_json::json!({
                "source_id": session.source.id,
                "label": session.source.label,
                "class": session.source.class,
                "artist": session.source.artist,
                "album": session.source.album,
                "shuffle_mode": session.shuffle_mode,
                "repeat_mode": session.repeat_mode,
                "total_tracks": session.total_tracks(),
                "position": session.flat_position(),
            });
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
            let queue = queues.get_or_create(&device.id);
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

    events.publish(
        "playback_state",
        &serde_json::json!({
            "target_id": device.id,
            "playing": playing,
            "current_track": current_track,
            "position": pos,
            "queue_length": queue_length,
            "shuffle_mode": shuffle_mode,
            "repeat_mode": repeat_mode,
            "elapsed_seconds": elapsed,
            "duration_seconds": duration,
            "session": session_info,
            "allowed_actions": allowed_actions,
        }),
    );
}

fn format_duration(seconds: f64) -> String {
    let total = seconds as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// Map UPnP PlayMode to app shuffle/repeat modes.
fn parse_upnp_play_mode(mode: &str) -> (&str, &str) {
    match mode {
        "SHUFFLE" | "SHUFFLE_NOREPEAT" | "RANDOM" => ("on", "off"),
        "REPEAT_ONE" => ("off", "track"),
        "REPEAT_ALL" => ("off", "all"),
        "SHUFFLE_REPEAT_ALL" => ("on", "all"),
        _ => ("off", "off"), // NORMAL or unknown
    }
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
