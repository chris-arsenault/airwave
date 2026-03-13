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

  const handleToggleEnabled = async (device: Device) => {
    const newEnabled = !device.enabled
    updateDevice(device.id, { enabled: newEnabled })
    await api.setEnabled(device.id, newEnabled)
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

  // Group devices: masters with their slaves, then ungrouped devices.
  const masters = devices.filter((d) => d.is_master)
  const groupedSlaveIds = new Set(
    devices.filter((d) => d.group_id && !d.is_master).map((d) => d.id)
  )
  const ungrouped = devices.filter((d) => !d.group_id)

  if (devices.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Rooms</h2>
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📡</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Discovering devices...</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">
            Searching for UPnP MediaRenderer devices on your network
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
        {/* Render grouped devices (master + slaves together) */}
        {masters.map((master) => {
          const slaves = devices.filter(
            (d) => d.group_id === master.id && !d.is_master
          )
          return (
            <div key={master.id} className="rounded-xl border border-orange-400/20 overflow-hidden">
              <DeviceCard
                device={master}
                isActive={master.id === activeDeviceId}
                grouping={grouping}
                isSelectedSlave={false}
                onSelect={() => !grouping && master.enabled && setActiveDevice(master.id)}
                onToggleSlave={() => {}}
                onVolumeChange={(v) => handleVolumeChange(master, v)}
                onMuteToggle={() => handleMuteToggle(master)}
                onToggleEnabled={() => handleToggleEnabled(master)}
                onDissolveGroup={() => handleDissolveGroup(master.id)}
              />
              {slaves.map((slave) => (
                <div key={slave.id} className="border-t border-white/5 pl-4">
                  <DeviceCard
                    device={slave}
                    isActive={slave.id === activeDeviceId}
                    grouping={grouping}
                    isSelectedSlave={false}
                    isGroupedSlave
                    onSelect={() => !grouping && slave.enabled && setActiveDevice(master.id)}
                    onToggleSlave={() => {}}
                    onVolumeChange={(v) => handleVolumeChange(slave, v)}
                    onMuteToggle={() => handleMuteToggle(slave)}
                    onToggleEnabled={() => handleToggleEnabled(slave)}
                    onDissolveGroup={() => {}}
                  />
                </div>
              ))}
            </div>
          )
        })}

        {/* Render ungrouped devices */}
        {ungrouped
          .filter((d) => !groupedSlaveIds.has(d.id))
          .map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isActive={device.id === activeDeviceId}
              grouping={grouping}
              isSelectedSlave={selectedSlaves.includes(device.id)}
              onSelect={() => !grouping && device.enabled && setActiveDevice(device.id)}
              onToggleSlave={() => toggleSlaveSelection(device.id)}
              onVolumeChange={(v) => handleVolumeChange(device, v)}
              onMuteToggle={() => handleMuteToggle(device)}
              onToggleEnabled={() => handleToggleEnabled(device)}
              onDissolveGroup={() => handleDissolveGroup(device.id)}
            />
          ))}
      </div>
    </div>
  )
}

function DeviceTypeBadge({ device }: { device: Device }) {
  if (device.device_type === 'wiim') {
    return (
      <>
        <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
          WiiM
        </span>
        {!device.capabilities.https_api && (
          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full" title="HTTPS API (port 443) unavailable — reboot device to restore EQ controls">
            Reboot needed
          </span>
        )}
      </>
    )
  }
  return (
    <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">
      UPnP
    </span>
  )
}

function DeviceCard({
  device,
  isActive,
  grouping,
  isSelectedSlave,
  isGroupedSlave,
  onSelect,
  onToggleSlave,
  onVolumeChange,
  onMuteToggle,
  onToggleEnabled,
  onDissolveGroup,
}: {
  device: Device
  isActive: boolean
  grouping: boolean
  isSelectedSlave: boolean
  isGroupedSlave?: boolean
  onSelect: () => void
  onToggleSlave: () => void
  onVolumeChange: (value: number) => void
  onMuteToggle: () => void
  onToggleEnabled: () => void
  onDissolveGroup: () => void
}) {
  const volumePercent = Math.round(device.volume * 100)
  const updateDevice = useDeviceStore((s) => s.updateDevice)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(device.name)

  const handleRename = async () => {
    if (!editName.trim() || editName === device.name) { setEditing(false); return }
    await api.renameDevice(device.id, editName.trim())
    updateDevice(device.id, { name: editName.trim() })
    setEditing(false)
  }

  const handleChannelChange = async (ch: string) => {
    updateDevice(device.id, { channel: ch })
    await api.setChannel(device.id, ch)
  }

  return (
    <div
      onClick={grouping ? onToggleSlave : onSelect}
      className={`bg-[var(--color-surface-elevated)] p-4 transition-all cursor-pointer ${
        !device.is_master && !isGroupedSlave ? 'rounded-xl' : ''
      } ${
        !device.enabled ? 'opacity-50' : ''
      } ${
        isActive && !grouping && device.enabled ? 'ring-1 ring-[var(--color-accent)]' : ''
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
              {editing ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
                  autoFocus
                  className="bg-white/10 rounded px-1 py-0.5 text-sm text-white outline-none border border-white/20 w-32"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  {device.name}
                  {!grouping && device.device_type === 'wiim' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditName(device.name); setEditing(true) }}
                      className="p-0.5 text-white/30 hover:text-white/70 transition-colors"
                      title="Rename"
                    >
                      <PencilIcon />
                    </button>
                  )}
                </>
              )}
              <DeviceTypeBadge device={device} />
              {isActive && !grouping && device.enabled && (
                <span className="text-[10px] text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
              {device.is_master && (
                <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">
                  Master
                </span>
              )}
              {isGroupedSlave && (
                <span className="text-[10px] text-orange-300 bg-orange-300/10 px-1.5 py-0.5 rounded-full">
                  Follower
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {device.model ?? device.ip}
              {device.source ? ` · ${device.source}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {device.is_master && !grouping && (
            <button
              onClick={(e) => { e.stopPropagation(); onDissolveGroup() }}
              className="text-xs text-[var(--color-text-secondary)] hover:text-red-400 transition-colors px-2 py-1"
            >
              Ungroup
            </button>
          )}
          {!grouping && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleEnabled() }}
              className={`w-9 h-5 rounded-full transition-colors relative ${
                device.enabled ? 'bg-[var(--color-accent)]' : 'bg-white/15'
              }`}
              title={device.enabled ? 'Disable device' : 'Enable device'}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
                device.enabled ? 'left-[18px]' : 'left-[3px]'
              }`} />
            </button>
          )}
        </div>
      </div>

      {/* Volume slider — only for enabled devices with rendering control */}
      {!grouping && device.enabled && device.capabilities.rendering_control && (
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

      {/* Channel control — WiiM devices only */}
      {!grouping && device.enabled && device.device_type === 'wiim' && device.channel != null && (
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Channel</span>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {['Left', 'Stereo', 'Right'].map((ch) => (
              <button
                key={ch}
                onClick={() => handleChannelChange(ch)}
                className={`px-3 py-1 text-xs transition-colors ${
                  device.channel === ch
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {ch === 'Left' ? 'L' : ch === 'Right' ? 'R' : 'Stereo'}
              </button>
            ))}
          </div>
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

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}
