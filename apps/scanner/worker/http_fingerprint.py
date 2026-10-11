"""HTTP fingerprinting — detect technologies from response headers and HTML."""
from __future__ import annotations

import re
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Simple signature map: header/body pattern → technology label
SIGNATURES: list[tuple[str, str, str]] = [
    # (source: 'header' | 'body', pattern, label)
    ("header:server", r"nginx", "Nginx"),
    ("header:server", r"apache", "Apache"),
    ("header:server", r"iis", "IIS"),
    ("header:server", r"cloudflare", "Cloudflare"),
    ("header:x-powered-by", r"php", "PHP"),
    ("header:x-powered-by", r"asp\.net", "ASP.NET"),
    ("header:x-powered-by", r"express", "Express"),
    ("header:x-generator", r"wordpress", "WordPress"),
    ("header:x-drupal-cache", r".*", "Drupal"),
    ("header:x-shopify-stage", r".*", "Shopify"),
    ("body", r'content="WordPress', "WordPress"),
    ("body", r"wp-content", "WordPress"),
    ("body", r"Drupal\.settings", "Drupal"),
    ("body", r"<title>.*Joomla.*</title>", "Joomla"),
    ("body", r"var Shopify", "Shopify"),
    ("body", r"__next", "Next.js"),
    ("body", r"nuxt", "Nuxt.js"),
    ("body", r"ng-version", "Angular"),
    ("body", r"data-reactroot", "React"),
    ("body", r"__vue", "Vue.js"),
]


async def fingerprint_url(url: str, timeout: float = 8.0) -> dict[str, Any]:
    """GET a URL and return fingerprint information."""
    result: dict[str, Any] = {
        "url": url,
        "httpStatus": None,
        "httpTitle": None,
        "httpServer": None,
        "technologies": [],
    }

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            verify=False,  # Some targets may have self-signed certs
            headers={"User-Agent": "ptaas-asm/1.0 security-assessment"},
        ) as client:
            resp = await client.get(url)

        result["httpStatus"] = resp.status_code
        result["httpServer"] = resp.headers.get("server", "")

        # Title from HTML
        title_match = re.search(r"<title[^>]*>([^<]{1,200})</title>", resp.text, re.IGNORECASE)
        if title_match:
            result["httpTitle"] = title_match.group(1).strip()

        techs: list[str] = []
        text_lower = resp.text[:50_000].lower()

        for source, pattern, label in SIGNATURES:
            if label in techs:
                continue
            if source.startswith("header:"):
                hname = source[7:]
                hvalue = resp.headers.get(hname, "").lower()
                if hvalue and re.search(pattern, hvalue, re.IGNORECASE):
                    techs.append(label)
            elif source == "body":
                if re.search(pattern, text_lower, re.IGNORECASE):
                    techs.append(label)

        result["technologies"] = list(dict.fromkeys(techs))  # deduplicate, preserve order

    except httpx.TimeoutException:
        result["httpStatus"] = -1   # timeout marker
    except Exception as exc:
        logger.debug("Fingerprint failed for %s: %s", url, exc)

    return result
