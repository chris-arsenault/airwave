import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeviceManager } from './DeviceManager'
import { useDeviceStore } from '../../stores/deviceStore'
import type { Device } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: {
    setVolume: vi.fn(() => Promise.resolve()),
    toggleMute: vi.fn(() => Promise.resolve()),
    createGroup: vi.fn(() => Promise.resolve()),
    dissolveGroup: vi.fn(() => Promise.resolve()),
    setEnabled: vi.fn(() => Promise.resolve()),
    renameDevice: vi.fn(() => Promise.resolve()),
    getChannel: vi.fn(() => Promise.resolve({ channel: 'Stereo' })),
    setChannel: vi.fn(() => Promise.resolve()),
    getPresets: vi.fn(() => Promise.resolve({ presets: {} })),
    savePreset: vi.fn(() => Promise.resolve()),
    loadPreset: vi.fn(() => Promise.resolve()),
    deletePreset: vi.fn(() => Promise.resolve()),
  },
}))

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    name: 'Living Room',
    ip: '192.168.1.10',
    model: 'WiiM Pro',
    firmware: '4.8.1',
    device_type: 'wiim',
    enabled: true,
    capabilities: { av_transport: true, rendering_control: true, wiim_extended: true, https_api: true },
    volume: 0.5,
    muted: false,
    channel: null,
    source: 'wifi',
    group_id: null,
    is_master: false,
    ...overrides,
  }
}

describe('DeviceManager', () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [], activeDeviceId: null })
  })

  it('shows discovery message when no devices', () => {
    render(<DeviceManager />)
    expect(screen.getByText('Discovering devices...')).toBeInTheDocument()
  })

  it('renders device tiles with names', () => {
    useDeviceStore.setState({
      devices: [
        makeDevice({ id: 'a', name: 'Kitchen', model: 'WiiM Mini' }),
        makeDevice({ id: 'b', name: 'Bedroom', model: 'WiiM Pro' }),
      ],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Bedroom')).toBeInTheDocument()
  })

  it('shows Master badge in grouped tile', () => {
    useDeviceStore.setState({
      devices: [
        makeDevice({ id: 'a', name: 'Main', is_master: true, group_id: 'a' }),
        makeDevice({ id: 'b', name: 'Follower', group_id: 'a' }),
      ],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('renders volume slider with correct percentage', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', volume: 0.75 })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('75')).toBeInTheDocument()
  })

  it('shows preset buttons', () => {
    useDeviceStore.setState({
      devices: [makeDevice()],
      activeDeviceId: 'dev-1',
    })
    render(<DeviceManager />)
    expect(screen.getByText('Presets')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders WiiM badge for wiim devices', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ device_type: 'wiim' })],
      activeDeviceId: 'dev-1',
    })
    render(<DeviceManager />)
    expect(screen.getByText('WiiM')).toBeInTheDocument()
  })

  it('renders UPnP badge for non-wiim devices', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ device_type: 'renderer' })],
      activeDeviceId: 'dev-1',
    })
    render(<DeviceManager />)
    expect(screen.getByText('UPnP')).toBeInTheDocument()
  })

  it('calls setVolume on slider change', async () => {
    const { api } = vi.mocked(await import('../../api/client'))
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', volume: 0.5 })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '80' } })
    expect(api.setVolume).toHaveBeenCalledWith('a', 0.8)
  })
})
