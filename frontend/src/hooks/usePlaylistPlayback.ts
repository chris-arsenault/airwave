import { useCallback } from "react";
import { api } from "../api/client";
import { useDeviceStore } from "../stores/deviceStore";
import { usePlayerStore } from "../stores/playerStore";

interface PlayOptions {
  shuffle?: boolean;
  startTrackId?: string;
}

/** Plays a saved playlist on the active device, optionally shuffled. */
export function usePlaylistPlayback(onPlay?: () => void) {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);
  const setPlaying = usePlayerStore((s) => s.setPlaying);

  const play = useCallback(
    async (playlistId: number, options: PlayOptions = {}) => {
      if (!activeDeviceId) return;
      await api.sessionPlay(activeDeviceId, {
        source_id: api.playlistSourceId(playlistId),
        start_track_id: options.startTrackId,
        shuffle: options.shuffle ? "tracks" : undefined,
      });
      setPlaying(true);
      onPlay?.();
    },
    [activeDeviceId, setPlaying, onPlay]
  );

  return { canPlay: !!activeDeviceId, play };
}
