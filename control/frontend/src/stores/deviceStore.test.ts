import { describe, it, expect, beforeEach } from 'vitest'
import { useDeviceStore } from './deviceStore'
import type { Device } from '../api/client'

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    name: 'Living Room',
    ip: '192.168.1.10',
    model: 'WiiM Pro',
    firmware: '4.8.1',
    device_type: 'wiim',
    enabled: true,
    capabilities: { av_transport: true, rendering_control: true, wiim_extended: true },
    volume: 0.5,
    muted: false,
    source: 'wifi',
    group_id: null,
    is_master: false,
    ...overrides,
  }
}

describe('deviceStore', () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [], activeDeviceId: null })
  })

  it('starts with empty devices and no active device', () => {
    const { devices, activeDeviceId } = useDeviceStore.getState()
    expect(devices).toEqual([])
    expect(activeDeviceId).toBeNull()
  })

  it('setDevices stores devices and auto-selects first', () => {
    const devices = [makeDevice({ id: 'a' }), makeDevice({ id: 'b' })]
    useDeviceStore.getState().setDevices(devices)
    const state = useDeviceStore.getState()
    expect(state.devices).toHaveLength(2)
    expect(state.activeDeviceId).toBe('a')
  })

  it('setDevices preserves existing activeDeviceId if still present', () => {
    useDeviceStore.setState({ activeDeviceId: 'b' })
    const devices = [makeDevice({ id: 'a' }), makeDevice({ id: 'b' })]
    useDeviceStore.getState().setDevices(devices)
    expect(useDeviceStore.getState().activeDeviceId).toBe('b')
  })

  it('setActiveDevice changes the active device', () => {
    useDeviceStore.getState().setDevices([makeDevice({ id: 'a' }), makeDevice({ id: 'b' })])
    useDeviceStore.getState().setActiveDevice('b')
    expect(useDeviceStore.getState().activeDeviceId).toBe('b')
  })

  it('updateDevice merges partial updates', () => {
    useDeviceStore.getState().setDevices([makeDevice({ id: 'a', volume: 0.5, muted: false })])
    useDeviceStore.getState().updateDevice('a', { volume: 0.8, muted: true })
    const device = useDeviceStore.getState().devices[0]
    expect(device.volume).toBe(0.8)
    expect(device.muted).toBe(true)
    expect(device.name).toBe('Living Room') // unchanged
  })

  it('updateDevice does not affect other devices', () => {
    useDeviceStore.getState().setDevices([
      makeDevice({ id: 'a', volume: 0.5 }),
      makeDevice({ id: 'b', volume: 0.3 }),
    ])
    useDeviceStore.getState().updateDevice('a', { volume: 0.9 })
    expect(useDeviceStore.getState().devices[1].volume).toBe(0.3)
  })
})
