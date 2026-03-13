use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use tracing::debug;

use crate::media::art::{album_cache_key, extract_art};
use crate::media::library::LibraryObject;

use super::state::ControlState;

/// GET /api/art/{track_id}
/// Returns album art for the given track, extracting on-demand and caching.
pub async fn get_art(
    State(state): State<ControlState>,
    Path(track_id): Path<String>,
) -> Result<Response, StatusCode> {
    // Look up the track to get file path and album key
    let (file_path, cache_key) = {
        let library = state.library.read();
        match library.get(&track_id) {
            Some(LibraryObject::Track(t)) => {
                let key = album_cache_key(&t.meta.album_artist, &t.meta.album);
                (t.path.clone(), key)
            }
            _ => return Err(StatusCode::NOT_FOUND),
        }
    };

    let art_cache = state.art_cache.clone();
    let file_path_clone = file_path.clone();
    let cache_key_clone = cache_key.clone();

    // Do all blocking work (cache lookup + extraction) in a blocking task
    let result = tokio::task::spawn_blocking(move || {
        // Check cache first
        if let Some(cached) = art_cache.get(&cache_key_clone) {
            if cached.data.is_empty() {
                return None; // Known missing
            }
            return Some((cached.data, cached.mime_type));
        }

        // Check if known missing
        if art_cache.is_known_missing(&cache_key_clone) {
            return None;
        }

        // Extract from file
        match extract_art(&file_path_clone) {
            Some((data, mime)) => {
                debug!("Extracted art for {} ({})", cache_key_clone, mime);
                art_cache.put(&cache_key_clone, &data, &mime);
                Some((data, mime))
            }
            None => {
                debug!("No art found for {}", cache_key_clone);
                art_cache.mark_missing(&cache_key_clone);
                None
            }
        }
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match result {
        Some((data, mime)) => Ok(Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .body(Body::from(data))
            .unwrap()),
        None => Err(StatusCode::NOT_FOUND),
    }
}
