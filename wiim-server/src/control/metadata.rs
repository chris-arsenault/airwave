use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::media::library::LibraryObject;
use crate::media::tag_writer::{self, TagUpdate};
use crate::media::{library, metadata};

use super::state::ControlState;

/// PATCH /api/library/tracks/{id} — edit a single track's metadata.
pub async fn update_track(
    State(state): State<ControlState>,
    Path(track_id): Path<String>,
    Json(update): Json<TagUpdate>,
) -> Result<StatusCode, (StatusCode, String)> {
    let path = {
        let lib = state.library.read();
        match lib.get(&track_id) {
            Some(LibraryObject::Track(t)) => t.path.clone(),
            _ => return Err((StatusCode::NOT_FOUND, "Track not found".to_string())),
        }
    };

    let write_path = path.clone();
    tokio::task::spawn_blocking(move || tag_writer::write_tags(&write_path, &update))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task failed: {}", e),
            )
        })?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Re-read metadata from file and update library.
    let meta_path = path.clone();
    let new_meta = tokio::task::spawn_blocking(move || metadata::extract_metadata(&meta_path))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task failed: {}", e),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to re-read metadata".to_string(),
            )
        })?;

    state.library.write().refresh_track(&track_id, new_meta);

    info!(
        "Updated metadata for track {} ({})",
        track_id,
        path.display()
    );
    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct BulkAlbumArtistRequest {
    pub container_id: String,
    pub album_artist: String,
}

/// POST /api/library/bulk/album-artist — set album_artist for all tracks in a container.
pub async fn bulk_set_album_artist(
    State(state): State<ControlState>,
    Json(body): Json<BulkAlbumArtistRequest>,
) -> Result<Json<BulkResult>, (StatusCode, String)> {
    let tracks: Vec<(String, PathBuf)> = {
        let lib = state.library.read();
        collect_track_paths(&lib, &body.container_id)
    };

    if tracks.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No tracks found".to_string()));
    }

    let album_artist = body.album_artist.clone();
    let count = tracks.len();

    let results = tokio::task::spawn_blocking(move || {
        let mut success = 0u32;
        let mut failed = 0u32;
        for (_id, path) in &tracks {
            let update = TagUpdate {
                album_artist: Some(album_artist.clone()),
                ..Default::default()
            };
            match tag_writer::write_tags(path, &update) {
                Ok(()) => success += 1,
                Err(e) => {
                    warn!("Failed to write tags to {}: {}", path.display(), e);
                    failed += 1;
                }
            }
        }
        (success, failed, tracks)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task failed: {}", e),
        )
    })?;

    let (success, failed, tracks) = results;

    // Trigger a full rescan since container structure may change.
    trigger_rescan(&state).await;

    info!(
        "Bulk set album_artist='{}' on {} tracks ({} ok, {} failed)",
        body.album_artist, count, success, failed
    );

    state
        .events
        .publish("library_changed", &serde_json::json!({}));

    Ok(Json(BulkResult {
        total: tracks.len(),
        success: success as usize,
        failed: failed as usize,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RenameArtistRequest {
    pub from: String,
    pub to: String,
    /// "artist", "album_artist", or "both"
    #[serde(default = "default_field")]
    pub field: String,
}

fn default_field() -> String {
    "both".to_string()
}

/// POST /api/library/bulk/rename-artist — rename artist across the library.
pub async fn bulk_rename_artist(
    State(state): State<ControlState>,
    Json(body): Json<RenameArtistRequest>,
) -> Result<Json<BulkResult>, (StatusCode, String)> {
    let from_lower = body.from.to_lowercase();
    let do_artist = body.field == "artist" || body.field == "both";
    let do_album_artist = body.field == "album_artist" || body.field == "both";

    // Find all tracks with matching artist/album_artist.
    let matching: Vec<(String, PathBuf, bool, bool)> = {
        let lib = state.library.read();
        lib.all_tracks()
            .into_iter()
            .filter_map(|(id, path)| {
                if let Some(LibraryObject::Track(t)) = lib.get(id) {
                    let artist_match = do_artist && t.meta.artist.to_lowercase() == from_lower;
                    let aa_match =
                        do_album_artist && t.meta.album_artist.to_lowercase() == from_lower;
                    if artist_match || aa_match {
                        Some((id.to_string(), path.to_path_buf(), artist_match, aa_match))
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect()
    };

    if matching.is_empty() {
        return Ok(Json(BulkResult {
            total: 0,
            success: 0,
            failed: 0,
        }));
    }

    let to = body.to.clone();
    let count = matching.len();

    let results = tokio::task::spawn_blocking(move || {
        let mut success = 0u32;
        let mut failed = 0u32;
        for (_id, path, artist_match, aa_match) in &matching {
            let update = TagUpdate {
                artist: if *artist_match {
                    Some(to.clone())
                } else {
                    None
                },
                album_artist: if *aa_match { Some(to.clone()) } else { None },
                ..Default::default()
            };
            match tag_writer::write_tags(path, &update) {
                Ok(()) => success += 1,
                Err(e) => {
                    warn!("Failed to write tags to {}: {}", path.display(), e);
                    failed += 1;
                }
            }
        }
        (success, failed)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task failed: {}", e),
        )
    })?;

    let (success, failed) = results;

    trigger_rescan(&state).await;

    info!(
        "Bulk rename '{}' → '{}' ({}) on {} tracks ({} ok, {} failed)",
        body.from, body.to, body.field, count, success, failed
    );

    state
        .events
        .publish("library_changed", &serde_json::json!({}));

    Ok(Json(BulkResult {
        total: count,
        success: success as usize,
        failed: failed as usize,
    }))
}

#[derive(Debug, serde::Serialize)]
pub struct BulkResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
}

fn collect_track_paths(lib: &library::Library, container_id: &str) -> Vec<(String, PathBuf)> {
    let mut result = Vec::new();
    for child in lib.children_of(container_id) {
        match child {
            LibraryObject::Track(t) => {
                result.push((t.id.clone(), t.path.clone()));
            }
            LibraryObject::Container(c) => {
                result.extend(collect_track_paths(lib, &c.id));
            }
        }
    }
    result
}

async fn trigger_rescan(state: &ControlState) {
    let lib = state.library.clone();
    let dirs = {
        // We need the music dirs from config. They're stored in the library scan,
        // but the simplest approach is to rescan using the same dirs.
        // Access them from the config via the library's existing tracks.
        let l = lib.read();
        let mut dirs = std::collections::HashSet::new();
        for (_, path) in l.all_tracks() {
            // Walk up to find the music root (parent dirs of files).
            // Simpler: just collect unique parent directories of all tracks.
            if let Some(parent) = path.parent() {
                dirs.insert(parent.to_path_buf());
            }
        }
        // Find the common ancestor(s) — the shortest paths.
        let mut sorted: Vec<PathBuf> = dirs.into_iter().collect();
        sorted.sort_by_key(|p| p.components().count());
        // Keep only root-level dirs (not subdirs of other entries).
        let mut roots = Vec::new();
        for d in &sorted {
            if !roots.iter().any(|r: &PathBuf| d.starts_with(r)) {
                roots.push(d.clone());
            }
        }
        roots
    };

    if dirs.is_empty() {
        return;
    }

    let new_lib = tokio::task::spawn_blocking(move || library::scan(&dirs))
        .await
        .ok();

    if let Some(new_lib) = new_lib {
        *lib.write() = new_lib;
    }
}
