use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;

use super::models::{DeviceCapabilitiesResponse, DeviceResponse, SetEnabledRequest, VolumeRequest};
use super::state::ControlState;

fn device_to_response(d: &crate::wiim::device::WiimDevice) -> DeviceResponse {
    DeviceResponse {
        id: d.id.clone(),
        name: d.name.clone(),
        ip: d.ip.clone(),
        model: d.model.clone(),
        firmware: d.firmware.clone(),
        device_type: d.device_type.clone(),
        enabled: d.enabled,
        capabilities: DeviceCapabilitiesResponse {
            av_transport: d.capabilities.av_transport,
            rendering_control: d.capabilities.rendering_control,
            wiim_extended: d.capabilities.wiim_extended,
        },
        volume: d.volume,
        muted: d.muted,
        source: d.source.clone(),
        group_id: d.group_id.clone(),
        is_master: d.is_master,
    }
}

pub async fn list_devices(State(state): State<ControlState>) -> Json<Vec<DeviceResponse>> {
    let devices = state.devices.list_all();
    Json(devices.iter().map(device_to_response).collect())
}

pub async fn get_device(
    State(state): State<ControlState>,
    Path(id): Path<String>,
) -> Result<Json<DeviceResponse>, StatusCode> {
    let d = state.devices.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(device_to_response(&d)))
}

pub async fn set_enabled(
    State(state): State<ControlState>,
    Path(id): Path<String>,
    Json(body): Json<SetEnabledRequest>,
) -> Result<StatusCode, StatusCode> {
    if !state.devices.contains(&id) {
        return Err(StatusCode::NOT_FOUND);
    }
    state.devices.update(&id, |d| d.enabled = body.enabled);
    state.device_config.save_enabled(&id, body.enabled);
    state.events.publish(
        "device_state",
        &serde_json::json!({ "device_id": id, "enabled": body.enabled }),
    );
    Ok(StatusCode::OK)
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
