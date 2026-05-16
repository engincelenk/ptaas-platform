import asyncio
import structlog
from shared.config import settings
from shared.api_client import PTaaSApiClient
from shared.models import ScanJob, ScanType
from .checks import check_security_headers, check_https_redirect, check_cors

log = structlog.get_logger()

CHECKS = [
    check_security_headers,
    check_https_redirect,
    check_cors,
]


async def run(job: ScanJob) -> None:
    client = PTaaSApiClient(api_url=job.api_url, api_key=job.api_key)
    log.info("scan_started", scan_id=job.scan_id, targets=job.targets)

    await client.update_scan_status(job.scan_id, "RUNNING")

    try:
        import httpx
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
        ) as http:
            for target in job.targets:
                for check in CHECKS:
                    try:
                        findings = await asyncio.wait_for(
                            check(http, target), timeout=60.0
                        )
                        for finding in findings:
                            await client.create_finding(job.scan_id, job.project_id, finding)
                    except asyncio.TimeoutError:
                        log.warning("check_timeout", check=check.__name__, target=target)
                    except Exception as exc:
                        log.error("check_error", check=check.__name__, target=target, error=str(exc))

        await client.update_scan_status(job.scan_id, "COMPLETED")
        log.info("scan_completed", scan_id=job.scan_id)

    except Exception as exc:
        log.error("scan_failed", scan_id=job.scan_id, error=str(exc))
        await client.update_scan_status(job.scan_id, "FAILED", error=str(exc))


if __name__ == "__main__":
    # Wird als Kubernetes Job gestartet — Jobdaten aus ENV
    import json, os

    job = ScanJob(
        scan_id=settings.scan_id,
        project_id=os.environ["PROJECT_ID"],
        tenant_id=os.environ["TENANT_ID"],
        targets=json.loads(os.environ["TARGETS"]),
        type=ScanType(os.environ.get("SCAN_TYPE", "WEB_ONLY")),
        api_key=settings.internal_api_key,
        api_url=settings.api_url,
    )
    asyncio.run(run(job))
