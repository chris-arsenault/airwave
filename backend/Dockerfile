FROM debian:bookworm-slim

ARG AWS_SIGNING_HELPER_VERSION=1.8.4
ARG AWS_SIGNING_HELPER_SHA256=b7568acd6e1517a4e1adaee68d52bfd6284a0e5305677166cd83d43a07c815c9

# The backend reads its collector token at start with the identity the trust
# appliance issues it, rather than receiving it from a deploy (ahara-trust
# ADR-0002). curl and openssl are what the enrollment bootstrap speaks with;
# the AWS CLI is what reads the parameter.
RUN apt-get update && apt-get install -y --no-install-recommends \
    awscli \
    ca-certificates \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
    "https://rolesanywhere.amazonaws.com/releases/${AWS_SIGNING_HELPER_VERSION}/X86_64/Linux/Amzn2023/aws_signing_helper" \
    -o /usr/local/bin/aws_signing_helper \
    && echo "${AWS_SIGNING_HELPER_SHA256}  /usr/local/bin/aws_signing_helper" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/aws_signing_helper

COPY truenas-roles-anywhere-bootstrap /usr/local/bin/truenas-roles-anywhere-bootstrap
RUN chmod 0755 /usr/local/bin/truenas-roles-anywhere-bootstrap

COPY dist/airwave-server /usr/local/bin/airwave-server
COPY config.toml /etc/airwave-server/config.toml

EXPOSE 7882
EXPOSE 1900/udp

ENTRYPOINT ["/usr/local/bin/truenas-roles-anywhere-bootstrap", "AWS_RA_BACKEND", "--", \
            "airwave-server", "/etc/airwave-server/config.toml"]
