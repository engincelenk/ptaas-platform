"""Technology fingerprinter — HTTP-based stack detection for scan strategy."""
from __future__ import annotations

import hashlib
import re
import asyncio
from typing import Any

import httpx

TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# (header, pattern) → technology
HEADER_SIGNATURES: list[tuple[str, re.Pattern, str]] = [
    ("server", re.compile(r"nginx", re.I), "nginx"),
    ("server", re.compile(r"apache", re.I), "apache"),
    ("server", re.compile(r"iis", re.I), "iis"),
    ("server", re.compile(r"cloudflare", re.I), "cloudflare"),
    ("x-powered-by", re.compile(r"php", re.I), "php"),
    ("x-powered-by", re.compile(r"asp\.net", re.I), "aspnet"),
    ("x-powered-by", re.compile(r"express", re.I), "nodejs-express"),
    ("x-powered-by", re.compile(r"next\.js", re.I), "nextjs"),
    ("x-generator", re.compile(r"wordpress", re.I), "wordpress"),
    ("x-drupal-cache", re.compile(r".", re.I), "drupal"),
    ("x-joomla", re.compile(r".", re.I), "joomla"),
]

# Body pattern → technology
BODY_SIGNATURES: list[tuple[re.Pattern, str]] = [
    (re.compile(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']WordPress', re.I), "wordpress"),
    (re.compile(r'wp-content|wp-includes', re.I), "wordpress"),
    (re.compile(r'Drupal\.settings|sites/default/files', re.I), "drupal"),
    (re.compile(r'Joomla!', re.I), "joomla"),
    (re.compile(r'laravel_session|laravel/', re.I), "laravel"),
    (re.compile(r'Django|csrfmiddlewaretoken', re.I), "django"),
    (re.compile(r'ng-version|angular', re.I), "angular"),
    (re.compile(r'__NEXT_DATA__|_next/static', re.I), "nextjs"),
    (re.compile(r'react-root|__reactFiber', re.I), "react"),
    (re.compile(r'strapi|graphql', re.I), "api-cms"),
    (re.compile(r'swagger-ui|openapi', re.I), "swagger"),
    (re.compile(r'spring|org\.springframework', re.I), "spring"),
    (re.compile(r'tomcat|Jakarta EE', re.I), "java-tomcat"),
    (re.compile(r'\.NET|ASP\.NET', re.I), "aspnet"),
]

# Cookie patterns → technology
COOKIE_SIGNATURES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"PHPSESSID", re.I), "php"),
    (re.compile(r"JSESSIONID", re.I), "java"),
    (re.compile(r"ASP\.NET_SessionId", re.I), "aspnet"),
    (re.compile(r"wordpress_logged_in", re.I), "wordpress"),
    (re.compile(r"laravel_session", re.I), "laravel"),
]


async def fingerprint(target_url: str) -> dict[str, Any]:
    """Return detected technologies, headers, and status from a target URL."""
    detected: set[str] = set()
    headers_observed: dict[str, str] = {}
    status_code: int | None = None
    redirect_chain: list[str] = []

    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
            verify=False,  # noqa: S501 — internal scanner, not production client
        ) as client:
            resp = await client.get(target_url, headers={"User-Agent": "PTaaS-Scanner/1.0"})
            status_code = resp.status_code
            redirect_chain = [str(r.url) for r in resp.history]

            headers_lower = {k.lower(): v for k, v in resp.headers.items()}
            headers_observed = dict(resp.headers)

            # Header-based detection
            for header_name, pattern, tech in HEADER_SIGNATURES:
                val = headers_lower.get(header_name, "")
                if val and pattern.search(val):
                    detected.add(tech)

            # Cookie-based detection
            cookie_header = headers_lower.get("set-cookie", "")
            for pattern, tech in COOKIE_SIGNATURES:
                if pattern.search(cookie_header):
                    detected.add(tech)

            # Body-based detection (first 50 KB only)
            body_snippet = resp.text[:51200]
            for pattern, tech in BODY_SIGNATURES:
                if pattern.search(body_snippet):
                    detected.add(tech)

            # Favicon hash (used by Nuclei community templates)
            favicon_hash: str | None = None
            try:
                favicon_resp = await client.get(
                    f"{target_url.rstrip('/')}/favicon.ico",
                    follow_redirects=True,
                )
                if favicon_resp.status_code == 200 and favicon_resp.content:
                    favicon_hash = hashlib.md5(favicon_resp.content).hexdigest()
                    detected.add(f"favicon:{favicon_hash[:8]}")
            except Exception:
                pass

    except httpx.RequestError as exc:
        return {
            "error": str(exc),
            "technologies": [],
            "headers": {},
            "statusCode": None,
            "redirects": [],
        }

    return {
        "technologies": sorted(detected),
        "headers": headers_observed,
        "statusCode": status_code,
        "redirects": redirect_chain,
    }
