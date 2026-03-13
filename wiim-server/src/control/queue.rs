use dashmap::DashMap;
use parking_lot::RwLock;
use rand::seq::SliceRandom;
use std::sync::Arc;

use super::models::QueueTrackResponse;

/// Server-side queue for a single playback target.
#[derive(Debug)]
pub struct PlayQueue {
    tracks: Vec<QueueTrackResponse>,
    position: usize,
    shuffle_mode: String,
    repeat_mode: String,
    shuffle_order: Vec<usize>,
}

impl Default for PlayQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl PlayQueue {
    pub fn new() -> Self {
        Self {
            tracks: Vec::new(),
            position: 0,
            shuffle_mode: "off".to_string(),
            repeat_mode: "off".to_string(),
            shuffle_order: Vec::new(),
        }
    }

    pub fn set_tracks(&mut self, tracks: Vec<QueueTrackResponse>, start_index: usize) {
        self.tracks = tracks;
        self.position = start_index;
        self.rebuild_shuffle_order();
    }

    pub fn add_tracks(&mut self, tracks: Vec<QueueTrackResponse>, position: &str) {
        match position {
            "next" => {
                let insert_at = (self.position + 1).min(self.tracks.len());
                for (i, t) in tracks.into_iter().enumerate() {
                    self.tracks.insert(insert_at + i, t);
                }
            }
            _ => {
                self.tracks.extend(tracks);
            }
        }
        self.rebuild_shuffle_order();
    }

    pub fn remove_track(&mut self, index: usize) -> bool {
        if index >= self.tracks.len() {
            return false;
        }
        self.tracks.remove(index);
        if self.position > 0 && index < self.position {
            self.position -= 1;
        }
        if self.position >= self.tracks.len() && !self.tracks.is_empty() {
            self.position = self.tracks.len() - 1;
        }
        self.rebuild_shuffle_order();
        true
    }

    pub fn current(&self) -> Option<&QueueTrackResponse> {
        self.tracks.get(self.position)
    }

    pub fn advance(&mut self) -> Option<&QueueTrackResponse> {
        if self.tracks.is_empty() {
            return None;
        }
        match self.repeat_mode.as_str() {
            "track" => return self.tracks.get(self.position),
            "all" => {
                self.position = (self.position + 1) % self.tracks.len();
            }
            _ => {
                if self.position + 1 < self.tracks.len() {
                    self.position += 1;
                } else {
                    return None;
                }
            }
        }
        self.tracks.get(self.position)
    }

    #[allow(dead_code)]
    pub fn go_back(&mut self) -> Option<&QueueTrackResponse> {
        if self.tracks.is_empty() {
            return None;
        }
        if self.position > 0 {
            self.position -= 1;
        } else if self.repeat_mode == "all" {
            self.position = self.tracks.len() - 1;
        }
        self.tracks.get(self.position)
    }

    pub fn clear(&mut self) {
        self.tracks.clear();
        self.position = 0;
        self.shuffle_order.clear();
    }

    pub fn tracks(&self) -> &[QueueTrackResponse] {
        &self.tracks
    }

    #[allow(dead_code)]
    pub fn tracks_mut(&mut self) -> &mut Vec<QueueTrackResponse> {
        &mut self.tracks
    }

    /// Move a track from one index to another, adjusting position accordingly.
    pub fn move_track(&mut self, from: usize, to: usize) -> bool {
        if from >= self.tracks.len() || to >= self.tracks.len() || from == to {
            return false;
        }
        let track = self.tracks.remove(from);
        self.tracks.insert(to, track);

        // Adjust current position to follow the playing track
        if self.position == from {
            // The playing track was moved
            self.position = to;
        } else if from < self.position && to >= self.position {
            // Moved a track from before position to after — shift left
            self.position -= 1;
        } else if from > self.position && to <= self.position {
            // Moved a track from after position to before — shift right
            self.position += 1;
        }
        self.rebuild_shuffle_order();
        true
    }

    pub fn position(&self) -> usize {
        self.position
    }

    pub fn shuffle_mode(&self) -> &str {
        &self.shuffle_mode
    }

    pub fn repeat_mode(&self) -> &str {
        &self.repeat_mode
    }

    pub fn set_shuffle_mode(&mut self, mode: String) {
        self.shuffle_mode = mode;
        self.rebuild_shuffle_order();
    }

    pub fn set_repeat_mode(&mut self, mode: String) {
        self.repeat_mode = mode;
    }

    fn rebuild_shuffle_order(&mut self) {
        if self.shuffle_mode == "off" || self.tracks.is_empty() {
            self.shuffle_order.clear();
            return;
        }
        let mut order: Vec<usize> = (0..self.tracks.len()).collect();
        let mut rng = rand::rng();
        order.shuffle(&mut rng);
        // Move current track to front
        if let Some(pos) = order.iter().position(|&i| i == self.position) {
            order.swap(0, pos);
        }
        self.shuffle_order = order;
    }
}

/// Manages queues for all playback targets.
pub struct QueueManager {
    queues: DashMap<String, Arc<RwLock<PlayQueue>>>,
}

impl Default for QueueManager {
    fn default() -> Self {
        Self::new()
    }
}

impl QueueManager {
    pub fn new() -> Self {
        Self {
            queues: DashMap::new(),
        }
    }

    pub fn get_or_create(&self, target_id: &str) -> Arc<RwLock<PlayQueue>> {
        self.queues
            .entry(target_id.to_string())
            .or_insert_with(|| Arc::new(RwLock::new(PlayQueue::new())))
            .clone()
    }
}
