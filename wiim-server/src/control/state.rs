use std::sync::Arc;

use crate::media::art::ArtCache;
use crate::media::library::SharedLibrary;
use crate::wiim::device::DeviceManager;

use super::events::EventBus;
use super::playlists::PlaylistStore;
use super::queue::QueueManager;
use super::session::SessionManager;

#[derive(Clone)]
pub struct ControlState {
    pub devices: Arc<DeviceManager>,
    pub library: SharedLibrary,
    pub events: EventBus,
    pub playlists: Arc<PlaylistStore>,
    pub queues: Arc<QueueManager>,
    pub sessions: Arc<SessionManager>,
    pub art_cache: Arc<ArtCache>,
    pub base_url: String,
}
