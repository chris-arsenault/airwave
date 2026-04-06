FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY dist/airwave-server /usr/local/bin/airwave-server
COPY config.toml /etc/airwave-server/config.toml

EXPOSE 7882
EXPOSE 1900/udp

ENTRYPOINT ["airwave-server", "/etc/airwave-server/config.toml"]
