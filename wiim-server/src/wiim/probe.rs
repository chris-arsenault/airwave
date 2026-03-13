use super::schema::DeviceSchema;
use super::scpd::fetch_device_schema;

/// Probe a UPnP device and return its full schema.
pub async fn probe_device(
    host: &str,
    port: u16,
) -> Result<DeviceSchema, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let base_url = format!("http://{}:{}", host, port);
    fetch_device_schema(&client, &base_url).await
}
