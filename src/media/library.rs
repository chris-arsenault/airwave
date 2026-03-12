use crate::media::metadata::{self, TrackMetadata};
use parking_lot::RwLock;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, warn};
use walkdir::WalkDir;

/// Unique identifier for any object in the library (container or item).
pub type ObjectId = String;

/// A track in the library.
#[derive(Debug, Clone)]
pub struct Track {
    pub id: ObjectId,
    pub parent_id: ObjectId,
    pub path: PathBuf,
    pub meta: TrackMetadata,
}

/// A container (root, artist, album).
#[derive(Debug, Clone)]
pub struct Container {
    pub id: ObjectId,
    pub parent_id: ObjectId,
    pub title: String,
    pub children: Vec<ObjectId>,
    pub child_count: u32,
}

/// Either a container or a track.
#[derive(Debug, Clone)]
pub enum LibraryObject {
    Container(Container),
    Track(Track),
}

impl LibraryObject {
    #[allow(dead_code)]
    pub fn parent_id(&self) -> &str {
        match self {
            LibraryObject::Container(c) => &c.parent_id,
            LibraryObject::Track(t) => &t.parent_id,
        }
    }
}

/// The in-memory media library.
/// Tree structure: Root ("0") -> Artists -> Albums -> Tracks
#[derive(Debug)]
pub struct Library {
    objects: BTreeMap<ObjectId, LibraryObject>,
    pub total_tracks: u32,
}

impl Default for Library {
    fn default() -> Self {
        Self::new()
    }
}

impl Library {
    pub fn new() -> Self {
        let mut objects = BTreeMap::new();
        objects.insert(
            "0".to_string(),
            LibraryObject::Container(Container {
                id: "0".to_string(),
                parent_id: "-1".to_string(),
                title: "Root".to_string(),
                children: Vec::new(),
                child_count: 0,
            }),
        );
        Self {
            objects,
            total_tracks: 0,
        }
    }

    pub fn get(&self, id: &str) -> Option<&LibraryObject> {
        self.objects.get(id)
    }

    pub fn children_of(&self, id: &str) -> Vec<&LibraryObject> {
        match self.objects.get(id) {
            Some(LibraryObject::Container(c)) => c
                .children
                .iter()
                .filter_map(|cid| self.objects.get(cid))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn system_update_id(&self) -> u32 {
        self.total_tracks
    }
}

pub type SharedLibrary = Arc<RwLock<Library>>;

pub fn new_shared() -> SharedLibrary {
    Arc::new(RwLock::new(Library::new()))
}

/// Scan directories and rebuild the library.
pub fn scan(music_dirs: &[PathBuf]) -> Library {
    let mut lib = Library::new();
    let mut next_id: u64 = 1;
    // artist_name -> artist_id
    let mut artist_ids: BTreeMap<String, ObjectId> = BTreeMap::new();
    // (artist_name, album_name) -> album_id
    let mut album_ids: BTreeMap<(String, String), ObjectId> = BTreeMap::new();

    let mut files_scanned: u64 = 0;
    let mut files_failed: u64 = 0;

    info!("Library scan starting: {:?}", music_dirs);

    for dir in music_dirs {
        if !dir.exists() {
            warn!("Music directory does not exist: {}", dir.display());
            continue;
        }
        for entry in WalkDir::new(dir)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let mime = mime_guess::from_path(path)
                .first()
                .map(|m| m.to_string())
                .unwrap_or_default();
            if !mime.starts_with("audio/") {
                continue;
            }
            files_scanned += 1;
            if files_scanned.is_multiple_of(1000) {
                info!("Scanning: {} files processed so far...", files_scanned);
            }
            let meta = match metadata::extract_metadata(path) {
                Some(m) => m,
                None => {
                    files_failed += 1;
                    continue;
                }
            };

            // Ensure artist container exists
            let artist_id = artist_ids
                .entry(meta.album_artist.clone())
                .or_insert_with(|| {
                    let id = format!("a{}", next_id);
                    next_id += 1;
                    let container = Container {
                        id: id.clone(),
                        parent_id: "0".to_string(),
                        title: meta.album_artist.clone(),
                        children: Vec::new(),
                        child_count: 0,
                    };
                    lib.objects
                        .insert(id.clone(), LibraryObject::Container(container));
                    // Add to root
                    if let Some(LibraryObject::Container(root)) = lib.objects.get_mut("0") {
                        root.children.push(id.clone());
                        root.child_count += 1;
                    }
                    id
                })
                .clone();

            // Ensure album container exists
            let album_key = (meta.album_artist.clone(), meta.album.clone());
            let album_id = album_ids
                .entry(album_key)
                .or_insert_with(|| {
                    let id = format!("al{}", next_id);
                    next_id += 1;
                    let container = Container {
                        id: id.clone(),
                        parent_id: artist_id.clone(),
                        title: meta.album.clone(),
                        children: Vec::new(),
                        child_count: 0,
                    };
                    lib.objects
                        .insert(id.clone(), LibraryObject::Container(container));
                    // Add to artist
                    if let Some(LibraryObject::Container(artist)) = lib.objects.get_mut(&artist_id)
                    {
                        artist.children.push(id.clone());
                        artist.child_count += 1;
                    }
                    id
                })
                .clone();

            // Add track
            let track_id = format!("t{}", next_id);
            next_id += 1;
            let track = Track {
                id: track_id.clone(),
                parent_id: album_id.clone(),
                path: path.to_path_buf(),
                meta,
            };
            lib.objects
                .insert(track_id.clone(), LibraryObject::Track(track));
            if let Some(LibraryObject::Container(album)) = lib.objects.get_mut(&album_id) {
                album.children.push(track_id);
                album.child_count += 1;
            }
            lib.total_tracks += 1;
        }
    }

    info!(
        "Library scan complete: {} tracks, {} artists, {} albums ({} files scanned)",
        lib.total_tracks,
        artist_ids.len(),
        album_ids.len(),
        files_scanned
    );
    if files_failed > 0 {
        warn!("{} audio files failed metadata extraction", files_failed);
    }
    lib
}

/// Run periodic background scans.
pub async fn scan_loop(library: SharedLibrary, music_dirs: Vec<PathBuf>, interval_secs: u64) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    loop {
        interval.tick().await;
        let dirs = music_dirs.clone();
        let new_lib = tokio::task::spawn_blocking(move || scan(&dirs))
            .await
            .expect("scan task panicked");
        *library.write() = new_lib;
    }
}
