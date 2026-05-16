import httpx
from shared.models import Finding, Severity

REQUIRED_HEADERS = {
    "Strict-Transport-Security": {
        "severity": Severity.HIGH,
        "cvss_score": 7.5,
        "cwe_id": "CWE-319",
        "owasp_category": "A05:2021 – Security Misconfiguration",
        "remediation": "Nginx: add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains; preload\";\nApache: Header always set Strict-Transport-Security \"max-age=31536000\"",
    },
    "X-Frame-Options": {
        "severity": Severity.MEDIUM,
        "cvss_score": 6.1,
        "cwe_id": "CWE-1021",
        "owasp_category": "A05:2021 – Security Misconfiguration",
        "remediation": "Add header: X-Frame-Options: DENY",
    },
    "X-Content-Type-Options": {
        "severity": Severity.LOW,
        "cvss_score": 4.3,
        "cwe_id": "CWE-16",
        "owasp_category": "A05:2021 – Security Misconfiguration",
        "remediation": "Add header: X-Content-Type-Options: nosniff",
    },
    "Content-Security-Policy": {
        "severity": Severity.MEDIUM,
        "cvss_score": 6.1,
        "cwe_id": "CWE-693",
        "owasp_category": "A05:2021 – Security Misconfiguration",
        "remediation": "Implement a Content-Security-Policy header. Start with: Content-Security-Policy: default-src 'self'",
    },
    "X-Permitted-Cross-Domain-Policies": {
        "severity": Severity.LOW,
        "cvss_score": 3.7,
        "cwe_id": "CWE-16",
        "owasp_category": "A05:2021 – Security Misconfiguration",
        "remediation": "Add header: X-Permitted-Cross-Domain-Policies: none",
    },
}


async def check_security_headers(client: httpx.AsyncClient, url: str) -> list[Finding]:
    findings: list[Finding] = []
    try:
        response = await client.get(url, follow_redirects=True, timeout=15.0)
    except httpx.RequestError:
        return []

    for header, config in REQUIRED_HEADERS.items():
        if header not in response.headers:
            findings.append(Finding(
                title=f"Missing Security Header: {header}",
                description=f"The HTTP response from {url} is missing the '{header}' security header. This may expose users to security risks.",
                severity=config["severity"],
                cvss_score=config["cvss_score"],
                cwe_id=config["cwe_id"],
                owasp_category=config["owasp_category"],
                affected_url=url,
                affected_component="HTTP Response Headers",
                proof_of_concept=f"curl -I {url}  # No '{header}' header in response",
                remediation=config["remediation"],
                raw_output={"response_headers": dict(response.headers)},
            ))

    return findings


async def check_https_redirect(client: httpx.AsyncClient, url: str) -> list[Finding]:
    if not url.startswith("http://"):
        return []

    try:
        response = await client.get(url, follow_redirects=False, timeout=10.0)
        if response.status_code not in (301, 302, 307, 308):
            return [Finding(
                title="HTTP to HTTPS Redirect Missing",
                description=f"The URL {url} is served over HTTP without redirecting to HTTPS.",
                severity=Severity.HIGH,
                cvss_score=7.4,
                cwe_id="CWE-319",
                owasp_category="A02:2021 – Cryptographic Failures",
                affected_url=url,
                affected_component="Web Server",
                proof_of_concept=f"curl -I {url}  # No redirect to HTTPS",
                remediation="Configure your web server to redirect all HTTP traffic to HTTPS (301 redirect).",
            )]
    except httpx.RequestError:
        pass

    return []


async def check_cors(client: httpx.AsyncClient, url: str) -> list[Finding]:
    findings: list[Finding] = []
    try:
        response = await client.options(
            url,
            headers={"Origin": "https://evil.example.com"},
            timeout=10.0,
        )
        acao = response.headers.get("Access-Control-Allow-Origin", "")

        if acao == "*":
            findings.append(Finding(
                title="CORS Wildcard Origin Allowed",
                description=f"The endpoint {url} allows requests from any origin (*). This may expose sensitive data to unauthorized domains.",
                severity=Severity.MEDIUM,
                cvss_score=5.4,
                cwe_id="CWE-942",
                owasp_category="A05:2021 – Security Misconfiguration",
                affected_url=url,
                affected_component="CORS Configuration",
                proof_of_concept=f"curl -X OPTIONS -H 'Origin: https://evil.example.com' {url}",
                remediation="Restrict CORS to specific trusted origins instead of using wildcard (*).",
            ))
    except httpx.RequestError:
        pass

    return findings
