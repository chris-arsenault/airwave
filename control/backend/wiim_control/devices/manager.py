"""Device registry and state cache."""

import logging

from wiim_control.devices.models import DeviceInfo

logger = logging.getLogger(__name__)


class DeviceManager:
    def __init__(self):
        self._devices: dict[str, DeviceInfo] = {}
        self._players: dict[str, object] = {}  # ip -> pywiim Player

    async def register(self, player) -> bool:
        """Register or update a discovered device. Returns True if new."""
        try:
            info = await player.get_device_info_model()
            device_id = info.uuid or info.mac or str(info.ip)
            ip = str(info.ip)

            device = DeviceInfo(
                id=device_id,
                name=info.device_name or ip,
                ip=ip,
                model=getattr(info, "hardware", None),
                firmware=getattr(info, "firmware", None),
            )

            is_new = device_id not in self._devices
            self._devices[device_id] = device
            self._players[ip] = player

            if is_new:
                logger.info("Discovered device: %s (%s)", device.name, ip)
            return is_new
        except Exception:
            logger.debug("Failed to register device", exc_info=True)
            return False

    def get(self, device_id: str) -> DeviceInfo | None:
        return self._devices.get(device_id)

    def get_player(self, device_id: str):
        """Get the pywiim Player for a device."""
        device = self._devices.get(device_id)
        if device:
            return self._players.get(device.ip)
        return None

    def list_all(self) -> list[DeviceInfo]:
        return list(self._devices.values())

    def snapshot(self) -> dict:
        return {"devices": [d.model_dump() for d in self._devices.values()]}

    async def close(self):
        self._players.clear()
        self._devices.clear()
