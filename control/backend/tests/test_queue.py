"""Unit tests for the server-side play queue."""

from wiim_control.playback.models import QueueTrack, RepeatMode, ShuffleMode
from wiim_control.playback.queue import PlayQueue


def _track(id: str, title: str = "Track") -> QueueTrack:
    return QueueTrack(id=id, title=f"{title} {id}")


def test_empty_queue_returns_none():
    q = PlayQueue()
    assert q.current() is None
    assert q.advance() is None


def test_set_tracks_and_advance():
    q = PlayQueue()
    q.set_tracks([_track("1"), _track("2"), _track("3")])
    assert q.current().id == "1"
    assert q.advance().id == "2"
    assert q.advance().id == "3"
    assert q.advance() is None  # end of queue


def test_repeat_track():
    q = PlayQueue()
    q.repeat_mode = RepeatMode.TRACK
    q.set_tracks([_track("1"), _track("2")])
    assert q.advance().id == "1"
    assert q.advance().id == "1"


def test_repeat_all():
    q = PlayQueue()
    q.repeat_mode = RepeatMode.ALL
    q.set_tracks([_track("1"), _track("2")])
    assert q.advance().id == "2"
    assert q.advance().id == "1"  # wraps around


def test_go_back():
    q = PlayQueue()
    q.set_tracks([_track("1"), _track("2"), _track("3")])
    q.advance()
    q.advance()
    assert q.current().id == "3"
    assert q.go_back().id == "2"
    assert q.go_back().id == "1"
    assert q.go_back().id == "1"  # stays at start


def test_add_tracks_end():
    q = PlayQueue()
    q.set_tracks([_track("1")])
    q.add_tracks([_track("2"), _track("3")])
    assert len(q.tracks) == 3
    assert q.tracks[2].id == "3"


def test_add_tracks_next():
    q = PlayQueue()
    q.set_tracks([_track("1"), _track("3")])
    q.add_tracks([_track("2")], next=True)
    assert q.tracks[1].id == "2"
    assert q.tracks[2].id == "3"


def test_remove_track():
    q = PlayQueue()
    q.set_tracks([_track("1"), _track("2"), _track("3")])
    q.remove_track(1)
    assert len(q.tracks) == 2
    assert q.tracks[1].id == "3"


def test_clear():
    q = PlayQueue()
    q.set_tracks([_track("1"), _track("2")])
    q.clear()
    assert len(q.tracks) == 0
    assert q.current() is None


def test_shuffle_produces_all_tracks():
    q = PlayQueue()
    q.shuffle_mode = ShuffleMode.ALL
    tracks = [_track(str(i)) for i in range(10)]
    q.set_tracks(tracks)

    seen = {q.current().id}
    for _ in range(9):
        t = q.advance()
        if t:
            seen.add(t.id)

    assert len(seen) == 10  # all tracks visited
