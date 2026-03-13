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

    for slave_id in &body.slave_ids {
        let slave = state.devices.get(slave_id).ok_or(StatusCode::NOT_FOUND)?;

        // Prefer HTTPS API (ConnectMasterAp) — works on WiiM Mini and newer firmware.
        // Fall back to SOAP MultiRoomJoinGroup for non-HTTPS devices.
        if let Some(ref https) = slave.https_client {
            debug!(
                "Sending ConnectMasterAp:JoinGroupMaster to slave {} ({}) -> master {}",
                slave.name, slave.id, master.ip
            );
            match https.join_group_master(&master.ip).await {
                Ok(()) => {
                    info!(
                        "JoinGroupMaster succeeded for slave {} ({})",
                        slave.name, slave.id
                    );
                }
                Err(e) => {
                    error!(
                        "JoinGroupMaster FAILED for slave {} ({}): {:?}",
                        slave.name, slave.id, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }
        } else {
            let master_info = format!("{}:{}", master.ip, master.port);
            debug!(
                "Sending SOAP MultiRoomJoinGroup to slave {} ({}) master_info='{}'",
                slave.name, slave.id, master_info
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
    }

    // Update in-memory state optimistically.
    // The next discovery cycle will read actual group state back from the device.
    state.devices.update(&body.master_id, |d| {
        d.is_master = true;
        d.group_id = Some(body.master_id.clone());
    });
    for slave_id in &body.slave_ids {
        state.devices.update(slave_id, |d| {
            d.group_id = Some(body.master_id.clone());
        });
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

    let master = state.devices.get(&master_id).ok_or(StatusCode::NOT_FOUND)?;

    // Prefer HTTPS API: kick each slave from the master.
    // Fall back to SOAP MultiRoomLeaveGroup on each slave.
    if let Some(ref https) = master.https_client {
        // Query the master for its current slave list so we don't rely on stale in-memory state.
        let slave_list = https.get_slave_list().await.map_err(|e| {
            error!("Failed to get slave list from master {}: {:?}", master_id, e);
            StatusCode::BAD_GATEWAY
        })?;

        for slave in &slave_list.slave_list {
            debug!(
                "Kicking slave {} ({}) from master {} via HTTPS",
                slave.name, slave.ip, master_id
            );
            match https.slave_kickout(&slave.ip).await {
                Ok(()) => {
                    info!("SlaveKickout succeeded for {} ({})", slave.name, slave.ip);
                }
                Err(e) => {
                    error!(
                        "SlaveKickout FAILED for {} ({}): {:?}",
                        slave.name, slave.ip, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }
            // Update in-memory state for the slave by UUID.
            let slave_device_id = slave.uuid.replace("uuid:", "");
            state.devices.update(&slave_device_id, |d| {
                d.group_id = None;
            });
        }
    } else {
        // SOAP fallback: send leave to each slave individually.
        let devices = state.devices.list_all();
        for device in &devices {
            if device.group_id.as_deref() == Some(&master_id) && device.id != master_id {
                debug!(
                    "Sending SOAP MultiRoomLeaveGroup to slave {} ({})",
                    device.name, device.id
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
    }

    state.devices.update(&master_id, |d| {
        d.is_master = false;
        d.group_id = None;
    });

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
                    "https_api": d.capabilities.https_api,
                },
                "volume": d.volume,
                "muted": d.muted,
                "channel": d.channel,
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
