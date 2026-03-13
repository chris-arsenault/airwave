import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type SessionInfo } from './api/client'
import { BottomNav } from './components/layout/BottomNav'
import { Sidebar } from './components/layout/Sidebar'
import { DevicePill } from './components/layout/DevicePill'
import { MiniPlayer } from './components/layout/MiniPlayer'
import { NowPlaying } from './components/player/NowPlaying'
import { LibraryBrowser } from './components/library/LibraryBrowser'
import { QueueView } from './components/queue/QueueView'
import { DeviceManager } from './components/devices/DeviceManager'
import { EQSettings } from './components/devices/EQSettings'
import { useDeviceStore } from './stores/deviceStore'
import { usePlayerStore } from './stores/playerStore'
import { useSSE } from './hooks/useSSE'

const queryClient = new QueryClient()

function AppContent() {
  const [tab, setTab] = useState('library')
  const [playerExpanded, setPlayerExpanded] = useState(false)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const updateDevice = useDeviceStore((s) => s.updateDevice)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setSession = usePlayerStore((s) => s.setSession)
  const hasTrack = usePlayerStore((s) => !!s.currentTrack)

  // Initial device fetch
  useEffect(() => {
    api.getDevices().then(setDevices).catch(console.error)
  }, [setDevices])

  // SSE real-time updates (includes playback state — no polling needed)
  useSSE({
    playback_state: (data) => {
      const state = data as {
        target_id: string
        playing: boolean
        current_track: Parameters<typeof setCurrentTrack>[0] | null
        elapsed_seconds: number
        duration_seconds: number
        shuffle_mode: string
        repeat_mode: string
        session?: SessionInfo | null
      }
      const activeId = useDeviceStore.getState().activeDeviceId
      if (state.target_id !== activeId) return
      const session = state.session ?? null
      usePlayerStore.setState({
        playing: state.playing,
        elapsedSeconds: state.elapsed_seconds,
        durationSeconds: state.duration_seconds,
        session,
        shuffleMode: session ? session.shuffle_mode : state.shuffle_mode,
        repeatMode: session ? session.repeat_mode : state.repeat_mode,
        ...(state.current_track ? { currentTrack: state.current_track } : {}),
      })
    },
    devices_changed: (data) => {
      const devices = (data as { devices: Parameters<typeof setDevices>[0] }).devices
      setDevices(devices)
    },
    device_state: (data) => {
      const { device_id, ...update } = data as { device_id: string; [key: string]: unknown }
      updateDevice(device_id, update)
    },
    volume_changed: (data) => {
      const { device_id, volume } = data as { device_id: string; volume: number }
      updateDevice(device_id, { volume })
    },
    mute_changed: (data) => {
      const { device_id, muted } = data as { device_id: string; muted: boolean }
      updateDevice(device_id, { muted })
    },
    track_changed: (data) => {
      const { track } = data as { device_id: string; track: { id: string; title: string; artist: string | null } }
      if (track) {
        setCurrentTrack({ id: track.id, title: track.title, artist: track.artist, album: null, duration: null, stream_url: null })
      }
    },
    playback_started: () => setPlaying(true),
    playback_stopped: () => setPlaying(false),
    queue_ended: () => {
      setPlaying(false)
      setCurrentTrack(null)
    },
    session_started: (data) => {
      const { session } = data as { device_id: string; session: SessionInfo }
      setSession(session)
      setPlaying(true)
    },
    session_ended: () => {
      setSession(null)
      setPlaying(false)
      setCurrentTrack(null)
    },
  })

  return (
    <div className={`app-layout ${!hasTrack ? 'np-collapsed' : ''}`}>
      {/* Desktop sidebar */}
      <Sidebar active={tab} onNavigate={setTab} />

      {/* Main content area */}
      <div className="app-main">
        {/* Mobile header */}
        <header className="sticky top-0 bg-[var(--color-surface)]/95 backdrop-blur-sm border-b border-white/5 px-4 py-3 z-30 flex items-center justify-between">
          <h1 className="text-lg font-semibold">WiiM Control</h1>
          <DevicePill />
        </header>

        <main className="px-4 py-4">
          {/* Keep all tabs mounted for state persistence */}
          <div className={tab === 'library' ? '' : 'hidden'}>
            <LibraryBrowser />
          </div>
          <div className={tab === 'queue' ? '' : 'hidden'}>
            <QueueView />
          </div>
          <div className={tab === 'devices' ? '' : 'hidden'}>
            <DeviceManager />
          </div>
          <div className={tab === 'settings' ? '' : 'hidden'}>
            <EQSettings />
          </div>
        </main>
      </div>

      {/* Now Playing — desktop right panel + mobile bottom sheet */}
      <NowPlaying open={playerExpanded} onClose={() => setPlayerExpanded(false)} />

      {/* Mobile: mini player + bottom nav */}
      <MiniPlayer onExpand={() => setPlayerExpanded(true)} />
      <BottomNav active={tab} onNavigate={setTab} />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
