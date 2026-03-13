import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type EqBand } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'

const BAND_LABELS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
const BUILTIN_PRESETS = new Set([
  'Flat', 'Acoustic', 'Bass Booster', 'Bass Reducer', 'Classical', 'Dance', 'Deep',
  'Electronic', 'Game', 'Hip-Hop', 'Jazz', 'Latin', 'Loudness', 'Lounge', 'Movie',
  'Piano', 'Pop', 'R&B', 'Rock', 'Small Speakers', 'Spoken Word', 'Treble Booster',
  'Treble Reducer', 'Vocal Booster',
])

export function EQSettings() {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const activeDevice = useDeviceStore((s) => s.devices.find((d) => d.id === s.activeDeviceId))
  const [activeTab, setActiveTab] = useState<'presets' | 'bands' | 'audio'>('presets')

  if (!activeDeviceId || !activeDevice) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
          No device selected
        </div>
      </div>
    )
  }

  if (!activeDevice.capabilities.https_api) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Settings</h2>
        <DeviceHeader device={activeDevice} />
        <div className="text-center py-12">
          <div className="text-amber-400 text-sm font-medium mb-2">EQ Unavailable</div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            HTTPS API (port 443) is not responding on this device.
            <br />Try rebooting the device to restore EQ controls.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>
      <DeviceHeader device={activeDevice} />

      <div className="flex gap-1 bg-[var(--color-surface-elevated)] rounded-lg p-1">
        {(['presets', 'bands', 'audio'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-sm py-2 rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {tab === 'presets' ? 'Presets' : tab === 'bands' ? 'EQ Bands' : 'Audio'}
          </button>
        ))}
      </div>

      {activeTab === 'presets' && <PresetsTab deviceId={activeDeviceId} />}
      {activeTab === 'bands' && <BandsTab deviceId={activeDeviceId} />}
      {activeTab === 'audio' && <AudioTab deviceId={activeDeviceId} />}
    </div>
  )
}

function DeviceHeader({ device }: { device: { name: string; ip: string; model: string | null; firmware: string | null } }) {
  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4">
      <div className="text-sm font-medium">{device.name}</div>
      <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
        {device.ip}
        {device.model ? ` · ${device.model}` : ''}
        {device.firmware ? ` · FW ${device.firmware}` : ''}
      </div>
    </div>
  )
}

function PresetsTab({ deviceId }: { deviceId: string }) {
  const queryClient = useQueryClient()

  const stateQuery = useQuery({
    queryKey: ['eq', 'state', deviceId],
    queryFn: () => api.getEqState(deviceId),
  })

  const presetsQuery = useQuery({
    queryKey: ['eq', 'presets', deviceId],
    queryFn: () => api.getEqPresets(deviceId),
  })

  const handleToggleEq = async () => {
    if (!stateQuery.data) return
    if (stateQuery.data.enabled) {
      await api.disableEq(deviceId)
    } else {
      await api.enableEq(deviceId)
    }
    queryClient.invalidateQueries({ queryKey: ['eq', 'state', deviceId] })
  }

  const handleSelectPreset = async (preset: string) => {
    await api.loadEqPreset(deviceId, preset)
    queryClient.invalidateQueries({ queryKey: ['eq', 'state', deviceId] })
  }

  const handleDeletePreset = async (name: string) => {
    await api.deleteEqPreset(deviceId, name)
    queryClient.invalidateQueries({ queryKey: ['eq', 'presets', deviceId] })
  }

  const presets = presetsQuery.data?.presets ?? []
  const currentPreset = stateQuery.data?.preset_name ?? ''
  const eqEnabled = stateQuery.data?.enabled ?? false

  return (
    <div className="space-y-3">
      {/* EQ On/Off toggle */}
      <div className="flex items-center justify-between bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3">
        <div>
          <div className="text-sm font-medium">Equalizer</div>
          {eqEnabled && currentPreset && (
            <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{currentPreset}</div>
          )}
        </div>
        <button
          onClick={handleToggleEq}
          className={`w-11 h-6 rounded-full transition-colors relative ${
            eqEnabled ? 'bg-[var(--color-accent)]' : 'bg-white/15'
          }`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
            eqEnabled ? 'left-[22px]' : 'left-[4px]'
          }`} />
        </button>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <div key={preset} className="relative group">
            <button
              onClick={() => handleSelectPreset(preset)}
              className={`w-full rounded-lg px-3 py-3 text-sm text-left transition-colors active:scale-[0.98] ${
                eqEnabled && currentPreset === preset
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40'
                  : 'bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {preset}
            </button>
            {!BUILTIN_PRESETS.has(preset) && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset) }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete preset"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BandsTab({ deviceId }: { deviceId: string }) {
  const queryClient = useQueryClient()
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  const stateQuery = useQuery({
    queryKey: ['eq', 'state', deviceId],
    queryFn: () => api.getEqState(deviceId),
  })

  const bands = stateQuery.data?.bands ?? []
  const eqEnabled = stateQuery.data?.enabled ?? false

  const handleBandChange = useCallback(
    async (band: EqBand, rawValue: number) => {
      // rawValue is 0-100 from the slider, convert to dB: (rawValue - 50) * 0.24 gives roughly -12 to +12
      await api.setEqBand(deviceId, band.index, rawValue)
      queryClient.invalidateQueries({ queryKey: ['eq', 'state', deviceId] })
    },
    [deviceId, queryClient],
  )

  const handleReset = async () => {
    await api.loadEqPreset(deviceId, 'Flat')
    queryClient.invalidateQueries({ queryKey: ['eq', 'state', deviceId] })
  }

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    await api.saveEqPreset(deviceId, saveName.trim())
    queryClient.invalidateQueries({ queryKey: ['eq', 'presets', deviceId] })
    setSaveName('')
    setSaving(false)
  }

  if (!eqEnabled) {
    return (
      <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
        Enable the equalizer on the Presets tab to adjust bands
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Band sliders */}
      <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4 space-y-3">
        {bands.map((band, i) => (
          <BandSlider
            key={band.index}
            band={band}
            label={BAND_LABELS[i] ?? band.param_name}
            onChange={handleBandChange}
          />
        ))}
      </div>

      {/* Reset + Save */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          className="text-xs text-[var(--color-text-secondary)] px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        >
          Reset to Flat
        </button>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Preset name..."
          className="flex-1 text-xs bg-[var(--color-surface-elevated)] rounded-lg px-3 py-2 outline-none"
        />
        <button
          onClick={handleSave}
          disabled={!saveName.trim() || saving}
          className="text-xs text-[var(--color-accent)] px-3 py-2 rounded-lg border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/10 transition-colors disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function BandSlider({ band, label, onChange }: {
  band: EqBand
  label: string
  onChange: (band: EqBand, value: number) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(band, value), 200)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-text-secondary)] w-8 text-right shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={Math.round(band.value)}
        onChange={handleChange}
        className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
      />
      <span className="text-xs text-[var(--color-text-secondary)] w-6 text-right shrink-0">
        {Math.round(band.value)}
      </span>
    </div>
  )
}

const INPUT_SOURCES = [
  { value: 'wifi', label: 'WiFi' },
  { value: 'bluetooth', label: 'Bluetooth' },
  { value: 'line-in', label: 'Line In' },
  { value: 'optical', label: 'Optical' },
  { value: 'coaxial', label: 'Coaxial' },
  { value: 'udisk', label: 'USB' },
  { value: 'HDMI', label: 'HDMI' },
  { value: 'RCA', label: 'RCA' },
]

function rssiToLabel(rssi: number): { label: string; color: string; bars: number } {
  if (rssi >= -50) return { label: 'Excellent', color: 'text-green-400', bars: 4 }
  if (rssi >= -60) return { label: 'Good', color: 'text-green-400', bars: 3 }
  if (rssi >= -70) return { label: 'Fair', color: 'text-yellow-400', bars: 2 }
  return { label: 'Weak', color: 'text-red-400', bars: 1 }
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-colors ${
            i <= bars ? 'bg-current' : 'bg-white/15'
          }`}
          style={{ height: `${i * 25}%` }}
        />
      ))}
    </div>
  )
}

function AudioTab({ deviceId }: { deviceId: string }) {
  const queryClient = useQueryClient()
  const balanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const balanceQuery = useQuery({
    queryKey: ['eq', 'balance', deviceId],
    queryFn: () => api.getBalance(deviceId),
  })

  const crossfadeQuery = useQuery({
    queryKey: ['eq', 'crossfade', deviceId],
    queryFn: () => api.getCrossfade(deviceId),
  })

  const wifiQuery = useQuery({
    queryKey: ['device', 'wifi', deviceId],
    queryFn: () => api.getWifiStatus(deviceId),
    refetchInterval: 30000,
  })

  const currentSource = wifiQuery.data?.source ?? null

  const handleSourceChange = async (source: string) => {
    await api.switchSource(deviceId, source)
    queryClient.invalidateQueries({ queryKey: ['device', 'wifi', deviceId] })
  }

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current)
    balanceTimerRef.current = setTimeout(async () => {
      await api.setBalance(deviceId, value)
      queryClient.invalidateQueries({ queryKey: ['eq', 'balance', deviceId] })
    }, 200)
  }

  const handleCrossfadeToggle = async () => {
    const current = crossfadeQuery.data?.enabled ?? false
    await api.setCrossfade(deviceId, !current)
    queryClient.invalidateQueries({ queryKey: ['eq', 'crossfade', deviceId] })
  }

  const balance = balanceQuery.data?.balance ?? 0
  const rssi = wifiQuery.data?.rssi ?? null
  const ssid = wifiQuery.data?.ssid ?? null
  const signal = rssi !== null ? rssiToLabel(rssi) : null

  return (
    <div className="space-y-3">
      {/* Input Source */}
      <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4 space-y-3">
        <div className="text-sm font-medium">Input Source</div>
        <div className="grid grid-cols-4 gap-1.5">
          {INPUT_SOURCES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleSourceChange(value)}
              className={`text-xs py-2 rounded-lg transition-colors ${
                currentSource === value
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40'
                  : 'bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* WiFi Signal */}
      {signal && (
        <div className="bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">WiFi Signal</div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                {ssid ? `${ssid} · ` : ''}{rssi} dBm
              </div>
            </div>
            <div className={`flex items-center gap-2 ${signal.color}`}>
              <span className="text-xs font-medium">{signal.label}</span>
              <SignalBars bars={signal.bars} />
            </div>
          </div>
        </div>
      )}

      {/* Channel Balance */}
      <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4 space-y-3">
        <div className="text-sm font-medium">Channel Balance</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-secondary)] shrink-0">L</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            defaultValue={balance}
            onChange={handleBalanceChange}
            className="flex-1 h-1 accent-[var(--color-accent)] bg-white/10 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text-secondary)] shrink-0">R</span>
        </div>
        <div className="text-xs text-center text-[var(--color-text-secondary)]">
          {balance === 0 ? 'Center' : balance < 0 ? `Left ${Math.abs(balance).toFixed(1)}` : `Right ${balance.toFixed(1)}`}
        </div>
      </div>

      {/* Crossfade */}
      <div className="flex items-center justify-between bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3">
        <div className="text-sm font-medium">Crossfade</div>
        <button
          onClick={handleCrossfadeToggle}
          className={`w-11 h-6 rounded-full transition-colors relative ${
            crossfadeQuery.data?.enabled ? 'bg-[var(--color-accent)]' : 'bg-white/15'
          }`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
            crossfadeQuery.data?.enabled ? 'left-[22px]' : 'left-[4px]'
          }`} />
        </button>
      </div>
    </div>
  )
}
