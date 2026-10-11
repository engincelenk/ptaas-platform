"""HTTP client for the PTaaS internal API callbacks."""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from config import API_BASE_URL, SCANNER_API_KEY

log = structlog.get_logger()

TIMEOUT = httpx.Timeout(30.0)


class ApiClient:
    """Context-manager HTTP client — reuse a single AsyncClient per job."""

    def __init__(self, base_url: str = API_BASE_URL, api_key: str = SCANNER_API_KEY):
        self._base_url = base_url.rstrip("/")
        self._headers = {
            "x-scanner-api-key": api_key,
            "content-type": "application/json",
        }
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ApiClient":
        self._client = httpx.AsyncClient(timeout=TIMEOUT, headers=self._headers)
        return self

    async def __aexit__(self, *_) -> None:
        if self._client:
            await self._client.aclose()

    # ── Scan callbacks ────────────────────────────────────────────────────────

    async def get_credentials(self, scan_id: str) -> dict | None:
        resp = await self._client.get(f"{self._base_url}/internal/scans/{scan_id}/credentials")
        resp.raise_for_status()
        return resp.json().get("credentials")

    async def update_progress(self, scan_id: str, **kwargs: Any) -> None:
        try:
            resp = await self._client.post(
                f"{self._base_url}/internal/scans/{scan_id}/progress", json=kwargs
            )
            resp.raise_for_status()
        except Exception as exc:
            log.warning("progress_update_failed", scan_id=scan_id, error=str(exc))

    async def ingest_findings(self, scan_id: str, findings: list[dict]) -> int:
        if not findings:
            return 0
        resp = await self._client.post(
            f"{self._base_url}/internal/scans/{scan_id}/findings",
            json={"findings": findings},
        )
        resp.raise_for_status()
        return resp.json().get("ingested", 0)

    # ── ASM callbacks ─────────────────────────────────────────────────────────

    async def update_asm_progress(
        self, asm_scan_id: str, status: str, assets_found: int | None = None
    ) -> None:
        payload: dict[str, Any] = {"status": status}
        if assets_found is not None:
            payload["assetsFound"] = assets_found
        try:
            resp = await self._client.post(
                f"{self._base_url}/internal/asm/{asm_scan_id}/progress", json=payload
            )
            resp.raise_for_status()
        except Exception as exc:
            log.warning("asm_progress_update_failed", asm_scan_id=asm_scan_id, error=str(exc))

    async def ingest_asm_assets(self, asm_scan_id: str, assets: list[dict]) -> int:
        if not assets:
            return 0
        resp = await self._client.post(
            f"{self._base_url}/internal/asm/{asm_scan_id}/assets",
            json={"assets": assets},
        )
        resp.raise_for_status()
        return resp.json().get("ingested", 0)
