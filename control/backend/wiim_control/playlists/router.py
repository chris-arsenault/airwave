from fastapi import APIRouter, HTTPException, Request

from wiim_control.playlists.models import (
    PlaylistAddTracks,
    PlaylistCreate,
    PlaylistInfo,
    PlaylistReorder,
    PlaylistUpdate,
)

router = APIRouter()


def _store(request: Request):
    return request.app.state.playlist_store


@router.get("", response_model=list[PlaylistInfo])
async def list_playlists(request: Request):
    return await _store(request).list_playlists()


@router.post("", status_code=201)
async def create_playlist(body: PlaylistCreate, request: Request):
    playlist_id = await _store(request).create_playlist(body.name, body.track_ids)
    return {"id": playlist_id}


@router.get("/{playlist_id}")
async def get_playlist(playlist_id: int, request: Request):
    playlist = await _store(request).get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(404, "Playlist not found")
    return playlist


@router.put("/{playlist_id}")
async def update_playlist(playlist_id: int, body: PlaylistUpdate, request: Request):
    if body.name:
        await _store(request).rename_playlist(playlist_id, body.name)
    return {"ok": True}


@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: int, request: Request):
    await _store(request).delete_playlist(playlist_id)
    return {"ok": True}


@router.post("/{playlist_id}/tracks")
async def add_tracks(playlist_id: int, body: PlaylistAddTracks, request: Request):
    await _store(request).add_tracks(playlist_id, body.track_ids)
    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track(playlist_id: int, track_id: str, request: Request):
    await _store(request).remove_track(playlist_id, track_id)
    return {"ok": True}


@router.put("/{playlist_id}/tracks/reorder")
async def reorder_tracks(playlist_id: int, body: PlaylistReorder, request: Request):
    await _store(request).reorder_tracks(playlist_id, body.positions)
    return {"ok": True}
