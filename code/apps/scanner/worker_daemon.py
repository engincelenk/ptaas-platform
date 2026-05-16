"""
BullMQ Worker Daemon – für lokale Entwicklung / Docker Compose.

In Produktion läuft der Scanner als Kubernetes Job (einmalig pro Scan).
Hier wird ein dauerhafter Consumer gestartet, der Jobs aus der Queue zieht
und den passenden Worker ausführt.
"""

import asyncio
import json
import os
import structlog
from bullmq import Worker

from shared.config import settings
from shared.models import ScanJob, ScanType
from workers.web_security.worker import run as run_web_security

log = structlog.get_logger()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


WORKER_MAP = {
    ScanType.WEB_ONLY: run_web_security,
    ScanType.FULL: run_web_security,   # FULL startet alle Worker sequenziell
    ScanType.SSL_ONLY: run_web_security,  # Placeholder bis SSL-Worker fertig
    ScanType.PORTS_ONLY: run_web_security,  # Placeholder bis Port-Worker fertig
}


async def process_job(job, job_token: str) -> None:
    data = job.data
    log.info("job_received", job_id=job.id, scan_id=data.get("scanId"), type=data.get("type"))

    scan_job = ScanJob(
        scan_id=data["scanId"],
        project_id=data["projectId"],
        tenant_id=data["tenantId"],
        targets=data.get("targets", []),
        type=ScanType(data.get("type", "WEB_ONLY")),
        api_key=settings.internal_api_key,
        api_url=settings.api_url,
    )

    runner = WORKER_MAP.get(scan_job.type)
    if runner is None:
        log.warning("no_worker_for_type", type=scan_job.type)
        return

    await runner(scan_job)
    log.info("job_done", job_id=job.id, scan_id=scan_job.scan_id)


async def main() -> None:
    log.info("scanner_daemon_starting", redis=REDIS_URL, api=settings.api_url)

    worker = Worker(
        "scans",
        process_job,
        {"connection": REDIS_URL},
    )

    log.info("scanner_daemon_ready", queue="scans")

    # Laufe bis SIGTERM/SIGINT
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("scanner_daemon_stopping")
        await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
