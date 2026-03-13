from fastapi import APIRouter, HTTPException, Request

from wiim_control.devices.models import DeviceInfo, SourceRequest, VolumeRequest
from wiim_control.events import publish

router = APIRouter()


def _mgr(request: Request):
    return request.app.state.device_manager


@router.get("", response_model=list[DeviceInfo])
async def list_devices(request: Request):
    return _mgr(request).list_all()


@router.get("/{device_id}", response_model=DeviceInfo)
async def get_device(device_id: str, request: Request):
    device = _mgr(request).get(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    return device


@router.post("/{device_id}/volume")
async def set_volume(device_id: str, body: VolumeRequest, request: Request):
    mgr = _mgr(request)
    player = mgr.get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.set_volume(body.volume)
    publish("device_state", {"device_id": device_id, "volume": body.volume})
    return {"ok": True}


@router.post("/{device_id}/mute")
async def toggle_mute(device_id: str, request: Request):
    mgr = _mgr(request)
    player = mgr.get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    device = mgr.get(device_id)
    await player.set_mute(not device.muted)
    device.muted = not device.muted
    publish("device_state", {"device_id": device_id, "muted": device.muted})
    return {"ok": True, "muted": device.muted}


@router.post("/{device_id}/source")
async def set_source(device_id: str, body: SourceRequest, request: Request):
    mgr = _mgr(request)
    player = mgr.get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.set_source(body.source)
    return {"ok": True}
