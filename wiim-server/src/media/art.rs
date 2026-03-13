use lofty::file::TaggedFileExt;
use lofty::picture::PictureType;
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

/// On-demand album art extractor with SQLite-backed persistent cache.
pub struct ArtCache {
    conn: Mutex<Connection>,
}

pub struct CachedArt {
    pub data: Vec<u8>,
    pub mime_type: String,
}

impl ArtCache {
    pub fn new(data_dir: &Path) -> Self {
        std::fs::create_dir_all(data_dir).ok();
        let db_path = data_dir.join("art_cache.db");
        let conn = Connection::open(&db_path).expect("Failed to open art cache database");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS art (
                album_key TEXT PRIMARY KEY,
                data BLOB NOT NULL,
                mime_type TEXT NOT NULL
            );",
        )
        .expect("Failed to initialize art cache schema");
        // WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
        Self {
            conn: Mutex::new(conn),
        }
    }

    /// Get cached art by album key, or None if not cached.
    pub fn get(&self, album_key: &str) -> Option<CachedArt> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT data, mime_type FROM art WHERE album_key = ?1",
            params![album_key],
            |row| {
                Ok(CachedArt {
                    data: row.get(0)?,
                    mime_type: row.get(1)?,
                })
            },
        )
        .ok()
    }

    /// Store art in the cache.
    pub fn put(&self, album_key: &str, data: &[u8], mime_type: &str) {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO art (album_key, data, mime_type) VALUES (?1, ?2, ?3)",
            params![album_key, data, mime_type],
        )
        .ok();
    }

    /// Check if a key is known to have no art (cached as empty).
    pub fn is_known_missing(&self, album_key: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT LENGTH(data) FROM art WHERE album_key = ?1",
            params![album_key],
            |row| row.get::<_, i64>(0),
        )
        .map(|len| len == 0)
        .unwrap_or(false)
    }

    /// Mark a key as having no art so we don't re-extract.
    pub fn mark_missing(&self, album_key: &str) {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO art (album_key, data, mime_type) VALUES (?1, ?2, ?3)",
            params![album_key, Vec::<u8>::new(), ""],
        )
        .ok();
    }
}

/// Extract the front cover (or first picture) from an audio file.
pub fn extract_art(path: &Path) -> Option<(Vec<u8>, String)> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())?;

    let pictures = tag.pictures();
    // Prefer front cover
    let pic = pictures
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures.first())?;

    let mime = pic.mime_type().map(|m| m.to_string()).unwrap_or_else(|| "image/jpeg".to_string());
    Some((pic.data().to_vec(), mime))
}

/// Build a cache key from album_artist + album.
pub fn album_cache_key(album_artist: &str, album: &str) -> String {
    format!("{}||{}", album_artist, album)
}
