# Airwave

[![CI](https://github.com/chris-arsenault/airwave/actions/workflows/ci.yml/badge.svg)](https://github.com/chris-arsenault/airwave/actions/workflows/ci.yml)

A complete music system for [WiiM](https://www.wiimhome.com/) devices: a fast DLNA media server with integrated control plane and a modern web interface.

## Components

### [Backend](backend/) — Rust

Unified DLNA/UPnP MediaServer and control plane. The IoT collector advertises
the server locally to WiiMs; Airwave serves SOAP browsing (Artists, Albums,
Genres, All Tracks, Search) and HTTP streaming with seek support. It manages
players through the collector's scoped transport while retaining its existing
queue/session engine, grouping, EQ, playlists, metadata editing, and SSE state.

### [Frontend](frontend/) — React/Vite

Mobile-first web UI inspired by [Poweramp](https://powerampapp.com/). Library browser with search, now-playing with album art, drag-reorderable queue, device/group management, volume control, EQ profiles, and inline metadata editing.

## Quick Start

```bash
# The collector generates this separately from its House Sensors token.
AIRWAVE_COLLECTOR_TOKEN=<collector-airwave-token> docker compose up -d

# Or run components individually — see each directory
```

The LAN web UI is served at `http://<server>:7880`. It talks to the backend
through the frontend container's `/api` proxy and does not require Cognito.
Public access remains available through the Cognito-protected AWS deployment.
The backend reads renderer inventory and sends all WiiM HTTP/HTTPS through
`https://collector.local.ahara.io:8443`. It renews a MediaServer lease there;
the collector advertises Airwave on the IoT LAN. Configure a different endpoint
with `AIRWAVE_COLLECTOR_URL`. The token comes from
`/ahara/airwave/collector/api-token`, not the House Sensors secret.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the LAN, public, and Android delivery
models and their authentication boundaries.

## Supported Audio Formats

FLAC, MP3, AAC/M4A, WAV, OGG Vorbis, AIFF, PCM (L16), WMA

## License

[MIT](LICENSE)
