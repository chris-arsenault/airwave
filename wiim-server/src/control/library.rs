use axum::extract::{Query, State};
use axum::Json;
use serde::Deserialize;

use crate::media::library::{Library, LibraryObject, Track};

use super::models::{BrowseResponse, ContainerInfoResponse, LibraryItemResponse};
use super::state::ControlState;

#[derive(Deserialize)]
pub struct BrowseQuery {
    #[serde(default = "default_id")]
    pub id: String,
    #[serde(default)]
    pub start: usize,
    #[serde(default)]
    pub count: usize,
}

fn default_id() -> String {
    "0".to_string()
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default)]
    pub start: usize,
    #[serde(default)]
    pub count: usize,
}

pub async fn browse(
    State(state): State<ControlState>,
    Query(params): Query<BrowseQuery>,
) -> Json<BrowseResponse> {
    let library = state.library.read();
    let children = library.children_of(&params.id);

    let container_info = build_container_info(&library, &params.id);

    let items: Vec<LibraryItemResponse> = children
        .iter()
        .map(|child| library_object_to_response(child, &library))
        .collect();

    let total = items.len();
    Json(BrowseResponse {
        container: container_info,
        items,
        total,
    })
}

pub async fn search(
    State(state): State<ControlState>,
    Query(params): Query<SearchQuery>,
) -> Json<BrowseResponse> {
    let library = state.library.read();
    let results = library.search(&params.q);

    let items: Vec<LibraryItemResponse> = results
        .iter()
        .map(|obj| library_object_to_response(obj, &library))
        .collect();

    let total = items.len();
    Json(BrowseResponse {
        container: None,
        items,
        total,
    })
}

/// Build container info for the browsed container, including artist/album context.
fn build_container_info(library: &Library, id: &str) -> Option<ContainerInfoResponse> {
    let obj = library.get(id)?;
    let container = match obj {
        LibraryObject::Container(c) => c,
        _ => return None,
    };

    let class = container.upnp_class;
    let mut artist = None;
    let mut album = None;

    if class == "object.container.person.musicArtist" {
        artist = Some(container.title.clone());
    } else if class == "object.container.album.musicAlbum" {
        album = Some(container.title.clone());
        // Look up parent to get artist name
        if let Some(LibraryObject::Container(parent)) = library.get(&container.parent_id) {
            if parent.upnp_class == "object.container.person.musicArtist" {
                artist = Some(parent.title.clone());
            }
        }
    }

    Some(ContainerInfoResponse {
        id: container.id.clone(),
        title: container.title.clone(),
        class: Some(class.to_string()),
        artist,
        album,
    })
}

fn track_to_response(t: &Track) -> LibraryItemResponse {
    LibraryItemResponse {
        item_type: "track".to_string(),
        id: t.id.clone(),
        parent_id: Some(t.parent_id.clone()),
        title: Some(t.meta.title.clone()),
        artist: Some(t.meta.artist.clone()),
        album: Some(t.meta.album.clone()),
        album_artist: Some(t.meta.album_artist.clone()),
        genre: t.meta.genre.clone(),
        track_number: t.meta.track_number.map(|n| n.to_string()),
        class: Some("object.item.audioItem.musicTrack".to_string()),
        child_count: None,
        duration: t.meta.duration.map(|d| {
            let secs = d.as_secs();
            format!("{}:{:02}", secs / 60, secs % 60)
        }),
        stream_url: None,
    }
}

fn library_object_to_response(obj: &LibraryObject, library: &Library) -> LibraryItemResponse {
    match obj {
        LibraryObject::Container(c) => {
            let mut artist = None;
            let mut album = None;

            if c.upnp_class == "object.container.person.musicArtist" {
                artist = Some(c.title.clone());
            } else if c.upnp_class == "object.container.album.musicAlbum" {
                album = Some(c.title.clone());
                // Look up parent for artist name
                if let Some(LibraryObject::Container(parent)) = library.get(&c.parent_id) {
                    if parent.upnp_class == "object.container.person.musicArtist" {
                        artist = Some(parent.title.clone());
                    }
                }
            }

            LibraryItemResponse {
                item_type: "container".to_string(),
                id: c.id.clone(),
                parent_id: Some(c.parent_id.clone()),
                title: Some(c.title.clone()),
                artist,
                album,
                album_artist: None,
                genre: None,
                track_number: None,
                class: Some(c.upnp_class.to_string()),
                child_count: Some(c.child_count as usize),
                duration: None,
                stream_url: None,
            }
        }
        LibraryObject::Track(t) => track_to_response(t),
    }
}
