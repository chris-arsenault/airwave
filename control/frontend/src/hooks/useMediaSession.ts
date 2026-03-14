import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePlayerStore } from '../stores/playerStore'
import { useDeviceStore } from '../stores/deviceStore'

// Tiny silent MP3 (1 frame of silence) — avoids needing to host a file
const SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqmAAAAAAD/+1DEAAAH+ANoUAAAIscKbgwxSCIAAHDHgAAEJBAEf/U////qIf///0w/+oAAAAGkjNakjNbiRsWVFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

const VOLUME_STEP = 0.05
const VOLUME_MIDPOINT = 0.5

function handleVolumeChange(audioRef: React.RefObject<HTMLAudioElement | null>, lastVolumeRef: React.RefObject<number>) {
  const audio = audioRef.current
  if (!audio) return

  const delta = audio.volume - lastVolumeRef.current!

  // Reset to midpoint to prevent drift
  audio.volume = VOLUME_MIDPOINT
  lastVolumeRef.current = VOLUME_MIDPOINT

  if (Math.abs(delta) < 0.001) return

  const deviceId = useDeviceStore.getState().activeDeviceId
  if (!deviceId) return

  const device = useDeviceStore.getState().devices.find((d) => d.id === deviceId)
  if (!device) return

  const direction = delta > 0 ? VOLUME_STEP : -VOLUME_STEP
  const newVolume = Math.max(0, Math.min(1, device.volume + direction))
  api.setVolume(deviceId, newVolume).catch(() => {})
  useDeviceStore.getState().updateDevice(deviceId, { volume: newVolume })
}

export function useMediaSession() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activatedRef = useRef(false)
  const lastVolumeRef = useRef(VOLUME_MIDPOINT)

  // Activate audio focus on first user gesture
  useEffect(() => {
    if (activatedRef.current) return

    const onVolume = () => handleVolumeChange(audioRef, lastVolumeRef)

    const activate = () => {
      if (activatedRef.current) return
      activatedRef.current = true

      const audio = new Audio(SILENT_MP3)
      audio.loop = true
      audio.volume = VOLUME_MIDPOINT
      audioRef.current = audio
      lastVolumeRef.current = VOLUME_MIDPOINT

      audio.addEventListener('volumechange', onVolume)
      audio.play()?.catch(() => {})

      document.removeEventListener('click', activate)
      document.removeEventListener('touchstart', activate)
    }

    document.addEventListener('click', activate, { once: false })
    document.addEventListener('touchstart', activate, { once: false })

    return () => {
      document.removeEventListener('click', activate)
      document.removeEventListener('touchstart', activate)
    }
  }, [])

  // Reclaim audio focus when returning to foreground
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && audioRef.current) {
        audioRef.current.play()?.catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Sync metadata and action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const unsub = usePlayerStore.subscribe((state, prev) => {
      const track = state.currentTrack
      if (!track) {
        navigator.mediaSession.metadata = null
        return
      }

      // Only update metadata when track changes
      if (track.id !== prev.currentTrack?.id) {
        const artwork: MediaImage[] = []
        if (track.id) {
          artwork.push({ src: api.artUrl(track.id), sizes: '512x512', type: 'image/jpeg' })
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist ?? undefined,
          album: track.album ?? undefined,
          artwork,
        })
      }

      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'
    })

    // Set initial state
    const { currentTrack, playing } = usePlayerStore.getState()
    if (currentTrack) {
      const artwork: MediaImage[] = []
      if (currentTrack.id) {
        artwork.push({ src: api.artUrl(currentTrack.id), sizes: '512x512', type: 'image/jpeg' })
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist ?? undefined,
        album: currentTrack.album ?? undefined,
        artwork,
      })
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }

    return unsub
  }, [])

  // Action handlers (separate effect to avoid re-registering on every state change)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const getDeviceId = () => useDeviceStore.getState().activeDeviceId
    const hasSession = () => usePlayerStore.getState().session !== null

    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => {
        const id = getDeviceId()
        if (id) api.resume(id).catch(() => {})
      }],
      ['pause', () => {
        const id = getDeviceId()
        if (id) api.pause(id).catch(() => {})
      }],
      ['nexttrack', () => {
        const id = getDeviceId()
        if (!id) return
        if (hasSession()) api.sessionNext(id).catch(() => {})
        else api.next(id).catch(() => {})
      }],
      ['previoustrack', () => {
        const id = getDeviceId()
        if (!id) return
        if (hasSession()) api.sessionPrev(id).catch(() => {})
        else api.prev(id).catch(() => {})
      }],
      ['seekforward', () => {
        const id = getDeviceId()
        if (id) api.seekForward(id).catch(() => {})
      }],
      ['seekbackward', () => {
        const id = getDeviceId()
        if (id) api.seekBackward(id).catch(() => {})
      }],
    ]

    for (const [action, handler] of actions) {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* unsupported */ }
    }

    return () => {
      for (const [action] of actions) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* unsupported */ }
      }
    }
  }, [])
}
