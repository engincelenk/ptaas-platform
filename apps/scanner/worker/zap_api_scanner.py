"""OWASP ZAP API Security Scanner — API_SCAN scan type.

Imports an OpenAPI/Swagger specification into ZAP, then runs Active Scan
against all discovered endpoints. Supports URL (fetched by ZAP) or inline
YAML/JSON spec.

Flow:
  1. Import OpenAPI spec (URL or inline)
  2. Run targeted Active Scan on imported endpoints
  3. Read alerts → convert to PTaaS findings
"""
from __future__ import annotations

import logging
import time
from typing import Any

from zapv2 import ZAPv2

from config import ZAP_URL, ZAP_API_KEY
from zap_runner import _alerts_to_findings, RISK_MAP

logger = logging.getLogger(__name__)


def _zap_client() -> ZAPv2:
    return ZAPv2(apikey=ZAP_API_KEY, proxies={"http": ZAP_URL, "https": ZAP_URL})


def run_zap_api_scan_sync(
    scan_id: str,
    target: str,
    open_api_spec: str,
    credentials: dict | None = None,
    timeout_seconds: int = 3600,
) -> list[dict[str, Any]]:
    """Import OpenAPI spec and scan all endpoints. Returns findings list."""
    zap = _zap_client()
    deadline = time.time() + timeout_seconds

    zap.core.new_session(name=f"ptaas-api-{scan_id}", overwrite=True)
    logger.info("ZAP API scan session started for scan %s → %s", scan_id, target)

    # ── Auth header ───────────────────────────────────────────────────────────
    if credentials:
        cred_type = credentials.get("type", "")
        cred_value = credentials.get("value", "")
        if cred_type in ("bearer", "basic"):
            header = f"Bearer {cred_value}" if cred_type == "bearer" else f"Basic {cred_value}"
            zap.replacer.add_rule(
                description="ptaas-api-auth",
                enabled=True,
                matchtype="REQ_HEADER",
                matchregex=False,
                matchstring="Authorization",
                replacement=header,
            )

    # ── Import OpenAPI spec ───────────────────────────────────────────────────
    is_url = open_api_spec.strip().startswith(("http://", "https://"))

    if is_url:
        result = zap.openapi.import_url(open_api_spec, hostoverride=target)
        logger.info("ZAP OpenAPI import from URL: %s → %s", open_api_spec, result)
    else:
        # Inline YAML/JSON — write to temp file and import
        import tempfile, os
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(open_api_spec)
            spec_path = f.name
        try:
            result = zap.openapi.import_file(spec_path, target)
            logger.info("ZAP OpenAPI import from file: %s", result)
        finally:
            os.unlink(spec_path)

    # Small wait to let ZAP register all imported endpoints
    time.sleep(2)

    urls_in_scope = len(zap.core.urls(baseurl=target))
    logger.info("ZAP imported %d URLs from OpenAPI spec", urls_in_scope)

    # ── Active Scan ───────────────────────────────────────────────────────────
    as_id = zap.ascan.scan(target, recurse=True, inscopeonly=False)
    logger.info("ZAP API active scan started: id=%s", as_id)

    while int(zap.ascan.status(as_id)) < 100:
        if time.time() > deadline:
            zap.ascan.stop(as_id)
            logger.warning("ZAP API scan timed out for scan %s", scan_id)
            break
        time.sleep(5)

    logger.info("ZAP API active scan completed")

    # ── Read alerts ───────────────────────────────────────────────────────────
    alerts = zap.core.alerts(baseurl=target, count=1000)
    findings = _alerts_to_findings(alerts, scan_id)
    logger.info("ZAP API scan: %d alerts → %d findings", len(alerts), len(findings))

    zap.core.new_session(name="cleanup", overwrite=True)
    return findings
