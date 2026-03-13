use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;

use super::models::{DeviceResponse, VolumeRequest};
use super::state::ControlState;

pub async fn list_devices(State(state): State<ControlState>) -> Json<Vec<DeviceResponse>> {
    let devices = state.devices.list_all();
    Json(
        devices
            .into_iter()
            .map(|d| DeviceResponse {
                id: d.id,
                name: d.name,
                ip: d.ip,
                model: d.model,
                firmware: d.firmware,
                volume: d.volume,
                muted: d.muted,
                source: d.source,
                group_id: d.group_id,
                is_master: d.is_master,
            })
            .collect(),
    )
}

pub async fn get_device(
    State(state): State<ControlState>,
    Path(id): Path<String>,
) -> Result<Json<DeviceResponse>, StatusCode> {
    let d = state.devices.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(DeviceResponse {
        id: d.id,
        name: d.name,
        ip: d.ip,
        model: d.model,
        firmware: d.firmware,
        volume: d.volume,
        muted: d.muted,
        source: d.source,
        group_id: d.group_id,
        is_master: d.is_master,
    }))
}

pub async fn set_volume(
    State(state): State<ControlState>,
    Path(id): Path<String>,
    Json(body): Json<VolumeRequest>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    let vol = (body.volume * 100.0).round() as u32;
    device
        .rendering
        .set_volume(vol)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    state.devices.update(&id, |d| d.volume = body.volume);
    state.events.publish(
        "volume_changed",
        &serde_json::json!({ "device_id": id, "volume": body.volume }),
    );
    Ok(StatusCode::OK)
}

pub async fn toggle_mute(
    State(state): State<ControlState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let device = state.devices.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    let new_mute = !device.muted;
    device
        .rendering
        .set_mute(new_mute)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    state.devices.update(&id, |d| d.muted = new_mute);
    state.events.publish(
        "mute_changed",
        &serde_json::json!({ "device_id": id, "muted": new_mute }),
    );
    Ok(StatusCode::OK)
}
