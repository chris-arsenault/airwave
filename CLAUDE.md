# CLAUDE.md

## Project Overview

Monorepo for a WiiM audio ecosystem: a unified Rust server (DLNA media server + control plane) and a web-based frontend for WiiM devices.

### Components

| Directory | Language | Purpose |
|-----------|----------|---------|
| `wiim-server/` | Rust | Unified DLNA/UPnP MediaServer + control plane — SSDP, SOAP, HTTP streaming, device management, playback, queue/session engine, playlists, EQ, metadata editing, SSE |
| `control/frontend/` | React/TypeScript (Vite) | Mobile-first web UI — library browser, now playing, queue, device/group management, metadata editing |

## Build & Run

### WiiM Server (Rust)

```bash
cd wiim-server
cargo build --release
cargo test
cargo fmt --all --check
cargo clippy --all-targets
cargo run -- config.toml
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

### WiiM Server
- In-memory BTreeMap library with virtual containers (Artists/Albums/Genres/All Tracks)
- No database for library, no transcoding — files served as-is
- `Arc<RwLock<Library>>` (parking_lot) — never hold read guard across await
- Object IDs: `ar{n}` artists, `aa{n}` artist-albums, `av{n}` album-view, `gr{n}` genres, `t{n}` tracks
- UPnP SOAP client for WiiM device communication (AVTransport, RenderingControl)
- SSDP discovery for WiiM MediaRenderer devices on the local network
- Server-side queue engine with Poweramp-style shuffle/repeat modes
- Session-based playback with group/track shuffle, gapless pre-fetch, auto-advance
- SSE for real-time playback state + device change push to frontend
- SQLite for playlists and preferences
- Metadata tag editing via lofty (ID3/Vorbis), with bulk operations and library rescan
- Album art extraction with SQLite cache
- SOAP retry with exponential backoff for transient network errors

### Control Frontend
- Zustand stores, TanStack Query, Tailwind CSS
- Mobile-first layout: bottom nav, expandable now-playing bar
- SSE hook for real-time device/playback updates (no polling)
- Track metadata editor with single-track and bulk edit dialogs

## Key Constraints

- Server needs host networking for SSDP multicast device discovery
- WiiM group commands must go through the master device (slave-side leave doesn't persist)
- Music volume mounted read-write when metadata editing is enabled
- No auth — this is a home network appliance

## Style

- Server: minimal deps, quick-xml writer, SOAP faults with UPnP error codes, axum routers
- Frontend: functional components, typed API layer, no class components
