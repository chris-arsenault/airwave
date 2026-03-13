import { usePlayerStore } from '../../stores/playerStore'
import { useDeviceStore } from '../../stores/deviceStore'
import { api } from '../../api/client'

interface Props {
  onExpand: () => void
}

export function MiniPlayer({ onExpand }: Props) {
  const { playing, currentTrack } = usePlayerStore()
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)

  if (!currentTrack) return null

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeDeviceId) return
    if (playing) {
      await api.pause(activeDeviceId)
    } else {
      await api.resume(activeDeviceId)
    }
  }

  return (
    <div
      onClick={onExpand}
      className="fixed bottom-[56px] left-0 right-0 bg-[var(--color-surface-elevated)] border-t border-white/10 flex items-center gap-3 px-4 py-2 cursor-pointer z-40"
    >
      <div className="w-10 h-10 rounded bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-secondary)] text-lg shrink-0">
        {currentTrack.title?.[0] ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{currentTrack.title}</div>
        <div className="text-xs text-[var(--color-text-secondary)] truncate">
          {currentTrack.artist}
        </div>
      </div>
      <button
        onClick={handlePlayPause}
        className="w-10 h-10 flex items-center justify-center text-[var(--color-text-primary)]"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
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
