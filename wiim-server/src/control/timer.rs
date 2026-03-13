use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use parking_lot::Mutex;
use tokio::task::JoinHandle;
use tokio::time::Instant;

use super::models::{SleepTimerRequest, SleepTimerResponse};
use super::state::ControlState;

#[derive(Clone)]
pub struct SleepTimerManager {
    inner: Arc<Mutex<HashMap<String, TimerEntry>>>,
}

struct TimerEntry {
    expires_at: Instant,
    handle: JoinHandle<()>,
}

impl Default for SleepTimerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SleepTimerManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set(&self, device_id: String, minutes: u32, state: ControlState) {
        let duration = std::time::Duration::from_secs(minutes as u64 * 60);
        let expires_at = Instant::now() + duration;

        // Cancel existing timer for this device
        self.cancel(&device_id);

        let mgr = self.clone();
        let did = device_id.clone();
        let handle = tokio::spawn(async move {
            tokio::time::sleep(duration).await;
            // Timer expired — stop playback
            if let Some(device) = state.devices.get(&did) {
                let _ = device.av_transport.stop().await;
            }
            state.events.publish(
                "sleep_timer_expired",
                &serde_json::json!({ "device_id": did }),
            );
            mgr.inner.lock().remove(&did);
        });

        self.inner
            .lock()
            .insert(device_id, TimerEntry { expires_at, handle });
    }

    pub fn cancel(&self, device_id: &str) {
        if let Some(entry) = self.inner.lock().remove(device_id) {
            entry.handle.abort();
        }
    }

    pub fn remaining_seconds(&self, device_id: &str) -> Option<u64> {
        let lock = self.inner.lock();
        lock.get(device_id).map(|entry| {
            let now = Instant::now();
            if entry.expires_at > now {
                (entry.expires_at - now).as_secs()
            } else {
                0
            }
        })
    }
}

pub async fn set_sleep_timer(
    State(state): State<ControlState>,
    Path(id): Path<String>,
    Json(body): Json<SleepTimerRequest>,
) -> Result<StatusCode, StatusCode> {
    if !state.devices.contains(&id) {
        return Err(StatusCode::NOT_FOUND);
    }
    state.sleep_timers.set(id, body.minutes, state.clone());
    Ok(StatusCode::OK)
}

pub async fn get_sleep_timer(
    State(state): State<ControlState>,
    Path(id): Path<String>,
) -> Result<Json<SleepTimerResponse>, StatusCode> {
    if !state.devices.contains(&id) {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(SleepTimerResponse {
        remaining_seconds: state.sleep_timers.remaining_seconds(&id),
    }))
}

pub async fn cancel_sleep_timer(
    State(state): State<ControlState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    if !state.devices.contains(&id) {
        return Err(StatusCode::NOT_FOUND);
    }
    state.sleep_timers.cancel(&id);
    Ok(StatusCode::OK)
}
