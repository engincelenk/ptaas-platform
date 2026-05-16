FROM python:3.12-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends nmap \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Entwicklung: BullMQ-Daemon (docker-compose) ──────────────────────────────
FROM base AS development
COPY shared/ ./shared/
COPY workers/ ./workers/
COPY worker_daemon.py .

RUN useradd -r -u 65534 scanner
USER scanner

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "worker_daemon"]

# ── Produktion: Einmal-Job (Kubernetes) ──────────────────────────────────────
FROM base AS production
COPY shared/ ./shared/
COPY workers/ ./workers/

RUN useradd -r -u 65534 scanner
USER scanner

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "workers.web_security.worker"]
