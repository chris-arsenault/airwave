FROM rust:1.83-slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/wiim-dlna /usr/local/bin/wiim-dlna
COPY config.toml /etc/wiim-dlna/config.toml

EXPOSE 9000
EXPOSE 1900/udp

ENTRYPOINT ["wiim-dlna", "/etc/wiim-dlna/config.toml"]
