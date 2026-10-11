"""DNS reconnaissance for a root domain.

Queries MX, A, AAAA, CNAME, TXT (SPF/DMARC), NS records.
Returns discovered subdomains and security issues found in DNS config.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import dns.asyncresolver
import dns.exception

logger = logging.getLogger(__name__)


async def recon_domain(domain: str) -> dict[str, Any]:
    """Run DNS recon on a root domain. Returns dict with records + issues."""
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = 8.0

    records: dict[str, list[str]] = {}
    issues: list[str] = []

    # A records → IP addresses
    records["A"] = await _query(resolver, domain, "A")

    # AAAA records
    records["AAAA"] = await _query(resolver, domain, "AAAA")

    # MX records
    records["MX"] = await _query(resolver, domain, "MX")
    if not records["MX"]:
        issues.append("MX_MISSING")

    # NS records
    records["NS"] = await _query(resolver, domain, "NS")

    # TXT records — parse SPF and DMARC
    txt_records = await _query(resolver, domain, "TXT")
    records["TXT"] = txt_records

    spf = [r for r in txt_records if r.startswith("v=spf1")]
    dmarc = await _query(resolver, f"_dmarc.{domain}", "TXT")
    records["DMARC"] = dmarc

    if not spf:
        issues.append("SPF_MISSING")
    elif "~all" in spf[0] or "?all" in spf[0]:
        issues.append("SPF_SOFT_FAIL")

    if not dmarc:
        issues.append("DMARC_MISSING")
    else:
        dmarc_str = dmarc[0] if dmarc else ""
        if "p=none" in dmarc_str:
            issues.append("DMARC_POLICY_NONE")

    # CNAME records (common for subdomains — check for dangling)
    records["CNAME"] = await _query(resolver, domain, "CNAME")

    # Wildcard DNS check
    wildcard = await _query(resolver, f"doesnotexist-ptaas-check.{domain}", "A")
    if wildcard:
        issues.append("WILDCARD_DNS_ENABLED")

    return {
        "domain": domain,
        "ipAddresses": records["A"] + records["AAAA"],
        "dnsRecords": records,
        "dnsIssues": issues,
    }


async def discover_subdomains_via_dns(domain: str) -> list[str]:
    """Brute-force common subdomain names via DNS resolution."""
    common = [
        "www", "mail", "remote", "blog", "webmail", "server", "ns1", "ns2",
        "smtp", "ftp", "mx", "api", "dev", "staging", "admin", "portal",
        "vpn", "m", "shop", "app", "beta", "secure", "cdn", "img", "images",
        "static", "assets", "git", "gitlab", "github", "jira", "confluence",
        "monitor", "status", "metrics", "logs", "grafana", "kibana",
        "jenkins", "ci", "build", "registry", "docker", "k8s",
        "test", "demo", "qa", "sandbox", "uat", "preview",
    ]
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = 4.0

    found: list[str] = []

    async def check(sub: str) -> str | None:
        fqdn = f"{sub}.{domain}"
        result = await _query(resolver, fqdn, "A")
        if result:
            return fqdn
        return None

    results = await asyncio.gather(*[check(s) for s in common], return_exceptions=True)
    for r in results:
        if isinstance(r, str):
            found.append(r)

    return found


async def _query(resolver: dns.asyncresolver.Resolver, name: str, qtype: str) -> list[str]:
    try:
        answers = await resolver.resolve(name, qtype)
        return [str(rdata) for rdata in answers]
    except (dns.exception.DNSException, Exception):
        return []
