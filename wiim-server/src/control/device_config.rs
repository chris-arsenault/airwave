use rusqlite::{params, Connection};
use std::collections::HashMap;

/// Persisted device configuration (survives server reboots).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DeviceConfig {
    pub device_id: String,
    pub enabled: bool,
    pub group_id: Option<String>,
    pub is_master: bool,
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
                enabled INTEGER NOT NULL DEFAULT 1,
                group_id TEXT,
                is_master INTEGER NOT NULL DEFAULT 0
            );",
        )
        .expect("Failed to initialize device_config schema");

        // Migrate: add columns if they don't exist (for existing databases).
        let _ = conn.execute_batch(
            "ALTER TABLE device_config ADD COLUMN group_id TEXT;
             ALTER TABLE device_config ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0;",
        );

        store
    }

    /// Load all persisted device configs, keyed by device_id.
    pub fn load_all(&self) -> HashMap<String, DeviceConfig> {
        let conn = Connection::open(&self.path).unwrap();
        let mut stmt = conn
            .prepare("SELECT device_id, enabled, group_id, is_master FROM device_config")
            .unwrap();
        stmt.query_map([], |row| {
            Ok(DeviceConfig {
                device_id: row.get(0)?,
                enabled: row.get::<_, i32>(1)? != 0,
                group_id: row.get(2)?,
                is_master: row.get::<_, i32>(3)? != 0,
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

    /// Save group membership for a device.
    #[allow(dead_code)]
    pub fn save_group(&self, device_id: &str, group_id: Option<&str>, is_master: bool) {
        let conn = Connection::open(&self.path).unwrap();
        conn.execute(
            "INSERT INTO device_config (device_id, enabled, group_id, is_master)
             VALUES (?1, 1, ?2, ?3)
             ON CONFLICT(device_id) DO UPDATE SET group_id = excluded.group_id, is_master = excluded.is_master",
            params![device_id, group_id, is_master as i32],
        )
        .ok();
    }

    /// Clear group membership for all devices in a group.
    #[allow(dead_code)]
    pub fn clear_group(&self, group_id: &str) {
        let conn = Connection::open(&self.path).unwrap();
        conn.execute(
            "UPDATE device_config SET group_id = NULL, is_master = 0 WHERE group_id = ?1",
            params![group_id],
        )
        .ok();
    }
}
