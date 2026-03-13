import { useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useDeviceStore } from '../../stores/deviceStore'
import { api } from '../../api/client'

interface Props {
  onExpand: () => void
}

export function MiniPlayer({ onExpand }: Props) {
  const { playing, currentTrack, elapsedSeconds, durationSeconds } = usePlayerStore()
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const activeDevice = useDeviceStore((s) => s.devices.find((d) => d.id === s.activeDeviceId))

  const progress = durationSeconds > 0 ? (elapsedSeconds / durationSeconds) * 100 : 0
  const hasTrack = !!currentTrack

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeDeviceId) return
    if (playing) {
      await api.pause(activeDeviceId)
    } else {
      await api.resume(activeDeviceId)
    }
  }

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (!activeDeviceId) return
    const vol = parseFloat(e.target.value) / 100
    useDeviceStore.getState().updateDevice(activeDeviceId, { volume: vol })
    await api.setVolume(activeDeviceId, vol)
  }

  const remaining = durationSeconds - elapsedSeconds
  const remMin = Math.floor(remaining / 60)
  const remSec = Math.floor(remaining % 60)

  return (
    <div
      onClick={onExpand}
      className="fixed bottom-[56px] left-0 right-0 bg-[var(--color-surface-elevated)] border-t border-white/10 z-40 cursor-pointer"
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        {hasTrack && durationSeconds > 0 && (
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-2">
        {/* Album art / idle icon */}
        <MiniArt trackId={hasTrack ? currentTrack.id : null} fallbackChar={hasTrack ? (currentTrack.title?.[0] ?? '?') : '\u266A'} />

        {/* Track info or idle message */}
        <div className="flex-1 min-w-0">
          {hasTrack ? (
            <>
              <div className="text-sm font-medium truncate">{currentTrack.title}</div>
              <div className="text-xs text-[var(--color-text-secondary)] truncate">
                {currentTrack.artist}
                {durationSeconds > 0 && (
                  <span className="ml-2">-{remMin}:{remSec.toString().padStart(2, '0')}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-[var(--color-text-secondary)]">Not playing</div>
              <div className="text-xs text-[var(--color-text-secondary)]/60 truncate">
                {activeDevice?.name ?? 'No device selected'}
              </div>
            </>
          )}
        </div>

        {/* Volume slider */}
        {activeDevice && (
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((activeDevice.volume ?? 0) * 100)}
            onChange={handleVolumeChange}
            onClick={(e) => e.stopPropagation()}
            className="w-16 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer shrink-0"
            title={`Volume: ${Math.round((activeDevice.volume ?? 0) * 100)}%`}
          />
        )}

        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="w-10 h-10 flex items-center justify-center text-[var(--color-text-primary)]"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </div>
  )
}

function MiniArt({ trackId, fallbackChar }: { trackId: string | null; fallbackChar: string }) {
  const [failed, setFailed] = useState(false)
  if (trackId && !failed) {
    return (
      <img
        src={api.artUrl(trackId)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-10 h-10 rounded object-cover shrink-0"
      />
    )
  }
  return (
    <div className="w-10 h-10 rounded bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-secondary)] text-lg shrink-0">
      {fallbackChar}
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )
}
