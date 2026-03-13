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
    set((state) => ({
      devices,
      activeDeviceId: state.activeDeviceId ?? devices[0]?.id ?? null,
    })),
  setActiveDevice: (id) => set({ activeDeviceId: id }),
  updateDevice: (id, update) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...update } : d)),
    })),
}))
