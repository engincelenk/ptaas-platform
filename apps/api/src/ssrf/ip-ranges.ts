import * as net from 'net';

export interface Cidr4 {
  network: number; // uint32
  mask: number;    // uint32
}

export function ipv4ToUint32(ip: string): number {
  return ip
    .split('.')
    .reduce((acc: number, octet: string) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0);
}

export function parseCidr4(cidr: string): Cidr4 {
  const [host, bits] = cidr.split('/');
  const prefixLen = parseInt(bits ?? '32', 10);
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return { network: ipv4ToUint32(host) & mask, mask };
}

/** Blocked IPv4 ranges (internal, reserved, documentation, multicast). */
export const BLOCKED_CIDR4: Cidr4[] = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',  // link-local + cloud metadata (169.254.169.254)
  '0.0.0.0/8',
  '100.64.0.0/10',   // shared address space (RFC 6598)
  '192.0.0.0/24',    // IETF protocol assignments
  '192.0.2.0/24',    // TEST-NET-1
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24',  // TEST-NET-3
  '192.88.99.0/24',  // 6to4 relay anycast
  '198.18.0.0/15',   // benchmark testing
  '224.0.0.0/4',     // multicast
  '240.0.0.0/4',     // reserved (incl. 255.255.255.255)
].map(parseCidr4);

export function isBlockedIpv4(ip: string): boolean {
  const addr = ipv4ToUint32(ip);
  return BLOCKED_CIDR4.some((cidr) => (addr & cidr.mask) === cidr.network);
}

/** Check if two IPv4 CIDRs overlap. */
export function cidr4sOverlap(a: Cidr4, b: Cidr4): boolean {
  const commonMask = a.mask & b.mask;
  return (a.network & commonMask) === (b.network & commonMask);
}

/** Expand an IPv6 address to 8 hextets, or null if malformed. */
export function expandIpv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);

  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4) → two hextets
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null;
    const v = ipv4ToUint32(tail);
    addr =
      addr.slice(0, lastColon + 1) +
      ((v >>> 16) & 0xffff).toString(16) + ':' + (v & 0xffff).toString(16);
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null; // '::' must stand for at least one group
    groups = [...head, ...Array<string>(missing).fill('0'), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

function embeddedV4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isBlockedIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return true; // unparseable → fail closed

  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);

  if (zeros(7) && (g[7] === 0 || g[7] === 1)) return true;                      // :: and ::1
  if (zeros(5) && g[5] === 0xffff) return isBlockedIpv4(embeddedV4(g[6], g[7])); // IPv4-mapped
  if (zeros(6)) return true;                                                    // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIpv4(embeddedV4(g[6], g[7]));                               // NAT64 64:ff9b::/96
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                  // unique-local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                  // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true;                                  // multicast ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;                          // Teredo 2001::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                          // documentation
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedV4(g[1], g[2]));            // 6to4
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unknown format → block by default
}

/**
 * Strip IPv6 brackets and a trailing :port. A host with several colons is an
 * IPv6 literal and is left untouched (its colons are not a port separator).
 */
export function normalizeHost(host: string): string {
  const h = host.trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h : h.slice(1, end);
  }
  if (h.split(':').length === 2) return h.replace(/:\d+$/, '');
  return h;
}
