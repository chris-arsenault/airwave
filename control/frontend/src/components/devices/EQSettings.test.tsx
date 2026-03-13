import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { EQSettings } from './EQSettings'
import { useDeviceStore } from '../../stores/deviceStore'
import type { Device } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: {
    getDevices: vi.fn(() => Promise.resolve([])),
  },
}))

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1', name: 'Living Room', ip: '192.168.1.10', model: 'WiiM Pro',
    firmware: '4.8.1', device_type: 'wiim', enabled: true,
    capabilities: { av_transport: true, rendering_control: true, wiim_extended: true },
    volume: 0.5, muted: false, source: 'wifi',
    group_id: null, is_master: false, ...overrides,
  }
}

describe('EQSettings', () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [], activeDeviceId: null })
    vi.restoreAllMocks()
  })

  it('shows "No device selected" when no active device', () => {
    renderWithProviders(<EQSettings />)
    expect(screen.getByText('No device selected')).toBeInTheDocument()
  })

  it('shows device info when device is selected', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', name: 'Kitchen', ip: '10.0.0.5', model: 'WiiM Pro', firmware: '4.8.1' })],
      activeDeviceId: 'a',
    })
    renderWithProviders(<EQSettings />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
  })

  it('renders EQ Presets and Parametric EQ tabs', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a' })],
      activeDeviceId: 'a',
    })
    renderWithProviders(<EQSettings />)
    expect(screen.getByText('EQ Presets')).toBeInTheDocument()
    expect(screen.getByText('Parametric EQ')).toBeInTheDocument()
  })

  it('shows default EQ presets after loading', async () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a' })],
      activeDeviceId: 'a',
    })
    // Mock fetch for the /api/eq/.../presets endpoint
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ presets: ['Flat', 'Rock', 'Pop', 'Jazz', 'Classical', 'Bass Boost', 'Treble Boost', 'Vocal'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    renderWithProviders(<EQSettings />)
    await waitFor(() => {
      expect(screen.getByText('Flat')).toBeInTheDocument()
      expect(screen.getByText('Rock')).toBeInTheDocument()
      expect(screen.getByText('Jazz')).toBeInTheDocument()
      expect(screen.getByText('Classical')).toBeInTheDocument()
    })
  })
})
