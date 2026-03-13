"""EQ and Parametric EQ controls via pywiim."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class EQPresetRequest(BaseModel):
    preset: str


class PEQBandRequest(BaseModel):
    band: int  # 0-9
    mode: str  # "off", "low_shelf", "peak", "high_shelf"
    frequency: int  # 10-22000 Hz
    q: float  # 0.01-24.0
    gain: float  # -12.0 to 12.0 dB


class PEQSettingsRequest(BaseModel):
    bands: list[PEQBandRequest]


def _mgr(request: Request):
    return request.app.state.device_manager


@router.get("/{device_id}")
async def get_eq(device_id: str, request: Request):
    """Get current EQ settings for a device."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        eq = await player.get_eq()
        return {"eq": eq}
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{device_id}/presets")
async def get_presets(device_id: str, request: Request):
    """Get available EQ presets."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    presets = await player.get_eq_presets()
    return {"presets": presets}


@router.post("/{device_id}/preset")
async def set_preset(device_id: str, body: EQPresetRequest, request: Request):
    """Apply an EQ preset."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    await player.set_eq_preset(body.preset)
    return {"ok": True}


@router.get("/{device_id}/peq")
async def get_peq(device_id: str, request: Request):
    """Get parametric EQ settings (WiiM devices only)."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        peq = await player.get_peq_settings()
        return {"peq": peq}
    except Exception as e:
        raise HTTPException(400, f"PEQ not supported: {e}") from e


@router.post("/{device_id}/peq")
async def set_peq(device_id: str, body: PEQSettingsRequest, request: Request):
    """Set parametric EQ bands (WiiM devices only)."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        # pywiim PEQ API expects band objects
        for band in body.bands:
            await player.set_peq_band(band.band, band.mode, band.frequency, band.q, band.gain)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{device_id}/peq/presets")
async def get_peq_presets(device_id: str, request: Request):
    """List saved PEQ presets."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        presets = await player.get_peq_presets()
        return {"presets": presets}
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/{device_id}/peq/presets/{name}")
async def save_peq_preset(device_id: str, name: str, request: Request):
    """Save current PEQ settings as a named preset."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        await player.save_peq_preset(name)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/{device_id}/peq/presets/{name}/load")
async def load_peq_preset(device_id: str, name: str, request: Request):
    """Load a saved PEQ preset."""
    player = _mgr(request).get_player(device_id)
    if not player:
        raise HTTPException(404, "Device not found")
    try:
        await player.load_peq_preset(name)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, str(e)) from e
