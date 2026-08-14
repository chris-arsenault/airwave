use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn};

#[derive(Clone)]
pub struct CollectorClient {
    http: reqwest::Client,
    base_url: String,
    token: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CollectorError {
    #[error("collector HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorDevice {
    pub id: String,
    pub udn: String,
    pub ip: String,
    pub name: String,
    pub model: Option<String>,
    pub firmware: Option<String>,
    pub description_port: u16,
    pub services: CollectorServices,
    pub reachable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorServices {
    pub av_transport: Option<String>,
    pub rendering_control: Option<String>,
    pub play_queue: Option<String>,
}

#[derive(Debug, Deserialize)]
struct InventoryResponse {
    devices: Vec<CollectorDevice>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaServerRegistration<'a> {
    uuid: &'a str,
    location: String,
    server: String,
    lease_seconds: u64,
}

impl CollectorClient {
    pub fn new(base_url: &str, token: String) -> CollectorClient {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build collector HTTP client");
        CollectorClient {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub async fn devices(&self) -> Result<Vec<CollectorDevice>, CollectorError> {
        let response = self
            .http
            .get(format!("{}/wiim/devices", self.base_url))
            .bearer_auth(&self.token)
            .send()
            .await?
            .error_for_status()?
            .json::<InventoryResponse>()
            .await?;
        Ok(response.devices)
    }

    pub async fn probe(&self, ip: &str) -> Result<CollectorDevice, CollectorError> {
        Ok(self
            .http
            .post(format!("{}/wiim/probe", self.base_url))
            .bearer_auth(&self.token)
            .json(&serde_json::json!({ "ip": ip }))
            .send()
            .await?
            .error_for_status()?
            .json::<CollectorDevice>()
            .await?)
    }

    pub async fn register_media_server(
        &self,
        uuid: &str,
        airwave_base_url: &str,
    ) -> Result<(), CollectorError> {
        let body = MediaServerRegistration {
            uuid,
            location: format!("{}/device.xml", airwave_base_url.trim_end_matches('/')),
            server: format!("Linux/1.0 UPnP/1.0 Airwave/{}", env!("CARGO_PKG_VERSION")),
            lease_seconds: 1200,
        };
        self.http
            .put(format!("{}/wiim/media-server", self.base_url))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

pub async fn run_media_registration(
    client: CollectorClient,
    uuid: String,
    airwave_base_url: String,
) {
    loop {
        match client.register_media_server(&uuid, &airwave_base_url).await {
            Ok(()) => {
                info!("Renewed collector MediaServer registration");
                tokio::time::sleep(Duration::from_secs(600)).await;
            }
            Err(error) => {
                warn!("Failed to register MediaServer with collector: {error}");
                tokio::time::sleep(Duration::from_secs(30)).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn inventory_request_uses_the_airwave_bearer() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = vec![0_u8; 4096];
            let length = stream.read(&mut request).await.unwrap();
            let request = String::from_utf8_lossy(&request[..length]);
            assert!(request.starts_with("GET /wiim/devices HTTP/1.1"));
            assert!(request
                .to_ascii_lowercase()
                .contains("authorization: bearer airwave-test-token"));
            let body = r#"{"devices":[{"id":"wiim-1","udn":"uuid:wiim-1","ip":"192.168.30.20","name":"Office","model":"Mini","firmware":null,"descriptionPort":49152,"services":{"avTransport":"/upnp/av","renderingControl":"/upnp/rc","playQueue":"/upnp/pq"},"reachable":true}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let client =
            CollectorClient::new(&format!("http://{address}"), "airwave-test-token".into());
        let devices = client.devices().await.unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].id, "wiim-1");
        assert_eq!(devices[0].services.play_queue.as_deref(), Some("/upnp/pq"));
        server.await.unwrap();
    }
}
