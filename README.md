# Airwave

[![CI](https://github.com/chris-arsenault/airwave/actions/workflows/ci.yml/badge.svg)](https://github.com/chris-arsenault/airwave/actions/workflows/ci.yml)

A complete music system for [WiiM](https://www.wiimhome.com/) devices: a fast DLNA media server with integrated control plane and a modern web interface.

## Components

### [Backend](backend/) — Rust

Unified DLNA/UPnP MediaServer and control plane. Serves music via SSDP discovery, SOAP browsing (Artists/Albums/Genres/All Tracks/Search), and HTTP streaming with seek support. Manages WiiM devices via UPnP, with server-side queue/session engine (shuffle/repeat), gapless playback, playlists, parametric EQ, metadata tag editing, and real-time SSE state push.

### [Frontend](frontend/) — React/Vite

Mobile-first web UI inspired by [Poweramp](https://powerampapp.com/). Library browser with search, now-playing with album art, drag-reorderable queue, device/group management, volume control, EQ profiles, and inline metadata editing.

## Quick Start

```bash
# Full stack
docker compose up -d

# Or run components individually — see each directory
```

## Supported Audio Formats

FLAC, MP3, AAC/M4A, WAV, OGG Vorbis, AIFF, PCM (L16), WMA

## License

[MIT](LICENSE)
