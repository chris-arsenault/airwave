import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'

export function EQSettings() {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const activeDevice = useDeviceStore((s) => s.devices.find((d) => d.id === s.activeDeviceId))
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'presets' | 'peq'>('presets')

  const presetsQuery = useQuery({
    queryKey: ['eq', 'presets', activeDeviceId],
    queryFn: () => api.getDevices().then(() =>
      fetch(`/api/eq/${activeDeviceId}/presets`).then((r) => r.json())
    ),
    enabled: !!activeDeviceId,
  })

  const peqPresetsQuery = useQuery({
    queryKey: ['peq', 'presets', activeDeviceId],
    queryFn: () =>
      fetch(`/api/eq/${activeDeviceId}/peq/presets`).then((r) => r.json()),
    enabled: !!activeDeviceId && activeTab === 'peq',
  })

  const handlePresetSelect = async (preset: string) => {
    if (!activeDeviceId) return
    await fetch(`/api/eq/${activeDeviceId}/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    })
    queryClient.invalidateQueries({ queryKey: ['eq'] })
  }

  const handlePeqPresetLoad = async (name: string) => {
    if (!activeDeviceId) return
    await fetch(`/api/eq/${activeDeviceId}/peq/presets/${encodeURIComponent(name)}/load`, {
      method: 'POST',
    })
    queryClient.invalidateQueries({ queryKey: ['peq'] })
  }

  if (!activeDeviceId) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
          No device selected
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* Device info */}
      <div className="bg-[var(--color-surface-elevated)] rounded-xl p-4">
        <div className="text-sm font-medium">{activeDevice?.name}</div>
        <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          {activeDevice?.ip}
          {activeDevice?.model ? ` · ${activeDevice.model}` : ''}
          {activeDevice?.firmware ? ` · FW ${activeDevice.firmware}` : ''}
        </div>
      </div>

      {/* EQ tabs */}
      <div className="flex gap-1 bg-[var(--color-surface-elevated)] rounded-lg p-1">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${
            activeTab === 'presets'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-text-secondary)]'
          }`}
        >
          EQ Presets
        </button>
        <button
          onClick={() => setActiveTab('peq')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${
            activeTab === 'peq'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-text-secondary)]'
          }`}
        >
          Parametric EQ
        </button>
      </div>

      {activeTab === 'presets' && (
        <div className="space-y-2">
          <div className="text-sm text-[var(--color-text-secondary)]">Standard EQ Presets</div>
          {presetsQuery.isLoading ? (
            <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(presetsQuery.data?.presets ?? DEFAULT_PRESETS).map((preset: string) => (
                <button
                  key={preset}
                  onClick={() => handlePresetSelect(preset)}
                  className="bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-lg px-3 py-3 text-sm text-left transition-colors active:scale-[0.98]"
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'peq' && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--color-text-secondary)]">
            Parametric EQ Profiles (WiiM devices only)
          </div>
          {peqPresetsQuery.isLoading ? (
            <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">Loading...</div>
          ) : peqPresetsQuery.isError ? (
            <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
              PEQ not available for this device
            </div>
          ) : (
            <div className="space-y-2">
              {(peqPresetsQuery.data?.presets ?? []).map((preset: { name: string }) => (
                <button
                  key={preset.name}
                  onClick={() => handlePeqPresetLoad(preset.name)}
                  className="w-full bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-lg px-4 py-3 text-sm text-left transition-colors flex items-center justify-between active:scale-[0.99]"
                >
                  <span>{preset.name}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Load</span>
                </button>
              ))}
              {(peqPresetsQuery.data?.presets ?? []).length === 0 && (
                <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
                  No saved PEQ presets. Create presets in the WiiM app first.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const DEFAULT_PRESETS = [
  'Flat', 'Rock', 'Pop', 'Jazz', 'Classical', 'Bass Boost', 'Treble Boost', 'Vocal',
]
