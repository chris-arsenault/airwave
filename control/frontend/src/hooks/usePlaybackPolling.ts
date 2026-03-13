import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePlayerStore } from '../stores/playerStore'
import { useDeviceStore } from '../stores/deviceStore'

const POLL_INTERVAL = 2000

export function usePlaybackPolling() {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!activeDeviceId) return

    const poll = async () => {
      try {
        const state = await api.getPlaybackState(activeDeviceId)
        const session = state.session ?? null
        const shuffleMode = session ? session.shuffle_mode : state.shuffle_mode
        const repeatMode = session ? session.repeat_mode : state.repeat_mode

        // Batch all updates into a single set() to avoid intermediate re-renders.
        usePlayerStore.setState({
          playing: state.playing,
          elapsedSeconds: state.elapsed_seconds,
          durationSeconds: state.duration_seconds,
          session,
          shuffleMode,
          repeatMode,
          ...(state.current_track ? { currentTrack: state.current_track } : {}),
        })
      } catch {
        // device may be offline, ignore
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeDeviceId])
}
