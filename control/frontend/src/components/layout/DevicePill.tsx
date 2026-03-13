import { useState, useRef, useEffect } from 'react'
import { useDeviceStore } from '../../stores/deviceStore'
import { usePlayerStore } from '../../stores/playerStore'

export function DevicePill() {
  const devices = useDeviceStore((s) => s.devices)
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setActiveDevice = useDeviceStore((s) => s.setActiveDevice)
  const activeDevice = devices.find((d) => d.id === activeDeviceId)
  const playing = usePlayerStore((s) => s.playing)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-surface-elevated)] border border-white/10 text-sm hover:border-white/20 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full ${playing ? 'bg-emerald-400' : 'bg-[var(--color-text-secondary)]'}`} />
        <span className="truncate max-w-[140px]">{activeDevice?.name ?? 'No device'}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {devices.filter((d) => d.enabled).map((device) => {
            const isSlave = device.group_id != null && !device.is_master
            const selectable = !isSlave
            return (
              <button
                key={device.id}
                onClick={() => { if (selectable) { setActiveDevice(device.id); setOpen(false) } }}
                disabled={!selectable}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  !selectable
                    ? 'opacity-40 cursor-not-allowed'
                    : device.id === activeDeviceId
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <SpeakerIcon />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {device.name}
                    {isSlave && <span className="text-[10px] text-orange-300 ml-1.5">(follower)</span>}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">
                    {device.model ?? device.ip}
                  </div>
                </div>
                {device.id === activeDeviceId && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}
