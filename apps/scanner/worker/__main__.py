"""PTaaS Scanner Worker — BullMQ consumers for SCAN_QUEUE, ASM_QUEUE, STRATEGY_QUEUE.

Runs as a long-lived process inside the scanner container.
Non-root user `scanner` (enforced in Dockerfile).
"""
import asyncio
import signal
import structlog
from .job_consumer import build_worker
from .asm_worker import build_asm_worker
from .strategy_consumer import build_strategy_worker

log = structlog.get_logger()


async def main() -> None:
    log.info("scanner_worker_starting")

    scan_worker = build_worker()
    asm_worker = build_asm_worker()
    strategy_worker = build_strategy_worker()

    stop_event = asyncio.Event()

    def _handle_signal():
        log.info("scanner_worker_shutdown_signal")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    log.info("scanner_worker_ready", queues=["scan-queue", "asm-queue", "strategy-queue"])

    try:
        await stop_event.wait()
    finally:
        log.info("scanner_worker_closing")
        await asyncio.gather(
            scan_worker.close(),
            asm_worker.close(),
            strategy_worker.close(),
            return_exceptions=True,
        )
        log.info("scanner_worker_stopped")


if __name__ == "__main__":
    asyncio.run(main())
