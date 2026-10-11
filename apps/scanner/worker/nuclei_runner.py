"""
Nuclei subprocess runner.

Executes Nuclei with safety flags:
  - Pinned binary at /usr/local/bin/nuclei (installed from pinned release in Dockerfile)
  - Rate limiting via -rate-limit (100 for QUICK, 30 for FULL)
  - JSON output parsed line-by-line
  - Progress callbacks to the API every 5 seconds
  - Timeout enforced via asyncio.wait_for
"""
import asyncio
import json
import time
import structlog
from typing import AsyncGenerator
from . import api_client

log = structlog.get_logger()

SEVERITY_MAP = {
    "critical": "CRITICAL",
    "high": "HIGH",
    "medium": "MEDIUM",
    "low": "LOW",
    "info": "INFO",
    "unknown": "INFO",
}

OWASP_PREFIX = "owasp:a"


def _parse_nuclei_finding(raw: dict) -> dict | None:
    """Convert Nuclei JSONL output line to PTaaS Finding payload."""
    try:
        info = raw.get("info", {})
        classification = info.get("classification", {})
        severity_raw = info.get("severity", "info").lower()
        severity = SEVERITY_MAP.get(severity_raw, "INFO")

        cve_ids = classification.get("cve-id") or []
        cwe_ids = [str(c) for c in (classification.get("cwe-id") or [])]

        # Extract OWASP tag if present
        tags = info.get("tags", [])
        owasp = next(
            (t.upper() for t in tags if isinstance(t, str) and t.lower().startswith(OWASP_PREFIX)),
            None,
        )

        return {
            "templateId": raw.get("template-id", ""),
            "templateName": info.get("name", raw.get("template-id", "")),
            "title": info.get("name", raw.get("template-id", "")),
            "severity": severity,
            "matchedAt": raw.get("matched-at", raw.get("host", "")),
            "httpRequest": (raw.get("request") or "")[:8192],
            "httpResponse": (raw.get("response") or "")[:8192],
            "cvssScore": classification.get("cvss-score"),
            "cvssVector": classification.get("cvss-metrics"),
            "cveIds": cve_ids if isinstance(cve_ids, list) else [cve_ids],
            "cweIds": cwe_ids,
            "owasp": owasp,
            "nucleiOutput": raw,
        }
    except Exception as exc:
        log.warning("finding_parse_error", error=str(exc), raw=str(raw)[:200])
        return None


async def run_nuclei(
    scan_id: str,
    target: str,
    scan_type: str,
    template_categories: list[str],
    exclude_paths: list[str],
    rate_limit: int,
    credentials: dict | None,
    timeout_seconds: int,
    extra_args: list[str] | None = None,
) -> list[dict]:
    """
    Run Nuclei against `target` and return parsed findings.
    Streams JSONL output and sends progress updates to the API.
    """
    cmd = [
        "/usr/local/bin/nuclei",
        "-target", target,
        "-json",                     # JSONL output to stdout
        "-silent",                   # no progress noise on stderr
        "-rate-limit", str(rate_limit),
        "-timeout", "10",            # per-request timeout (seconds)
        "-retries", "1",
        "-no-interactsh",            # disable OOB — use dedicated channel in M6
        "-stats",
        "-stats-interval", "5",
    ]

    # Template selection
    if template_categories:
        for cat in template_categories:
            cmd.extend(["-t", cat])

    # Exclusions
    for path in exclude_paths:
        cmd.extend(["-exclude", path])

    # Authenticated scan
    if credentials:
        cred_type = credentials.get("type", "bearer")
        cred_value = credentials.get("value", "")
        if cred_type == "bearer":
            cmd.extend(["-H", f"Authorization: Bearer {cred_value}"])
        elif cred_type == "cookie":
            cmd.extend(["-H", f"Cookie: {cred_value}"])
        elif cred_type == "basic":
            # value is "user:pass"
            import base64
            encoded = base64.b64encode(cred_value.encode()).decode()
            cmd.extend(["-H", f"Authorization: Basic {encoded}"])

    # Policy extra args (tags, severity, excludes) — M14
    if extra_args:
        cmd.extend(extra_args)

    log.info("nuclei_start", scan_id=scan_id, target=target, cmd_len=len(cmd))

    findings: list[dict] = []
    batch: list[dict] = []
    last_progress_at = time.time()
    templates_seen = 0

    async def _stream() -> None:
        nonlocal templates_seen, last_progress_at

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        assert proc.stdout is not None

        async for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                continue

            finding = _parse_nuclei_finding(raw)
            if finding:
                batch.append(finding)
                findings.append(finding)

            templates_seen += 1

            # Flush batch every 20 findings
            if len(batch) >= 20:
                await api_client.ingest_findings(scan_id, batch)
                batch.clear()

            # Progress heartbeat every 5s
            now = time.time()
            if now - last_progress_at >= 5:
                last_progress_at = now
                await api_client.update_progress(
                    scan_id,
                    status="RUNNING",
                    progress=min(99, int(templates_seen / max(1, templates_seen + 10) * 100)),
                    currentActivity=f"Scanning {target} ({templates_seen} templates processed)",
                )

        await proc.wait()
        if proc.returncode not in (0, None):
            stderr_out = b""
            if proc.stderr:
                stderr_out = await proc.stderr.read()
            log.warning("nuclei_exit_nonzero", code=proc.returncode, stderr=stderr_out[:500].decode(errors="replace"))

    try:
        await asyncio.wait_for(_stream(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        log.error("nuclei_timeout", scan_id=scan_id, timeout=timeout_seconds)
        raise RuntimeError(f"Nuclei scan timed out after {timeout_seconds}s")

    # Flush remaining batch
    if batch:
        await api_client.ingest_findings(scan_id, batch)

    log.info("nuclei_complete", scan_id=scan_id, findings_count=len(findings))
    return findings
