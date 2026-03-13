import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type QueueTrack } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'
import { usePlayerStore } from '../../stores/playerStore'

export function QueueView() {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['queue', activeDeviceId],
    queryFn: () => api.getQueue(activeDeviceId!),
    enabled: !!activeDeviceId,
    refetchInterval: 5000,
  })

  const handleRemove = async (index: number) => {
    if (!activeDeviceId) return
    await api.removeFromQueue(activeDeviceId, index)
    queryClient.invalidateQueries({ queryKey: ['queue', activeDeviceId] })
  }

  const handleClear = async () => {
    if (!activeDeviceId) return
    await api.clearQueue(activeDeviceId)
    queryClient.invalidateQueries({ queryKey: ['queue', activeDeviceId] })
  }

  const tracks = data?.tracks ?? []
  const position = data?.position ?? 0

  if (!activeDeviceId) {
    return (
      <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
        No device selected
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Queue</h2>
        {tracks.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors px-2 py-1"
          >
            Clear all
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Loading...</div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-[var(--color-text-secondary)] text-sm">Queue is empty</div>
          <div className="text-[var(--color-text-secondary)] text-xs mt-1">
            Browse your library and tap a track to start playing
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          {tracks.map((track, i) => (
            <QueueItem
              key={`${track.id}-${i}`}
              track={track}
              index={i}
              isPlaying={i === position && currentTrack?.id === track.id}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}

      {tracks.length > 0 && (
        <div className="text-xs text-[var(--color-text-secondary)] text-center pt-2">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} in queue
        </div>
      )}
    </div>
  )
}

function QueueItem({
  track,
  index,
  isPlaying,
  onRemove,
}: {
  track: QueueTrack
  index: number
  isPlaying: boolean
  onRemove: () => void
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isPlaying ? 'bg-[var(--color-accent)]/10' : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <div className={`w-8 text-center text-xs shrink-0 ${isPlaying ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>
        {isPlaying ? (
          <PlayingIndicator />
        ) : (
          index + 1
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate ${isPlaying ? 'text-[var(--color-accent)] font-medium' : ''}`}>
          {track.title}
        </div>
        <div className="text-xs text-[var(--color-text-secondary)] truncate">
          {[track.artist, track.album].filter(Boolean).join(' — ')}
        </div>
      </div>
      {track.duration && (
        <div className="text-xs text-[var(--color-text-secondary)] shrink-0">{track.duration}</div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="p-1.5 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors shrink-0"
      >
        <XIcon />
      </button>
    </div>
  )
}

function PlayingIndicator() {
  return (
    <div className="flex items-end justify-center gap-0.5 h-4">
      <div className="w-0.5 bg-[var(--color-accent)] animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
      <div className="w-0.5 bg-[var(--color-accent)] animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
      <div className="w-0.5 bg-[var(--color-accent)] animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
    </div>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
