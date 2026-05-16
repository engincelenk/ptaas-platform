from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class ScanType(str, Enum):
    FULL = "FULL"
    WEB_ONLY = "WEB_ONLY"
    SSL_ONLY = "SSL_ONLY"
    PORTS_ONLY = "PORTS_ONLY"


class ScanJob(BaseModel):
    scan_id: str
    project_id: str
    tenant_id: str
    targets: list[str]
    type: ScanType
    api_key: str
    api_url: str


class Finding(BaseModel):
    title: str
    description: str
    severity: Severity
    cvss_score: Optional[float] = None
    cvss_vector: Optional[str] = None
    cwe_id: Optional[str] = None
    owasp_category: Optional[str] = None
    affected_url: Optional[str] = None
    affected_component: Optional[str] = None
    proof_of_concept: Optional[str] = None
    remediation: Optional[str] = None
    raw_output: Optional[dict[str, Any]] = None
    check_version: str = "1.0.0"
