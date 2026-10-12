import { Injectable, BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';
import {
  BLOCKED_CIDR4,
  Cidr4,
  cidr4sOverlap,
  isBlockedIp,
  normalizeHost,
  parseCidr4,
} from './ip-ranges';

/**
 * SSRF Guard — MUST be called before any outbound HTTP request or DNS lookup
 * triggered by user-supplied input (domain verification, scan targets, AI endpoints).
 *
 * Blocks: RFC1918, loopback, link-local (incl. 169.254.169.254 cloud metadata),
 * documentation/multicast/reserved ranges and the IPv6 equivalents (see ip-ranges.ts).
 * No external dependencies — Node.js built-ins only.
 *
 * For anything that actually connects, use `resolveSafe()` and connect to the
 * returned address (see SafeHttpService) — checking and connecting separately
 * leaves a DNS-rebinding window.
 */
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

@Injectable()
export class SsrfGuardService {
  /** Resolve hostname and assert none of its addresses are internal. */
  async assertSafeHost(host: string): Promise<void> {
    await this.resolveSafe(host);
  }

  /**
   * Resolve a host (or accept an IP literal) and return the checked addresses.
   * Throws BadRequestException if the host does not resolve or ANY address is blocked.
   */
  async resolveSafe(host: string): Promise<ResolvedAddress[]> {
    const cleanHost = normalizeHost(host);

    if (net.isIP(cleanHost)) {
      if (isBlockedIp(cleanHost)) {
        throw new BadRequestException(
          `Target resolves to a disallowed address range: ${cleanHost}`,
        );
      }
      return [{ address: cleanHost, family: net.isIPv6(cleanHost) ? 6 : 4 }];
    }

    const addrs = await this.lookupAll(cleanHost);
    if (addrs.length === 0) {
      throw new BadRequestException(`Could not resolve host: ${cleanHost}`);
    }
    for (const { address } of addrs) {
      if (isBlockedIp(address)) {
        throw new BadRequestException(
          `Target "${cleanHost}" resolves to a disallowed address (${address}). ` +
            'Scanning internal or cloud-metadata addresses is not permitted.',
        );
      }
    }
    return addrs;
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

  /** Extract host from a URL and validate it is safe to contact. */
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

  /**
   * Same resolver path as the later connect (getaddrinfo via dns.lookup, incl. hosts file).
   * Protected so tests can substitute it.
   */
  protected async lookupAll(host: string): Promise<ResolvedAddress[]> {
    try {
      const res = await dns.promises.lookup(host, { all: true, verbatim: true });
      return res.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
    } catch {
      return [];
    }
  }
}
