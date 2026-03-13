use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceResponse {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub model: Option<String>,
    pub firmware: Option<String>,
    pub device_type: String,
    pub enabled: bool,
    pub capabilities: DeviceCapabilitiesResponse,
    pub volume: f64,
    pub muted: bool,
    pub source: Option<String>,
    pub group_id: Option<String>,
    pub is_master: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCapabilitiesResponse {
    pub av_transport: bool,
    pub rendering_control: bool,
    pub wiim_extended: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetEnabledRequest {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItemResponse {
    #[serde(rename = "type")]
    pub item_type: String,
    pub id: String,
    pub parent_id: Option<String>,
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_number: Option<String>,
    pub class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BrowseResponse {
    pub items: Vec<LibraryItemResponse>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueTrackResponse {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<String>,
    pub stream_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PlaybackStateResponse {
    pub target_id: String,
    pub playing: bool,
    pub current_track: Option<QueueTrackResponse>,
    pub position: usize,
    pub queue_length: usize,
    pub shuffle_mode: String,
    pub repeat_mode: String,
    pub elapsed_seconds: f64,
    pub duration_seconds: f64,
}

#[derive(Debug, Serialize)]
pub struct QueueStateResponse {
    pub tracks: Vec<QueueTrackResponse>,
    pub position: usize,
}

#[derive(Debug, Deserialize)]
pub struct PlayRequest {
    pub track_id: Option<String>,
    pub track_ids: Option<Vec<String>>,
    pub container_id: Option<String>,
    pub start_index: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct VolumeRequest {
    pub volume: f64,
}

#[derive(Debug, Deserialize)]
pub struct SeekRequest {
    pub position_seconds: f64,
}

#[derive(Debug, Deserialize)]
pub struct ShuffleModeRequest {
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct RepeatModeRequest {
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct QueueAddRequest {
    pub track_ids: Vec<String>,
    #[serde(default = "default_position")]
    pub position: String,
}

fn default_position() -> String {
    "end".to_string()
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub master_id: String,
    pub slave_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PresetRequest {
    pub preset: String,
}

#[derive(Debug, Serialize)]
pub struct PlaylistResponse {
    pub id: i64,
    pub name: String,
    pub track_count: usize,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlaylistRequest {
    pub name: String,
    #[serde(default)]
    pub track_ids: Vec<String>,
}
