"""
SSRF protection for the Python scanner side.

Prevents the scanner from scanning RFC1918 / loopback / cloud-metadata addresses.
The NestJS API enforces this too on target creation — this is defense-in-depth
so a compromised database or Redis entry cannot pivot to internal infrastructure.
"""
import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # AWS/GCP/Azure metadata
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),     # CGN
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("240.0.0.0/4"),
]

BLOCKED_IPV6_PREFIXES = ("::1", "fc", "fd", "fe80", "::ffff:", "64:ff9b:")


class SsrfBlockedError(ValueError):
    pass


def _is_blocked_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        if isinstance(ip, ipaddress.IPv4Address):
            return any(ip in net for net in BLOCKED_NETWORKS)
        # IPv6
        addr_lower = str(ip).lower()
        return any(addr_lower.startswith(p) for p in BLOCKED_IPV6_PREFIXES)
    except ValueError:
        return True  # unparseable = block


def assert_safe_target(target: str) -> None:
    """
    Resolve `target` (domain or IP) and block if any resolved address
    falls in a private/reserved range.
    """
    # If it looks like an IP, check directly
    try:
        ipaddress.ip_address(target)
        if _is_blocked_ip(target):
            raise SsrfBlockedError(f"Target IP {target!r} is in a blocked range")
        return
    except ValueError:
        pass  # not a bare IP — treat as hostname

    # Resolve all A/AAAA records
    try:
        infos = socket.getaddrinfo(target, None)
    except socket.gaierror as exc:
        raise SsrfBlockedError(f"DNS resolution failed for {target!r}: {exc}") from exc

    for family, _type, _proto, _canon, sockaddr in infos:
        addr = sockaddr[0]
        if _is_blocked_ip(addr):
            raise SsrfBlockedError(
                f"Target {target!r} resolved to blocked address {addr!r}"
            )


def assert_safe_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise SsrfBlockedError(f"Scheme {parsed.scheme!r} is not allowed — only http/https")
    host = parsed.hostname
    if not host:
        raise SsrfBlockedError("URL has no hostname")
    assert_safe_target(host)
