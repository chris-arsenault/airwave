import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from './api/client'
import { BottomNav } from './components/layout/BottomNav'
import { MiniPlayer } from './components/layout/MiniPlayer'
import { NowPlaying } from './components/player/NowPlaying'
import { LibraryBrowser } from './components/library/LibraryBrowser'
import { QueueView } from './components/queue/QueueView'
import { DeviceManager } from './components/devices/DeviceManager'
import { EQSettings } from './components/devices/EQSettings'
import { useDeviceStore } from './stores/deviceStore'
import { useSSE } from './hooks/useSSE'

const queryClient = new QueryClient()

function AppContent() {
  const [tab, setTab] = useState('library')
  const [playerExpanded, setPlayerExpanded] = useState(false)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const updateDevice = useDeviceStore((s) => s.updateDevice)

  // Initial device fetch
  useEffect(() => {
    api.getDevices().then(setDevices).catch(console.error)
  }, [setDevices])

  // SSE real-time updates
  useSSE({
    devices_changed: (data) => {
      const devices = (data as { devices: Parameters<typeof setDevices>[0] }).devices
      setDevices(devices)
    },
    device_state: (data) => {
      const { device_id, ...update } = data as { device_id: string; [key: string]: unknown }
      updateDevice(device_id, update)
    },
  })

  return (
    <div className="min-h-screen pb-[120px]">
      <header className="sticky top-0 bg-[var(--color-surface)]/95 backdrop-blur-sm border-b border-white/5 px-4 py-3 z-30">
        <h1 className="text-lg font-semibold">WiiM Control</h1>
      </header>

      <main className="px-4 py-4">
        {tab === 'library' && <LibraryBrowser />}
        {tab === 'queue' && <QueueView />}
        {tab === 'devices' && <DeviceManager />}
        {tab === 'settings' && <EQSettings />}
      </main>

      <MiniPlayer onExpand={() => setPlayerExpanded(true)} />
      <NowPlaying open={playerExpanded} onClose={() => setPlayerExpanded(false)} />
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
