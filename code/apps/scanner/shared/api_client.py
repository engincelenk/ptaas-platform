import httpx
import structlog
from .models import Finding

log = structlog.get_logger()


class PTaaSApiClient:
    def __init__(self, api_url: str, api_key: str) -> None:
        self._base = api_url.rstrip('/')
        self._headers = {
            "X-Internal-Key": api_key,
            "Content-Type": "application/json",
        }

    async def update_scan_status(self, scan_id: str, status: str, error: str | None = None) -> None:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{self._base}/internal/scans/{scan_id}/status",
                headers=self._headers,
                json={"status": status, "error": error},
                timeout=10.0,
            )
        log.info("scan_status_updated", scan_id=scan_id, status=status)

    async def create_finding(self, scan_id: str, project_id: str, finding: Finding) -> None:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._base}/internal/scans/{scan_id}/findings",
                headers=self._headers,
                json={
                    "projectId": project_id,
                    **finding.model_dump(exclude_none=True),
                },
                timeout=10.0,
            )
            response.raise_for_status()
        log.info("finding_created", scan_id=scan_id, title=finding.title, severity=finding.severity)
