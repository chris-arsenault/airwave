"""Background device discovery using pywiim."""

import asyncio
import logging

from wiim_control.devices.manager import DeviceManager
from wiim_control.events import publish

logger = logging.getLogger(__name__)


class DeviceScanner:
    def __init__(self, device_manager: DeviceManager, interval: int = 30):
        self.device_manager = device_manager
        self.interval = interval

    async def run(self):
        """Continuously discover devices on the network."""
        while True:
            try:
                await self._scan()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Device scan failed")
            await asyncio.sleep(self.interval)

    async def _scan(self):
        from pywiim import discover_devices

        discovered = await discover_devices()
        updated = False

        for device in discovered:
            if await self.device_manager.register(device):
                updated = True

        if updated:
            publish("devices_changed", self.device_manager.snapshot())
