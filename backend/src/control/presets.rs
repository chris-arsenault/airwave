use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use super::state::ControlState;

/// A single group definition within a preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupDefinition {
    pub master_id: String,
    pub slave_ids: Vec<String>,
}

/// Response for GET /api/presets — all 5 slots.
#[derive(Debug, Serialize)]
pub struct PresetsResponse {
    pub presets: HashMap<String, Option<Vec<GroupDefinition>>>,
}

/// GET /api/presets — returns all 5 slots (null for empty slots).
pub async fn list_presets(State(state): State<ControlState>) -> Json<PresetsResponse> {
    let stored = state.device_config.load_all_presets();
    let mut presets: HashMap<String, Option<Vec<GroupDefinition>>> = HashMap::new();
    for slot in 1..=5u8 {
        let key = slot.to_string();
        let value = stored
            .get(&slot)
            .and_then(|json| serde_json::from_str::<Vec<GroupDefinition>>(json).ok());
        presets.insert(key, value);
    }
    Json(PresetsResponse { presets })
}

/// POST /api/presets/:slot — save current group state to slot (1-5).
pub async fn save_preset(
    State(state): State<ControlState>,
    Path(slot): Path<u8>,
) -> Result<StatusCode, StatusCode> {
    if !(1..=5).contains(&slot) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let devices = state.devices.list_all();

    // Build group definitions from current in-memory device state.
    // Find all masters and collect their slaves.
    let mut groups: Vec<GroupDefinition> = Vec::new();
    for device in &devices {
        if device.is_master {
            let slave_ids: Vec<String> = devices
                .iter()
                .filter(|d| {
                    d.group_id.as_deref() == Some(&device.id) && d.id != device.id
                })
                .map(|d| d.id.clone())
                .collect();
            if !slave_ids.is_empty() {
                groups.push(GroupDefinition {
                    master_id: device.id.clone(),
                    slave_ids,
                });
            }
        }
    }

    let json = serde_json::to_string(&groups).map_err(|e| {
        error!("Failed to serialize group preset: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state.device_config.save_preset(slot, &json);
    info!("Saved group preset to slot {}: {} group(s)", slot, groups.len());
    Ok(StatusCode::OK)
}

/// POST /api/presets/:slot/load — load preset: dissolve all current groups, recreate preset groups.
pub async fn load_preset(
    State(state): State<ControlState>,
    Path(slot): Path<u8>,
) -> Result<StatusCode, StatusCode> {
    if !(1..=5).contains(&slot) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let json = state
        .device_config
        .load_preset(slot)
        .ok_or(StatusCode::NOT_FOUND)?;

    let groups: Vec<GroupDefinition> = serde_json::from_str(&json).map_err(|e| {
        error!("Failed to parse group preset in slot {}: {:?}", slot, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Step 1: Dissolve all existing groups.
    let devices = state.devices.list_all();
    let masters: Vec<_> = devices.iter().filter(|d| d.is_master).cloned().collect();

    for master in &masters {
        info!("Dissolving existing group: master={} ({})", master.name, master.id);

        if let Some(ref https) = master.https_client {
            match https.get_slave_list().await {
                Ok(slave_list) => {
                    for slave in &slave_list.slave_list {
                        debug!(
                            "Kicking slave {} ({}) from master {} via HTTPS",
                            slave.name, slave.ip, master.id
                        );
                        if let Err(e) = https.slave_kickout(&slave.ip).await {
                            error!(
                                "SlaveKickout FAILED for {} ({}): {:?}",
                                slave.name, slave.ip, e
                            );
                            return Err(StatusCode::BAD_GATEWAY);
                        }
                        let slave_device_id = slave.uuid.replace("uuid:", "");
                        state.devices.update(&slave_device_id, |d| {
                            d.group_id = None;
                        });
                    }
                }
                Err(e) => {
                    error!(
                        "Failed to get slave list from master {}: {:?}",
                        master.id, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }
        } else {
            // SOAP fallback: send leave to each slave individually.
            for device in &devices {
                if device.group_id.as_deref() == Some(&master.id) && device.id != master.id {
                    debug!(
                        "Sending SOAP MultiRoomLeaveGroup to slave {} ({})",
                        device.name, device.id
                    );
                    if let Err(e) = device.rendering.multiroom_leave_group().await {
                        error!(
                            "MultiRoomLeaveGroup FAILED for slave {} ({}): {:?}",
                            device.name, device.id, e
                        );
                        return Err(StatusCode::BAD_GATEWAY);
                    }
                    state.devices.update(&device.id, |d| {
                        d.group_id = None;
                    });
                }
            }
        }

        state.devices.update(&master.id, |d| {
            d.is_master = false;
            d.group_id = None;
        });
    }

    // Step 2: Create groups from the preset.
    for group in &groups {
        let master = state
            .devices
            .get(&group.master_id)
            .ok_or_else(|| {
                error!("Preset references unknown master device: {}", group.master_id);
                StatusCode::NOT_FOUND
            })?;

        info!(
            "Creating group from preset: master={} ({}) with {} slave(s)",
            master.name, master.id, group.slave_ids.len()
        );

        for slave_id in &group.slave_ids {
            let slave = state.devices.get(slave_id).ok_or_else(|| {
                error!("Preset references unknown slave device: {}", slave_id);
                StatusCode::NOT_FOUND
            })?;

            if let Some(ref https) = slave.https_client {
                debug!(
                    "Sending JoinGroupMaster to slave {} ({}) -> master {}",
                    slave.name, slave.id, master.ip
                );
                if let Err(e) = https.join_group_master(&master.ip).await {
                    error!(
                        "JoinGroupMaster FAILED for slave {} ({}): {:?}",
                        slave.name, slave.id, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            } else {
                let master_info = format!("{}:{}", master.ip, master.port);
                debug!(
                    "Sending SOAP MultiRoomJoinGroup to slave {} ({}) master_info='{}'",
                    slave.name, slave.id, master_info
                );
                if let Err(e) = slave.rendering.multiroom_join_group(&master_info).await {
                    error!(
                        "MultiRoomJoinGroup FAILED for slave {} ({}): {:?}",
                        slave.name, slave.id, e
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }
            }
        }

        // Update in-memory state.
        state.devices.update(&group.master_id, |d| {
            d.is_master = true;
            d.group_id = Some(group.master_id.clone());
        });
        for slave_id in &group.slave_ids {
            state.devices.update(slave_id, |d| {
                d.group_id = Some(group.master_id.clone());
            });
        }
    }

    // Step 3: Publish devices_changed SSE event.
    publish_devices_changed(&state);

    info!("Loaded group preset from slot {}: {} group(s)", slot, groups.len());
    Ok(StatusCode::OK)
}

/// DELETE /api/presets/:slot — delete a preset.
pub async fn delete_preset(
    State(state): State<ControlState>,
    Path(slot): Path<u8>,
) -> Result<StatusCode, StatusCode> {
    if !(1..=5).contains(&slot) {
        return Err(StatusCode::BAD_REQUEST);
    }

    state.device_config.delete_preset(slot);
    info!("Deleted group preset from slot {}", slot);
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
