# wiim-dlna

[![CI](https://github.com/wiim-dlna/wiim-dlna/actions/workflows/ci.yml/badge.svg)](https://github.com/wiim-dlna/wiim-dlna/actions/workflows/ci.yml)

Minimal DLNA/UPnP media server built in Rust, designed to serve music to [WiiM](https://www.wiimhome.com/) devices from a TrueNAS server (or any Linux host).

No transcoding, no thumbnails, no web UI bloat. Just SSDP discovery, a standards-compliant ContentDirectory, and fast HTTP streaming with seek support.

**5.9 MB** single binary. **~3 MB** idle RSS.

## Features

- UPnP MediaServer:1 with SSDP multicast discovery
- ContentDirectory:1 Browse (Artist → Album → Track hierarchy)
- ConnectionManager:1 with full audio format protocol info
- HTTP Range requests for seeking and gapless playback
- DLNA headers (`DLNA.ORG_OP`, `DLNA.ORG_FLAGS`, `contentFeatures.dlna.org`)
- Lossless metadata extraction (FLAC, MP3, AAC, WAV, OGG, AIFF, WMA)
- Periodic background library rescans
- Manual IP override for containerized deployments
- Simple REST API for status and rescans
- Deterministic device UUID (stable across restarts)

## Supported Audio Formats

FLAC, MP3, AAC/M4A, WAV, OGG Vorbis, AIFF, PCM (L16), WMA

## Quick Start

### From source

```bash
# Clone and build
git clone https://github.com/your-user/wiim-dlna.git
cd wiim-dlna
cargo build --release

# Edit config
cp config.toml my-config.toml
vi my-config.toml

# Run
./target/release/wiim-dlna my-config.toml
```

### Docker

```bash
docker build -t wiim-dlna .
docker run --network=host \
  -v /path/to/music:/mnt/music:ro \
  -v ./config.toml:/etc/wiim-dlna/config.toml:ro \
  wiim-dlna
```

### Docker Compose (TrueNAS)

```bash
docker compose up -d
```

See [docker-compose.yaml](docker-compose.yaml). Adjust the music volume path to your TrueNAS dataset.

## Configuration

```toml
[network]
# Override the advertised IP for container environments.
# Required when running in bridge-mode containers.
# If unset, auto-detects from network interfaces.
# advertise_ip = "192.168.1.50"
port = 9000

[media]
music_dirs = ["/mnt/music"]
scan_interval_secs = 300

[server]
friendly_name = "WiiM Music Server"
```

Pass the config file path as the first CLI argument:

```bash
wiim-dlna /path/to/config.toml
```

### IP Override for Containers

When running in a TrueNAS jail or Docker container with bridge networking, the container's internal IP isn't reachable from WiiM devices. Set `advertise_ip` to your TrueNAS host's LAN IP so SSDP announcements point clients to the right address.

With `--network=host` (recommended for DLNA), this is unnecessary — the server sees and advertises the host's real IP.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Server status (track count, IP, version) |
| GET | `/api/config` | Current configuration |
| POST | `/api/rescan` | Trigger immediate library rescan |

### UPnP Endpoints

| Path | Description |
|------|-------------|
| `/device.xml` | UPnP device description |
| `/ContentDirectory.xml` | ContentDirectory SCPD |
| `/ConnectionManager.xml` | ConnectionManager SCPD |
| `/control/ContentDirectory` | SOAP control (Browse, etc.) |
| `/control/ConnectionManager` | SOAP control (GetProtocolInfo, etc.) |
| `/media/{id}` | Audio file streaming |

## TrueNAS Deployment

### Recommended: Host Networking

Host networking is the simplest path for DLNA. SSDP uses UDP multicast on `239.255.255.250:1900`, which doesn't work through Docker's default bridge NAT.

```yaml
# docker-compose.yaml
services:
  wiim-dlna:
    build: .
    network_mode: host
    volumes:
      - /mnt/pool/media/music:/mnt/music:ro
      - ./config.toml:/etc/wiim-dlna/config.toml:ro
```

### Alternative: Bridge + IP Override

If host networking isn't available, use bridge mode with explicit port mapping and IP override:

```yaml
services:
  wiim-dlna:
    build: .
    ports:
      - "9000:9000"
      - "1900:1900/udp"
    volumes:
      - /mnt/pool/media/music:/mnt/music:ro
      - ./config.toml:/etc/wiim-dlna/config.toml:ro
```

And in `config.toml`:

```toml
[network]
advertise_ip = "192.168.1.50"  # your TrueNAS host IP
```

Note: SSDP multicast in bridge mode requires the container to receive multicast traffic, which may need `--net=host` on the Docker daemon or macvlan networking. Host mode avoids all of this.

## Logging

Control log level with the `RUST_LOG` environment variable:

```bash
RUST_LOG=wiim_dlna=debug ./target/release/wiim-dlna config.toml
RUST_LOG=wiim_dlna=trace,tower_http=debug  # verbose
```

## Testing

```bash
cargo test
```

49 tests covering XML spec compliance for all UPnP descriptions, SOAP envelopes, DIDL-Lite output, SSDP messages, and library operations.

## License

[MIT](LICENSE)
