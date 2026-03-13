use crate::media::metadata::{self, TrackMetadata};
use parking_lot::RwLock;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, warn};
use walkdir::WalkDir;

/// Unique identifier for any object in the library (container or item).
pub type ObjectId = String;

/// Virtual container IDs for the top-level browse menu.
pub const ROOT_ID: &str = "0";
pub const VC_ARTISTS: &str = "vc_artists";
pub const VC_ALBUMS: &str = "vc_albums";
pub const VC_GENRES: &str = "vc_genres";
pub const VC_ALL: &str = "vc_all";

/// A track in the library.
#[derive(Debug, Clone)]
pub struct Track {
    pub id: ObjectId,
    pub parent_id: ObjectId,
    pub path: PathBuf,
    pub meta: TrackMetadata,
}

/// A container (root, virtual category, artist, album, genre).
#[derive(Debug, Clone)]
pub struct Container {
    pub id: ObjectId,
    pub parent_id: ObjectId,
    pub title: String,
    pub children: Vec<ObjectId>,
    pub child_count: u32,
    pub upnp_class: &'static str,
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
///
/// Tree structure:
///   Root ("0")
///   ├── Artists (vc_artists) → Artist → Album → Track
///   ├── Albums (vc_albums) → Album → Track
///   ├── Genres (vc_genres) → Genre → Track
///   └── All Tracks (vc_all) → Track
#[derive(Debug)]
pub struct Library {
    objects: BTreeMap<ObjectId, LibraryObject>,
    /// All track IDs for search.
    all_track_ids: Vec<ObjectId>,
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

        // Root
        objects.insert(
            ROOT_ID.to_string(),
            LibraryObject::Container(Container {
                id: ROOT_ID.to_string(),
                parent_id: "-1".to_string(),
                title: "Root".to_string(),
                children: vec![
                    VC_ARTISTS.to_string(),
                    VC_ALBUMS.to_string(),
                    VC_GENRES.to_string(),
                    VC_ALL.to_string(),
                ],
                child_count: 4,
                upnp_class: "object.container",
            }),
        );

        // Virtual containers
        for (id, title, class) in [
            (VC_ARTISTS, "Artists", "object.container"),
            (VC_ALBUMS, "Albums", "object.container"),
            (VC_GENRES, "Genres", "object.container"),
            (VC_ALL, "All Tracks", "object.container"),
        ] {
            objects.insert(
                id.to_string(),
                LibraryObject::Container(Container {
                    id: id.to_string(),
                    parent_id: ROOT_ID.to_string(),
                    title: title.to_string(),
                    children: Vec::new(),
                    child_count: 0,
                    upnp_class: class,
                }),
            );
        }

        Self {
            objects,
            all_track_ids: Vec::new(),
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

    /// Search tracks by matching query against title, artist, album.
    pub fn search(&self, query: &str) -> Vec<&LibraryObject> {
        let query_lower = query.to_lowercase();
        self.all_track_ids
            .iter()
            .filter_map(|id| self.objects.get(id))
            .filter(|obj| {
                if let LibraryObject::Track(t) = obj {
                    t.meta.title.to_lowercase().contains(&query_lower)
                        || t.meta.artist.to_lowercase().contains(&query_lower)
                        || t.meta.album.to_lowercase().contains(&query_lower)
                        || t.meta.album_artist.to_lowercase().contains(&query_lower)
                } else {
                    false
                }
            })
            .collect()
    }

    pub fn system_update_id(&self) -> u32 {
        self.total_tracks
    }
}

pub type SharedLibrary = Arc<RwLock<Library>>;

pub fn new_shared() -> SharedLibrary {
    Arc::new(RwLock::new(Library::new()))
}

fn add_child(objects: &mut BTreeMap<ObjectId, LibraryObject>, parent_id: &str, child_id: &str) {
    if let Some(LibraryObject::Container(c)) = objects.get_mut(parent_id) {
        c.children.push(child_id.to_string());
        c.child_count += 1;
    }
}

/// Scan directories and rebuild the library.
pub fn scan(music_dirs: &[PathBuf]) -> Library {
    let mut lib = Library::new();
    let mut next_id: u64 = 1;

    // Dedup maps for artist view: artist_name -> artist_container_id
    let mut artist_ids: BTreeMap<String, ObjectId> = BTreeMap::new();
    // (album_artist, album) -> album_container_id under artist view
    let mut artist_album_ids: BTreeMap<(String, String), ObjectId> = BTreeMap::new();
    // album_name -> album_container_id under albums view (keyed by (album_artist, album))
    let mut album_view_ids: BTreeMap<(String, String), ObjectId> = BTreeMap::new();
    // genre_name -> genre_container_id
    let mut genre_ids: BTreeMap<String, ObjectId> = BTreeMap::new();
    // Collect all tracks for sorting into "All Tracks" at the end
    let mut all_tracks: Vec<(String, ObjectId)> = Vec::new(); // (title_lower, track_id)

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

            // === Artist View: vc_artists → Artist → Album → Track ===

            let artist_id = artist_ids
                .entry(meta.album_artist.clone())
                .or_insert_with(|| {
                    let id = format!("ar{}", next_id);
                    next_id += 1;
                    lib.objects.insert(
                        id.clone(),
                        LibraryObject::Container(Container {
                            id: id.clone(),
                            parent_id: VC_ARTISTS.to_string(),
                            title: meta.album_artist.clone(),
                            children: Vec::new(),
                            child_count: 0,
                            upnp_class: "object.container.person.musicArtist",
                        }),
                    );
                    add_child(&mut lib.objects, VC_ARTISTS, &id);
                    id
                })
                .clone();

            let artist_album_key = (meta.album_artist.clone(), meta.album.clone());
            let album_under_artist_id = artist_album_ids
                .entry(artist_album_key.clone())
                .or_insert_with(|| {
                    let id = format!("aa{}", next_id);
                    next_id += 1;
                    lib.objects.insert(
                        id.clone(),
                        LibraryObject::Container(Container {
                            id: id.clone(),
                            parent_id: artist_id.clone(),
                            title: meta.album.clone(),
                            children: Vec::new(),
                            child_count: 0,
                            upnp_class: "object.container.album.musicAlbum",
                        }),
                    );
                    add_child(&mut lib.objects, &artist_id, &id);
                    id
                })
                .clone();

            // === Albums View: vc_albums → Album → Track ===

            let album_view_key = (meta.album_artist.clone(), meta.album.clone());
            let album_view_id = album_view_ids
                .entry(album_view_key)
                .or_insert_with(|| {
                    let id = format!("av{}", next_id);
                    next_id += 1;
                    let title = if meta.album_artist != "Unknown Artist" {
                        format!("{} — {}", meta.album_artist, meta.album)
                    } else {
                        meta.album.clone()
                    };
                    lib.objects.insert(
                        id.clone(),
                        LibraryObject::Container(Container {
                            id: id.clone(),
                            parent_id: VC_ALBUMS.to_string(),
                            title,
                            children: Vec::new(),
                            child_count: 0,
                            upnp_class: "object.container.album.musicAlbum",
                        }),
                    );
                    add_child(&mut lib.objects, VC_ALBUMS, &id);
                    id
                })
                .clone();

            // === Genres View: vc_genres → Genre → Track ===

            let genre_container_id = meta.genre.as_ref().map(|genre| {
                genre_ids
                    .entry(genre.clone())
                    .or_insert_with(|| {
                        let id = format!("gr{}", next_id);
                        next_id += 1;
                        lib.objects.insert(
                            id.clone(),
                            LibraryObject::Container(Container {
                                id: id.clone(),
                                parent_id: VC_GENRES.to_string(),
                                title: genre.clone(),
                                children: Vec::new(),
                                child_count: 0,
                                upnp_class: "object.container.genre.musicGenre",
                            }),
                        );
                        add_child(&mut lib.objects, VC_GENRES, &id);
                        id
                    })
                    .clone()
            });

            // === Create the track (one canonical object) ===

            let track_id = format!("t{}", next_id);
            next_id += 1;
            let track = Track {
                id: track_id.clone(),
                parent_id: album_under_artist_id.clone(),
                path: path.to_path_buf(),
                meta,
            };
            all_tracks.push((track.meta.title.to_lowercase(), track_id.clone()));
            lib.objects
                .insert(track_id.clone(), LibraryObject::Track(track));

            // Add track to artist-view album
            add_child(&mut lib.objects, &album_under_artist_id, &track_id);
            // Add track to albums-view album
            add_child(&mut lib.objects, &album_view_id, &track_id);
            // Add track to genre
            if let Some(ref gid) = genre_container_id {
                add_child(&mut lib.objects, gid, &track_id);
            }

            lib.total_tracks += 1;
        }
    }

    // Sort "All Tracks" alphabetically by title and populate vc_all
    all_tracks.sort_by(|a, b| a.0.cmp(&b.0));
    let sorted_ids: Vec<ObjectId> = all_tracks.into_iter().map(|(_, id)| id).collect();
    let all_count = sorted_ids.len() as u32;
    if let Some(LibraryObject::Container(c)) = lib.objects.get_mut(VC_ALL) {
        c.children = sorted_ids.clone();
        c.child_count = all_count;
    }
    lib.all_track_ids = sorted_ids;

    info!(
        "Library scan complete: {} tracks, {} artists, {} albums, {} genres ({} files scanned)",
        lib.total_tracks,
        artist_ids.len(),
        artist_album_ids.len(),
        genre_ids.len(),
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
