use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;

use super::state::ControlState;

pub async fn health(State(state): State<ControlState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "collector": {
            "connected": state.collector_ready.load(Ordering::Relaxed),
        }
    }))
}
