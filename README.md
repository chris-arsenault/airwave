# wiim-dlna

[![CI](https://github.com/chris-arsenault/wiim-dlna/actions/workflows/ci.yml/badge.svg)](https://github.com/chris-arsenault/wiim-dlna/actions/workflows/ci.yml)

A complete music system for [WiiM](https://www.wiimhome.com/) devices: a fast DLNA media server and a modern web control interface.

## Components

### [DLNA Server](dlna-server/) — Rust

Minimal DLNA/UPnP MediaServer:1. Serves music via SSDP discovery, SOAP browsing (Artists/Albums/Genres/All Tracks/Search), and HTTP streaming with seek support. 5.9 MB binary, ~3 MB RSS.

### [Control Backend](control/backend/) — Python/FastAPI

Device management via [pywiim](https://github.com/mjcumming/pywiim). Multi-room grouping, synchronized playback, server-side queue with shuffle/repeat modes, DLNA library browsing, playlists, parametric EQ with profiles.

### [Control Frontend](control/frontend/) — React/Vite

Mobile-first web UI inspired by [Poweramp](https://powerampapp.com/). Library browser with search, now-playing with album art, drag-reorderable queue, device/group management, volume control, EQ profiles.

## Quick Start

```bash
# Full stack
docker compose up -d

# Or run components individually — see each directory's README
```

## Supported Audio Formats

FLAC, MP3, AAC/M4A, WAV, OGG Vorbis, AIFF, PCM (L16), WMA

## License

[MIT](LICENSE)
