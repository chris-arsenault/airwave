use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceSchema {
    pub friendly_name: String,
    pub model_name: String,
    pub model_number: String,
    pub udn: String,
    pub services: Vec<ServiceSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceSchema {
    pub service_type: String,
    pub service_id: String,
    pub control_url: String,
    pub scpd_url: String,
    pub event_url: String,
    pub actions: Vec<ActionSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSchema {
    pub name: String,
    pub arguments: Vec<ArgumentSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArgumentSchema {
    pub name: String,
    pub direction: Direction,
    pub related_state_variable: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    In,
    Out,
}
