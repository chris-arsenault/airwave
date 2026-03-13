use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::tag::{Accessor, ItemKey, TagExt};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize, Default)]
pub struct TagUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
}

/// Write tag updates to an audio file. Only non-None fields are changed.
pub fn write_tags(path: &Path, update: &TagUpdate) -> Result<(), String> {
    let mut tagged_file =
        lofty::read_from_path(path).map_err(|e| format!("Failed to read file: {}", e))?;

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "No primary tag found, cannot write".to_string())?;

    if let Some(ref title) = update.title {
        tag.set_title(title.clone());
    }
    if let Some(ref artist) = update.artist {
        tag.set_artist(artist.clone());
    }
    if let Some(ref album) = update.album {
        tag.set_album(album.clone());
    }
    if let Some(ref album_artist) = update.album_artist {
        tag.insert_text(ItemKey::AlbumArtist, album_artist.clone());
    }
    if let Some(ref genre) = update.genre {
        tag.set_genre(genre.clone());
    }
    if let Some(track) = update.track_number {
        tag.set_track(track);
    }
    if let Some(disc) = update.disc_number {
        tag.set_disk(disc);
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Failed to save tags: {}", e))?;

    Ok(())
}
