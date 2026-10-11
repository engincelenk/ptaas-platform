"""Run subfinder to discover subdomains for a root domain.

Subfinder is pinned in the Dockerfile and run as a subprocess.
Results are parsed from JSONL output.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncIterator

logger = logging.getLogger(__name__)

SUBFINDER_BINARY = os.environ.get("SUBFINDER_BINARY", "/usr/local/bin/subfinder")
SUBFINDER_TIMEOUT = int(os.environ.get("SUBFINDER_TIMEOUT", "300"))  # 5 min


async def discover_subdomains(domain: str) -> AsyncIterator[str]:
    """Yield discovered subdomains for a root domain via subfinder."""
    if not os.path.exists(SUBFINDER_BINARY):
        logger.warning("subfinder binary not found at %s — skipping", SUBFINDER_BINARY)
        return

    cmd = [
        SUBFINDER_BINARY,
        "-d", domain,
        "-oJ",                  # JSON output per line
        "-silent",
        "-timeout", "30",       # per-source timeout in seconds
        "-t", "10",             # parallel goroutines
        "-no-color",
        # Sources that don't require API keys — safe for Phase 2 without external credentials
        "-sources", "crtsh,certspotter,rapiddns,hackertarget,threatminer,bufferover",
    ]

    logger.info("Starting subfinder for domain: %s", domain)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=SUBFINDER_TIMEOUT
            )
        except asyncio.TimeoutError:
            proc.kill()
            logger.warning("subfinder timed out for domain %s", domain)
            return

        if stderr:
            logger.debug("subfinder stderr: %s", stderr.decode()[:1000])

        for line in stdout.decode().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                host = data.get("host", "")
                if host and host != domain:
                    yield host
            except json.JSONDecodeError:
                # Fallback: plain text line
                if line and line != domain:
                    yield line

    except FileNotFoundError:
        logger.warning("subfinder binary not found: %s", SUBFINDER_BINARY)
    except Exception as exc:
        logger.error("subfinder failed: %s", exc)
