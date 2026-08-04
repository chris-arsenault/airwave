use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::path::PathBuf;

const SSDP_TARGETS_ENV: &str = "AIRWAVE_SSDP_TARGETS";

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
    #[serde(default = "default_ssdp_targets")]
    pub ssdp_targets: Vec<Ipv4Addr>,
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
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
}

fn default_data_dir() -> PathBuf {
    PathBuf::from("/data")
}

fn default_port() -> u16 {
    7882
}

fn default_ssdp_targets() -> Vec<Ipv4Addr> {
    vec![Ipv4Addr::new(239, 255, 255, 250)]
}

fn parse_ssdp_targets(value: &str) -> Result<Vec<Ipv4Addr>, String> {
    let targets = value
        .split(',')
        .map(str::trim)
        .filter(|target| !target.is_empty())
        .map(|target| {
            target
                .parse::<Ipv4Addr>()
                .map_err(|error| format!("invalid SSDP target '{target}': {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    if targets.is_empty() {
        return Err("at least one SSDP target is required".to_string());
    }

    Ok(targets)
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
            ssdp_targets: default_ssdp_targets(),
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
            data_dir: default_data_dir(),
        }
    }
}

impl Config {
    pub fn load(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let mut config: Config = toml::from_str(&content)?;
        match std::env::var(SSDP_TARGETS_ENV) {
            Ok(value) => {
                config.network.ssdp_targets = parse_ssdp_targets(&value).map_err(|message| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        format!("{SSDP_TARGETS_ENV}: {message}"),
                    )
                })?;
            }
            Err(std::env::VarError::NotPresent) => {}
            Err(error) => return Err(error.into()),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssdp_defaults_to_standard_multicast() {
        assert_eq!(
            NetworkConfig::default().ssdp_targets,
            vec![Ipv4Addr::new(239, 255, 255, 250)]
        );
    }

    #[test]
    fn parses_multiple_ssdp_targets() {
        assert_eq!(
            parse_ssdp_targets("239.255.255.250, 192.168.65.255").unwrap(),
            vec![
                Ipv4Addr::new(239, 255, 255, 250),
                Ipv4Addr::new(192, 168, 65, 255),
            ]
        );
    }

    #[test]
    fn rejects_empty_ssdp_target_list() {
        assert_eq!(
            parse_ssdp_targets(" , ").unwrap_err(),
            "at least one SSDP target is required"
        );
    }
}
