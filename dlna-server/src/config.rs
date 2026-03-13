use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub network: NetworkConfig,
    #[serde(default)]
    pub media: MediaConfig,
    #[serde(default)]
    pub server: ServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub advertise_ip: Option<Ipv4Addr>,
    #[serde(default = "default_port")]
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaConfig {
    #[serde(default = "default_music_dirs")]
    pub music_dirs: Vec<PathBuf>,
    #[serde(default = "default_scan_interval")]
    pub scan_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_friendly_name")]
    pub friendly_name: String,
}

fn default_port() -> u16 {
    9000
}

fn default_music_dirs() -> Vec<PathBuf> {
    vec![PathBuf::from("/mnt/music")]
}

fn default_scan_interval() -> u64 {
    300
}

fn default_friendly_name() -> String {
    "WiiM Music Server".to_string()
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            advertise_ip: None,
            port: default_port(),
        }
    }
}

impl Default for MediaConfig {
    fn default() -> Self {
        Self {
            music_dirs: default_music_dirs(),
            scan_interval_secs: default_scan_interval(),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            friendly_name: default_friendly_name(),
        }
    }
}

impl Config {
    pub fn load(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }

    pub fn effective_ip(&self) -> Ipv4Addr {
        self.network.advertise_ip.unwrap_or_else(detect_local_ip)
    }

    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.effective_ip(), self.network.port)
    }
}

fn detect_local_ip() -> Ipv4Addr {
    local_ip_address::local_ip()
        .ok()
        .and_then(|ip| match ip {
            std::net::IpAddr::V4(v4) => Some(v4),
            _ => None,
        })
        .unwrap_or(Ipv4Addr::new(127, 0, 0, 1))
}
