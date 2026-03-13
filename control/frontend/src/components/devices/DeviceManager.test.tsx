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

  it('renders device cards with name and model', () => {
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

  it('marks active device with Active badge', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', name: 'Kitchen' })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows Group button', () => {
    useDeviceStore.setState({
      devices: [makeDevice()],
      activeDeviceId: 'dev-1',
    })
    render(<DeviceManager />)
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('entering group mode shows Cancel and Create group buttons', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a' }), makeDevice({ id: 'b', name: 'Other' })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    fireEvent.click(screen.getByText('Group'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Create group')).toBeInTheDocument()
  })

  it('shows Ungroup button for master devices', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', name: 'Master', is_master: true, group_id: 'a' })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('Ungroup')).toBeInTheDocument()
    expect(screen.getByText('Master', { selector: 'span' })).toBeInTheDocument()
  })

  it('renders volume slider with correct percentage', () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: 'a', volume: 0.75 })],
      activeDeviceId: 'a',
    })
    render(<DeviceManager />)
    expect(screen.getByText('75')).toBeInTheDocument()
  })
})
