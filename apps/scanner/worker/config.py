"""Scanner worker configuration.

Secrets are loaded from Docker secrets files (/run/secrets/<name>) first,
falling back to environment variables for local development.
"""
import os


def load_secret(secret_name: str, env_fallback: str) -> str:
    """Read a secret from /run/secrets/<name> (Docker Secrets).
    Falls back to env var `env_fallback` for local dev."""
    secret_path = f"/run/secrets/{secret_name}"
    try:
        with open(secret_path, "r") as f:
            value = f.read().strip()
            if value:
                return value
    except OSError:
        pass  # file not present — use env fallback
    return os.environ[env_fallback]


REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379")
API_BASE_URL: str = os.environ.get("API_BASE_URL", "http://api:3000/api/v1")

# Secrets — prefer Docker Secrets, fall back to env var
SCANNER_API_KEY: str = load_secret("scanner_api_key", "SCANNER_API_KEY")

# ZAP daemon (M9)
ZAP_URL: str = os.environ.get("ZAP_URL", "http://zap:8080")
ZAP_API_KEY: str = os.environ.get("ZAP_API_KEY", "ptaas-zap-key")

NUCLEI_BINARY: str = os.environ.get("NUCLEI_BINARY", "/usr/local/bin/nuclei")
NUCLEI_TEMPLATES_DIR: str = os.environ.get("NUCLEI_TEMPLATES_DIR", "/nuclei-templates")

# Concurrency and safety
MAX_CONCURRENT_SCANS: int = int(os.environ.get("MAX_CONCURRENT_SCANS", "1"))
SCAN_TIMEOUT_QUICK: int = int(os.environ.get("SCAN_TIMEOUT_QUICK", "600"))   # 10 min
SCAN_TIMEOUT_FULL: int = int(os.environ.get("SCAN_TIMEOUT_FULL", "7200"))    # 2 hours

# BullMQ queue name must match the NestJS SCAN_QUEUE constant
SCAN_QUEUE_NAME: str = "scan-queue"
