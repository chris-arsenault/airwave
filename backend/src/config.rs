use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::path::PathBuf;

const COLLECTOR_URL_ENV: &str = "AIRWAVE_COLLECTOR_URL";
const COLLECTOR_TOKEN_ENV: &str = "AIRWAVE_COLLECTOR_TOKEN";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub network: NetworkConfig,
    #[serde(default)]
    pub media: MediaConfig,
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub collector: CollectorConfig,
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
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorConfig {
    #[serde(default = "default_collector_url")]
    pub url: String,
}

fn default_data_dir() -> PathBuf {
    PathBuf::from("/data")
}

fn default_collector_url() -> String {
    "https://collector.local.ahara.io:8443".to_string()
}

fn default_port() -> u16 {
    7882
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
            data_dir: default_data_dir(),
        }
    }
}

impl Default for CollectorConfig {
    fn default() -> Self {
        Self {
            url: default_collector_url(),
        }
    }
}

impl Config {
    pub fn load(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let mut config: Config = toml::from_str(&content)?;
        config.collector.url = validate_collector_url(&config.collector.url)?;
        match std::env::var(COLLECTOR_URL_ENV) {
            Ok(value) => config.collector.url = validate_collector_url(&value)?,
            Err(std::env::VarError::NotPresent) => {}
            Err(error) => return Err(error.into()),
        }
        Ok(config)
    }

    pub fn collector_token() -> Result<String, String> {
        let value = std::env::var(COLLECTOR_TOKEN_ENV)
            .map_err(|_| format!("{COLLECTOR_TOKEN_ENV} is required"))?;
        let token = value.trim();
        if token.len() < 16 {
            return Err(format!(
                "{COLLECTOR_TOKEN_ENV} must contain at least 16 characters"
            ));
        }
        Ok(token.to_string())
    }

    pub fn effective_ip(&self) -> Ipv4Addr {
        self.network.advertise_ip.unwrap_or_else(detect_local_ip)
    }

    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.effective_ip(), self.network.port)
    }
}

fn validate_collector_url(value: &str) -> Result<String, Box<dyn std::error::Error>> {
    let url = reqwest::Url::parse(value.trim())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("collector URL must be an HTTP or HTTPS origin without credentials, path, query, or fragment".into());
    }
    Ok(value.trim().trim_end_matches('/').to_string())
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
    fn validates_collector_urls() {
        assert_eq!(
            validate_collector_url("https://collector.local.ahara.io:8443/").unwrap(),
            "https://collector.local.ahara.io:8443"
        );
        assert!(validate_collector_url("collector.local.ahara.io").is_err());
        assert!(validate_collector_url("https://collector.local.ahara.io:8443/wiim").is_err());
    }
}
