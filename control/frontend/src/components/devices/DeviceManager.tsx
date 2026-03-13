import { useState } from 'react'
import { api, type Device } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'

export function DeviceManager() {
  const devices = useDeviceStore((s) => s.devices)
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const updateDevice = useDeviceStore((s) => s.updateDevice)
  const [grouping, setGrouping] = useState(false)
  const [selectedSlaves, setSelectedSlaves] = useState<string[]>([])

  const handleVolumeChange = async (device: Device, value: number) => {
    const volume = value / 100
    updateDevice(device.id, { volume })
    await api.setVolume(device.id, volume)
  }

  const handleMuteToggle = async (device: Device) => {
    await api.toggleMute(device.id)
    updateDevice(device.id, { muted: !device.muted })
  }

  const handleCreateGroup = async () => {
    if (!activeDeviceId || selectedSlaves.length === 0) return
    await api.createGroup(activeDeviceId, selectedSlaves)
    setGrouping(false)
    setSelectedSlaves([])
  }

  const handleDissolveGroup = async (masterId: string) => {
    await api.dissolveGroup(masterId)
  }

  const toggleSlaveSelection = (id: string) => {
    setSelectedSlaves((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  if (devices.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Rooms</h2>
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📡</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Discovering devices...</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">
            Make sure your WiiM devices are on the same network
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Rooms</h2>
        {!grouping ? (
          <button
            onClick={() => setGrouping(true)}
            className="text-xs text-[var(--color-accent)] px-3 py-1.5 rounded-full border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            Group
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setGrouping(false); setSelectedSlaves([]) }}
              className="text-xs text-[var(--color-text-secondary)] px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={selectedSlaves.length === 0}
              className="text-xs text-[var(--color-accent)] px-3 py-1.5 rounded-full border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/10 transition-colors disabled:opacity-40"
            >
              Create group
            </button>
          </div>
        )}
      </div>

      {grouping && (
        <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] rounded-lg px-3 py-2">
          Active device is the group master. Select devices to add as followers:
        </div>
      )}

      <div className="space-y-2">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isActive={device.id === activeDeviceId}
            grouping={grouping}
            isSelectedSlave={selectedSlaves.includes(device.id)}
            onSelect={() => !grouping && setActiveDevice(device.id)}
            onToggleSlave={() => toggleSlaveSelection(device.id)}
            onVolumeChange={(v) => handleVolumeChange(device, v)}
            onMuteToggle={() => handleMuteToggle(device)}
            onDissolveGroup={() => handleDissolveGroup(device.id)}
          />
        ))}
      </div>
    </div>
  )
}

function DeviceCard({
  device,
  isActive,
  grouping,
  isSelectedSlave,
  onSelect,
  onToggleSlave,
  onVolumeChange,
  onMuteToggle,
  onDissolveGroup,
}: {
  device: Device
  isActive: boolean
  grouping: boolean
  isSelectedSlave: boolean
  onSelect: () => void
  onToggleSlave: () => void
  onVolumeChange: (value: number) => void
  onMuteToggle: () => void
  onDissolveGroup: () => void
}) {
  const volumePercent = Math.round(device.volume * 100)

  return (
    <div
      onClick={grouping ? onToggleSlave : onSelect}
      className={`bg-[var(--color-surface-elevated)] rounded-xl p-4 transition-all cursor-pointer ${
        isActive && !grouping ? 'ring-1 ring-[var(--color-accent)]' : ''
      } ${isSelectedSlave ? 'ring-1 ring-[var(--color-accent)] bg-[var(--color-accent)]/5' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {grouping && !isActive && (
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelectedSlave ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-white/20'
            }`}>
              {isSelectedSlave && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              )}
            </div>
          )}
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              {device.name}
              {isActive && !grouping && (
                <span className="text-[10px] text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
              {device.is_master && (
                <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">
                  Master
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {device.model ?? device.ip}
              {device.source ? ` · ${device.source}` : ''}
            </div>
          </div>
        </div>
        {device.is_master && !grouping && (
          <button
            onClick={(e) => { e.stopPropagation(); onDissolveGroup() }}
            className="text-xs text-[var(--color-text-secondary)] hover:text-red-400 transition-colors px-2 py-1"
          >
            Ungroup
          </button>
        )}
      </div>

      {/* Volume slider */}
      {!grouping && (
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMuteToggle}
            className={`shrink-0 ${device.muted ? 'text-red-400' : 'text-[var(--color-text-secondary)]'}`}
          >
            {device.muted ? <VolumeMutedIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volumePercent}
            onChange={(e) => onVolumeChange(parseInt(e.target.value))}
            className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text-secondary)] w-8 text-right shrink-0">
            {volumePercent}
          </span>
        </div>
      )}
    </div>
  )
}

function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}

function VolumeMutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
