use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tracing::debug;

use super::events::EventBus;
use super::queue::QueueManager;
use crate::wiim::device::DeviceManager;

/// Background task that monitors playback state and auto-advances queues
/// when a track finishes.
pub async fn run_playback_monitor(
    devices: Arc<DeviceManager>,
    queues: Arc<QueueManager>,
    events: EventBus,
    base_url: String,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(2));
    let mut last_states: HashMap<String, String> = HashMap::new();

    loop {
        interval.tick().await;

        for device in devices.list_all() {
            let queue_lock = queues.get_or_create(&device.id);

            // Skip devices with empty queues
            {
                let q = queue_lock.read();
                if q.tracks().is_empty() {
                    continue;
                }
            }

            let info = match device.av_transport.get_transport_info().await {
                Ok(i) => i,
                Err(_) => continue,
            };

            let prev = last_states.get(&device.id).cloned().unwrap_or_default();
            let curr = &info.current_transport_state;

            // Detect transition from PLAYING/TRANSITIONING to STOPPED
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
    }
}
