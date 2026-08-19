import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Playlist } from "../../api/client";
import { usePlaylistPlayback } from "../../hooks/usePlaylistPlayback";
import { ChevronRightIcon, PlayIcon, ShuffleIcon, TrashIcon } from "../library/LibraryIcons";
import { PlaylistDetail } from "./PlaylistDetail";

const ICON_BUTTON =
  "shrink-0 p-1.5 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors";

export function PlaylistsView({ onPlay }: { onPlay?: () => void }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (openId !== null) {
    return <PlaylistDetail playlistId={openId} onBack={() => setOpenId(null)} onPlay={onPlay} />;
  }
  return <PlaylistList onOpen={setOpenId} onPlay={onPlay} />;
}

function PlaylistList({ onOpen, onPlay }: { onOpen: (id: number) => void; onPlay?: () => void }) {
  const queryClient = useQueryClient();
  const { canPlay, play } = usePlaylistPlayback(onPlay);
  const { data: playlists, isLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: api.getPlaylists,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["playlists"] });
  const createPlaylist = useMutation({
    mutationFn: (name: string) => api.createPlaylist(name),
    onSuccess: invalidate,
  });
  const deletePlaylist = useMutation({
    mutationFn: (id: number) => api.deletePlaylist(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      <NewPlaylistForm onCreate={(name) => createPlaylist.mutate(name)} />
      {isLoading && (
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
          Loading...
        </div>
      )}
      {!isLoading && !playlists?.length && (
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
          No playlists yet
        </div>
      )}
      <div className="space-y-0.5">
        {playlists?.map((playlist) => (
          <PlaylistRow
            key={playlist.id}
            playlist={playlist}
            canPlay={canPlay}
            onOpen={() => onOpen(playlist.id)}
            onPlay={() => play(playlist.id)}
            onShuffle={() => play(playlist.id, { shuffle: true })}
            onDelete={() => deletePlaylist.mutate(playlist.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NewPlaylistForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New playlist name"
        aria-label="New playlist name"
        className="flex-1 bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-text-secondary)]"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
      >
        Create
      </button>
    </form>
  );
}

function PlaylistRow({
  playlist,
  canPlay,
  onOpen,
  onPlay,
  onShuffle,
  onDelete,
}: {
  playlist: Playlist;
  canPlay: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onShuffle: () => void;
  onDelete: () => void;
}) {
  const empty = playlist.track_count === 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors group">
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{playlist.name}</div>
          <div className="text-xs text-[var(--color-text-secondary)] truncate">
            {playlist.track_count} track{playlist.track_count === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronRightIcon className="text-[var(--color-text-secondary)] shrink-0" />
      </button>
      {canPlay && !empty && (
        <>
          <button onClick={onShuffle} className={ICON_BUTTON} title="Shuffle playlist">
            <ShuffleIcon />
          </button>
          <button onClick={onPlay} className={ICON_BUTTON} title="Play playlist">
            <PlayIcon />
          </button>
        </>
      )}
      <button onClick={onDelete} className={ICON_BUTTON} title="Delete playlist">
        <TrashIcon />
      </button>
    </div>
  );
}
