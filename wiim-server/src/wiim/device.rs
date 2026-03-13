use dashmap::DashMap;

use super::services::av_transport::AvTransport;
use super::services::play_queue::PlayQueueService;
use super::services::rendering_control::RenderingControl;
use super::soap_client::SoapClient;

/// A discovered WiiM device with its UPnP service clients.
#[derive(Debug, Clone)]
pub struct WiimDevice {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub model: Option<String>,
    pub firmware: Option<String>,
    pub udn: String,
    pub volume: f64,
    pub muted: bool,
    pub source: Option<String>,
    pub group_id: Option<String>,
    pub is_master: bool,
    pub av_transport: AvTransport,
    pub rendering: RenderingControl,
    pub play_queue: PlayQueueService,
}

impl WiimDevice {
    pub fn new(
        ip: String,
        port: u16,
        name: String,
        model: Option<String>,
        firmware: Option<String>,
        udn: String,
    ) -> Self {
        let base_url = format!("http://{}:{}", ip, port);
        let client = SoapClient::new(base_url);
        let id = udn.replace("uuid:", "");

        Self {
            id,
            name,
            ip,
            port,
            model,
            firmware,
            udn,
            volume: 0.0,
            muted: false,
            source: None,
            group_id: None,
            is_master: false,
            av_transport: AvTransport::new(client.clone()),
            rendering: RenderingControl::new(client.clone()),
            play_queue: PlayQueueService::new(client),
        }
    }
}

/// Thread-safe registry of discovered WiiM devices.
pub struct DeviceManager {
    devices: DashMap<String, WiimDevice>,
}

impl Default for DeviceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DeviceManager {
    pub fn new() -> Self {
        Self {
            devices: DashMap::new(),
        }
    }

    pub fn register(&self, device: WiimDevice) {
        self.devices.insert(device.id.clone(), device);
    }

    pub fn get(&self, id: &str) -> Option<WiimDevice> {
        self.devices.get(id).map(|d| d.value().clone())
    }

    pub fn list_all(&self) -> Vec<WiimDevice> {
        self.devices.iter().map(|r| r.value().clone()).collect()
    }

    pub fn update<F: FnOnce(&mut WiimDevice)>(&self, id: &str, f: F) {
        if let Some(mut device) = self.devices.get_mut(id) {
            f(device.value_mut());
        }
    }

    pub fn remove(&self, id: &str) {
        self.devices.remove(id);
    }

    pub fn contains(&self, id: &str) -> bool {
        self.devices.contains_key(id)
    }
}
