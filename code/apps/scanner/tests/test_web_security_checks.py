import pytest
import httpx
import respx
from workers.web_security.checks import check_security_headers, check_https_redirect, check_cors


@pytest.mark.asyncio
async def test_detects_missing_hsts():
    with respx.mock:
        respx.get("https://example.com").mock(
            return_value=httpx.Response(200, headers={"Content-Type": "text/html"})
        )
        async with httpx.AsyncClient() as client:
            findings = await check_security_headers(client, "https://example.com")

    hsts = next((f for f in findings if "Strict-Transport-Security" in f.title), None)
    assert hsts is not None
    assert hsts.severity == "HIGH"


@pytest.mark.asyncio
async def test_no_findings_when_all_headers_present():
    all_headers = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'",
        "X-Permitted-Cross-Domain-Policies": "none",
    }
    with respx.mock:
        respx.get("https://secure.example.com").mock(
            return_value=httpx.Response(200, headers=all_headers)
        )
        async with httpx.AsyncClient() as client:
            findings = await check_security_headers(client, "https://secure.example.com")

    assert findings == []


@pytest.mark.asyncio
async def test_detects_http_without_redirect():
    with respx.mock:
        respx.get("http://insecure.example.com", follow_redirects=False).mock(
            return_value=httpx.Response(200)
        )
        async with httpx.AsyncClient() as client:
            findings = await check_https_redirect(client, "http://insecure.example.com")

    assert len(findings) == 1
    assert "Redirect" in findings[0].title


@pytest.mark.asyncio
async def test_detects_cors_wildcard():
    with respx.mock:
        respx.options("https://api.example.com").mock(
            return_value=httpx.Response(200, headers={"Access-Control-Allow-Origin": "*"})
        )
        async with httpx.AsyncClient() as client:
            findings = await check_cors(client, "https://api.example.com")

    assert len(findings) == 1
    assert "Wildcard" in findings[0].title
