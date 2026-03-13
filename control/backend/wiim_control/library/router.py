from fastapi import APIRouter

from wiim_control.library import dlna_client

router = APIRouter()


@router.get("/browse")
async def browse_library(id: str = "0", start: int = 0, count: int = 0):
    """Browse the DLNA library. id=0 for root."""
    return await dlna_client.browse(object_id=id, start=start, count=count)


@router.get("/search")
async def search_library(q: str, start: int = 0, count: int = 0):
    """Search tracks by title, artist, or album."""
    return await dlna_client.search(query=q, start=start, count=count)
