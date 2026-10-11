import { Injectable, BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

/**
 * SSRF Guard — MUST be called before any outbound HTTP request or DNS lookup
 * triggered by user-supplied input (domain verification, scan targets).
 *
 * Blocks: RFC1918, loopback, link-local (incl. 169.254.169.254 cloud metadata),
 * unique-local IPv6. No external dependencies — Node.js built-ins only.
 */

interface Cidr4 {
  network: number; // uint32
  mask: number;    // uint32
}

// Blocked IPv4 ranges
const BLOCKED_CIDR4: Cidr4[] = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',  // link-local + AWS/GCP/Azure metadata (169.254.169.254)
  '0.0.0.0/8',
  '100.64.0.0/10',   // shared address space (RFC 6598)
  '192.0.0.0/24',    // IETF protocol assignments
  '198.18.0.0/15',   // benchmark testing
  '240.0.0.0/4',     // reserved
].map(parseCidr4);

// Blocked IPv6 prefixes (as string prefixes for simplicity — covers all cases)
const BLOCKED_IPV6_PREFIXES = [
  '::1',             // loopback
  'fc',              // unique-local fc00::/7 (fc and fd)
  'fd',
  'fe80',            // link-local fe80::/10
  '::ffff:',         // IPv4-mapped — we re-check the embedded IPv4
  '64:ff9b:',        // NAT64
];

function parseCidr4(cidr: string): Cidr4 {
  const [host, bits] = cidr.split('/');
  const prefixLen = parseInt(bits ?? '32', 10);
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return { network: ipv4ToUint32(host) & mask, mask };
}

function ipv4ToUint32(ip: string): number {
  return ip
    .split('.')
    .reduce((acc: number, octet: string) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0);
}

function isBlockedIpv4(ip: string): boolean {
  const addr = ipv4ToUint32(ip);
  return BLOCKED_CIDR4.some((cidr) => (addr & cidr.mask) === cidr.network);
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped addresses like ::ffff:192.168.1.1 — extract and check embedded IPv4
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isBlockedIpv4(v4mapped[1]);
  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unknown format → block by default
}

/** Check if two IPv4 CIDRs overlap */
function cidr4sOverlap(a: Cidr4, b: Cidr4): boolean {
  const commonMask = a.mask & b.mask;
  return (a.network & commonMask) === (b.network & commonMask);
}

@Injectable()
export class SsrfGuardService {
  /**
   * Resolve hostname to IPs and assert none are internal.
   * Throws BadRequestException if the host resolves to a blocked address.
   */
  async assertSafeHost(host: string): Promise<void> {
    // Strip port if present
    const cleanHost = host.replace(/:\d+$/, '');

    // If the host is already an IP, check directly
    if (net.isIP(cleanHost)) {
      if (isBlockedIp(cleanHost)) {
        throw new BadRequestException(
          `Target resolves to a disallowed address range: ${cleanHost}`,
        );
      }
      return;
    }

    // DNS resolution — both A (IPv4) and AAAA (IPv6)
    const ips = await this.resolveAllAddresses(cleanHost);

    if (ips.length === 0) {
      throw new BadRequestException(`Could not resolve host: ${cleanHost}`);
    }

    for (const ip of ips) {
      if (isBlockedIp(ip)) {
        throw new BadRequestException(
          `Target "${cleanHost}" resolves to a disallowed address (${ip}). ` +
            'Scanning internal or cloud-metadata addresses is not permitted.',
        );
      }
    }
  }

  /**
   * Validate a CIDR target (e.g. "192.168.1.0/24") — ensures it does not
   * overlap with any blocked private/internal range.
   */
  assertSafeCidr(cidr: string): void {
    let parsed: Cidr4;
    try {
      parsed = parseCidr4(cidr);
    } catch {
      throw new BadRequestException(`Invalid CIDR notation: ${cidr}`);
    }

    for (const blocked of BLOCKED_CIDR4) {
      if (cidr4sOverlap(parsed, blocked)) {
        throw new BadRequestException(
          `CIDR "${cidr}" overlaps with a disallowed internal range. ` +
            'Only publicly routable IP ranges are permitted.',
        );
      }
    }
  }

  /**
   * Extract host from a URL and validate it is safe to contact.
   */
  async assertSafeUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException(`Invalid URL: ${rawUrl}`);
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Only HTTP and HTTPS URLs are allowed');
    }

    await this.assertSafeHost(url.hostname);
    return url;
  }

  private async resolveAllAddresses(host: string): Promise<string[]> {
    const results: string[] = [];

    await Promise.allSettled([
      dns.promises.resolve4(host).then((addrs) => results.push(...addrs)),
      dns.promises.resolve6(host).then((addrs) => results.push(...addrs)),
    ]);

    return results;
  }
}
