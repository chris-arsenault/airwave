# CLAUDE.md

## Project Overview

wiim-dlna is a minimal DLNA/UPnP MediaServer:1 written in Rust. It serves music files to WiiM network audio players via SSDP discovery, SOAP-based browsing, and HTTP streaming.

## Build & Run

```bash
cargo build --release          # build
cargo test                     # 49 tests (XML spec, SOAP, DIDL, SSDP, library)
cargo run -- config.toml       # run with config file
RUST_LOG=wiim_dlna=debug cargo run -- config.toml  # debug logging
```

## Architecture

- **No database** — in-memory BTreeMap library, rebuilt on each scan
- **No transcoding** — files served as-is
- **No UPnP eventing** — WiiM devices poll Browse, no SUBSCRIBE needed
- Single binary, single process, tokio async runtime

### Module layout

- `config.rs` — TOML config with IP override for containers
- `ssdp/` — UDP multicast discovery (239.255.255.250:1900)
- `upnp/xml.rs` — device.xml, SCPD documents
- `upnp/soap.rs` — SOAP parse/generate
- `upnp/didl.rs` — DIDL-Lite XML for Browse results
- `services/content_directory.rs` — Browse action handler
- `services/connection_manager.rs` — GetProtocolInfo handler
- `media/library.rs` — in-memory tree (Root → Artist → Album → Track)
- `media/metadata.rs` — audio tag extraction via lofty
- `streaming.rs` — HTTP Range file serving with DLNA headers
- `api.rs` — REST admin endpoints

### Object ID scheme

Root = `"0"`, artists = `"a{n}"`, albums = `"al{n}"`, tracks = `"t{n}"`

### Shared state

Library is `Arc<RwLock<Library>>` (parking_lot). Never hold the read guard across an await point — this causes `Send` bound failures with tokio.

## Testing

Tests are in `tests/xml_spec.rs`. They validate:
- All XML documents parse correctly (roxmltree)
- UPnP required elements, attributes, namespaces present
- SOAP envelope structure
- DIDL-Lite content (protocolInfo, duration format, DLNA flags)
- SSDP message format
- Library data model

## Key Constraints

- axum 0.8: `State<T>` can go anywhere in handler args, but `Request` must be last. parking_lot guards across await points break `Send` bounds.
- SSDP requires multicast on 239.255.255.250:1900 — needs `--network=host` in Docker or macvlan.
- `advertise_ip` config is critical for bridge-mode containers.

## Style

- Minimal dependencies. No frameworks beyond axum/tokio.
- XML generated via quick-xml writer, not string templates (except static SCPDs).
- All UPnP XML is static `&'static str` where possible.
- Errors returned as SOAP faults with proper UPnP error codes.
