from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from wiim_control.events import publish

router = APIRouter()


class CreateGroupRequest(BaseModel):
    master_id: str
    slave_ids: list[str]


class ModifyGroupRequest(BaseModel):
    device_id: str


def _mgr(request: Request):
    return request.app.state.device_manager


@router.post("")
async def create_group(body: CreateGroupRequest, request: Request):
    """Create a multiroom group with a master and one or more slaves."""
    mgr = _mgr(request)
    master_player = mgr.get_player(body.master_id)
    if not master_player:
        raise HTTPException(404, "Master device not found")

    master_device = mgr.get(body.master_id)

    for slave_id in body.slave_ids:
        slave_player = mgr.get_player(slave_id)
        if not slave_player:
            raise HTTPException(404, f"Slave device {slave_id} not found")
        # pywiim: join is called on the slave, passing master IP
        await slave_player.join_slave(master_device.ip)

    publish("group_changed", {"master": body.master_id, "slaves": body.slave_ids})
    return {"ok": True}


@router.post("/{master_id}/add")
async def add_to_group(master_id: str, body: ModifyGroupRequest, request: Request):
    """Add a device to an existing group."""
    mgr = _mgr(request)
    master_device = mgr.get(master_id)
    if not master_device:
        raise HTTPException(404, "Master device not found")

    slave_player = mgr.get_player(body.device_id)
    if not slave_player:
        raise HTTPException(404, "Device not found")

    await slave_player.join_slave(master_device.ip)
    publish("group_changed", {"master": master_id, "added": body.device_id})
    return {"ok": True}


@router.post("/{master_id}/remove")
async def remove_from_group(master_id: str, body: ModifyGroupRequest, request: Request):
    """Remove a device from a group. Must be called via master."""
    mgr = _mgr(request)
    master_player = mgr.get_player(master_id)
    if not master_player:
        raise HTTPException(404, "Master device not found")

    slave_device = mgr.get(body.device_id)
    if not slave_device:
        raise HTTPException(404, "Device not found")

    # Critical: kick must go through master, not slave
    await master_player.kick_slave(slave_device.ip)
    publish("group_changed", {"master": master_id, "removed": body.device_id})
    return {"ok": True}


@router.delete("/{master_id}")
async def dissolve_group(master_id: str, request: Request):
    """Dissolve an entire group."""
    mgr = _mgr(request)
    master_player = mgr.get_player(master_id)
    if not master_player:
        raise HTTPException(404, "Master device not found")

    await master_player.delete_group()
    publish("group_changed", {"dissolved": master_id})
    return {"ok": True}
