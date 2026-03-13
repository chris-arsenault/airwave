"""SQLite-backed playlist persistence."""

import aiosqlite

_SCHEMA = """
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist
ON playlist_tracks(playlist_id, position);
"""


class PlaylistStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._db: aiosqlite.Connection | None = None

    async def init(self):
        self._db = await aiosqlite.connect(self.db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(_SCHEMA)
        await self._db.execute("PRAGMA foreign_keys = ON")
        await self._db.commit()

    async def close(self):
        if self._db:
            await self._db.close()

    async def list_playlists(self) -> list[dict]:
        cursor = await self._db.execute(
            """SELECT p.id, p.name, p.created_at, p.updated_at,
                      COUNT(pt.id) as track_count
               FROM playlists p
               LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
               GROUP BY p.id
               ORDER BY p.name"""
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def create_playlist(self, name: str, track_ids: list[str] | None = None) -> int:
        cursor = await self._db.execute("INSERT INTO playlists (name) VALUES (?)", (name,))
        playlist_id = cursor.lastrowid
        if track_ids:
            await self._insert_tracks(playlist_id, track_ids)
        await self._db.commit()
        return playlist_id

    async def get_playlist(self, playlist_id: int) -> dict | None:
        cursor = await self._db.execute(
            "SELECT id, name, created_at, updated_at FROM playlists WHERE id = ?",
            (playlist_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return None

        tracks_cursor = await self._db.execute(
            "SELECT track_id, position FROM playlist_tracks"
            " WHERE playlist_id = ? ORDER BY position",
            (playlist_id,),
        )
        tracks = await tracks_cursor.fetchall()
        return {
            **dict(row),
            "tracks": [dict(t) for t in tracks],
            "track_count": len(tracks),
        }

    async def rename_playlist(self, playlist_id: int, name: str):
        await self._db.execute(
            "UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?",
            (name, playlist_id),
        )
        await self._db.commit()

    async def delete_playlist(self, playlist_id: int):
        await self._db.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
        await self._db.commit()

    async def add_tracks(self, playlist_id: int, track_ids: list[str]):
        # Get current max position
        cursor = await self._db.execute(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?",
            (playlist_id,),
        )
        row = await cursor.fetchone()
        start_pos = row[0] + 1
        for i, tid in enumerate(track_ids):
            await self._db.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                (playlist_id, tid, start_pos + i),
            )
        await self._db.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?",
            (playlist_id,),
        )
        await self._db.commit()

    async def remove_track(self, playlist_id: int, track_id: str):
        await self._db.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
            (playlist_id, track_id),
        )
        await self._reindex(playlist_id)
        await self._db.commit()

    async def reorder_tracks(self, playlist_id: int, positions: list[int]):
        cursor = await self._db.execute(
            "SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
            (playlist_id,),
        )
        rows = await cursor.fetchall()
        row_ids = [r["id"] for r in rows]
        for new_pos, old_idx in enumerate(positions):
            if 0 <= old_idx < len(row_ids):
                await self._db.execute(
                    "UPDATE playlist_tracks SET position = ? WHERE id = ?",
                    (new_pos, row_ids[old_idx]),
                )
        await self._db.commit()

    async def _insert_tracks(self, playlist_id: int, track_ids: list[str]):
        for i, tid in enumerate(track_ids):
            await self._db.execute(
                "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                (playlist_id, tid, i),
            )

    async def _reindex(self, playlist_id: int):
        cursor = await self._db.execute(
            "SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
            (playlist_id,),
        )
        rows = await cursor.fetchall()
        for i, row in enumerate(rows):
            await self._db.execute(
                "UPDATE playlist_tracks SET position = ? WHERE id = ?",
                (i, row["id"]),
            )
