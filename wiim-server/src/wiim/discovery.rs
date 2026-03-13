use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use std::time::Duration;

use roxmltree::Document;
use tokio::net::UdpSocket;
use tracing::{debug, info, warn};

use super::device::{DeviceCapabilities, DeviceManager, DeviceParams, ServiceUrls, WiimDevice};
use super::https_api::HttpsApiClient;
use crate::control::device_config::DeviceConfigStore;
use crate::control::events::EventBus;

const SSDP_MULTICAST: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const MEDIA_RENDERER_URN: &str = "urn:schemas-upnp-org:device:MediaRenderer:1";
const UPNP_NS: &str = "urn:schemas-upnp-org:device-1-0";

const PLAY_QUEUE_TYPE: &str = "urn:schemas-wiimu-com:service:PlayQueue:1";

struct DiscoveredLocation {
    location: String,
    usn: String,
}

struct DeviceInfo {
    udn: String,
    friendly_name: String,
    model_name: Option<String>,
    model_number: Option<String>,
    ip: String,
    port: u16,
    service_urls: ServiceUrls,
    has_play_queue: bool,
}

/// Send M-SEARCH for MediaRenderer devices and collect responses.
async fn search_renderers(bind_ip: Ipv4Addr) -> Vec<DiscoveredLocation> {
    let socket = match UdpSocket::bind(SocketAddrV4::new(bind_ip, 0)).await {
        Ok(s) => s,
        Err(e) => {
            warn!("Failed to bind discovery socket: {e}");
            return Vec::new();
        }
    };

    let search = format!(
        "M-SEARCH * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         MAN: \"ssdp:discover\"\r\n\
         MX: 3\r\n\
         ST: {MEDIA_RENDERER_URN}\r\n\
         \r\n"
    );

    let dest = SocketAddr::V4(SocketAddrV4::new(SSDP_MULTICAST, SSDP_PORT));

    // Send twice for reliability
    for _ in 0..2 {
        if let Err(e) = socket.send_to(search.as_bytes(), dest).await {
            warn!("Failed to send M-SEARCH: {e}");
            return Vec::new();
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(4);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        let mut buf = [0u8; 2048];
        match tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await {
            Ok(Ok((len, _))) => {
                let text = String::from_utf8_lossy(&buf[..len]);
                if let Some(loc) = parse_response(&text) {
                    if seen.insert(loc.usn.clone()) {
                        debug!("Discovered renderer: {} ({})", loc.location, loc.usn);
                        results.push(loc);
                    }
                }
            }
            Ok(Err(e)) => {
                debug!("Discovery recv error: {e}");
                break;
            }
            Err(_) => break, // timeout
        }
    }

    results
}

fn parse_response(text: &str) -> Option<DiscoveredLocation> {
    let location = text
        .lines()
        .find(|l| l.to_ascii_uppercase().starts_with("LOCATION:"))
        .map(|l| l[9..].trim().to_string())?;

    let usn = text
        .lines()
        .find(|l| l.to_ascii_uppercase().starts_with("USN:"))
        .map(|l| l[4..].trim().to_string())
        .unwrap_or_default();

    Some(DiscoveredLocation { location, usn })
}

/// Fetch description.xml and extract device info including service control URLs.
async fn fetch_device_info(
    client: &reqwest::Client,
    location: &str,
) -> Result<DeviceInfo, Box<dyn std::error::Error + Send + Sync>> {
    let xml = client.get(location).send().await?.text().await?;
    let doc = Document::parse(&xml)?;

    let device_node = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "device")
        .ok_or("No <device> element")?;

    let udn = child_text(&device_node, "UDN").ok_or("No UDN")?;
    let friendly_name =
        child_text(&device_node, "friendlyName").unwrap_or_else(|| "Unknown".into());
    let model_name = child_text(&device_node, "modelName");
    let model_number = child_text(&device_node, "modelNumber");

    // Parse service list to get control URLs
    let mut service_urls = ServiceUrls::default();
    let mut has_play_queue = false;

    for service_node in doc.descendants().filter(|n| {
        n.is_element()
            && n.tag_name().name() == "service"
            && n.parent()
                .is_some_and(|p| p.tag_name().name() == "serviceList")
    }) {
        let service_type = child_text_any_ns(&service_node, "serviceType").unwrap_or_default();
        let control_url = child_text_any_ns(&service_node, "controlURL");

        if let Some(url) = control_url {
            if service_type.contains("AVTransport") {
                service_urls.av_transport = Some(url);
            } else if service_type.contains("RenderingControl") {
                service_urls.rendering_control = Some(url);
            } else if service_type.contains("PlayQueue") {
                service_urls.play_queue = Some(url.clone());
                has_play_queue = true;
            }
        }

        if service_type == PLAY_QUEUE_TYPE {
            has_play_queue = true;
        }
    }

    // Extract IP and port from the location URL
    let url: url::Url = location.parse().map_err(|_| "Invalid location URL")?;
    let ip = url.host_str().ok_or("No host in URL")?.to_string();
    let port = url.port().unwrap_or(80);

    Ok(DeviceInfo {
        udn,
        friendly_name,
        model_name,
        model_number,
        ip,
        port,
        service_urls,
        has_play_queue,
    })
}

fn child_text(parent: &roxmltree::Node, local_name: &str) -> Option<String> {
    parent
        .children()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == local_name
                && (n.tag_name().namespace() == Some(UPNP_NS) || n.tag_name().namespace().is_none())
        })
        .and_then(|n| n.text().map(|t| t.trim().to_string()))
}

/// Like child_text but ignores namespace entirely — needed for service elements
/// which may or may not carry the UPnP namespace.
fn child_text_any_ns(parent: &roxmltree::Node, local_name: &str) -> Option<String> {
    parent
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == local_name)
        .and_then(|n| n.text().map(|t| t.trim().to_string()))
}

/// Probe standard AVTransport by calling GetTransportInfo.
/// Returns true if the device responds successfully.
async fn probe_av_transport(device: &WiimDevice) -> bool {
    device.av_transport.get_transport_info().await.is_ok()
}

/// Probe standard RenderingControl by calling GetVolume.
/// Returns true if the device responds successfully.
async fn probe_rendering_control(device: &WiimDevice) -> bool {
    device.rendering.get_volume().await.is_ok()
}

/// Derive group state from GetControlDeviceInfo response.
/// Returns (group_id, is_master) based on the device's actual multiroom state.
///
/// MultiType values observed:
///   "0" — not in a group (standalone)
///   "1" — standalone (WiiM Mini reports this even when ungrouped)
///   Other values may indicate master/slave — needs testing with active group.
///
/// SlaveList JSON contains `"slaves": N` where N > 0 means this device is a master.
/// The `group` field in the Status JSON is "0" when ungrouped.
fn derive_group_state(
    _device_id: &str,
    slave_list: &str,
    status_json: &std::collections::HashMap<String, String>,
) -> (Option<String>, bool) {
    // Parse SlaveList to check if this device is a master with slaves
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(slave_list) {
        if let Some(count) = parsed.get("slaves").and_then(|v| v.as_u64()) {
            if count > 0 {
                // This device has slaves — it's a master.
                // group_id = own device_id (set by caller)
                return (None, true); // caller sets group_id to device's own id
            }
        }
    }

    // Check the `group` field in Status — "0" means ungrouped
    if let Some(group_val) = status_json.get("group") {
        if group_val != "0" {
            // Device reports being in a group but has no slaves — it's a slave.
            // The group value might be the master's identifier.
            return (Some(group_val.clone()), false);
        }
    }

    (None, false)
}

/// Run periodic SSDP discovery of MediaRenderer devices.
pub async fn run_discovery(
    device_manager: Arc<DeviceManager>,
    device_config: Arc<DeviceConfigStore>,
    events: EventBus,
    bind_ip: Ipv4Addr,
    interval: Duration,
) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("failed to build discovery HTTP client");

    // Load persisted device configs (only used for `enabled` state)
    let persisted = device_config.load_all();

    // Initial delay to let the server start up
    tokio::time::sleep(Duration::from_secs(2)).await;

    let mut known_ids: HashSet<String> = HashSet::new();

    loop {
        debug!("Starting device discovery scan");
        let discovered = search_renderers(bind_ip).await;

        let mut current_ids: HashSet<String> = HashSet::new();

        for loc in &discovered {
            match fetch_device_info(&client, &loc.location).await {
                Ok(info) => {
                    let id = info.udn.replace("uuid:", "");
                    current_ids.insert(id.clone());

                    if !device_manager.contains(&id) {
                        // Build device with parsed service URLs, probe to determine capabilities
                        let initial_caps = DeviceCapabilities {
                            av_transport: info.service_urls.av_transport.is_some(),
                            rendering_control: info.service_urls.rendering_control.is_some(),
                            wiim_extended: info.has_play_queue,
                            https_api: false,
                        };

                        let mut device = WiimDevice::new(DeviceParams {
                            ip: info.ip,
                            port: info.port,
                            name: info.friendly_name,
                            model: info.model_name,
                            firmware: info.model_number,
                            udn: info.udn,
                            service_urls: info.service_urls,
                            capabilities: initial_caps,
                        });

                        // Probe standard SOAP to verify the device actually responds
                        let av_ok = probe_av_transport(&device).await;
                        let rc_ok = probe_rendering_control(&device).await;

                        if !av_ok && !rc_ok {
                            debug!(
                                "Device {} ({}) did not respond to standard SOAP probes, skipping",
                                device.name, id
                            );
                            current_ids.remove(&id);
                            continue;
                        }

                        device.capabilities.av_transport = av_ok;
                        device.capabilities.rendering_control = rc_ok;

                        // Fetch initial volume/mute if rendering control works
                        if rc_ok {
                            if let Ok(vol) = device.rendering.get_volume().await {
                                device.volume = vol as f64 / 100.0;
                            }
                            if let Ok(muted) = device.rendering.get_mute().await {
                                device.muted = muted;
                            }
                        }

                        // Probe HTTPS API (port 443) for WiiM devices
                        if device.capabilities.wiim_extended {
                            let probe = HttpsApiClient::probe_client(&device.ip);
                            let has_https = probe.probe().await;
                            device.capabilities.https_api = has_https;
                            if has_https {
                                info!("HTTPS API available for {} ({})", device.name, id);
                            } else {
                                warn!(
                                    "HTTPS API not available for {} ({}) — EQ disabled",
                                    device.name, id
                                );
                            }
                        }

                        // For WiiM devices, use proprietary GetControlDeviceInfo for
                        // accurate volume/mute/name and multiroom state.
                        // Device state is canonical — we read group info from the device,
                        // not from our database.
                        if device.capabilities.wiim_extended {
                            if let Ok(dev_info) = device.rendering.get_control_device_info().await {
                                device.volume = dev_info.volume as f64 / 100.0;
                                device.muted = dev_info.muted;
                                device.channel = Some(dev_info.channel.clone());
                                device.name = dev_info
                                    .raw
                                    .get("DeviceName")
                                    .or(dev_info.raw.get("Name"))
                                    .cloned()
                                    .unwrap_or(device.name);

                                // Derive group state from what the device reports
                                let (group_id, is_master) = derive_group_state(
                                    &id,
                                    &dev_info.slave_list,
                                    &dev_info.raw,
                                );
                                if is_master {
                                    device.is_master = true;
                                    device.group_id = Some(id.clone());
                                } else if group_id.is_some() {
                                    // Slave — resolve master UUID from GetInfoEx
                                    let resolved_gid = match device.av_transport.get_info_ex().await {
                                        Ok(info_ex) if !info_ex.master_uuid.is_empty() => {
                                            Some(info_ex.master_uuid)
                                        }
                                        _ => group_id,
                                    };
                                    device.group_id = resolved_gid;
                                }

                                debug!(
                                    "Device {} multiroom: MultiType={}, SlaveList={}, group_id={:?}, is_master={}",
                                    id, dev_info.multi_type, dev_info.slave_list,
                                    device.group_id, device.is_master
                                );
                            }
                        }

                        // Apply persisted enabled state only (group state comes from device)
                        if let Some(cfg) = persisted.get(&id) {
                            device.enabled = cfg.enabled;
                        }

                        info!(
                            "Discovered {} device: {} ({}) at {}:{} [enabled={}, group={:?}, master={}]",
                            device.device_type,
                            device.name,
                            id,
                            device.ip,
                            device.port,
                            device.enabled,
                            device.group_id,
                            device.is_master,
                        );

                        events.publish(
                            "device_added",
                            &serde_json::json!({
                                "id": device.id,
                                "name": device.name,
                                "ip": device.ip,
                                "device_type": device.device_type,
                            }),
                        );

                        device_manager.register(device);
                    } else {
                        // Device already known — refresh group state from device
                        refresh_group_state(&id, &device_manager, &events).await;
                    }
                }
                Err(e) => {
                    debug!("Failed to fetch device info from {}: {e}", loc.location);
                }
            }
        }

        // Remove devices no longer responding
        for id in known_ids.difference(&current_ids) {
            info!("Device no longer responding: {id}");
            device_manager.remove(id);
            events.publish("device_removed", &serde_json::json!({ "id": id }));
        }

        known_ids = current_ids;

        tokio::time::sleep(interval).await;
    }
}

/// Refresh group state for an already-registered device by querying GetControlDeviceInfo
/// and GetInfoEx. This runs on every discovery cycle for existing devices so we pick up
/// group changes made by other apps (e.g. the WiiM app).
async fn refresh_group_state(
    device_id: &str,
    device_manager: &DeviceManager,
    events: &EventBus,
) {
    let device = match device_manager.get(device_id) {
        Some(d) => d,
        None => return,
    };

    if !device.capabilities.wiim_extended {
        return;
    }

    let dev_info = match device.rendering.get_control_device_info().await {
        Ok(info) => info,
        Err(_) => return,
    };

    let (group_id, is_master) = derive_group_state(device_id, &dev_info.slave_list, &dev_info.raw);

    // For slaves, resolve the actual master device ID from GetInfoEx's MasterUUID.
    let new_group_id = if is_master {
        Some(device_id.to_string())
    } else if group_id.is_some() {
        // Device is a slave — try to get the master's UUID from GetInfoEx.
        match device.av_transport.get_info_ex().await {
            Ok(info_ex) if !info_ex.master_uuid.is_empty() => {
                Some(info_ex.master_uuid)
            }
            _ => group_id,
        }
    } else {
        None
    };

    // Check if anything changed
    if device.group_id != new_group_id || device.is_master != is_master {
        info!(
            "Group state changed for {} ({}): group={:?}->{:?}, master={}->{}",
            device.name, device_id, device.group_id, new_group_id, device.is_master, is_master
        );
        device_manager.update(device_id, |d| {
            d.group_id = new_group_id.clone();
            d.is_master = is_master;
        });

        // Notify frontend
        let devices: Vec<serde_json::Value> = device_manager
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
                    "source": d.source,
                    "group_id": d.group_id,
                    "is_master": d.is_master,
                })
            })
            .collect();
        events.publish(
            "devices_changed",
            &serde_json::json!({ "devices": devices }),
        );
    }

    // Also refresh volume/mute while we're at it
    let new_vol = dev_info.volume as f64 / 100.0;
    let new_muted = dev_info.muted;
    if (device.volume - new_vol).abs() > 0.001 || device.muted != new_muted {
        device_manager.update(device_id, |d| {
            d.volume = new_vol;
            d.muted = new_muted;
        });
    }
}
