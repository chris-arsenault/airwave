FROM rust:1.94-slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY tests/ tests/
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/airwave-server /usr/local/bin/airwave-server
COPY config.toml /etc/airwave-server/config.toml

EXPOSE 7882
EXPOSE 1900/udp

ENTRYPOINT ["airwave-server", "/etc/airwave-server/config.toml"]
