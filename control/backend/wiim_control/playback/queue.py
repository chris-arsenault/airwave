"""Server-side queue engine with shuffle/repeat logic."""

import random

from wiim_control.playback.models import QueueTrack, RepeatMode, ShuffleMode


class PlayQueue:
    """Manages a play queue for a single device/group target."""

    def __init__(self):
        self.tracks: list[QueueTrack] = []
        self.position: int = 0
        self.shuffle_mode: ShuffleMode = ShuffleMode.OFF
        self.repeat_mode: RepeatMode = RepeatMode.OFF
        self._shuffle_order: list[int] = []
        self._shuffle_pos: int = 0
        # Category context: tracks belonging to current album/artist
        self._category_start: int = 0
        self._category_end: int = 0

    def set_tracks(self, tracks: list[QueueTrack], start_index: int = 0):
        """Replace the queue with new tracks."""
        self.tracks = tracks
        self.position = start_index
        self._rebuild_shuffle()

    def add_tracks(self, tracks: list[QueueTrack], next: bool = False):
        """Add tracks to the queue."""
        if next:
            insert_at = self.position + 1
            for i, track in enumerate(tracks):
                self.tracks.insert(insert_at + i, track)
        else:
            self.tracks.extend(tracks)
        self._rebuild_shuffle()

    def remove_track(self, index: int):
        if 0 <= index < len(self.tracks):
            self.tracks.pop(index)
            if self.position >= len(self.tracks):
                self.position = max(0, len(self.tracks) - 1)
            self._rebuild_shuffle()

    def reorder(self, from_index: int, to_index: int):
        if 0 <= from_index < len(self.tracks) and 0 <= to_index < len(self.tracks):
            track = self.tracks.pop(from_index)
            self.tracks.insert(to_index, track)

    def current(self) -> QueueTrack | None:
        if not self.tracks:
            return None
        idx = self._effective_index()
        if 0 <= idx < len(self.tracks):
            return self.tracks[idx]
        return None

    def advance(self) -> QueueTrack | None:
        """Move to the next track based on shuffle/repeat mode."""
        if not self.tracks:
            return None

        if self.repeat_mode == RepeatMode.TRACK:
            return self.current()

        if self.shuffle_mode != ShuffleMode.OFF:
            return self._advance_shuffled()

        # Sequential advance
        self.position += 1
        if self.position >= len(self.tracks):
            if self.repeat_mode in (RepeatMode.ALL, RepeatMode.CATEGORY):
                self.position = 0
            else:
                self.position = len(self.tracks) - 1
                return None  # end of queue

        return self.current()

    def go_back(self) -> QueueTrack | None:
        """Move to the previous track."""
        if not self.tracks:
            return None

        if self.shuffle_mode != ShuffleMode.OFF and self._shuffle_order:
            self._shuffle_pos = max(0, self._shuffle_pos - 1)
            self.position = self._shuffle_order[self._shuffle_pos]
            return self.current()

        self.position = max(0, self.position - 1)
        return self.current()

    def clear(self):
        self.tracks.clear()
        self.position = 0
        self._shuffle_order.clear()
        self._shuffle_pos = 0

    def _effective_index(self) -> int:
        if self.shuffle_mode != ShuffleMode.OFF and self._shuffle_order:
            return self._shuffle_order[self._shuffle_pos]
        return self.position

    def _advance_shuffled(self) -> QueueTrack | None:
        self._shuffle_pos += 1
        if self._shuffle_pos >= len(self._shuffle_order):
            if self.repeat_mode in (RepeatMode.ALL, RepeatMode.CATEGORY):
                self._rebuild_shuffle()
                self._shuffle_pos = 0
            else:
                return None

        self.position = self._shuffle_order[self._shuffle_pos]
        return self.current()

    def _rebuild_shuffle(self):
        if self.shuffle_mode == ShuffleMode.OFF or not self.tracks:
            self._shuffle_order = []
            return

        indices = list(range(len(self.tracks)))
        random.shuffle(indices)
        # Ensure current track is first if we have one
        if self.position in indices:
            indices.remove(self.position)
            indices.insert(0, self.position)
        self._shuffle_order = indices
        self._shuffle_pos = 0
