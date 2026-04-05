use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tokio::task;

use super::models::{CreatePlaylistRequest, PlaylistResponse};
use super::state::ControlState;

pub struct PlaylistStore {
    path: String,
}

impl PlaylistStore {
    pub fn new(path: &str) -> Self {
        let store = Self {
            path: path.to_string(),
        };
        let conn = Connection::open(path).expect("Failed to open playlist database");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                added_at TEXT DEFAULT (datetime('now'))
            );",
        )
        .expect("Failed to initialize playlist schema");
        store
    }

    pub async fn list(&self) -> Vec<PlaylistResponse> {
        let path = self.path.clone();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            let mut stmt = conn
                .prepare(
                    "SELECT p.id, p.name, COUNT(pt.id) as track_count, p.created_at, p.updated_at
                     FROM playlists p
                     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
                     GROUP BY p.id
                     ORDER BY p.name",
                )
                .unwrap();
            stmt.query_map([], |row| {
                Ok(PlaylistResponse {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    track_count: row.get::<_, i64>(2)? as usize,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
        })
        .await
        .unwrap_or_default()
    }

    pub async fn create(&self, name: &str) -> Option<i64> {
        let path = self.path.clone();
        let name = name.to_string();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            conn.execute("INSERT INTO playlists (name) VALUES (?1)", params![name])
                .ok()?;
            Some(conn.last_insert_rowid())
        })
        .await
        .ok()?
    }

    pub async fn get(&self, id: i64) -> Option<PlaylistResponse> {
        let path = self.path.clone();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            conn.query_row(
                "SELECT p.id, p.name, COUNT(pt.id) as track_count, p.created_at, p.updated_at
                 FROM playlists p
                 LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
                 WHERE p.id = ?1
                 GROUP BY p.id",
                params![id],
                |row| {
                    Ok(PlaylistResponse {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        track_count: row.get::<_, i64>(2)? as usize,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .ok()
        })
        .await
        .ok()?
    }

    pub async fn get_track_ids(&self, playlist_id: i64) -> Vec<String> {
        let path = self.path.clone();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            let mut stmt = conn
                .prepare(
                    "SELECT track_id FROM playlist_tracks
                     WHERE playlist_id = ?1
                     ORDER BY position",
                )
                .unwrap();
            stmt.query_map(params![playlist_id], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        })
        .await
        .unwrap_or_default()
    }

    pub async fn delete(&self, id: i64) -> bool {
        let path = self.path.clone();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            // Delete tracks first (FK cascade may not work without PRAGMA foreign_keys)
            let _ = conn.execute(
                "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
                params![id],
            );
            conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])
                .map(|n| n > 0)
                .unwrap_or(false)
        })
        .await
        .unwrap_or(false)
    }

    pub async fn add_tracks(&self, playlist_id: i64, track_ids: &[String]) -> bool {
        let path = self.path.clone();
        let track_ids = track_ids.to_vec();
        task::spawn_blocking(move || {
            let conn = Connection::open(&path).unwrap();
            let max_pos: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?1",
                    params![playlist_id],
                    |row| row.get(0),
                )
                .unwrap_or(-1);
            for (i, track_id) in track_ids.iter().enumerate() {
                conn.execute(
                    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                    params![playlist_id, track_id, max_pos + 1 + i as i64],
                )
                .ok();
            }
            true
        })
        .await
        .unwrap_or(false)
    }
}

// ── REST Handlers ──

pub async fn list_playlists(State(state): State<ControlState>) -> Json<Vec<PlaylistResponse>> {
    Json(state.playlists.list().await)
}

pub async fn get_playlist(
    State(state): State<ControlState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, StatusCode> {
    let playlist = state.playlists.get(id).await.ok_or(StatusCode::NOT_FOUND)?;
    let track_ids = state.playlists.get_track_ids(id).await;

    let tracks: Vec<Value> = track_ids
        .iter()
        .enumerate()
        .map(|(pos, tid)| {
            json!({
                "track_id": tid,
                "position": pos,
            })
        })
        .collect();

    Ok(Json(json!({
        "id": playlist.id,
        "name": playlist.name,
        "track_count": playlist.track_count,
        "created_at": playlist.created_at,
        "updated_at": playlist.updated_at,
        "tracks": tracks,
    })))
}

pub async fn create_playlist(
    State(state): State<ControlState>,
    Json(body): Json<CreatePlaylistRequest>,
) -> Result<Json<Value>, StatusCode> {
    let id = state
        .playlists
        .create(&body.name)
        .await
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    if !body.track_ids.is_empty() {
        state.playlists.add_tracks(id, &body.track_ids).await;
    }

    Ok(Json(json!({ "id": id, "name": body.name })))
}

pub async fn delete_playlist(State(state): State<ControlState>, Path(id): Path<i64>) -> StatusCode {
    if state.playlists.delete(id).await {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}
