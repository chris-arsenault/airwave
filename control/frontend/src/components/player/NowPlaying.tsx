import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../../api/client'
import { usePlayerStore } from '../../stores/playerStore'
import { useDeviceStore } from '../../stores/deviceStore'
import { useArtColor } from '../../hooks/useArtColor'

const SHUFFLE_MODES = ['off', 'tracks', 'groups', 'both'] as const
const SHUFFLE_LABELS: Record<string, string> = {
  off: 'Off',
  tracks: 'Songs',
  groups: 'Albums',
  both: 'All',
}

const REPEAT_MODES = ['off', 'all', 'track'] as const
const REPEAT_LABELS: Record<string, string> = {
  off: 'Off',
  all: 'All',
  track: '1',
}

interface Props {
  open: boolean
  onClose: () => void
}

export function NowPlaying({ open, onClose }: Props) {
  const { playing, currentTrack, elapsedSeconds, durationSeconds, shuffleMode, repeatMode, session, allowedActions } = usePlayerStore()
  const { setPlaying, setShuffleMode, setRepeatMode } = usePlayerStore()
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const activeDevice = useDeviceStore((s) => s.devices.find((d) => d.id === s.activeDeviceId))
  const colors = useArtColor(currentTrack?.id ?? null)
  const rating = usePlayerStore((s) => s.rating)
  const setRating = usePlayerStore((s) => s.setRating)
  const sleepRemaining = usePlayerStore((s) => s.sleepRemaining)
  const setSleepRemaining = usePlayerStore((s) => s.setSleepRemaining)
  const [sleepTimerOpen, setSleepTimerOpen] = useState(false)

  // Fetch sleep timer state once when device changes (SSE handles updates after that)
  useEffect(() => {
    if (!activeDeviceId) return
    let cancelled = false
    api.getSleepTimer(activeDeviceId).then((res) => {
      if (!cancelled) setSleepRemaining(res.remaining_seconds)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [activeDeviceId, setSleepRemaining])

  // Local countdown — decrement sleepRemaining every second so the UI ticks without polling
  useEffect(() => {
    if (sleepRemaining == null || sleepRemaining <= 0) return
    const interval = setInterval(() => {
      usePlayerStore.setState((s) => ({
        sleepRemaining: s.sleepRemaining != null && s.sleepRemaining > 1
          ? s.sleepRemaining - 1
          : s.sleepRemaining,
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepRemaining != null && sleepRemaining > 0])

  const handlePlayPause = useCallback(async () => {
    if (!activeDeviceId) return
    if (playing) {
      await api.pause(activeDeviceId)
      setPlaying(false)
    } else {
      await api.resume(activeDeviceId)
      setPlaying(true)
    }
  }, [activeDeviceId, playing, setPlaying])

  const handleNext = useCallback(async () => {
    if (!activeDeviceId) return
    if (session) {
      await api.sessionNext(activeDeviceId)
    } else {
      await api.next(activeDeviceId)
    }
  }, [activeDeviceId, session])

  const handlePrev = useCallback(async () => {
    if (!activeDeviceId) return
    if (session) {
      await api.sessionPrev(activeDeviceId)
    } else {
      await api.prev(activeDeviceId)
    }
  }, [activeDeviceId, session])

  const handleSeek = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeDeviceId) return
    await api.seek(activeDeviceId, parseFloat(e.target.value))
  }, [activeDeviceId])

  const handleSeekForward = useCallback(async () => {
    if (!activeDeviceId) return
    await api.seekForward(activeDeviceId)
  }, [activeDeviceId])

  const handleSeekBackward = useCallback(async () => {
    if (!activeDeviceId) return
    await api.seekBackward(activeDeviceId)
  }, [activeDeviceId])

  const handleSetSleepTimer = useCallback(async (minutes: number) => {
    if (!activeDeviceId) return
    await api.setSleepTimer(activeDeviceId, minutes)
    setSleepRemaining(minutes * 60)
    setSleepTimerOpen(false)
  }, [activeDeviceId, setSleepRemaining])

  const handleCancelSleepTimer = useCallback(async () => {
    if (!activeDeviceId) return
    await api.cancelSleepTimer(activeDeviceId)
    setSleepRemaining(null)
    setSleepTimerOpen(false)
  }, [activeDeviceId, setSleepRemaining])

  const handleRate = useCallback(async (stars: number) => {
    if (!activeDeviceId || !currentTrack) return
    setRating(stars)
    await api.rateTrack(activeDeviceId, currentTrack.id, stars)
  }, [activeDeviceId, currentTrack])

  const cycleShuffle = useCallback(async () => {
    if (!activeDeviceId) return
    const idx = SHUFFLE_MODES.indexOf(shuffleMode as typeof SHUFFLE_MODES[number])
    const next = SHUFFLE_MODES[(idx + 1) % SHUFFLE_MODES.length]
    if (session) {
      await api.sessionSetShuffle(activeDeviceId, next)
    } else {
      await api.setShuffle(activeDeviceId, next)
    }
    setShuffleMode(next)
  }, [activeDeviceId, shuffleMode, setShuffleMode, session])

  const cycleRepeat = useCallback(async () => {
    if (!activeDeviceId) return
    const idx = REPEAT_MODES.indexOf(repeatMode as typeof REPEAT_MODES[number])
    const next = REPEAT_MODES[(idx + 1) % REPEAT_MODES.length]
    if (session) {
      await api.sessionSetRepeat(activeDeviceId, next)
    } else {
      await api.setRepeat(activeDeviceId, next)
    }
    setRepeatMode(next)
  }, [activeDeviceId, repeatMode, setRepeatMode, session])

  // Desktop right panel (always visible when mounted via App)
  // Mobile bottom sheet (animated)
  return (
    <>
      {/* Mobile: full-screen bottom sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col md:hidden"
            style={{ background: colors.muted }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <NowPlayingContent
              onClose={onClose}
              colors={colors}
              playing={playing}
              currentTrack={currentTrack}
              elapsedSeconds={elapsedSeconds}
              durationSeconds={durationSeconds}
              shuffleMode={shuffleMode}
              repeatMode={repeatMode}
              session={session}
              allowedActions={allowedActions}
              activeDevice={activeDevice}
              handlePlayPause={handlePlayPause}
              handleNext={handleNext}
              handlePrev={handlePrev}
              handleSeek={handleSeek}
              handleSeekForward={handleSeekForward}
              handleSeekBackward={handleSeekBackward}

              cycleShuffle={cycleShuffle}
              cycleRepeat={cycleRepeat}
              sleepTimerOpen={sleepTimerOpen}
              setSleepTimerOpen={setSleepTimerOpen}
              sleepRemaining={sleepRemaining}
              handleSetSleepTimer={handleSetSleepTimer}
              handleCancelSleepTimer={handleCancelSleepTimer}
              rating={rating}
              handleRate={handleRate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop: right panel */}
      <div
        className="app-nowplaying flex-col"
        style={{ background: colors.muted }}
      >
        <NowPlayingContent
          colors={colors}
          playing={playing}
          currentTrack={currentTrack}
          elapsedSeconds={elapsedSeconds}
          durationSeconds={durationSeconds}
          shuffleMode={shuffleMode}
          repeatMode={repeatMode}
          session={session}
          allowedActions={allowedActions}
          activeDevice={activeDevice}
          handlePlayPause={handlePlayPause}
          handleNext={handleNext}
          handlePrev={handlePrev}
          handleSeek={handleSeek}
          handleSeekForward={handleSeekForward}
          handleSeekBackward={handleSeekBackward}
          cycleShuffle={cycleShuffle}
          cycleRepeat={cycleRepeat}
          sleepTimerOpen={sleepTimerOpen}
          setSleepTimerOpen={setSleepTimerOpen}
          sleepRemaining={sleepRemaining}
          handleSetSleepTimer={handleSetSleepTimer}
          handleCancelSleepTimer={handleCancelSleepTimer}
          rating={rating}
          handleRate={handleRate}
        />
      </div>
    </>
  )
}

interface ContentProps {
  onClose?: () => void
  colors: { dominant: string; muted: string }
  playing: boolean
  currentTrack: ReturnType<typeof usePlayerStore.getState>['currentTrack']
  elapsedSeconds: number
  durationSeconds: number
  shuffleMode: string
  repeatMode: string
  session: ReturnType<typeof usePlayerStore.getState>['session']
  allowedActions: string[]
  activeDevice: ReturnType<typeof useDeviceStore.getState>['devices'][number] | undefined
  handlePlayPause: () => void
  handleNext: () => void
  handlePrev: () => void
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSeekForward: () => void
  handleSeekBackward: () => void
  cycleShuffle: () => void
  cycleRepeat: () => void
  sleepTimerOpen: boolean
  setSleepTimerOpen: (open: boolean) => void
  sleepRemaining: number | null
  handleSetSleepTimer: (minutes: number) => void
  handleCancelSleepTimer: () => void
  rating: number
  handleRate: (stars: number) => void
}

function NowPlayingContent({
  onClose,
  colors,
  playing,
  currentTrack,
  elapsedSeconds,
  durationSeconds,
  shuffleMode,
  repeatMode,
  session,
  allowedActions,
  activeDevice,
  handlePlayPause,
  handleNext,
  handlePrev,
  handleSeek,
  handleSeekForward,
  handleSeekBackward,
  cycleShuffle,
  cycleRepeat,
  sleepTimerOpen,
  setSleepTimerOpen,
  sleepRemaining,
  handleSetSleepTimer,
  handleCancelSleepTimer,
  rating,
  handleRate,
}: ContentProps) {
  const isWiim = activeDevice?.device_type === 'wiim'
  const canSeek = allowedActions.length === 0 || allowedActions.includes('Seek')
  const canQuickSeek = canSeek && isWiim
  const canNext = allowedActions.length === 0 || allowedActions.includes('Next')
  const canPrev = allowedActions.length === 0 || allowedActions.includes('Previous')
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        {onClose ? (
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white">
            <ChevronDownIcon />
          </button>
        ) : (
          <div className="w-10" />
        )}
        <div className="text-center">
          <div className="text-xs text-white/60 uppercase tracking-wider">
            {activeDevice?.name ?? 'No device'}
          </div>
          {session && (
            <div className="text-[10px] text-white/40 truncate max-w-[200px]">
              {session.label}
              {session.total_tracks > 0 && ` \u2022 ${session.position + 1}/${session.total_tracks}`}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setSleepTimerOpen(!sleepTimerOpen)}
            className={`p-2 ${sleepRemaining ? 'text-[var(--color-accent)]' : 'text-white/40'} hover:text-white`}
            title="Sleep timer"
          >
            <MoonIcon />
            {sleepRemaining != null && sleepRemaining > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-[var(--color-accent)] text-white rounded-full w-4 h-4 flex items-center justify-center">
                {Math.ceil(sleepRemaining / 60)}
              </span>
            )}
          </button>
          {sleepTimerOpen && (
            <div className="absolute right-0 top-10 bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-white/10 py-1 z-50 min-w-[140px]">
              {[15, 30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  onClick={() => handleSetSleepTimer(m)}
                  className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  {m} min
                </button>
              ))}
              {sleepRemaining != null && (
                <button
                  onClick={handleCancelSleepTimer}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 border-t border-white/5"
                >
                  Cancel timer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Album art */}
      <div className="flex-1 flex items-center justify-center px-8 min-h-0">
        <NowPlayingArt trackId={currentTrack?.id ?? null} title={currentTrack?.title ?? null} />
      </div>

      {/* Track info */}
      <div className="px-6 py-2 text-center shrink-0">
        <div className="text-lg font-semibold truncate text-white">
          {currentTrack?.title ?? 'Nothing playing'}
        </div>
        <div className="text-sm text-white/60 truncate mt-0.5">
          {currentTrack
            ? [currentTrack.artist, currentTrack.album].filter(Boolean).join(' \u2014 ')
            : 'Select a track to play'
          }
        </div>
        {/* Star rating */}
        {currentTrack && (
          <div className="flex items-center justify-center gap-1 mt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRate(star)}
                className={`text-lg ${star <= rating ? 'text-yellow-400' : 'text-white/20'} hover:text-yellow-300 transition-colors`}
              >
                {star <= rating ? '\u2605' : '\u2606'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Seek bar with forward/backward buttons */}
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

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-6 py-3 shrink-0">
        <button
          onClick={cycleShuffle}
          className={`p-2 text-sm ${shuffleMode !== 'off' ? 'text-white' : 'text-white/40'}`}
          title={`Shuffle: ${SHUFFLE_LABELS[shuffleMode] ?? shuffleMode}`}
        >
          <ShuffleIcon />
          {shuffleMode !== 'off' && (
            <div className="text-[10px] mt-0.5">{SHUFFLE_LABELS[shuffleMode]}</div>
          )}
        </button>

        <button onClick={handlePrev} disabled={!canPrev} className="p-3 text-white disabled:opacity-30">
          <PrevIcon />
        </button>

        <button
          onClick={handlePlayPause}
          className="w-16 h-16 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
          style={{ backgroundColor: colors.dominant }}
        >
          {playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
        </button>

        <button onClick={handleNext} disabled={!canNext} className="p-3 text-white disabled:opacity-30">
          <NextIcon />
        </button>

        <button
          onClick={cycleRepeat}
          className={`p-2 text-sm ${repeatMode !== 'off' ? 'text-white' : 'text-white/40'}`}
          title={`Repeat: ${REPEAT_LABELS[repeatMode] ?? repeatMode}`}
        >
          <RepeatIcon />
          {repeatMode !== 'off' && (
            <div className="text-[10px] mt-0.5">{REPEAT_LABELS[repeatMode]}</div>
          )}
        </button>
      </div>

      {/* Bottom padding */}
      <div className="pb-8 shrink-0" />
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function NowPlayingArt({ trackId, title }: { trackId: string | null; title: string | null }) {
  const [failed, setFailed] = useState(false)
  const [lastTrackId, setLastTrackId] = useState(trackId)
  if (trackId !== lastTrackId) {
    setLastTrackId(trackId)
    setFailed(false)
  }

  if (trackId && !failed) {
    return (
      <img
        src={api.artUrl(trackId)}
        alt=""
        onError={() => setFailed(true)}
        className="w-full max-w-[320px] aspect-square rounded-2xl object-cover shadow-2xl"
      />
    )
  }
  return (
    <div className="w-full max-w-[320px] aspect-square rounded-2xl bg-white/5 flex items-center justify-center">
      <div className="text-6xl text-white/30">
        {title?.[0]?.toUpperCase() ?? '\u266A'}
      </div>
    </div>
  )
}

// Icons
function ChevronDownIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="6,9 12,15 18,9" />
    </svg>
  )
}

function PlayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  )
}

function PauseIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="3" width="4" height="18" />
      <rect x="15" y="3" width="4" height="18" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="19,20 9,12 19,4" />
      <rect x="5" y="4" width="2" height="16" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,4 15,12 5,20" />
      <rect x="17" y="4" width="2" height="16" />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="16,3 21,3 21,8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21,16 21,21 16,21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="17,1 21,5 17,9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7,23 3,19 7,15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SeekForwardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="5,4 15,12 5,20" fill="currentColor" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  )
}

function SeekBackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="19,20 9,12 19,4" fill="currentColor" />
      <line x1="5" y1="5" x2="5" y2="19" />
    </svg>
  )
}

