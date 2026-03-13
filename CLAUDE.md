# CLAUDE.md

## Project Overview

Monorepo for a WiiM audio ecosystem: a DLNA media server and a web-based control plane for WiiM devices.

### Components

| Directory | Language | Purpose |
|-----------|----------|---------|
| `dlna-server/` | Rust | Minimal DLNA/UPnP MediaServer:1 — serves music via SSDP + SOAP + HTTP streaming |
| `control/backend/` | Python (FastAPI) | Control plane — device discovery (pywiim), playback, queue, groups, DLNA browsing, playlists, EQ |
| `control/frontend/` | React/TypeScript (Vite) | Mobile-first web UI — library browser, now playing, queue, device/group management |

## Build & Run

### DLNA Server (Rust)

```bash
cd dlna-server
cargo build --release
cargo test                     # 49 tests
cargo clippy -- -D warnings
cargo run -- config.toml
```

### Control Backend (Python)

```bash
cd control/backend
pip install -e ".[dev]"
pytest
ruff check . && ruff format --check .
uvicorn wiim_control.main:app --reload
```

### Control Frontend (React)

```bash
cd control/frontend
npm install
npm run dev                    # vite dev server
npm run lint && npm run typecheck
npm run test -- --run
```

### Full Stack (Docker)

```bash
docker compose up -d
```

## Architecture

### DLNA Server
- In-memory BTreeMap library with virtual containers (Artists/Albums/Genres/All Tracks)
- No database, no transcoding — files served as-is
- `Arc<RwLock<Library>>` (parking_lot) — never hold read guard across await
- Object IDs: `ar{n}` artists, `aa{n}` artist-albums, `av{n}` album-view, `gr{n}` genres, `t{n}` tracks

### Control Backend
- pywiim for all WiiM device communication (async HTTP + UPnP)
- SOAP client to dlna-server for ContentDirectory Browse/Search
- Server-side queue engine with Poweramp-style shuffle/repeat modes
- SSE for real-time state push to frontend
- SQLite for playlists and preferences

### Control Frontend
- Zustand stores, TanStack Query, Tailwind CSS
- Mobile-first layout: bottom nav, expandable now-playing bar
- SSE hook for real-time device/playback updates

## Key Constraints

- Backend needs host networking for SSDP multicast device discovery
- pywiim group commands must go through the master device (slave-side leave doesn't persist)
- WiiM HTTPS uses self-signed certs (pywiim handles this)
- No auth — this is a home network appliance

## Style

- DLNA server: minimal deps, quick-xml writer, SOAP faults with UPnP error codes
- Backend: FastAPI routers, pydantic models, async throughout
- Frontend: functional components, typed API layer, no class components
