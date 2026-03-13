use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;

use super::models::CreateGroupRequest;
use super::state::ControlState;

pub async fn create_group(
    State(state): State<ControlState>,
    Json(body): Json<CreateGroupRequest>,
) -> Result<StatusCode, StatusCode> {
    let master = state
        .devices
        .get(&body.master_id)
        .ok_or(StatusCode::NOT_FOUND)?;

    // Build master info string — the slave needs this to join the group.
    // Format is typically the master's IP or UUID, depending on firmware.
    let master_info = format!("{}:{}", master.ip, master.port);

    for slave_id in &body.slave_ids {
        let slave = state.devices.get(slave_id).ok_or(StatusCode::NOT_FOUND)?;
        slave
            .rendering
            .multiroom_join_group(&master_info)
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;
    }

    // Mark master
    state.devices.update(&body.master_id, |d| {
        d.is_master = true;
        d.group_id = Some(body.master_id.clone());
    });
    for slave_id in &body.slave_ids {
        state.devices.update(slave_id, |d| {
            d.group_id = Some(body.master_id.clone());
        });
    }

    Ok(StatusCode::OK)
}

pub async fn dissolve_group(
    State(state): State<ControlState>,
    Path(master_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Find all devices in this group and have them leave
    let devices = state.devices.list_all();
    for device in &devices {
        if device.group_id.as_deref() == Some(&master_id) && device.id != master_id {
            device
                .rendering
                .multiroom_leave_group()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;
            state.devices.update(&device.id, |d| {
                d.group_id = None;
            });
        }
    }

    state.devices.update(&master_id, |d| {
        d.is_master = false;
        d.group_id = None;
    });

    Ok(StatusCode::OK)
}
