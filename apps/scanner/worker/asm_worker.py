"""ASM Worker — consumes asm-queue jobs from BullMQ.

Discovery pipeline per job:
  1. subfinder — passive subdomain discovery (no API keys needed)
  2. DNS brute-force — common subdomain names via DNS resolution
  3. DNS recon — MX/SPF/DMARC/CNAME analysis on root domain + each subdomain
  4. HTTP fingerprinting — detect tech stack, get page title + status
  5. Batch-ingest assets → /internal/asm/:asmScanId/assets
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from bullmq import Worker

from config import REDIS_URL, SCANNER_API_KEY, API_BASE_URL
from api_client import ApiClient
from ssrf_check import is_safe_host
from subfinder_runner import discover_subdomains
from dns_recon import recon_domain, discover_subdomains_via_dns
from http_fingerprint import fingerprint_url

logger = logging.getLogger(__name__)

ASM_QUEUE_NAME = "asm-queue"
BATCH_SIZE = 20


async def process_asm_job(job, token: str = None) -> None:
    data: dict[str, Any] = job.data
    asm_scan_id: str = data["asmScanId"]
    root_domain: str = data["rootDomain"]

    api = ApiClient(base_url=API_BASE_URL, api_key=SCANNER_API_KEY)

    async with api:
        await api.update_asm_progress(asm_scan_id, "RUNNING")
        logger.info("ASM discovery started: %s (scanId=%s)", root_domain, asm_scan_id)

        try:
            discovered: set[str] = set()

            # ── Phase 1: subfinder passive discovery ──────────────────────────
            async for subdomain in discover_subdomains(root_domain):
                discovered.add(subdomain)

            # ── Phase 2: DNS brute-force ──────────────────────────────────────
            dns_found = await discover_subdomains_via_dns(root_domain)
            discovered.update(dns_found)

            logger.info("Discovered %d subdomains for %s", len(discovered), root_domain)

            # ── Phase 3 + 4: DNS recon + HTTP fingerprint each asset ─────────
            assets: list[dict[str, Any]] = []

            # Root domain DNS recon first
            root_recon = await recon_domain(root_domain)

            # Process each discovered subdomain
            all_targets = [root_domain] + sorted(discovered)
            for host in all_targets:
                # SSRF guard — skip if resolves to internal IP
                if not await is_safe_host_async(host):
                    logger.warning("Skipping %s — resolves to internal/reserved IP", host)
                    continue

                # DNS recon
                if host == root_domain:
                    recon = root_recon
                else:
                    recon = await recon_domain(host)

                # HTTP fingerprint
                fp = await fingerprint_url(f"https://{host}")
                if fp["httpStatus"] in (None, -1):
                    # Try HTTP fallback
                    fp_http = await fingerprint_url(f"http://{host}")
                    if fp_http["httpStatus"] and fp_http["httpStatus"] > 0:
                        fp = fp_http

                asset = {
                    "value": host,
                    "type": "SUBDOMAIN" if host != root_domain else "SUBDOMAIN",
                    "httpStatus": fp.get("httpStatus"),
                    "httpTitle": fp.get("httpTitle"),
                    "httpServer": fp.get("httpServer"),
                    "technologies": fp.get("technologies", []),
                    "ipAddresses": recon.get("ipAddresses", []),
                    "dnsRecords": recon.get("dnsRecords"),
                    "dnsIssues": recon.get("dnsIssues", []),
                }
                assets.append(asset)

                # Flush in batches
                if len(assets) >= BATCH_SIZE:
                    await api.ingest_asm_assets(asm_scan_id, assets)
                    assets = []

            # Final flush
            if assets:
                await api.ingest_asm_assets(asm_scan_id, assets)

            total = len(all_targets)
            await api.update_asm_progress(asm_scan_id, "COMPLETED", assets_found=total)
            logger.info("ASM discovery completed: %d assets for %s", total, root_domain)

        except Exception as exc:
            logger.exception("ASM discovery failed for %s: %s", root_domain, exc)
            await api.update_asm_progress(asm_scan_id, "FAILED")
            raise


async def is_safe_host_async(host: str) -> bool:
    """Async wrapper for SSRF check — returns True if host is safe to probe."""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, is_safe_host, host)
    except Exception:
        return False


def build_asm_worker() -> Worker:
    """Return a BullMQ Worker for the ASM queue (used by __main__.py)."""
    from urllib.parse import urlparse
    parsed = urlparse(REDIS_URL)
    conn = {"host": parsed.hostname or "localhost", "port": parsed.port or 6379}
    worker = Worker(ASM_QUEUE_NAME, process_asm_job, {"connection": conn})
    logger.info("ASM worker created — queue: %s", ASM_QUEUE_NAME)
    return worker


def run_asm_worker() -> None:
    """Standalone entrypoint — kept for backwards compatibility."""
    worker = build_asm_worker()
    worker.run()
