import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePlayerStore } from '../stores/playerStore'
import { useDeviceStore } from '../stores/deviceStore'

const POLL_INTERVAL = 2000

export function usePlaybackPolling() {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setElapsed = usePlayerStore((s) => s.setElapsed)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const setShuffleMode = usePlayerStore((s) => s.setShuffleMode)
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode)
  const setSession = usePlayerStore((s) => s.setSession)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!activeDeviceId) return

    const poll = async () => {
      try {
        const state = await api.getPlaybackState(activeDeviceId)
        setPlaying(state.playing)
        setElapsed(state.elapsed_seconds)
        setDuration(state.duration_seconds)
        setSession(state.session ?? null)

        // Pull shuffle/repeat from session if active, else from queue.
        if (state.session) {
          setShuffleMode(state.session.shuffle_mode)
          setRepeatMode(state.session.repeat_mode)
        } else {
          setShuffleMode(state.shuffle_mode)
          setRepeatMode(state.repeat_mode)
        }

        if (state.current_track) {
          setCurrentTrack(state.current_track)
        }
      } catch {
        // device may be offline, ignore
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeDeviceId, setPlaying, setCurrentTrack, setElapsed, setDuration, setShuffleMode, setRepeatMode, setSession])
}
