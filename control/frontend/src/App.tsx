import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from './api/client'
import { BottomNav } from './components/layout/BottomNav'
import { MiniPlayer } from './components/layout/MiniPlayer'
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
        {tab === 'library' && <LibraryPlaceholder />}
        {tab === 'queue' && <QueuePlaceholder />}
        {tab === 'devices' && <DevicesPlaceholder />}
        {tab === 'settings' && <SettingsPlaceholder />}
      </main>

      <MiniPlayer onExpand={() => setPlayerExpanded(!playerExpanded)} />
      <BottomNav active={tab} onNavigate={setTab} />
    </div>
  )
}

// Placeholder screens — will be replaced with real components
function LibraryPlaceholder() {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Library</h2>
      <div className="grid grid-cols-2 gap-3">
        {['Artists', 'Albums', 'Genres', 'All Tracks'].map((cat) => (
          <div key={cat} className="bg-[var(--color-surface-elevated)] rounded-xl p-4 text-center">
            <div className="text-sm font-medium">{cat}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QueuePlaceholder() {
  return (
    <div>
      <h2 className="text-xl font-semibold">Queue</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2">No tracks in queue</p>
    </div>
  )
}

function DevicesPlaceholder() {
  const devices = useDeviceStore((s) => s.devices)
  return (
    <div>
      <h2 className="text-xl font-semibold">Rooms</h2>
      {devices.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">Discovering devices...</p>
      ) : (
        <div className="space-y-2 mt-3">
          {devices.map((d) => (
            <div key={d.id} className="bg-[var(--color-surface-elevated)] rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">{d.ip}</div>
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">
                {Math.round(d.volume * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsPlaceholder() {
  return (
    <div>
      <h2 className="text-xl font-semibold">Settings</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2">EQ, preferences</p>
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
