use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tracing::debug;

use super::events::EventBus;
use super::queue::QueueManager;
use super::session::SessionManager;
use crate::media::library::{LibraryObject, SharedLibrary};
use crate::wiim::device::DeviceManager;

/// Background task that monitors playback state and auto-advances
/// sessions/queues when a track finishes.
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

    loop {
        interval.tick().await;

        for device in devices.list_all() {
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
                )
                .await;
            } else {
                handle_queue_device(&device, &queues, &base_url, &events, &mut last_states)
                    .await;
            }
        }
    }
}

async fn handle_session_device(
    device: &crate::wiim::device::WiimDevice,
    session_lock: &parking_lot::RwLock<Option<super::session::PlaySession>>,
    library: &SharedLibrary,
    base_url: &str,
    events: &EventBus,
    last_states: &mut HashMap<String, String>,
) {
    let info = match device.av_transport.get_transport_info().await {
        Ok(i) => i,
        Err(_) => return,
    };

    let prev = last_states.get(&device.id).cloned().unwrap_or_default();
    let curr = &info.current_transport_state;

    // Pre-fetch: if playing and within 5s of track end, send next URI.
    if curr == "PLAYING" {
        if let Ok(position) = device.av_transport.get_position_info().await {
            let elapsed = parse_duration(&position.rel_time);
            let duration = parse_duration(&position.track_duration);

            if duration > 0.0 && (duration - elapsed) <= 5.0 {
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
        }
    }

    // Detect track end: PLAYING/TRANSITIONING → STOPPED/NO_MEDIA_PRESENT.
    if (prev == "PLAYING" || prev == "TRANSITIONING")
        && (curr == "STOPPED" || curr == "NO_MEDIA_PRESENT")
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
                        last_states.insert(device.id.clone(), curr.clone());
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

    last_states.insert(device.id.clone(), curr.clone());
}

async fn handle_queue_device(
    device: &crate::wiim::device::WiimDevice,
    queues: &QueueManager,
    base_url: &str,
    events: &EventBus,
    last_states: &mut HashMap<String, String>,
) {
    let queue_lock = queues.get_or_create(&device.id);

    // Skip devices with empty queues.
    {
        let q = queue_lock.read();
        if q.tracks().is_empty() {
            return;
        }
    }

    let info = match device.av_transport.get_transport_info().await {
        Ok(i) => i,
        Err(_) => return,
    };

    let prev = last_states.get(&device.id).cloned().unwrap_or_default();
    let curr = &info.current_transport_state;

    // Detect transition from PLAYING/TRANSITIONING to STOPPED.
    if (prev == "PLAYING" || prev == "TRANSITIONING")
        && (curr == "STOPPED" || curr == "NO_MEDIA_PRESENT")
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

    last_states.insert(device.id.clone(), curr.clone());
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
