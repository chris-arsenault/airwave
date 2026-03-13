from enum import Enum

from pydantic import BaseModel


class ShuffleMode(str, Enum):
    OFF = "off"
    ALL = "shuffle_all"
    SONGS = "shuffle_songs"
    CATEGORIES = "shuffle_categories"
    SONGS_AND_CATEGORIES = "shuffle_songs_and_categories"


class RepeatMode(str, Enum):
    OFF = "off"
    TRACK = "track"
    CATEGORY = "category"
    ALL = "all"
    ADVANCE = "advance"


class QueueTrack(BaseModel):
    id: str
    title: str
    artist: str | None = None
    album: str | None = None
    duration: str | None = None
    stream_url: str | None = None


class PlaybackState(BaseModel):
    target_id: str
    playing: bool = False
    current_track: QueueTrack | None = None
    position: int = 0  # current position in queue
    queue_length: int = 0
    shuffle_mode: ShuffleMode = ShuffleMode.OFF
    repeat_mode: RepeatMode = RepeatMode.OFF
    elapsed_seconds: float = 0.0
    duration_seconds: float = 0.0


class PlayRequest(BaseModel):
    track_id: str | None = None
    track_ids: list[str] | None = None
    container_id: str | None = None
    start_index: int = 0


class SeekRequest(BaseModel):
    position_seconds: float


class ShuffleModeRequest(BaseModel):
    mode: ShuffleMode


class RepeatModeRequest(BaseModel):
    mode: RepeatMode


class QueueAddRequest(BaseModel):
    track_ids: list[str]
    position: str = "end"  # "next" or "end"
