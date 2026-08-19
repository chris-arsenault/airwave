import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DialogOverlay, Field } from "../library/TrackEditor";

interface Props {
  /** Track or container IDs — containers are expanded to their tracks server-side. */
  trackIds: string[];
  /** What is being added, shown in the dialog header. */
  label: string;
  onClose: () => void;
}

export function AddToPlaylistDialog({ trackIds, label, onClose }: Props) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: playlists, isLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: api.getPlaylists,
  });

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["playlists"] });
    onClose();
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
      setBusy(false);
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Add to Playlist</h2>
      <div className="text-sm text-[var(--color-text-secondary)] truncate">{label}</div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {isLoading ? (
        <div className="text-sm text-[var(--color-text-secondary)] py-2">Loading...</div>
      ) : (
        <div className="space-y-0.5 max-h-60 overflow-y-auto">
          {playlists?.map((playlist) => (
            <button
              key={playlist.id}
              disabled={busy}
              onClick={() => run(() => api.addToPlaylist(playlist.id, trackIds))}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
            >
              <span className="text-sm font-medium truncate">{playlist.name}</span>
              <span className="text-xs text-[var(--color-text-secondary)] shrink-0">
                {playlist.track_count} tracks
              </span>
            </button>
          ))}
          {!playlists?.length && (
            <div className="text-sm text-[var(--color-text-secondary)] px-3 py-2">
              No playlists yet
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/5 pt-3 space-y-3">
        <Field label="New Playlist" value={newName} onChange={setNewName} />
        <button
          disabled={busy || !newName.trim()}
          onClick={() => run(() => api.createPlaylist(newName.trim(), trackIds))}
          className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
        >
          Create &amp; Add
        </button>
      </div>
    </DialogOverlay>
  );
}
