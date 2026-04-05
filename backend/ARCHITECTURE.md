# Architecture

## Overview

airwave implements a UPnP MediaServer:1 device. The UPnP Device Architecture 1.0 spec requires three protocol layers, plus HTTP media streaming:

```
┌─────────────────────────────────────────────────────────────┐
│                     WiiM Device                             │
│                  (DLNA Media Renderer)                      │
└─────┬──────────────┬──────────────┬──────────────┬──────────┘
      │ 1. Discovery │ 2. Description │ 3. Control  │ 4. Stream
      │    (SSDP)    │    (HTTP/XML)  │  (SOAP/XML) │  (HTTP)
      ▼              ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                     airwave                                │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌────────┐ │
│  │   SSDP   │  │  UPnP XML    │  │ Services  │  │ Stream │ │
│  │ Multicast│  │ Descriptions │  │ (SOAP)    │  │ (HTTP) │ │
│  └──────────┘  └──────────────┘  └───────────┘  └────────┘ │
│         │              │               │              │      │
│         └──────────────┴───────┬───────┴──────────────┘      │
│                                │                             │
│                        ┌───────────────┐                     │
│                        │    Library    │                     │
│                        │  (in-memory)  │                     │
│                        └───────────────┘                     │
│                                │                             │
│                        ┌───────────────┐                     │
│                        │  Filesystem   │                     │
│                        │   Scanner     │                     │
│                        └───────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## Module Map

```
src/
├── main.rs                         Application bootstrap, HTTP routing
├── lib.rs                          Public re-exports for integration tests
├── config.rs                       TOML configuration with IP override
├── api.rs                          REST admin endpoints (/api/*)
├── streaming.rs                    HTTP Range-aware file serving
│
├── ssdp/
│   ├── mod.rs                      UDP multicast listener + periodic announcer
│   └── messages.rs                 SSDP message templates (NOTIFY, M-SEARCH response)
│
├── upnp/
│   ├── xml.rs                      Device + service description XML (device.xml, SCPDs)
│   ├── soap.rs                     SOAP envelope parsing and generation
│   └── didl.rs                     DIDL-Lite XML builder for Browse results
│
├── services/
│   ├── content_directory.rs        Browse, GetSearchCapabilities, GetSortCapabilities
│   └── connection_manager.rs       GetProtocolInfo, GetCurrentConnectionIDs
│
└── media/
    ├── library.rs                  In-memory tree + filesystem scanner
    └── metadata.rs                 Audio tag extraction (lofty)
```

## Request Flow

### 1. Discovery (SSDP)

```
WiiM sends:  M-SEARCH * HTTP/1.1  (UDP multicast 239.255.255.250:1900)
             ST: urn:schemas-upnp-org:device:MediaServer:1

Server:      ssdp::SsdpService::handle_msearch()
             → matches ST against device_nts()
             → sends unicast response with LOCATION pointing to device.xml
```

The server also proactively announces itself every 15 minutes (CACHE-CONTROL/2) via NOTIFY alive messages.

### 2. Description (HTTP/XML)

```
WiiM fetches:  GET /device.xml
Server:        upnp::xml::device_description()
               → returns XML with UDN, friendly name, service list

WiiM fetches:  GET /ContentDirectory.xml
Server:        upnp::xml::content_directory_scpd()
               → returns SCPD with Browse action definition
```

### 3. Control (SOAP)

```
WiiM sends:  POST /control/ContentDirectory
             SOAPAction: "urn:schemas-upnp-org:service:ContentDirectory:1#Browse"
             Body: <Browse><ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag>...</Browse>

Server:      main::handle_soap_control()
             → upnp::soap::parse_soap_action()       (extract action + args)
             → services::content_directory::handle_browse()
             → media::library::Library::children_of() (get objects)
             → upnp::didl::DidlWriter                 (serialize to DIDL-Lite XML)
             → upnp::soap::soap_response()            (wrap in SOAP envelope)
```

### 4. Streaming (HTTP)

```
WiiM sends:  GET /media/t42
             Range: bytes=0-

Server:      main::stream_media()
             → library.get("t42")        (look up track path)
             → streaming::serve_file()   (open file, handle Range, stream)
             → HTTP 206 with Content-Range, DLNA headers
```

## Data Model

```
Library (in-memory, Arc<RwLock<Library>>)
│
├── "0" Container (Root)
│   ├── "a1" Container (Artist: "Pink Floyd")
│   │   ├── "al1" Container (Album: "The Wall")
│   │   │   ├── "t1" Track → /mnt/music/Pink Floyd/The Wall/01 - In The Flesh.flac
│   │   │   ├── "t2" Track → /mnt/music/Pink Floyd/The Wall/02 - The Thin Ice.flac
│   │   │   └── ...
│   │   └── "al2" Container (Album: "Wish You Were Here")
│   │       └── ...
│   ├── "a2" Container (Artist: "Miles Davis")
│   │   └── ...
│   └── ...
```

IDs are prefixed by type: `a` = artist, `al` = album, `t` = track. Root is always `"0"`.

The library is rebuilt from scratch on each scan (no incremental updates). This is intentional — a full rescan of 100k tracks takes ~2 seconds, and the atomic swap via `RwLock` means zero downtime for clients during rescans.

## Concurrency Model

```
main thread
├── axum HTTP server (tokio, multi-threaded)
├── tokio::spawn → ssdp::run()           (SSDP listener + advertiser)
└── tokio::spawn → library::scan_loop()  (periodic rescan)
```

The library is shared via `Arc<RwLock<Library>>` (parking_lot). Read locks are held only briefly during Browse/stream lookups. Write locks only during scan completion (atomic swap).

The SSDP task runs two sub-tasks: a listener for M-SEARCH requests and a periodic NOTIFY advertiser. Both share an `Arc<UdpSocket>`.

## Key Design Decisions

**No database.** The entire media library is an in-memory BTreeMap. Music metadata for 100k tracks fits in ~50 MB. Startup scan is fast. No schema migrations, no corruption, no backup concerns.

**No eventing.** UPnP eventing (SUBSCRIBE/NOTIFY for state changes) is not implemented. WiiM devices work fine without it — they poll Browse on navigation. This removes significant complexity.

**No transcoding.** Files are served as-is. WiiM hardware supports all common lossless and lossy formats natively.

**Deterministic UUID.** The device UUID is derived from the friendly name via UUID v5 (SHA-1 namespace). This means the same server always appears as the same device to WiiM, even across container rebuilds — no duplicate entries in the WiiM app.

**parking_lot over std.** `parking_lot::RwLock` is used because `std::sync::RwLock` guards are not `Send`, which conflicts with tokio's work-stealing scheduler. parking_lot guards have the same restriction but the code is structured to never hold a guard across an await point.

## Dependencies

| Crate | Purpose |
|-------|---------|
| tokio | Async runtime |
| axum | HTTP server |
| quick-xml | XML generation/parsing for SOAP and DIDL |
| lofty | Audio metadata extraction (ID3, Vorbis, FLAC) |
| serde + toml | Configuration |
| socket2 | Multicast UDP socket setup |
| parking_lot | Fast RwLock |
| walkdir | Recursive directory traversal |
| uuid | Deterministic device UUID |
| mime_guess | MIME type detection from file extensions |
| percent-encoding | URL encoding for track IDs |
| tokio-util | ReaderStream for async file streaming |
| httpdate | HTTP date formatting for SSDP |
| local-ip-address | Auto-detect host IP |
| tracing | Structured logging |

## Control Plane

In addition to serving media, airwave-server acts as the control plane for WiiM devices on the network. This adds several module groups not shown in the DLNA-focused diagram above:

```
src/
├── control/
│   ├── mod.rs                      Control plane routes + state
│   ├── state.rs                    Shared state (DeviceManager, EventBus, sessions)
│   ├── groups.rs                   Multiroom group create/dissolve (HTTPS API primary, SOAP fallback)
│   ├── eq.rs                       EQ, balance, crossfade, source switching, WiFi status
│   ├── playback_monitor.rs         Periodic polling of device transport state
│   ├── session.rs                  Session-based playback engine (shuffle/repeat/gapless)
│   ├── events.rs                   SSE event bus for real-time frontend push
│   ├── device_config.rs            SQLite persistence for device preferences
│   └── models.rs                   Request/response types
│
├── wiim/
│   ├── discovery.rs                SSDP M-SEARCH + device registration + group state refresh
│   ├── device.rs                   WiimDevice model + DeviceManager (DashMap)
│   ├── https_api.rs                Linkplay HTTPS API client (EQ, grouping, status)
│   ├── soap_client.rs              Generic SOAP client with retry
│   └── services/
│       ├── av_transport.rs         AVTransport:1 (play, pause, seek, GetInfoEx)
│       ├── rendering_control.rs    RenderingControl:1 (volume, mute, GetControlDeviceInfo)
│       └── play_queue.rs           PlayQueue:1 (WiiM-proprietary queue)
```

WiiM devices expose two distinct APIs — see [docs/WIIM-PROTOCOL.md](docs/WIIM-PROTOCOL.md) for the full protocol reference including multiroom grouping, EQ, source switching, and known idiosyncrasies.

## Protocol References

- [UPnP Device Architecture 1.0](http://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.0.pdf)
- [ContentDirectory:1 Service](http://upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf)
- [ConnectionManager:1 Service](http://upnp.org/specs/av/UPnP-av-ConnectionManager-v1-Service.pdf)
- [DLNA Guidelines](https://spirespark.com/dlna/guidelines) (protocol info flags, ORG_OP, ORG_FLAGS)
- [DIDL-Lite Schema](http://www.upnp.org/schemas/av/didl-lite-v2.xsd)
- [WiiM Protocol Reference](docs/WIIM-PROTOCOL.md) (reverse-engineered Linkplay API, multiroom, EQ, idiosyncrasies)
