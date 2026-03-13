use std::collections::HashSet;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use std::time::Duration;

use roxmltree::Document;
use tokio::net::UdpSocket;
use tracing::{debug, info, warn};

use super::device::{DeviceManager, WiimDevice};
use crate::control::events::EventBus;

const SSDP_MULTICAST: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const MEDIA_RENDERER_URN: &str = "urn:schemas-upnp-org:device:MediaRenderer:1";
const UPNP_NS: &str = "urn:schemas-upnp-org:device-1-0";

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
    // Must be an HTTP response (200 OK) or contain LOCATION
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

/// Fetch description.xml and extract device info.
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
                        info!(
                            "Discovered new device: {} ({}) at {}:{}",
                            info.friendly_name, id, info.ip, info.port
                        );

                        let mut device = WiimDevice::new(
                            info.ip,
                            info.port,
                            info.friendly_name,
                            info.model_name,
                            info.model_number,
                            info.udn,
                        );

                        // Fetch initial state
                        match device.rendering.get_control_device_info().await {
                            Ok(dev_info) => {
                                device.volume = dev_info.volume as f64 / 100.0;
                                device.muted = dev_info.muted;
                                device.name = dev_info
                                    .raw
                                    .get("DeviceName")
                                    .or(dev_info.raw.get("Name"))
                                    .cloned()
                                    .unwrap_or(device.name);
                            }
                            Err(e) => {
                                debug!("Could not fetch device info for {}: {e}", device.id);
                            }
                        }

                        events.publish(
                            "device_added",
                            &serde_json::json!({
                                "id": device.id,
                                "name": device.name,
                                "ip": device.ip,
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
