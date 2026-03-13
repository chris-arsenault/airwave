use rusqlite::{params, Connection};
use std::collections::HashMap;

/// Persisted device configuration (survives server reboots).
#[derive(Debug, Clone)]
pub struct DeviceConfig {
    pub device_id: String,
    pub enabled: bool,
}

/// SQLite-backed store for device configuration.
pub struct DeviceConfigStore {
    path: String,
}

impl DeviceConfigStore {
    pub fn new(path: &str) -> Self {
        let store = Self {
            path: path.to_string(),
        };
        let conn = Connection::open(path).expect("Failed to open device config database");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS device_config (
                device_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1
            );",
        )
        .expect("Failed to initialize device_config schema");
        store
    }

    /// Load all persisted device configs, keyed by device_id.
    pub fn load_all(&self) -> HashMap<String, DeviceConfig> {
        let conn = Connection::open(&self.path).unwrap();
        let mut stmt = conn
            .prepare("SELECT device_id, enabled FROM device_config")
            .unwrap();
        stmt.query_map([], |row| {
            Ok(DeviceConfig {
                device_id: row.get(0)?,
                enabled: row.get::<_, i32>(1)? != 0,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .map(|c| (c.device_id.clone(), c))
        .collect()
    }

    /// Save or update the enabled state for a device.
    pub fn save_enabled(&self, device_id: &str, enabled: bool) {
        let conn = Connection::open(&self.path).unwrap();
        conn.execute(
            "INSERT INTO device_config (device_id, enabled)
             VALUES (?1, ?2)
             ON CONFLICT(device_id) DO UPDATE SET enabled = excluded.enabled",
            params![device_id, enabled as i32],
        )
        .ok();
    }
}
