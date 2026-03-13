use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

use super::models::PresetRequest;
use super::state::ControlState;

pub async fn get_presets(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let device = state.devices.get(&device_id).ok_or(StatusCode::NOT_FOUND)?;
    let presets_str = device
        .rendering
        .list_presets()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let presets: Vec<&str> = presets_str.split(',').map(|s| s.trim()).collect();
    Ok(Json(json!({ "presets": presets })))
}

pub async fn set_preset(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<PresetRequest>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&device_id).ok_or(StatusCode::NOT_FOUND)?;
    device
        .rendering
        .select_preset(&body.preset)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    state.events.publish(
        "preset_changed",
        &json!({ "device_id": device_id, "preset": body.preset }),
    );
    Ok(StatusCode::OK)
}

pub async fn get_equalizer(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let device = state.devices.get(&device_id).ok_or(StatusCode::NOT_FOUND)?;
    let eq = device
        .rendering
        .get_equalizer()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(Json(json!({ "equalizer": eq })))
}

/// PEQ presets — WiiM devices may not support this, return empty list gracefully.
pub async fn get_peq_presets(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let _device = state.devices.get(&device_id).ok_or(StatusCode::NOT_FOUND)?;
    // WiiM Mini does not expose PEQ via UPnP SOAP — return empty.
    // Devices that support PEQ would need a custom SOAP action here.
    let empty: Vec<Value> = Vec::new();
    Ok(Json(json!({ "presets": empty })))
}

/// Load a PEQ preset by name.
pub async fn load_peq_preset(
    State(state): State<ControlState>,
    Path((device_id, _name)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let _device = state.devices.get(&device_id).ok_or(StatusCode::NOT_FOUND)?;
    // Not supported on WiiM Mini via UPnP SOAP
    Err(StatusCode::NOT_IMPLEMENTED)
}
