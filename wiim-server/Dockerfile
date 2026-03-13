FROM rust:1.94-slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY tests/ tests/
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/wiim-server /usr/local/bin/wiim-server
COPY config.toml /etc/wiim-server/config.toml

EXPOSE 7882
EXPOSE 1900/udp

ENTRYPOINT ["wiim-server", "/etc/wiim-server/config.toml"]
