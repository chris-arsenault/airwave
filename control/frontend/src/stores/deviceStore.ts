import { create } from 'zustand'
import type { Device } from '../api/client'

interface DeviceState {
  devices: Device[]
  activeDeviceId: string | null
  setDevices: (devices: Device[]) => void
  setActiveDevice: (id: string) => void
  updateDevice: (id: string, update: Partial<Device>) => void
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  activeDeviceId: null,
  setDevices: (devices) =>
    set((state) => {
      let activeId = state.activeDeviceId
      // If current active device is now a slave, redirect to its master
      if (activeId) {
        const active = devices.find((d) => d.id === activeId)
        if (active && active.group_id && !active.is_master) {
          activeId = active.group_id
        }
      }
      return {
        devices,
        activeDeviceId: activeId ?? devices.find((d) => d.enabled && !(d.group_id && !d.is_master))?.id ?? devices[0]?.id ?? null,
      }
    }),
  setActiveDevice: (id) =>
    set((state) => {
      const device = state.devices.find((d) => d.id === id)
      // If selecting a slave, redirect to its master
      if (device && device.group_id && !device.is_master) {
        return { activeDeviceId: device.group_id }
      }
      return { activeDeviceId: id }
    }),
  updateDevice: (id, update) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...update } : d)),
    })),
}))
