import { useState, useRef, useCallback, useEffect } from 'react'
import { api, type Device, type GroupDefinition } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'

interface GroupPreset {
  groups: GroupDefinition[]
}

export function DeviceManager() {
  const devices = useDeviceStore((s) => s.devices)
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const updateDevice = useDeviceStore((s) => s.updateDevice)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [presets, setPresets] = useState<(GroupPreset | null)[]>([null, null, null, null, null])

  // Load presets on mount
  useEffect(() => {
    api.getPresets().then((data) => {
      const slots: (GroupPreset | null)[] = []
      for (let i = 1; i <= 5; i++) {
        const raw = data.presets[String(i)]
        slots.push(raw ? { groups: raw } : null)
      }
      setPresets(slots)
    }).catch(() => {})
  }, [])

  // Compute group zones
  const masters = devices.filter((d) => d.is_master)
  const masterIds = new Set(masters.map((d) => d.id))
  const groupedSlaveIds = new Set(
    devices.filter((d) => d.group_id && !d.is_master && masterIds.has(d.group_id)).map((d) => d.id)
  )

  type GroupZone = { id: string; label: string; deviceIds: string[] }
  const groups: GroupZone[] = masters.map((m) => ({
    id: m.id,
    label: m.name,
    deviceIds: [m.id, ...devices.filter((d) => d.group_id === m.id && !d.is_master).map((d) => d.id)],
  }))
  const ungroupedDevices = devices.filter((d) => !groupedSlaveIds.has(d.id) && !d.is_master)

  // Remove device from its current group (helper)
  const removeFromCurrentGroup = useCallback(async (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId)
    if (!device?.group_id) return
    if (device.is_master) {
      await api.dissolveGroup(deviceId)
    } else {
      const remainingSlaves = devices.filter(
        (d) => d.group_id === device.group_id && !d.is_master && d.id !== deviceId
      )
      await api.dissolveGroup(device.group_id)
      if (remainingSlaves.length > 0) {
        await api.createGroup(device.group_id, remainingSlaves.map((d) => d.id))
      }
    }
  }, [devices])

  const handleDrop = useCallback(async (targetZone: string) => {
    if (!dragId) return
    const droppedId = dragId
    setDragOver(null)
    setDragId(null)

    const device = devices.find((d) => d.id === droppedId)
    if (!device) return

    // --- Ungroup zone ---
    if (targetZone === 'ungroup') {
      await removeFromCurrentGroup(droppedId)
      return
    }

    // --- Drop onto an ungrouped device → create new 2-device group ---
    const targetDevice = devices.find((d) => d.id === targetZone)
    if (targetDevice && !targetDevice.is_master && !targetDevice.group_id) {
      if (targetZone === droppedId) return // dropped on self
      await removeFromCurrentGroup(droppedId)
      await api.createGroup(targetZone, [droppedId])
      return
    }

    // --- Drop onto an existing group ---
    if (targetZone === device.group_id) return // already in this group
    await removeFromCurrentGroup(droppedId)

    const existingSlaves = devices.filter(
      (d) => d.group_id === targetZone && !d.is_master
    )
    const allSlaveIds = [...existingSlaves.map((d) => d.id), droppedId]
    if (existingSlaves.length > 0) {
      await api.dissolveGroup(targetZone)
    }
    await api.createGroup(targetZone, allSlaveIds)
  }, [dragId, devices, removeFromCurrentGroup])

  // Preset handlers
  const handlePresetClick = useCallback(async (slot: number) => {
    const preset = presets[slot]
    if (!preset) return
    await api.loadPreset(slot + 1)
  }, [presets])

  const handlePresetLongPress = useCallback(async (slot: number) => {
    await api.savePreset(slot + 1)
    const data = await api.getPresets()
    const slots: (GroupPreset | null)[] = []
    for (let i = 1; i <= 5; i++) {
      const raw = data.presets[String(i)]
      slots.push(raw ? { groups: raw } : null)
    }
    setPresets(slots)
  }, [])

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

  if (devices.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Rooms</h2>
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📡</div>
          <div className="text-sm text-[var(--color-text-secondary)]">Discovering devices...</div>
        </div>
      </div>
    )
  }

  const isDragging = dragId !== null

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Rooms</h2>

      {/* Presets bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-secondary)] shrink-0">Presets</span>
        {presets.map((preset, i) => (
          <PresetButton
            key={i}
            slot={i}
            hasPreset={preset !== null}
            groupCount={preset?.groups.length ?? 0}
            onClick={() => handlePresetClick(i)}
            onLongPress={() => handlePresetLongPress(i)}
          />
        ))}
      </div>

      {/* Groups */}
      {groups.map((group) => (
        <DropZone
          key={group.id}
          zoneId={group.id}
          highlight={isDragging && dragOver === group.id}
          onDragOver={() => setDragOver(group.id)}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop(group.id)}
          className={`rounded-xl border p-2 transition-colors ${
            isDragging && dragOver === group.id
              ? 'border-orange-400 bg-orange-400/5'
              : 'border-orange-400/30 bg-[var(--color-surface-elevated)]/50'
          }`}
        >
          <div className="px-1 pt-0.5 pb-1.5 flex items-center gap-2">
            <GroupIcon />
            <span className="text-xs font-medium text-orange-400">Group</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {group.deviceIds.map((id, idx) => {
              const d = devices.find((dev) => dev.id === id)
              if (!d) return null
              return (
                <SpeakerCard
                  key={id}
                  device={d}
                  isMaster={idx === 0}
                  isActive={id === activeDeviceId}
                  isDragging={dragId === id}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDragId(id) }}
                  onDragEnd={() => { setDragId(null); setDragOver(null) }}
                  onSelect={() => d.enabled && setActiveDevice(group.id)}
                  onVolumeChange={(v) => handleVolumeChange(d, v)}
                  onMuteToggle={() => handleMuteToggle(d)}
                  onToggleEnabled={() => handleToggleEnabled(d)}
                />
              )
            })}
          </div>
        </DropZone>
      ))}

      {/* Ungrouped devices — each card is a drop target too */}
      <div className="grid grid-cols-2 gap-2">
        {ungroupedDevices.map((d) => (
          <DropZone
            key={d.id}
            zoneId={d.id}
            highlight={isDragging && dragOver === d.id && dragId !== d.id}
            onDragOver={() => setDragOver(d.id)}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(d.id)}
            className={`rounded-xl transition-colors ${
              isDragging && dragOver === d.id && dragId !== d.id
                ? 'ring-2 ring-[var(--color-accent)]'
                : ''
            }`}
          >
            <SpeakerCard
              device={d}
              isMaster={false}
              isActive={d.id === activeDeviceId}
              isDragging={dragId === d.id}
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; setDragId(d.id) }}
              onDragEnd={() => { setDragId(null); setDragOver(null) }}
              onSelect={() => d.enabled && setActiveDevice(d.id)}
              onVolumeChange={(v) => handleVolumeChange(d, v)}
              onMuteToggle={() => handleMuteToggle(d)}
              onToggleEnabled={() => handleToggleEnabled(d)}
            />
          </DropZone>
        ))}
      </div>

      {/* Ungroup drop zone — only visible during drag */}
      {isDragging && (
        <DropZone
          zoneId="ungroup"
          highlight={dragOver === 'ungroup'}
          onDragOver={() => setDragOver('ungroup')}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop('ungroup')}
          className={`rounded-xl border-2 border-dashed py-5 flex items-center justify-center gap-2 text-sm transition-colors ${
            dragOver === 'ungroup'
              ? 'border-red-400 bg-red-400/10 text-red-400'
              : 'border-white/20 text-white/40'
          }`}
        >
          <UnlinkIcon />
          <span>Ungroup</span>
        </DropZone>
      )}
    </div>
  )
}

// --- Sub-components ---

function DropZone({
  zoneId,
  onDragOver,
  onDragLeave,
  onDrop,
  className,
  children,
}: {
  zoneId: string
  highlight?: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      data-zone={zoneId}
      className={className}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave()
      }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      {children}
    </div>
  )
}

function SpeakerCard({
  device,
  isMaster,
  isActive,
  isDragging,
  onDragStart,
  onDragEnd,
  onSelect,
  onVolumeChange,
  onMuteToggle,
  onToggleEnabled,
}: {
  device: Device
  isMaster: boolean
  isActive: boolean
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onSelect: () => void
  onVolumeChange: (value: number) => void
  onMuteToggle: () => void
  onToggleEnabled: () => void
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
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`bg-[var(--color-surface-elevated)] p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30 scale-95' : ''
      } ${!device.enabled ? 'opacity-50' : ''} ${
        isActive && device.enabled ? 'ring-1 ring-[var(--color-accent)]' : ''
      }`}
    >
      {/* Header: name + toggle */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <DragHandle />
            {isMaster && (
              <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded-full shrink-0">M</span>
            )}
            <DeviceTypeBadge device={device} />
          </div>
          <div className="font-medium text-sm leading-tight flex items-center gap-1">
            {editing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
                autoFocus
                className="bg-white/10 rounded px-1 py-0.5 text-sm text-white outline-none border border-white/20 w-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="truncate">{device.name}</span>
                {device.device_type === 'wiim' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditName(device.name); setEditing(true) }}
                    className="p-0.5 text-white/30 hover:text-white/70 transition-colors shrink-0"
                    title="Rename"
                  >
                    <PencilIcon />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
            {device.model ?? device.ip}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleEnabled() }}
          className={`w-8 h-4.5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
            device.enabled ? 'bg-[var(--color-accent)]' : 'bg-white/15'
          }`}
          title={device.enabled ? 'Disable' : 'Enable'}
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-[3px] transition-all ${
            device.enabled ? 'left-[17px]' : 'left-[3px]'
          }`} />
        </button>
      </div>

      {/* Volume */}
      {device.enabled && device.capabilities.rendering_control && (
        <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMuteToggle}
            className={`shrink-0 ${device.muted ? 'text-red-400' : 'text-[var(--color-text-secondary)]'}`}
          >
            {device.muted ? <VolumeMutedIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range" min={0} max={100} value={volumePercent}
            onChange={(e) => onVolumeChange(parseInt(e.target.value))}
            className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-[11px] text-[var(--color-text-secondary)] w-6 text-right shrink-0">{volumePercent}</span>
        </div>
      )}

      {/* Channel */}
      {device.enabled && device.device_type === 'wiim' && device.channel != null && (
        <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">Ch</span>
          <div className="flex rounded-md overflow-hidden border border-white/10">
            {['Left', 'Stereo', 'Right'].map((ch) => (
              <button
                key={ch}
                onClick={() => handleChannelChange(ch)}
                className={`px-2 py-0.5 text-[10px] transition-colors ${
                  device.channel === ch
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {ch === 'Left' ? 'L' : ch === 'Right' ? 'R' : 'S'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PresetButton({
  slot,
  hasPreset,
  groupCount,
  onClick,
  onLongPress,
}: {
  slot: number
  hasPreset: boolean
  groupCount: number
  onClick: () => void
  onLongPress: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const startPress = () => {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, 600)
  }

  const endPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!firedRef.current) onClick()
  }

  return (
    <button
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current) }}
      onTouchStart={startPress}
      onTouchEnd={(e) => { e.preventDefault(); endPress() }}
      className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
        hasPreset
          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30'
          : 'bg-white/5 text-white/30 border border-white/10'
      }`}
      title={hasPreset ? `Load preset ${slot + 1} (${groupCount} groups) — hold to overwrite` : `Hold to save preset ${slot + 1}`}
    >
      {slot + 1}
    </button>
  )
}

function DeviceTypeBadge({ device }: { device: Device }) {
  if (device.device_type === 'wiim') {
    return (
      <>
        <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded-full shrink-0">WiiM</span>
        {!device.capabilities.https_api && (
          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded-full shrink-0" title="Reboot device to restore EQ controls">
            Reboot
          </span>
        )}
      </>
    )
  }
  return <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1 py-0.5 rounded-full shrink-0">UPnP</span>
}

// --- Icons ---

function DragHandle() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-white/25 shrink-0">
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-orange-400">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function UnlinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3" />
    </svg>
  )
}

function VolumeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}

function VolumeMutedIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}
