import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client'
import { usePlayerStore } from '../stores/playerStore'
import { useDeviceStore } from '../stores/deviceStore'

const VOLUME_STEP = 0.05
const VOLUME_MIDPOINT = 0.5

/** Generate a valid 1-second silent WAV as a Blob URL */
function createSilentAudio(): string {
  const sampleRate = 8000
  const numSamples = sampleRate
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const write = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

// Debug log buffer — shared across hook instances
const debugLog: string[] = []
let debugListeners: Array<(logs: string[]) => void> = []

function log(msg: string) {
  const ts = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  debugLog.push(`[${ts}] ${msg}`)
  if (debugLog.length > 30) debugLog.shift()
  debugListeners.forEach((fn) => fn([...debugLog]))
}

/** Subscribe to debug logs — returns unsubscribe function */
export function useMediaSessionDebug(): string[] {
  const [logs, setLogs] = useState<string[]>([...debugLog])
  useEffect(() => {
    debugListeners.push(setLogs)
    return () => { debugListeners = debugListeners.filter((fn) => fn !== setLogs) }
  }, [])
  return logs
}

function handleVolumeChange(audioRef: React.RefObject<HTMLAudioElement | null>, lastVolumeRef: React.RefObject<number>) {
  const audio = audioRef.current
  if (!audio) return

  const delta = audio.volume - lastVolumeRef.current!

  // Reset to midpoint to prevent drift
  audio.volume = VOLUME_MIDPOINT
  lastVolumeRef.current = VOLUME_MIDPOINT

  if (Math.abs(delta) < 0.001) return

  log(`volumechange delta=${delta.toFixed(3)}`)

  const deviceId = useDeviceStore.getState().activeDeviceId
  if (!deviceId) { log('no active device'); return }

  const device = useDeviceStore.getState().devices.find((d) => d.id === deviceId)
  if (!device) { log('device not found'); return }

  const direction = delta > 0 ? VOLUME_STEP : -VOLUME_STEP
  const newVolume = Math.max(0, Math.min(1, device.volume + direction))
  log(`vol ${device.volume.toFixed(2)} -> ${newVolume.toFixed(2)}`)
  api.setVolume(deviceId, newVolume).catch((e) => log(`setVolume error: ${e}`))
  useDeviceStore.getState().updateDevice(deviceId, { volume: newVolume })
}

export function useMediaSession() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activatedRef = useRef(false)
  const lastVolumeRef = useRef(VOLUME_MIDPOINT)

  const logInit = useCallback(() => {
    log(`mediaSession in navigator: ${'mediaSession' in navigator}`)
    log(`userAgent: ${navigator.userAgent.slice(0, 80)}`)
  }, [])

  // Log on mount
  useEffect(() => { logInit() }, [logInit])

  // Activate audio focus on first user gesture
  useEffect(() => {
    if (activatedRef.current) return

    const onVolume = () => handleVolumeChange(audioRef, lastVolumeRef)

    // Create audio element once, reuse across attempts
    let audio: HTMLAudioElement | null = null

    const activate = (e: Event) => {
      if (activatedRef.current) return
      log(`activate attempt via ${e.type}`)

      try {
        if (!audio) {
          const url = createSilentAudio()
          log(`created silent audio blob`)
          audio = new Audio(url)
          audio.loop = true
          audio.volume = VOLUME_MIDPOINT
          audioRef.current = audio
          lastVolumeRef.current = VOLUME_MIDPOINT

          audio.addEventListener('volumechange', onVolume)
          audio.addEventListener('playing', () => log('audio state: playing'))
          audio.addEventListener('error', (ev) => {
            const err = audio?.error
            log(`audio error: code=${err?.code} msg=${err?.message ?? (ev as ErrorEvent).message ?? 'unknown'}`)
          })
        }

        const result = audio.play()
        if (result && typeof result.then === 'function') {
          result.then(() => {
            log('audio.play() resolved — activated!')
            activatedRef.current = true
            document.removeEventListener('click', activate)
            document.removeEventListener('touchstart', activate)
          }).catch((err: Error) => {
            log(`audio.play() rejected: ${err.message} — will retry on next gesture`)
          })
        } else {
          log(`audio.play() returned: ${typeof result}`)
        }
      } catch (err) {
        log(`activate error: ${err}`)
      }
    }

    document.addEventListener('click', activate, { once: false })
    document.addEventListener('touchstart', activate, { once: false })
    log('gesture listeners registered')

    return () => {
      document.removeEventListener('click', activate)
      document.removeEventListener('touchstart', activate)
    }
  }, [])

  // Reclaim audio focus when returning to foreground
  useEffect(() => {
    const onVisibility = () => {
      log(`visibilitychange: ${document.visibilityState}`)
      if (document.visibilityState === 'visible' && audioRef.current) {
        const result = audioRef.current.play()
        if (result && typeof result.then === 'function') {
          result.then(() => log('reclaim play() resolved')).catch((err: Error) => log(`reclaim play() rejected: ${err.message}`))
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Sync metadata
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      log('SKIP metadata: mediaSession not available')
      return
    }
    log('metadata sync registered')

    const unsub = usePlayerStore.subscribe((state, prev) => {
      const track = state.currentTrack
      if (!track) {
        navigator.mediaSession.metadata = null
        navigator.mediaSession.playbackState = 'none'
        return
      }

      if (track.id !== prev.currentTrack?.id) {
        log(`metadata update: ${track.title} - ${track.artist}`)
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
      log(`initial metadata: ${currentTrack.title}`)
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
    } else {
      log('no current track on init')
    }

    return unsub
  }, [])

  // Action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      log('SKIP actions: mediaSession not available')
      return
    }

    const getDeviceId = () => useDeviceStore.getState().activeDeviceId
    const hasSession = () => usePlayerStore.getState().session !== null

    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => {
        log('action: play')
        const id = getDeviceId()
        if (id) api.resume(id).catch((e) => log(`play error: ${e}`))
        else log('no active device for play')
      }],
      ['pause', () => {
        log('action: pause')
        const id = getDeviceId()
        if (id) api.pause(id).catch((e) => log(`pause error: ${e}`))
        else log('no active device for pause')
      }],
      ['nexttrack', () => {
        log('action: next')
        const id = getDeviceId()
        if (!id) { log('no active device for next'); return }
        if (hasSession()) api.sessionNext(id).catch((e) => log(`next error: ${e}`))
        else api.next(id).catch((e) => log(`next error: ${e}`))
      }],
      ['previoustrack', () => {
        log('action: prev')
        const id = getDeviceId()
        if (!id) { log('no active device for prev'); return }
        if (hasSession()) api.sessionPrev(id).catch((e) => log(`prev error: ${e}`))
        else api.prev(id).catch((e) => log(`prev error: ${e}`))
      }],
      ['seekforward', () => {
        log('action: seekforward')
        const id = getDeviceId()
        if (id) api.seekForward(id).catch((e) => log(`seekfwd error: ${e}`))
      }],
      ['seekbackward', () => {
        log('action: seekbackward')
        const id = getDeviceId()
        if (id) api.seekBackward(id).catch((e) => log(`seekback error: ${e}`))
      }],
    ]

    let registered = 0
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
        registered++
      } catch (e) {
        log(`action ${action} unsupported: ${e}`)
      }
    }
    log(`${registered}/${actions.length} action handlers registered`)

    return () => {
      for (const [action] of actions) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* */ }
      }
    }
  }, [])
}
