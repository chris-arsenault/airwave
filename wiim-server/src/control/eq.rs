use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use tracing::debug;

use super::models::{
    BalanceRequest, CrossfadeRequest, EqBandRequest, PresetRequest, SavePresetRequest,
    SourceRequest,
};
use super::state::ControlState;
use crate::wiim::https_api::HttpsApiClient;

/// Helper: get the HTTPS API client for a device, or 501 if unavailable.
fn get_https_client(state: &ControlState, device_id: &str) -> Result<HttpsApiClient, StatusCode> {
    let device = state.devices.get(device_id).ok_or(StatusCode::NOT_FOUND)?;
    device
        .https_client
        .clone()
        .ok_or(StatusCode::NOT_IMPLEMENTED)
}

/// GET /api/eq/{id}/state — full EQ state (bands, enabled, preset name)
pub async fn get_eq_state(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let eq_state = client.eq_get_band().await.map_err(|e| {
        debug!("EQ get_band failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(Json(serde_json::to_value(eq_state).unwrap()))
}

/// GET /api/eq/{id}/presets — list of preset names
pub async fn get_eq_presets(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let presets = client.eq_get_list().await.map_err(|e| {
        debug!("EQ get_list failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(Json(json!({ "presets": presets })))
}

/// POST /api/eq/{id}/load — load a preset by name
pub async fn load_eq_preset(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<PresetRequest>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let eq_state = client.eq_load(&body.preset).await.map_err(|e| {
        debug!("EQ load '{}' failed for {}: {}", body.preset, device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    state.events.publish(
        "eq_changed",
        &json!({ "device_id": device_id, "preset": body.preset }),
    );
    Ok(Json(serde_json::to_value(eq_state).unwrap()))
}

/// POST /api/eq/{id}/enable
pub async fn enable_eq(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.eq_on().await.map_err(|e| {
        debug!("EQ on failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    state.events.publish(
        "eq_changed",
        &json!({ "device_id": device_id, "enabled": true }),
    );
    Ok(StatusCode::OK)
}

/// POST /api/eq/{id}/disable
pub async fn disable_eq(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.eq_off().await.map_err(|e| {
        debug!("EQ off failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    state.events.publish(
        "eq_changed",
        &json!({ "device_id": device_id, "enabled": false }),
    );
    Ok(StatusCode::OK)
}

/// POST /api/eq/{id}/band — set a single band value
pub async fn set_eq_band(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<EqBandRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client
        .eq_set_band(body.index, body.value)
        .await
        .map_err(|e| {
            debug!("EQ set_band failed for {}: {}", device_id, e);
            StatusCode::BAD_GATEWAY
        })?;
    Ok(StatusCode::OK)
}

/// POST /api/eq/{id}/save — save current EQ as a named preset
pub async fn save_eq_preset(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<SavePresetRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.eq_save(&body.name).await.map_err(|e| {
        debug!("EQ save '{}' failed for {}: {}", body.name, device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(StatusCode::OK)
}

/// DELETE /api/eq/{id}/presets/{name} — delete a user preset
pub async fn delete_eq_preset(
    State(state): State<ControlState>,
    Path((device_id, name)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.eq_del(&name).await.map_err(|e| {
        debug!("EQ delete '{}' failed for {}: {}", name, device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(StatusCode::OK)
}

/// GET /api/eq/{id}/balance
pub async fn get_balance(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let balance = client.get_channel_balance().await.map_err(|e| {
        debug!("Get balance failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(Json(json!({ "balance": balance })))
}

/// POST /api/eq/{id}/balance
pub async fn set_balance(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<BalanceRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client
        .set_channel_balance(body.balance)
        .await
        .map_err(|e| {
            debug!("Set balance failed for {}: {}", device_id, e);
            StatusCode::BAD_GATEWAY
        })?;
    Ok(StatusCode::OK)
}

/// GET /api/eq/{id}/crossfade
pub async fn get_crossfade(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let enabled = client.get_crossfade().await.map_err(|e| {
        debug!("Get crossfade failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(Json(json!({ "enabled": enabled })))
}

/// POST /api/eq/{id}/crossfade
pub async fn set_crossfade(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<CrossfadeRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.set_crossfade(body.enabled).await.map_err(|e| {
        debug!("Set crossfade failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(StatusCode::OK)
}

/// POST /api/devices/{id}/source — switch input source
pub async fn set_source(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
    Json(body): Json<SourceRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    client.switch_source(&body.source).await.map_err(|e| {
        debug!("Switch source failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    state.events.publish(
        "device_changed",
        &json!({ "device_id": device_id, "source": body.source }),
    );
    Ok(StatusCode::OK)
}

/// GET /api/devices/{id}/wifi — WiFi signal info
pub async fn get_wifi_status(
    State(state): State<ControlState>,
    Path(device_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = get_https_client(&state, &device_id)?;
    let status = client.get_status_ex().await.map_err(|e| {
        debug!("getStatusEx failed for {}: {}", device_id, e);
        StatusCode::BAD_GATEWAY
    })?;
    Ok(Json(serde_json::to_value(status).unwrap()))
}
