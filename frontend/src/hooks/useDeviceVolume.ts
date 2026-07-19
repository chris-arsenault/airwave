import { useCallback } from "react";
import { api, type Device } from "../api/client";
import { useDeviceStore } from "../stores/deviceStore";

export const VOLUME_STEP = 0.05;

export function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export function volumePercent(device: Device): number {
  return Math.round(clampVolume(device.volume) * 100);
}

export function useDeviceVolumeActions() {
  const updateDevice = useDeviceStore((s) => s.updateDevice);

  const setVolume = useCallback(
    async (device: Device, volume: number) => {
      const next = clampVolume(volume);
      updateDevice(device.id, { volume: next });
      await api.setVolume(device.id, next);
    },
    [updateDevice]
  );

  const adjustVolume = useCallback(
    async (device: Device, delta: number) => {
      const current = useDeviceStore.getState().devices.find((d) => d.id === device.id) ?? device;
      await setVolume(current, current.volume + delta);
    },
    [setVolume]
  );

  return { setVolume, adjustVolume };
}
