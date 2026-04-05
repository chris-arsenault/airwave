import { useCallback, useState } from "react";
import { api } from "../../api/client";
import { usePlayerStore } from "../../stores/playerStore";
import { useDeviceStore } from "../../stores/deviceStore";
import { useArtColor } from "../../hooks/useArtColor";
import { useMediaSessionDebug } from "../../hooks/useMediaSession";
import { DevicePill } from "../layout/DevicePill";
import { useSleepTimerSync, formatTime, NowPlayingArt } from "./NowPlayingHelpers";
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  ShuffleIcon,
  RepeatIcon,
  MoonIcon,
  SeekForwardIcon,
  SeekBackIcon,
} from "./NowPlayingIcons";

const SHUFFLE_MODES = ["off", "tracks", "groups", "both"] as const;
const SHUFFLE_LABELS: Record<string, string> = {
  off: "Off",
  tracks: "Songs",
  groups: "Albums",
  both: "All",
};

const REPEAT_MODES = ["off", "all", "track"] as const;
const REPEAT_LABELS: Record<string, string> = {
  off: "Off",
  all: "All",
  track: "1",
};

export function NowPlaying() {
  return (
    <NowPlayingLayout>
      <DebugOverlay />
      <NowPlayingHeader />
      <NowPlayingArtSection />
      <TrackInfoSection />
      <SeekBarSection />
      <TransportControls />
      <div className="pb-20 md:pb-2 shrink-0" />
    </NowPlayingLayout>
  );
}

function NowPlayingLayout({ children }: { children: React.ReactNode }) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const colors = useArtColor(currentTrack?.id ?? null);

  return (
    <div
      className="flex flex-col h-full now-playing-bg"
      ref={(el) => {
        if (el) el.style.setProperty("--bg-color", colors.muted);
      }}
    >
      {children}
    </div>
  );
}

function DebugOverlay() {
  const debugLogs = useMediaSessionDebug();
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div className="shrink-0">
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="w-full text-[10px] text-white/30 py-0.5 text-center"
      >
        {showDebug ? "hide debug" : `media session debug (${debugLogs.length})`}
      </button>
      {showDebug && (
        <div className="bg-black/80 text-[10px] font-mono text-green-400 px-3 py-2 max-h-48 overflow-y-auto">
          {debugLogs.length === 0 ? (
            <div className="text-white/30">no logs yet</div>
          ) : (
            debugLogs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      )}
    </div>
  );
}

function NowPlayingHeader() {
  const session = usePlayerStore((s) => s.session);
  const sleepRemaining = usePlayerStore((s) => s.sleepRemaining);
  const setSleepRemaining = usePlayerStore((s) => s.setSleepRemaining);
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);
  const [sleepTimerOpen, setSleepTimerOpen] = useState(false);

  const handleSetSleepTimer = useCallback(
    async (minutes: number) => {
      if (!activeDeviceId) return;
      await api.setSleepTimer(activeDeviceId, minutes);
      setSleepRemaining(minutes * 60);
      setSleepTimerOpen(false);
    },
    [activeDeviceId, setSleepRemaining]
  );

  const handleCancelSleepTimer = useCallback(async () => {
    if (!activeDeviceId) return;
    await api.cancelSleepTimer(activeDeviceId);
    setSleepRemaining(null);
    setSleepTimerOpen(false);
  }, [activeDeviceId, setSleepRemaining]);

  return (
    <div className="flex items-center justify-between px-4 py-3 shrink-0">
      <DevicePill />
      <div className="text-center flex-1 min-w-0 px-2">
        {session && (
          <div className="text-[10px] text-white/40 truncate">
            {session.label}
            {session.total_tracks > 0 && ` \u2022 ${session.position + 1}/${session.total_tracks}`}
          </div>
        )}
      </div>
      <SleepTimerButton
        sleepRemaining={sleepRemaining}
        isOpen={sleepTimerOpen}
        onToggle={() => setSleepTimerOpen(!sleepTimerOpen)}
        onSet={handleSetSleepTimer}
        onCancel={handleCancelSleepTimer}
      />
    </div>
  );
}

function SleepTimerButton({
  sleepRemaining,
  isOpen,
  onToggle,
  onSet,
  onCancel,
}: {
  sleepRemaining: number | null;
  isOpen: boolean;
  onToggle: () => void;
  onSet: (minutes: number) => void;
  onCancel: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`p-2 ${sleepRemaining ? "text-[var(--color-accent)]" : "text-white/40"} hover:text-white`}
        title="Sleep timer"
      >
        <MoonIcon />
        {sleepRemaining != null && sleepRemaining > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-[var(--color-accent)] text-white rounded-full w-4 h-4 flex items-center justify-center">
            {Math.ceil(sleepRemaining / 60)}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-10 bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-white/10 py-1 z-50 min-w-[140px]">
          {[15, 30, 45, 60, 90].map((m) => (
            <button
              key={m}
              onClick={() => onSet(m)}
              className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              {m} min
            </button>
          ))}
          {sleepRemaining != null && (
            <button
              onClick={onCancel}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 border-t border-white/5"
            >
              Cancel timer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NowPlayingArtSection() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  return (
    <div className="flex-1 flex items-center justify-center px-8 min-h-0">
      <NowPlayingArt trackId={currentTrack?.id ?? null} title={currentTrack?.title ?? null} />
    </div>
  );
}

function TrackInfoSection() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const rating = usePlayerStore((s) => s.rating);
  const setRating = usePlayerStore((s) => s.setRating);
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);

  const handleRate = useCallback(
    async (stars: number) => {
      if (!activeDeviceId || !currentTrack) return;
      setRating(stars);
      await api.rateTrack(activeDeviceId, currentTrack.id, stars);
    },
    [activeDeviceId, currentTrack, setRating]
  );

  return (
    <div className="px-6 py-2 text-center shrink-0">
      <div className="text-lg font-semibold truncate text-white">
        {currentTrack?.title ?? "Nothing playing"}
      </div>
      <div className="text-sm text-white/60 truncate mt-0.5">
        {currentTrack
          ? [currentTrack.artist, currentTrack.album].filter(Boolean).join(" \u2014 ")
          : "Select a track to play"}
      </div>
      {currentTrack && <StarRating rating={rating} onRate={handleRate} />}
    </div>
  );
}

function StarRating({ rating, onRate }: { rating: number; onRate: (stars: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1 mt-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          className={`text-lg ${star <= rating ? "text-yellow-400" : "text-white/20"} hover:text-yellow-300 transition-colors`}
        >
          {star <= rating ? "\u2605" : "\u2606"}
        </button>
      ))}
    </div>
  );
}

function SeekBarSection() {
  const { elapsedSeconds, durationSeconds, allowedActions } = usePlayerStore();
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);
  const activeDevice = useDeviceStore((s) => s.devices.find((d) => d.id === s.activeDeviceId));

  useSleepTimerSync();

  const isWiim = activeDevice?.device_type === "wiim";
  const canSeek = allowedActions.length === 0 || allowedActions.includes("Seek");
  const canQuickSeek = canSeek && isWiim;

  const handleSeek = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activeDeviceId) return;
      await api.seek(activeDeviceId, parseFloat(e.target.value));
    },
    [activeDeviceId]
  );

  const handleSeekForward = useCallback(async () => {
    if (!activeDeviceId) return;
    await api.seekForward(activeDeviceId);
  }, [activeDeviceId]);

  const handleSeekBackward = useCallback(async () => {
    if (!activeDeviceId) return;
    await api.seekBackward(activeDeviceId);
  }, [activeDeviceId]);

  return (
    <div className="px-6 py-2 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSeekBackward}
          disabled={!canQuickSeek}
          className="p-1 text-white/50 hover:text-white disabled:opacity-30 shrink-0"
          title="Seek backward"
        >
          <SeekBackIcon />
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={durationSeconds || 1}
            value={elapsedSeconds}
            onChange={handleSeek}
            className="seek-bar w-full"
          />
        </div>
        <button
          onClick={handleSeekForward}
          disabled={!canQuickSeek}
          className="p-1 text-white/50 hover:text-white disabled:opacity-30 shrink-0"
          title="Seek forward"
        >
          <SeekForwardIcon />
        </button>
      </div>
      <div className="flex justify-between text-xs text-white/50 mt-1 px-7">
        <span>{formatTime(elapsedSeconds)}</span>
        <span>{formatTime(durationSeconds)}</span>
      </div>
    </div>
  );
}

function useTransportActions() {
  const { playing, shuffleMode, repeatMode, session } = usePlayerStore();
  const { setPlaying, setShuffleMode, setRepeatMode } = usePlayerStore();
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);

  const handlePlayPause = useCallback(async () => {
    if (!activeDeviceId) return;
    if (playing) {
      await api.pause(activeDeviceId);
      setPlaying(false);
    } else {
      await api.resume(activeDeviceId);
      setPlaying(true);
    }
  }, [activeDeviceId, playing, setPlaying]);

  const handleNext = useCallback(async () => {
    if (!activeDeviceId) return;
    if (session) await api.sessionNext(activeDeviceId);
    else await api.next(activeDeviceId);
  }, [activeDeviceId, session]);

  const handlePrev = useCallback(async () => {
    if (!activeDeviceId) return;
    if (session) await api.sessionPrev(activeDeviceId);
    else await api.prev(activeDeviceId);
  }, [activeDeviceId, session]);

  const cycleShuffle = useCallback(async () => {
    if (!activeDeviceId) return;
    const idx = SHUFFLE_MODES.indexOf(shuffleMode as (typeof SHUFFLE_MODES)[number]);
    const next = SHUFFLE_MODES[(idx + 1) % SHUFFLE_MODES.length];
    if (session) await api.sessionSetShuffle(activeDeviceId, next);
    else await api.setShuffle(activeDeviceId, next);
    setShuffleMode(next);
  }, [activeDeviceId, shuffleMode, setShuffleMode, session]);

  const cycleRepeat = useCallback(async () => {
    if (!activeDeviceId) return;
    const idx = REPEAT_MODES.indexOf(repeatMode as (typeof REPEAT_MODES)[number]);
    const next = REPEAT_MODES[(idx + 1) % REPEAT_MODES.length];
    if (session) await api.sessionSetRepeat(activeDeviceId, next);
    else await api.setRepeat(activeDeviceId, next);
    setRepeatMode(next);
  }, [activeDeviceId, repeatMode, setRepeatMode, session]);

  return { handlePlayPause, handleNext, handlePrev, cycleShuffle, cycleRepeat };
}

function ShuffleButton({ mode, onCycle }: { mode: string; onCycle: () => void }) {
  const isActive = mode !== "off";
  return (
    <button
      onClick={onCycle}
      className={`p-2 text-sm ${isActive ? "text-white" : "text-white/40"}`}
      title={`Shuffle: ${SHUFFLE_LABELS[mode] ?? mode}`}
    >
      <ShuffleIcon />
      {isActive && <div className="text-[10px] mt-0.5">{SHUFFLE_LABELS[mode]}</div>}
    </button>
  );
}

function RepeatButton({ mode, onCycle }: { mode: string; onCycle: () => void }) {
  const isActive = mode !== "off";
  return (
    <button
      onClick={onCycle}
      className={`p-2 text-sm ${isActive ? "text-white" : "text-white/40"}`}
      title={`Repeat: ${REPEAT_LABELS[mode] ?? mode}`}
    >
      <RepeatIcon />
      {isActive && <div className="text-[10px] mt-0.5">{REPEAT_LABELS[mode]}</div>}
    </button>
  );
}

function TransportControls() {
  const { playing, shuffleMode, repeatMode, allowedActions } = usePlayerStore();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const colors = useArtColor(currentTrack?.id ?? null);
  const canNext = allowedActions.length === 0 || allowedActions.includes("Next");
  const canPrev = allowedActions.length === 0 || allowedActions.includes("Previous");
  const { handlePlayPause, handleNext, handlePrev, cycleShuffle, cycleRepeat } =
    useTransportActions();

  return (
    <div className="flex items-center justify-center gap-6 py-3 shrink-0">
      <ShuffleButton mode={shuffleMode} onCycle={cycleShuffle} />
      <button
        onClick={handlePrev}
        disabled={!canPrev}
        className="p-3 text-white disabled:opacity-30"
      >
        <PrevIcon />
      </button>
      <button
        onClick={handlePlayPause}
        className="w-16 h-16 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform now-playing-play-btn"
        ref={(el) => {
          if (el) el.style.setProperty("--btn-color", colors.dominant);
        }}
      >
        {playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
      </button>
      <button
        onClick={handleNext}
        disabled={!canNext}
        className="p-3 text-white disabled:opacity-30"
      >
        <NextIcon />
      </button>
      <RepeatButton mode={repeatMode} onCycle={cycleRepeat} />
    </div>
  );
}
