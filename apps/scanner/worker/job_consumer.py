"""BullMQ job consumer — polls Redis for scan jobs and dispatches to runners.

Scan type routing:
  QUICK / FULL  → nuclei_runner  (template-based, fast)
  WEB_CRAWL     → zap_runner     (Spider + Active Scan, JS-rendered pages)
  API_SCAN      → zap_api_scanner (OpenAPI import + endpoint scan)
"""
from __future__ import annotations

import asyncio
import structlog
from bullmq import Worker, Job

from config import (
    REDIS_URL,
    SCAN_QUEUE_NAME,
    SCAN_TIMEOUT_QUICK,
    SCAN_TIMEOUT_FULL,
    MAX_CONCURRENT_SCANS,
)
from ssrf_check import assert_safe_target, SsrfBlockedError
import api_client as _api
import nuclei_runner
import zap_runner
import zap_api_scanner

log = structlog.get_logger()

ZAP_TIMEOUT = int(__import__('os').environ.get("ZAP_TIMEOUT", "7200"))  # 2h default


def _parse_redis_url(url: str) -> dict:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return {"host": parsed.hostname or "localhost", "port": parsed.port or 6379}


async def process_job(job: Job, _job_token: str | None = None) -> dict:
    data = job.data
    scan_id: str = data["scanId"]
    target_value: str = data["targetValue"]
    scan_type: str = data.get("scanType", "QUICK")
    has_credentials: bool = data.get("hasCredentials", False)

    log_ctx = log.bind(scan_id=scan_id, target=target_value, scan_type=scan_type)
    log_ctx.info("job_received")

    # Defense-in-depth SSRF check
    try:
        assert_safe_target(target_value)
    except SsrfBlockedError as exc:
        log_ctx.error("ssrf_blocked", reason=str(exc))
        await _api_update(scan_id, status="FAILED", errorMessage=f"SSRF blocked: {exc}")
        raise

    await _api_update(scan_id, status="RUNNING")

    credentials = None
    if has_credentials:
        try:
            async with _api.ApiClient() as client:
                credentials = await client.get_credentials(scan_id)
        except Exception as exc:
            log_ctx.warning("credentials_fetch_failed", error=str(exc))

    try:
        if scan_type in ("QUICK", "FULL"):
            findings = await _run_nuclei(data, scan_id, target_value, scan_type, credentials)
        elif scan_type == "RETEST":
            findings = await _run_retest(data, scan_id, target_value, credentials)
        elif scan_type == "WEB_CRAWL":
            findings = await _run_zap_crawl(data, scan_id, target_value, credentials)
        elif scan_type == "API_SCAN":
            findings = await _run_zap_api(data, scan_id, target_value, credentials)
        else:
            raise ValueError(f"Unknown scan type: {scan_type}")

        await _api_update(
            scan_id, status="COMPLETED", progress=100,
            currentActivity=f"Scan complete — {len(findings)} findings",
        )
        log_ctx.info("job_done", findings=len(findings))
        return {"status": "completed", "findingsCount": len(findings)}

    except Exception as exc:
        log_ctx.error("job_error", error=str(exc))
        await _api_update(scan_id, status="FAILED", errorMessage=str(exc))
        raise


# ── Runner helpers ────────────────────────────────────────────────────────────

async def _run_nuclei(data, scan_id, target, scan_type, credentials) -> list:
    timeout = SCAN_TIMEOUT_QUICK if scan_type == "QUICK" else SCAN_TIMEOUT_FULL

    # Custom policy overrides (M14)
    policy_max_duration = data.get("policyMaxDurationSeconds")
    if policy_max_duration:
        timeout = policy_max_duration

    extra_args: list[str] = []
    if data.get("policyNucleiTags"):
        extra_args += ["-tags", ",".join(data["policyNucleiTags"])]
    if data.get("policyNucleiSeverities"):
        extra_args += ["-severity", ",".join(data["policyNucleiSeverities"])]
    if data.get("policyExcludedTemplates"):
        extra_args += ["-exclude-templates", ",".join(data["policyExcludedTemplates"])]

    findings = await nuclei_runner.run_nuclei(
        scan_id=scan_id,
        target=target,
        scan_type=scan_type,
        template_categories=data.get("templateCategories", ["cves", "misconfigurations", "exposures"]),
        exclude_paths=data.get("excludePaths", []),
        rate_limit=data.get("policyRateLimit") or data.get("rateLimit", 100),
        credentials=credentials,
        timeout_seconds=timeout,
        extra_args=extra_args,
    )
    return findings


async def _run_retest(data, scan_id, target, credentials) -> list:
    """Run a targeted retest for a specific finding using its original template."""
    template_id: str | None = data.get("retestTemplateId")
    matched_at: str | None = data.get("retestMatchedAt")

    extra_args: list[str] = []
    if template_id:
        extra_args += ["-t", template_id]
    # Use matched-at URL if available (more targeted than the full target)
    effective_target = matched_at or target

    findings = await nuclei_runner.run_nuclei(
        scan_id=scan_id,
        target=effective_target,
        scan_type="QUICK",
        template_categories=[],  # ignored when -t is set
        exclude_paths=[],
        rate_limit=50,
        credentials=credentials,
        timeout_seconds=600,
        extra_args=extra_args,
    )
    return findings


async def _run_zap_crawl(data, scan_id, target, credentials) -> list:
    crawl_depth = data.get("crawlDepth", 5)
    async with _api.ApiClient() as client:
        findings = await zap_runner.run_zap_crawl(
            scan_id=scan_id,
            target=target,
            crawl_depth=crawl_depth,
            credentials=credentials,
            timeout_seconds=ZAP_TIMEOUT,
            api_client=client,
        )
        if findings:
            await client.ingest_findings(scan_id, findings)
    return findings


async def _run_zap_api(data, scan_id, target, credentials) -> list:
    open_api_spec = data.get("openApiSpec", "")
    if not open_api_spec:
        raise ValueError("API_SCAN requires openApiSpec in job data")

    loop = asyncio.get_event_loop()
    findings = await loop.run_in_executor(
        None,
        zap_api_scanner.run_zap_api_scan_sync,
        scan_id, target, open_api_spec, credentials, ZAP_TIMEOUT,
    )
    if findings:
        async with _api.ApiClient() as client:
            await client.ingest_findings(scan_id, findings)
    return findings


async def _api_update(scan_id: str, **kwargs) -> None:
    try:
        async with _api.ApiClient() as client:
            await client.update_progress(scan_id, **kwargs)
    except Exception as exc:
        log.warning("api_update_failed", scan_id=scan_id, error=str(exc))


def build_worker() -> Worker:
    conn_opts = _parse_redis_url(REDIS_URL)
    return Worker(
        SCAN_QUEUE_NAME,
        process_job,
        {"connection": conn_opts, "concurrency": MAX_CONCURRENT_SCANS},
    )
