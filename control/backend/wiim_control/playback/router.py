from fastapi import APIRouter, HTTPException, Request

from wiim_control.events import publish
from wiim_control.library import dlna_client
from wiim_control.playback.models import (
    PlaybackState,
    PlayRequest,
    QueueAddRequest,
    QueueTrack,
    RepeatModeRequest,
    SeekRequest,
    ShuffleModeRequest,
)
from wiim_control.playback.queue import PlayQueue

router = APIRouter()

# Per-target play queues
_queues: dict[str, PlayQueue] = {}


def _get_queue(target_id: str) -> PlayQueue:
    if target_id not in _queues:
        _queues[target_id] = PlayQueue()
    return _queues[target_id]


def _mgr(request: Request):
    return request.app.state.device_manager


async def _play_track_on_device(request: Request, target_id: str, track: QueueTrack):
    """Send a play_url command to the target device."""
    mgr = _mgr(request)
    player = mgr.get_player(target_id)
    if not player:
        raise HTTPException(404, "Device not found")
    if track.stream_url:
        await player.play_url(track.stream_url)


async def _resolve_tracks(track_ids: list[str]) -> list[QueueTrack]:
    """Resolve track IDs to QueueTrack objects via DLNA browsing."""
    # For now, browse each track's metadata
    tracks = []
    for tid in track_ids:
        result = await dlna_client.browse(object_id=tid)
        # browse returns parent's children; we might need BrowseMetadata
        # Simplified: search for the ID in results
        for item in result.get("items", []):
            if item.get("id") == tid:
                tracks.append(
                    QueueTrack(
                        id=item["id"],
                        title=item.get("title", "Unknown"),
                        artist=item.get("artist"),
                        album=item.get("album"),
                        duration=item.get("duration"),
                        stream_url=item.get("stream_url"),
                    )
                )
                break
    return tracks


@router.get("/{target_id}", response_model=PlaybackState)
async def get_state(target_id: str):
    queue = _get_queue(target_id)
    current = queue.current()
    return PlaybackState(
        target_id=target_id,
        playing=current is not None,
        current_track=current,
        position=queue.position,
        queue_length=len(queue.tracks),
        shuffle_mode=queue.shuffle_mode,
        repeat_mode=queue.repeat_mode,
    )


@router.post("/{target_id}/play")
async def play(target_id: str, body: PlayRequest, request: Request):
    queue = _get_queue(target_id)

    if body.container_id:
        # Browse container and enqueue all tracks
        result = await dlna_client.browse(object_id=body.container_id, count=9999)
        tracks = [
            QueueTrack(
                id=item["id"],
                title=item.get("title", "Unknown"),
                artist=item.get("artist"),
                album=item.get("album"),
                duration=item.get("duration"),
                stream_url=item.get("stream_url"),
            )
            for item in result.get("items", [])
            if item.get("type") == "track"
        ]
        queue.set_tracks(tracks, start_index=body.start_index)
    elif body.track_ids:
        tracks = await _resolve_tracks(body.track_ids)
        queue.set_tracks(tracks, start_index=body.start_index)
    elif body.track_id:
        tracks = await _resolve_tracks([body.track_id])
        queue.set_tracks(tracks)

    current = queue.current()
    if current:
        await _play_track_on_device(request, target_id, current)
        publish(
            "playback_update",
            {
                "target_id": target_id,
                "track": current.model_dump(),
                "position": queue.position,
            },
        )

    return {"ok": True}


@router.post("/{target_id}/pause")
async def pause(target_id: str, request: Request):
    player = _mgr(request).get_player(target_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.pause()
    publish("playback_update", {"target_id": target_id, "playing": False})
    return {"ok": True}


@router.post("/{target_id}/resume")
async def resume(target_id: str, request: Request):
    player = _mgr(request).get_player(target_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.resume()
    publish("playback_update", {"target_id": target_id, "playing": True})
    return {"ok": True}


@router.post("/{target_id}/next")
async def next_track(target_id: str, request: Request):
    queue = _get_queue(target_id)
    track = queue.advance()
    if track:
        await _play_track_on_device(request, target_id, track)
        publish(
            "playback_update",
            {
                "target_id": target_id,
                "track": track.model_dump(),
                "position": queue.position,
            },
        )
    return {"ok": True, "track": track.model_dump() if track else None}


@router.post("/{target_id}/prev")
async def prev_track(target_id: str, request: Request):
    queue = _get_queue(target_id)
    track = queue.go_back()
    if track:
        await _play_track_on_device(request, target_id, track)
        publish(
            "playback_update",
            {
                "target_id": target_id,
                "track": track.model_dump(),
                "position": queue.position,
            },
        )
    return {"ok": True, "track": track.model_dump() if track else None}


@router.post("/{target_id}/seek")
async def seek(target_id: str, body: SeekRequest, request: Request):
    player = _mgr(request).get_player(target_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.seek(int(body.position_seconds))
    return {"ok": True}


@router.post("/{target_id}/shuffle")
async def set_shuffle(target_id: str, body: ShuffleModeRequest):
    queue = _get_queue(target_id)
    queue.shuffle_mode = body.mode
    queue._rebuild_shuffle()
    publish("playback_update", {"target_id": target_id, "shuffle_mode": body.mode})
    return {"ok": True}


@router.post("/{target_id}/repeat")
async def set_repeat(target_id: str, body: RepeatModeRequest):
    queue = _get_queue(target_id)
    queue.repeat_mode = body.mode
    publish("playback_update", {"target_id": target_id, "repeat_mode": body.mode})
    return {"ok": True}


# Queue management
@router.get("/{target_id}/queue")
async def get_queue(target_id: str):
    queue = _get_queue(target_id)
    return {
        "tracks": [t.model_dump() for t in queue.tracks],
        "position": queue.position,
    }


@router.post("/{target_id}/queue/add")
async def add_to_queue(target_id: str, body: QueueAddRequest):
    queue = _get_queue(target_id)
    tracks = await _resolve_tracks(body.track_ids)
    queue.add_tracks(tracks, next=(body.position == "next"))
    publish(
        "queue_update",
        {
            "target_id": target_id,
            "queue_length": len(queue.tracks),
        },
    )
    return {"ok": True}


@router.delete("/{target_id}/queue/{index}")
async def remove_from_queue(target_id: str, index: int):
    queue = _get_queue(target_id)
    queue.remove_track(index)
    publish(
        "queue_update",
        {
            "target_id": target_id,
            "queue_length": len(queue.tracks),
        },
    )
    return {"ok": True}


@router.delete("/{target_id}/queue")
async def clear_queue(target_id: str):
    queue = _get_queue(target_id)
    queue.clear()
    publish("queue_update", {"target_id": target_id, "queue_length": 0})
    return {"ok": True}
