use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use std::time::Duration;

use roxmltree::Document;
use tokio::net::UdpSocket;
use tracing::{debug, info, warn};

use super::device::{DeviceCapabilities, DeviceManager, DeviceParams, ServiceUrls, WiimDevice};
use crate::control::events::EventBus;

const SSDP_MULTICAST: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const MEDIA_RENDERER_URN: &str = "urn:schemas-upnp-org:device:MediaRenderer:1";
const UPNP_NS: &str = "urn:schemas-upnp-org:device-1-0";

const AV_TRANSPORT_TYPE: &str = "urn:schemas-upnp-org:service:AVTransport:1";
const RENDERING_CONTROL_TYPE: &str = "urn:schemas-upnp-org:service:RenderingControl:1";
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

/// Run periodic SSDP discovery of MediaRenderer devices.
pub async fn run_discovery(
    device_manager: Arc<DeviceManager>,
    events: EventBus,
    bind_ip: Ipv4Addr,
    interval: Duration,
) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("failed to build discovery HTTP client");

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

                        // For WiiM devices, use proprietary GetControlDeviceInfo for
                        // accurate volume/mute/name (standard UPnP can report stale mute)
                        if device.capabilities.wiim_extended {
                            if let Ok(dev_info) = device.rendering.get_control_device_info().await {
                                device.volume = dev_info.volume as f64 / 100.0;
                                device.muted = dev_info.muted;
                                device.name = dev_info
                                    .raw
                                    .get("DeviceName")
                                    .or(dev_info.raw.get("Name"))
                                    .cloned()
                                    .unwrap_or(device.name);
                            }
                        }

                        info!(
                            "Discovered {} device: {} ({}) at {}:{}",
                            device.device_type, device.name, id, device.ip, device.port
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
