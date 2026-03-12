use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::{Accessor, ItemKey};
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TrackMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration: Option<Duration>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub mime_type: String,
    pub size_bytes: u64,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub channels: Option<u8>,
}

pub fn extract_metadata(path: &Path) -> Option<TrackMetadata> {
    let file_size = std::fs::metadata(path).ok()?.len();
    let mime = mime_guess::from_path(path)
        .first()
        .map(|m| m.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Only process audio files
    if !mime.starts_with("audio/") {
        return None;
    }

    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let properties = tagged_file.properties();

    let title = tag
        .and_then(|t| t.title().map(|s| s.to_string()))
        .unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Unknown".to_string())
        });

    let artist = tag
        .and_then(|t| t.artist().map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown Artist".to_string());

    let album = tag
        .and_then(|t| t.album().map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown Album".to_string());

    let album_artist = tag
        .and_then(|t| t.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()))
        .unwrap_or_else(|| artist.clone());

    let track_number = tag.and_then(|t| t.track());
    let disc_number = tag.and_then(|t| t.disk());
    let genre = tag.and_then(|t| t.genre().map(|s| s.to_string()));
    let year = tag.and_then(|t| t.year());

    let duration = properties.duration();
    let duration = if duration.is_zero() {
        None
    } else {
        Some(duration)
    };

    let sample_rate = properties.sample_rate();
    let bit_depth = properties.bit_depth();
    let channels = properties.channels();

    Some(TrackMetadata {
        title,
        artist,
        album,
        album_artist,
        track_number,
        disc_number,
        duration,
        genre,
        year,
        mime_type: mime,
        size_bytes: file_size,
        sample_rate,
        bit_depth,
        channels,
    })
}
