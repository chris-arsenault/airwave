import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from wiim_control.config import settings
from wiim_control.devices.manager import DeviceManager
from wiim_control.devices.router import router as devices_router
from wiim_control.discovery.scanner import DeviceScanner
from wiim_control.eq.router import router as eq_router
from wiim_control.events import router as events_router
from wiim_control.groups.router import router as groups_router
from wiim_control.library.router import router as library_router
from wiim_control.playback.router import router as playback_router
from wiim_control.playlists.router import router as playlists_router
from wiim_control.playlists.store import PlaylistStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    device_manager = DeviceManager()
    scanner = DeviceScanner(device_manager, interval=settings.device_scan_interval)
    playlist_store = PlaylistStore(settings.database_path)
    await playlist_store.init()

    app.state.device_manager = device_manager
    app.state.scanner = scanner
    app.state.playlist_store = playlist_store

    scan_task = asyncio.create_task(scanner.run())

    yield

    # Shutdown
    scan_task.cancel()
    await device_manager.close()


app = FastAPI(title="WiiM Control", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices_router, prefix="/api/devices", tags=["devices"])
app.include_router(groups_router, prefix="/api/groups", tags=["groups"])
app.include_router(playback_router, prefix="/api/playback", tags=["playback"])
app.include_router(library_router, prefix="/api/library", tags=["library"])
app.include_router(playlists_router, prefix="/api/playlists", tags=["playlists"])
app.include_router(eq_router, prefix="/api/eq", tags=["eq"])
app.include_router(events_router, prefix="/api", tags=["events"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
