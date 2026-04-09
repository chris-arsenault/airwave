# CLAUDE.md

## Project Overview

Airwave — a monorepo for a WiiM audio ecosystem: a unified Rust server (DLNA media server + control plane) and a web-based frontend for WiiM devices. Deployed to TrueNAS via Docker Compose + Komodo.

### Components

| Directory | Language | Purpose |
|-----------|----------|---------|
| `backend/` | Rust | Unified DLNA/UPnP MediaServer + control plane — SSDP, SOAP, HTTP streaming, device management, playback, queue/session engine, playlists, EQ, metadata editing, SSE |
| `frontend/` | React/TypeScript (Vite, pnpm) | Mobile-first web UI — library browser, now playing, queue, device/group management, metadata editing |

## Build & Run

### Backend (Rust)

```bash
cd backend
cargo build --release
cargo test
cargo fmt --all --check
cargo clippy -- -D warnings
cargo run -- config.toml
```

### Frontend (React)

```bash
cd frontend
pnpm install
pnpm run dev                   # vite dev server
pnpm run lint && pnpm run typecheck
pnpm run test -- --run
```

### Full Stack (Docker)

```bash
docker compose up -d
```

### Lint (all)

```bash
make ci
```

## Platform Integration

- **CI**: Shared reusable workflow (`chris-arsenault/ahara/.github/workflows/ci.yml@main`)
- **Deploy**: TrueNAS via Komodo (`truenas: true` in `platform.yml`)
- **Project registration**: `ahara-control/infrastructure/terraform/project-airwave.tf`
- **No database** (uses local SQLite), **no Cognito** (LAN appliance), **no ALB** (host networking)

## Architecture

### Backend
- In-memory BTreeMap library with virtual containers (Artists/Albums/Genres/All Tracks)
- No database for library, no transcoding — files served as-is
- `Arc<RwLock<Library>>` (parking_lot) — never hold read guard across await
- Object IDs: `ar{n}` artists, `aa{n}` artist-albums, `av{n}` album-view, `gr{n}` genres, `t{n}` tracks
- Two device communication channels:
  - **UPnP SOAP** (port varies per device): AVTransport, RenderingControl, PlayQueue — used for playback control and state queries
  - **HTTPS API** (port 443, self-signed certs): EQ, source switching, multiroom grouping, device status — Linkplay proprietary `httpapi.asp?command=...`
- SSDP discovery for WiiM MediaRenderer devices on the local network
- Server-side queue engine with Poweramp-style shuffle/repeat modes
- Session-based playback with group/track shuffle, gapless pre-fetch, auto-advance
- SSE for real-time playback state + device change push to frontend
- SQLite for playlists and preferences
- Metadata tag editing via lofty (ID3/Vorbis), with bulk operations and library rescan
- Album art extraction with SQLite cache
- SOAP retry with exponential backoff for transient network errors

### Frontend
- Zustand stores, TanStack Query, Tailwind CSS
- Mobile-first layout: bottom nav, expandable now-playing bar
- SSE hook for real-time device/playback updates (no polling)
- Track metadata editor with single-track and bulk edit dialogs

## Key Constraints

- Server needs host networking for SSDP multicast device discovery
- Multiroom grouping uses HTTPS API, NOT SOAP (see `backend/docs/WIIM-PROTOCOL.md`)
- Device state is canonical — always read from device, never persist-and-restore group state
- Music volume mounted read-write when metadata editing is enabled
- No auth — this is a home network appliance

## Style

- Server: minimal deps, quick-xml writer, SOAP faults with UPnP error codes, axum routers
- Frontend: functional components, typed API layer, no class components
