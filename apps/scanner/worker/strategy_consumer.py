"""BullMQ consumer for the strategy-queue — runs LangGraph strategy agent."""
from __future__ import annotations

import asyncio
import structlog
from bullmq import Worker, Job

from config import REDIS_URL, MAX_CONCURRENT_SCANS
from strategy_agent import run_strategy

log = structlog.get_logger()

STRATEGY_QUEUE_NAME = "strategy-queue"


def _parse_redis_url(url: str) -> dict:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return {"host": parsed.hostname or "localhost", "port": parsed.port or 6379}


async def process_strategy_job(job: Job, _token: str | None = None) -> dict:
    data = job.data
    strategy_id: str = data["strategyId"]
    target_url: str = data["targetUrl"]
    previous_findings: str = data.get("previousFindingsSummary", "")

    log.info("strategy_job_received", strategy_id=strategy_id, target=target_url)

    await run_strategy(
        strategy_id=strategy_id,
        target_url=target_url,
        previous_findings=previous_findings,
    )

    log.info("strategy_job_done", strategy_id=strategy_id)
    return {"ok": True}


def build_strategy_worker() -> Worker:
    conn_opts = _parse_redis_url(REDIS_URL)
    return Worker(
        STRATEGY_QUEUE_NAME,
        process_strategy_job,
        {"connection": conn_opts, "concurrency": 2},
    )
