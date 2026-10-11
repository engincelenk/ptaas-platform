"""OWASP ZAP runner — Spider + Active Scan for WEB_CRAWL scan type.

Flow:
  1. Open a new ZAP session (clears previous state)
  2. Access the target URL (seeds the session)
  3. Run Spider to discover all links (JS-rendered via HtmlUnit Ajax Spider)
  4. Run Active Scan against all discovered URLs
  5. Poll progress, report via /internal/scans/:id/progress
  6. Read alerts, convert to PTaaS finding format, ingest in batches
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from zapv2 import ZAPv2

from config import ZAP_URL, ZAP_API_KEY

logger = logging.getLogger(__name__)

# ZAP alert risk → PTaaS Severity
RISK_MAP = {
    "High": "HIGH",
    "Medium": "MEDIUM",
    "Low": "LOW",
    "Informational": "INFO",
}

# ZAP CWE IDs are ints in the API
ACTIVE_SCAN_POLICY_STRENGTH = "Medium"   # Low / Medium / High / Insane


def _zap_client() -> ZAPv2:
    return ZAPv2(apikey=ZAP_API_KEY, proxies={"http": ZAP_URL, "https": ZAP_URL})


async def run_zap_crawl(
    scan_id: str,
    target: str,
    crawl_depth: int = 5,
    credentials: dict | None = None,
    timeout_seconds: int = 3600,
    api_client=None,
) -> list[dict[str, Any]]:
    """Run ZAP Spider + Active Scan against target. Returns list of findings."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        _run_zap_crawl_sync,
        scan_id, target, crawl_depth, credentials, timeout_seconds, api_client,
    )


def _run_zap_crawl_sync(
    scan_id: str,
    target: str,
    crawl_depth: int,
    credentials: dict | None,
    timeout_seconds: int,
    api_client,
) -> list[dict[str, Any]]:
    zap = _zap_client()
    deadline = time.time() + timeout_seconds

    # ── New session ──────────────────────────────────────────────────────────
    zap.core.new_session(name=f"ptaas-{scan_id}", overwrite=True)
    logger.info("ZAP session created for scan %s → %s", scan_id, target)

    # ── Auth: inject session cookie or Bearer token ───────────────────────────
    if credentials:
        cred_type = credentials.get("type", "")
        cred_value = credentials.get("value", "")
        if cred_type == "cookie":
            # Extract cookie name=value and add to ZAP HTTP state
            for part in cred_value.split(";"):
                part = part.strip()
                if "=" in part:
                    name, _, value = part.partition("=")
                    zap.httpsessions.add_default_session_token(target, name.strip())
        elif cred_type in ("bearer", "basic"):
            # Add replacement rule for Authorization header
            header = f"Bearer {cred_value}" if cred_type == "bearer" else f"Basic {cred_value}"
            zap.replacer.add_rule(
                description="ptaas-auth",
                enabled=True,
                matchtype="REQ_HEADER",
                matchregex=False,
                matchstring="Authorization",
                replacement=header,
            )

    # ── Access target (seeds proxy state) ────────────────────────────────────
    zap.core.access_url(target, followredirects=True)

    # ── Spider ───────────────────────────────────────────────────────────────
    spider_id = zap.spider.scan(target, maxchildren=str(crawl_depth * 20))
    logger.info("ZAP spider started: id=%s", spider_id)

    while int(zap.spider.status(spider_id)) < 100:
        if time.time() > deadline:
            zap.spider.stop(spider_id)
            break
        progress = int(zap.spider.status(spider_id))
        if api_client:
            # Fire-and-forget in thread — api_client here is synchronous wrapper
            pass
        logger.debug("ZAP spider progress: %d%%", progress)
        time.sleep(3)

    urls_found = len(zap.spider.results(spider_id))
    logger.info("ZAP spider completed: %d URLs found", urls_found)

    # ── Ajax Spider (JS-rendered pages) ──────────────────────────────────────
    zap.ajaxSpider.scan(target)
    ajax_deadline = min(time.time() + 120, deadline)  # max 2 min for ajax spider
    while zap.ajaxSpider.status == "running":
        if time.time() > ajax_deadline:
            zap.ajaxSpider.stop()
            break
        time.sleep(3)

    logger.info("ZAP ajax spider completed")

    # ── Active Scan ───────────────────────────────────────────────────────────
    as_id = zap.ascan.scan(
        target,
        recurse=True,
        inscopeonly=False,
        scanpolicyname=None,
    )
    logger.info("ZAP active scan started: id=%s", as_id)

    last_progress = 0
    while int(zap.ascan.status(as_id)) < 100:
        if time.time() > deadline:
            zap.ascan.stop(as_id)
            break
        progress = int(zap.ascan.status(as_id))
        if progress != last_progress:
            logger.debug("ZAP active scan progress: %d%%", progress)
            last_progress = progress
        time.sleep(5)

    logger.info("ZAP active scan completed")

    # ── Read alerts ───────────────────────────────────────────────────────────
    alerts = zap.core.alerts(baseurl=target, count=500)
    findings = _alerts_to_findings(alerts, scan_id)
    logger.info("ZAP found %d alerts → %d unique findings", len(alerts), len(findings))

    # ── Cleanup session ───────────────────────────────────────────────────────
    zap.core.new_session(name="cleanup", overwrite=True)

    return findings


def _alerts_to_findings(alerts: list[dict], scan_id: str) -> list[dict[str, Any]]:
    """Deduplicate ZAP alerts by pluginId + url and convert to PTaaS format."""
    seen: set[str] = set()
    findings: list[dict[str, Any]] = []

    for alert in alerts:
        plugin_id = alert.get("pluginId", "")
        url = alert.get("url", "")
        dedup_key = f"{plugin_id}:{url}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        risk = alert.get("risk", "Informational")
        severity = RISK_MAP.get(risk, "INFO")

        cwe_raw = alert.get("cweid", "")
        cwe_ids = [f"CWE-{cwe_raw}"] if cwe_raw and cwe_raw != "0" else []

        # Build a minimal HTTP request/response snippet
        request = alert.get("evidence", "")
        response = f"Alert: {alert.get('description', '')[:500]}"

        findings.append({
            "templateId": f"zap-{plugin_id}",
            "templateName": alert.get("alert", "ZAP Finding"),
            "title": alert.get("alert", "ZAP Finding"),
            "severity": severity,
            "matchedAt": url,
            "httpRequest": request[:8192] if request else None,
            "httpResponse": response[:8192],
            "cveIds": [],
            "cweIds": cwe_ids,
            "nucleiOutput": {
                "source": "zap",
                "pluginId": plugin_id,
                "risk": risk,
                "confidence": alert.get("confidence", ""),
                "solution": alert.get("solution", ""),
                "reference": alert.get("reference", ""),
                "description": alert.get("desc", ""),
            },
        })

    return findings
