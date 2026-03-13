use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use tracing::{debug, error, info};

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

    info!(
        "Creating group: master={} ({}) with {} slave(s)",
        master.name,
        master.id,
        body.slave_ids.len()
    );

    // Build master info string for the WiiM multiroom SOAP call.
    let master_info = format!("{}:{}", master.ip, master.port);
    debug!(
        "MultiRoomJoinGroup master_info='{}' for master {} ({})",
        master_info, master.name, master.id
    );

    for slave_id in &body.slave_ids {
        let slave = state.devices.get(slave_id).ok_or(StatusCode::NOT_FOUND)?;
        debug!(
            "Sending MultiRoomJoinGroup to slave {} ({}) at {}:{}",
            slave.name, slave.id, slave.ip, slave.port
        );

        match slave.rendering.multiroom_join_group(&master_info).await {
            Ok(()) => {
                info!(
                    "MultiRoomJoinGroup succeeded for slave {} ({})",
                    slave.name, slave.id
                );
            }
            Err(e) => {
                error!(
                    "MultiRoomJoinGroup FAILED for slave {} ({}): {:?}",
                    slave.name, slave.id, e
                );
                return Err(StatusCode::BAD_GATEWAY);
            }
        }
    }

    // Update in-memory state.
    state.devices.update(&body.master_id, |d| {
        d.is_master = true;
        d.group_id = Some(body.master_id.clone());
    });
    for slave_id in &body.slave_ids {
        state.devices.update(slave_id, |d| {
            d.group_id = Some(body.master_id.clone());
        });
    }

    // Persist group to SQLite.
    state
        .device_config
        .save_group(&body.master_id, Some(&body.master_id), true);
    for slave_id in &body.slave_ids {
        state
            .device_config
            .save_group(slave_id, Some(&body.master_id), false);
    }

    // Push updated device list to all frontends.
    publish_devices_changed(&state);

    info!(
        "Group created: master={}, slaves={:?}",
        body.master_id, body.slave_ids
    );
    Ok(StatusCode::OK)
}

pub async fn dissolve_group(
    State(state): State<ControlState>,
    Path(master_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    info!("Dissolving group with master={}", master_id);

    // Find all devices in this group and have them leave.
    let devices = state.devices.list_all();
    for device in &devices {
        if device.group_id.as_deref() == Some(&master_id) && device.id != master_id {
            debug!(
                "Sending MultiRoomLeaveGroup to slave {} ({}) at {}:{}",
                device.name, device.id, device.ip, device.port
            );

            match device.rendering.multiroom_leave_group().await {
                Ok(()) => {
                    info!(
                        "MultiRoomLeaveGroup succeeded for slave {} ({})",
                        device.name, device.id
                    );
                }
                Err(e) => {
                    error!(
                        "MultiRoomLeaveGroup FAILED for slave {} ({}): {:?}",
                        device.name, device.id, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }

            state.devices.update(&device.id, |d| {
                d.group_id = None;
            });
        }
    }

    state.devices.update(&master_id, |d| {
        d.is_master = false;
        d.group_id = None;
    });

    // Clear persisted group.
    state.device_config.clear_group(&master_id);

    // Push updated device list to all frontends.
    publish_devices_changed(&state);

    info!("Group dissolved: master={}", master_id);
    Ok(StatusCode::OK)
}

/// Publish the full device list so frontends refresh group state.
fn publish_devices_changed(state: &ControlState) {
    let devices: Vec<serde_json::Value> = state
        .devices
        .list_all()
        .iter()
        .map(|d| {
            serde_json::json!({
                "id": d.id,
                "name": d.name,
                "ip": d.ip,
                "model": d.model,
                "firmware": d.firmware,
                "device_type": d.device_type,
                "enabled": d.enabled,
                "capabilities": {
                    "av_transport": d.capabilities.av_transport,
                    "rendering_control": d.capabilities.rendering_control,
                    "wiim_extended": d.capabilities.wiim_extended,
                },
                "volume": d.volume,
                "muted": d.muted,
                "source": d.source,
                "group_id": d.group_id,
                "is_master": d.is_master,
            })
        })
        .collect();
    state.events.publish(
        "devices_changed",
        &serde_json::json!({ "devices": devices }),
    );
}
