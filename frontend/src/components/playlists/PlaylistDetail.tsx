import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PlaylistTrack } from "../../api/client";
import { usePlaylistPlayback } from "../../hooks/usePlaylistPlayback";
import { ChevronLeftIcon, PlayIcon, ShuffleIcon, TrashIcon } from "../library/LibraryIcons";

const ICON_BUTTON =
  "shrink-0 p-1.5 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors";
const EMPTY_TEXT = "text-center py-12 text-[var(--color-text-secondary)] text-sm";

interface Props {
  playlistId: number;
  onBack: () => void;
  onPlay?: () => void;
}

export function PlaylistDetail({ playlistId, onBack, onPlay }: Props) {
  const queryClient = useQueryClient();
  const { canPlay, play } = usePlaylistPlayback(onPlay);

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => api.getPlaylist(playlistId),
  });

  const removeTrack = useMutation({
    mutationFn: (position: number) => api.removeFromPlaylist(playlistId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });

  const tracks = data?.tracks ?? [];

  return (
    <div className="space-y-3">
      <Header
        name={data?.name}
        trackCount={tracks.length}
        showActions={canPlay && tracks.length > 0}
        onBack={onBack}
        onPlay={() => play(playlistId)}
        onShuffle={() => play(playlistId, { shuffle: true })}
      />

      {isLoading && <div className={EMPTY_TEXT}>Loading...</div>}
      {!isLoading && tracks.length === 0 && <div className={EMPTY_TEXT}>No tracks yet</div>}

      <div className="space-y-0.5">
        {tracks.map((track) => (
          <TrackRow
            key={`${track.position}-${track.track_id}`}
            track={track}
            canPlay={canPlay}
            onPlay={() => play(playlistId, { startTrackId: track.track_id })}
            onRemove={() => removeTrack.mutate(track.position)}
          />
        ))}
      </div>
    </div>
  );
}

function Header({
  name,
  trackCount,
  showActions,
  onBack,
  onPlay,
  onShuffle,
}: {
  name?: string;
  trackCount: number;
  showActions: boolean;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="text-[var(--color-text-secondary)] p-1 shrink-0">
        <ChevronLeftIcon />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold truncate">{name ?? "Playlist"}</div>
        <div className="text-xs text-[var(--color-text-secondary)]">
          {trackCount} track{trackCount === 1 ? "" : "s"}
        </div>
      </div>
      {showActions && <PlaylistActions onPlay={onPlay} onShuffle={onShuffle} />}
    </div>
  );
}

function PlaylistActions({ onPlay, onShuffle }: { onPlay: () => void; onShuffle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={onShuffle} className={ICON_BUTTON} title="Shuffle playlist">
        <ShuffleIcon />
      </button>
      <button
        onClick={onPlay}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-accent)] text-white text-xs font-medium active:scale-95 transition-transform"
        title="Play playlist"
      >
        <PlayIcon />
        Play
      </button>
    </div>
  );
}

function TrackRow({
  track,
  canPlay,
  onPlay,
  onRemove,
}: {
  track: PlaylistTrack;
  canPlay: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors group">
      <button
        onClick={onPlay}
        disabled={!canPlay || track.missing}
        className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
        title={track.missing ? "Track is no longer in the library" : "Play"}
      >
        <span className="text-xs text-[var(--color-text-secondary)] w-5 shrink-0 text-right">
          {track.position + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {track.title ?? (track.missing ? "Missing track" : track.track_id)}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] truncate">
            {[track.artist, track.album].filter(Boolean).join(" — ") || " "}
          </div>
        </div>
      </button>
      {track.duration && (
        <span className="text-xs text-[var(--color-text-secondary)] shrink-0">
          {track.duration}
        </span>
      )}
      <button onClick={onRemove} className={ICON_BUTTON} title="Remove from playlist">
        <TrashIcon />
      </button>
    </div>
  );
}
