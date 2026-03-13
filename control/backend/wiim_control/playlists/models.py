from pydantic import BaseModel


class PlaylistCreate(BaseModel):
    name: str
    track_ids: list[str] = []


class PlaylistUpdate(BaseModel):
    name: str | None = None


class PlaylistAddTracks(BaseModel):
    track_ids: list[str]


class PlaylistReorder(BaseModel):
    positions: list[int]  # new ordering of track indices


class PlaylistInfo(BaseModel):
    id: int
    name: str
    track_count: int
    created_at: str | None = None
    updated_at: str | None = None


class PlaylistTrackInfo(BaseModel):
    track_id: str
    position: int
