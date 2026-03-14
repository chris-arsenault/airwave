import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type SessionInfo } from './api/client'
import { BottomNav } from './components/layout/BottomNav'
import { Sidebar } from './components/layout/Sidebar'
import { NowPlaying } from './components/player/NowPlaying'
import { LibraryBrowser } from './components/library/LibraryBrowser'
import { QueueView } from './components/queue/QueueView'
import { DeviceManager } from './components/devices/DeviceManager'
import { EQSettings } from './components/devices/EQSettings'
import { useDeviceStore } from './stores/deviceStore'
import { usePlayerStore } from './stores/playerStore'
import { useSSE } from './hooks/useSSE'
import { useMediaSession } from './hooks/useMediaSession'

const queryClient = new QueryClient()

const DRAWER_TITLES: Record<string, string> = {
  library: 'Library',
  queue: 'Queue',
  devices: 'Rooms',
  settings: 'EQ',
}

function AppContent() {
  const [drawer, setDrawer] = useState<string | null>(null)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const updateDevice = useDeviceStore((s) => s.updateDevice)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setSession = usePlayerStore((s) => s.setSession)
  const qc = useQueryClient()

  const toggleDrawer = (id: string) => setDrawer((d) => (d === id ? null : id))

  // Media Session API — lock screen controls + hardware volume buttons
  useMediaSession()

  // Initial device fetch
  useEffect(() => {
    api.getDevices().then(setDevices).catch(console.error)
  }, [setDevices])

  // SSE real-time updates
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
        allowed_actions?: string[] | null
      }
      const activeId = useDeviceStore.getState().activeDeviceId
      if (state.target_id !== activeId) return
      const session = state.session ?? null
      const currentId = usePlayerStore.getState().currentTrack?.id
      const trackChanged = state.current_track && state.current_track.id !== currentId
      usePlayerStore.setState({
        playing: state.playing,
        elapsedSeconds: state.elapsed_seconds,
        durationSeconds: state.duration_seconds,
        session,
        shuffleMode: session ? session.shuffle_mode : state.shuffle_mode,
        repeatMode: session ? session.repeat_mode : state.repeat_mode,
        allowedActions: state.allowed_actions ?? [],
        ...(state.current_track ? { currentTrack: state.current_track } : {}),
        ...(trackChanged ? { rating: 0 } : {}),
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
    sleep_timer_expired: () => {
      setPlaying(false)
      usePlayerStore.setState({ sleepRemaining: null })
    },
    sleep_timer_changed: (data) => {
      const { remaining_seconds } = data as { device_id: string; remaining_seconds: number | null }
      const activeId = useDeviceStore.getState().activeDeviceId
      const { device_id } = data as { device_id: string }
      if (device_id !== activeId) return
      usePlayerStore.setState({ sleepRemaining: remaining_seconds })
    },
    queue_changed: (data) => {
      const { device_id, tracks, position } = data as { device_id: string; tracks?: unknown[]; position?: number }
      if (tracks !== undefined) {
        const activeId = useDeviceStore.getState().activeDeviceId
        if (device_id === activeId) {
          qc.setQueryData(['queue', activeId], { tracks, position })
        }
      } else {
        qc.invalidateQueries({ queryKey: ['queue'] })
      }
    },
  })

  return (
    <div className="app-layout">
      {/* Desktop sidebar */}
      <Sidebar active={drawer} onNavigate={toggleDrawer} />

      {/* Main content area */}
      <div className="app-content">
        {/* Desktop drawer panel */}
        {drawer && (
          <div className="app-drawer-panel hidden md:flex flex-col bg-[var(--color-surface)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <h2 className="text-lg font-semibold">{DRAWER_TITLES[drawer]}</h2>
              <button onClick={() => setDrawer(null)} className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5">
                <XIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {drawer === 'library' && <LibraryBrowser />}
              {drawer === 'queue' && <QueueView />}
              {drawer === 'devices' && <DeviceManager />}
              {drawer === 'settings' && <EQSettings />}
            </div>
          </div>
        )}

        {/* Player — always visible */}
        <div className="app-player">
          <NowPlaying />
        </div>

        {/* Mobile drawer overlay */}
        <AnimatePresence>
          {drawer && (
            <motion.div
              key="drawer"
              className="absolute inset-0 z-30 flex flex-col md:hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Drag handle + header */}
              <div className="bg-[var(--color-surface)] rounded-t-2xl flex flex-col flex-1 min-h-0">
                <div
                  className="flex items-center justify-center pt-3 pb-1 shrink-0 cursor-pointer"
                  onClick={() => setDrawer(null)}
                >
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>
                <div className="flex items-center justify-between px-4 py-2 shrink-0">
                  <h2 className="text-lg font-semibold">{DRAWER_TITLES[drawer]}</h2>
                  <button onClick={() => setDrawer(null)} className="p-1.5 text-white/40 hover:text-white">
                    <XIcon />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {drawer === 'library' && <LibraryBrowser />}
                  {drawer === 'queue' && <QueueView />}
                  {drawer === 'devices' && <DeviceManager />}
                  {drawer === 'settings' && <EQSettings />}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav active={drawer} onNavigate={toggleDrawer} />
    </div>
  )
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
