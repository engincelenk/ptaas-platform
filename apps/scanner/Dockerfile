FROM python:3.12-slim AS base

# ── Nuclei: pinned release ──────────────────────────────────────────────────
ARG NUCLEI_VERSION=3.3.8
ARG NUCLEI_SHA256=47b03e3439e5c4f46a53e218b5ac38e4a18e29cc15219929bdc24cdcb37ef0e5

# ── subfinder: pinned release (passive subdomain discovery, M8 ASM) ─────────
ARG SUBFINDER_VERSION=2.6.6
ARG SUBFINDER_SHA256=e3e7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip && \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    ARCH=$(dpkg --print-architecture); \
    case "$ARCH" in \
      amd64) NUCLEI_ARCH="amd64" ;; \
      arm64) NUCLEI_ARCH="arm64" ;; \
      *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${NUCLEI_ARCH}.zip" \
         -o /tmp/nuclei.zip; \
    # Verify checksum (amd64 only — arm64 builds checked separately in CI)
    if [ "$NUCLEI_ARCH" = "amd64" ]; then \
      echo "${NUCLEI_SHA256}  /tmp/nuclei.zip" | sha256sum -c -; \
    fi; \
    unzip /tmp/nuclei.zip nuclei -d /usr/local/bin/; \
    chmod +x /usr/local/bin/nuclei; \
    rm /tmp/nuclei.zip

# ── subfinder binary ────────────────────────────────────────────────────────
RUN set -eux; \
    ARCH=$(dpkg --print-architecture); \
    case "$ARCH" in \
      amd64) SF_ARCH="amd64" ;; \
      arm64) SF_ARCH="arm64" ;; \
      *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/projectdiscovery/subfinder/releases/download/v${SUBFINDER_VERSION}/subfinder_${SUBFINDER_VERSION}_linux_${SF_ARCH}.zip" \
         -o /tmp/subfinder.zip; \
    unzip /tmp/subfinder.zip subfinder -d /usr/local/bin/; \
    chmod +x /usr/local/bin/subfinder; \
    rm /tmp/subfinder.zip

# ── Nuclei templates: pinned via git tag (no auto-update at runtime) ──
ARG NUCLEI_TEMPLATES_VERSION=9.9.4
RUN curl -fsSL "https://github.com/projectdiscovery/nuclei-templates/archive/refs/tags/v${NUCLEI_TEMPLATES_VERSION}.tar.gz" \
         -o /tmp/nuclei-templates.tar.gz && \
    mkdir -p /nuclei-templates && \
    tar -xzf /tmp/nuclei-templates.tar.gz --strip-components=1 -C /nuclei-templates && \
    rm /tmp/nuclei-templates.tar.gz

# ── Non-root scanner user (ADR-006) ──
RUN groupadd --gid 1001 scanner && \
    useradd --uid 1001 --gid scanner --shell /bin/sh --create-home scanner

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Templates dir must be readable by scanner user
RUN chown -R scanner:scanner /nuclei-templates

USER scanner

CMD ["python", "-m", "worker"]
