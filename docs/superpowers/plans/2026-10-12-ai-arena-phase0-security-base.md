# AI Arena — Phase 0: Sicherheitsbasis härten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SSRF-Guard, Verifikation, CryptoService und Audit so härten, dass die AI Arena (Phasen 1–4 der Spec) sicher darauf aufbauen kann — ohne Schema-Änderung und ohne neue Dependencies.

**Architecture:** Reine IP-/Host-Logik wandert in `ip-ranges.ts` (testbar, korrektes IPv6). Der `SsrfGuardService` bekommt `resolveSafe()` (liefert die geprüften IPs). Ein neuer `SafeHttpService` verbindet **nur** mit diesen gepinnten IPs, folgt Redirects manuell (jeder Hop neu geprüft, nur gleicher Host). Die Verifikation nutzt ihn. `CryptoService` bekommt Key-Versions-Präfix + AAD (abwärtskompatibel). `AuditService` bekommt `logStrict()` (awaited, mit Redaction).

**Tech Stack:** NestJS 11, TypeScript, Node `http`/`https`/`dns`/`crypto` (keine neue Dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-ai-arena-stage1-design.md` (Abschnitt 6.1)

**Nicht Teil dieses Plans (folgen als eigene Pläne):** Datenmodell/Migration (Phase 1), Orchestrator/Red/Judge (Phase 2), Findings/Retest (Phase 3), UI (Phase 4). Die Verifikation pro Endpunkt-Origin und die Token-TTL werden hier nur als Helfer bereitgestellt und in Phase 1 mit `AiTarget` durchgesetzt; für klassische Scans bleibt das Verhalten (außer Redirects) unverändert.

**Verhaltensänderungen (bewusst):** (1) Redirects bei der Domain-Verifikation sind nur noch auf denselben Host erlaubt (vorher: beliebiger Host nach Prüfung). (2) `assertSafeHost` nutzt `dns.lookup` (wie der spätere Connect) statt `resolve4/6`. (3) NAT64/6to4 werden nach eingebetteter IPv4 beurteilt statt pauschal geblockt bzw. übersehen.

Alle Befehle laufen in `C:\Projects\PTaaS\PTaaS\apps\api`.

---

## File Structure

| Datei | Aktion | Verantwortung |
|---|---|---|
| `src/ssrf/ip-ranges.ts` | Create | Reine Funktionen: CIDR/IPv4/IPv6-Blocklisten, `normalizeHost` |
| `src/ssrf/ip-ranges.spec.ts` | Create | Tests dafür |
| `src/ssrf/ssrf-guard.service.ts` | Modify | nutzt `ip-ranges.ts`, neues `resolveSafe()`, `lookupAll()` |
| `src/ssrf/ssrf-guard.service.spec.ts` | Modify | Tests für `resolveSafe` |
| `src/ssrf/safe-http.service.ts` | Create | HTTP-Client mit IP-Pinning, Port-Allowlist, manuellen Redirects |
| `src/ssrf/safe-http.service.spec.ts` | Create | Tests (Transport gemockt) |
| `src/ssrf/ssrf-guard.module.ts` | Modify | `SafeHttpService` registrieren/exportieren |
| `src/targets/verification-ttl.ts` | Create | `isVerificationFresh()` |
| `src/targets/verification-ttl.spec.ts` | Create | Tests |
| `src/targets/verification.service.ts` | Modify | nutzt `SafeHttpService` statt `fetch` |
| `src/targets/verification.service.spec.ts` | Create | Tests |
| `src/crypto/crypto.service.ts` | Modify | Key-Validierung, Version `v2` + AAD, `decryptBound` |
| `src/crypto/crypto.service.spec.ts` | Modify | neue Tests |
| `src/audit/redact.ts` | Create | `redactMetadata()` |
| `src/audit/audit.service.ts` | Modify | `logStrict()` |
| `src/audit/audit.service.spec.ts` | Create | Tests |

---

### Task 1: IP-/Host-Logik mit korrektem IPv6 (`ip-ranges.ts`)

**Files:**
- Create: `src/ssrf/ip-ranges.ts`
- Create: `src/ssrf/ip-ranges.spec.ts`

- [ ] **Step 1: Failing test schreiben**

`src/ssrf/ip-ranges.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isBlockedIp, normalizeHost, expandIpv6 } from './ip-ranges';

describe('isBlockedIp — IPv4', () => {
  const blocked = [
    '10.1.1.1', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '198.18.0.1', '240.0.0.1', '255.255.255.255',
    '192.0.2.5', '198.51.100.1', '203.0.113.9', // Doku-Netze
    '224.0.0.1', '239.255.255.250',            // Multicast
    '192.88.99.1',                             // 6to4 relay
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).toBe(true));

  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34'])
    it(`allows ${ip}`, () => expect(isBlockedIp(ip)).toBe(false));
});

describe('isBlockedIp — IPv6', () => {
  const blocked = [
    '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '2001:db8::1',                              // Doku
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',     // Teredo
    '::ffff:192.168.0.1', '::ffff:c0a8:0101',   // mapped (dotted + hex)
    '2002:c0a8:0101::1',                        // 6to4 von 192.168.1.1
    '64:ff9b::7f00:1',                          // NAT64 von 127.0.0.1
    '::2',                                      // IPv4-compatible (deprecated)
  ];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).toBe(true));

  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8',
                    '2002:0808:0808::1', '64:ff9b::808:808'])
    it(`allows ${ip}`, () => expect(isBlockedIp(ip)).toBe(false));

  it('blocks unparseable input (fail closed)', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('1:2:3')).toBe(true);
  });
});

describe('expandIpv6', () => {
  it('expands :: and embedded IPv4', () => {
    expect(expandIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  });
  it('returns null for malformed input', () => {
    expect(expandIpv6('1::2::3')).toBeNull();
    expect(expandIpv6('12345::1')).toBeNull();
  });
});

describe('normalizeHost', () => {
  it('strips brackets and port from IPv6 literals', () => {
    expect(normalizeHost('[::1]:8080')).toBe('::1');
    expect(normalizeHost('[::1]')).toBe('::1');
  });
  it('keeps bare IPv6 intact', () => expect(normalizeHost('::1')).toBe('::1'));
  it('strips port from hostnames and IPv4', () => {
    expect(normalizeHost('example.com:443')).toBe('example.com');
    expect(normalizeHost('10.0.0.1:80')).toBe('10.0.0.1');
    expect(normalizeHost('example.com')).toBe('example.com');
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/ssrf/ip-ranges.spec.ts`
Expected: FAIL (`Cannot find module './ip-ranges'`)

- [ ] **Step 3: Implementierung**

`src/ssrf/ip-ranges.ts`:

```ts
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

  if (zeros(7) && (g[7] === 0 || g[7] === 1)) return true;                    // :: and ::1
  if (zeros(5) && g[5] === 0xffff) return isBlockedIpv4(embeddedV4(g[6], g[7])); // IPv4-mapped
  if (zeros(6)) return true;                                                  // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIpv4(embeddedV4(g[6], g[7]));                             // NAT64 64:ff9b::/96
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                // unique-local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true;                                // multicast ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;                        // Teredo 2001::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                        // documentation
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedV4(g[1], g[2]));          // 6to4
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
```

Hinweis: `net.isIPv6('::ffff:c0a8:0101')` und `'1:2:3'` sind in Node korrekt `true` bzw. `false`; `'1:2:3'` fällt daher in `return true` (unknown format) — der Test erwartet genau das.

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/ssrf/ip-ranges.spec.ts`
Expected: PASS (alle Tests)

- [ ] **Step 5: Commit**

```bash
git add src/ssrf/ip-ranges.ts src/ssrf/ip-ranges.spec.ts
git commit -m "feat(ssrf): add pure IP range logic with correct IPv6 handling

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `SsrfGuardService` nutzt `ip-ranges.ts` und liefert geprüfte IPs

**Files:**
- Modify: `src/ssrf/ssrf-guard.service.ts` (komplett ersetzen)
- Modify: `src/ssrf/ssrf-guard.service.spec.ts` (Tests anhängen)

- [ ] **Step 1: Failing tests anhängen**

Am Ende von `src/ssrf/ssrf-guard.service.spec.ts` anfügen (Imports oben um `vi` ergänzen: `import { describe, it, expect, vi } from 'vitest';`):

```ts
class StubGuard extends SsrfGuardService {
  constructor(private readonly answers: Array<{ address: string; family: 4 | 6 }>) {
    super();
  }
  protected async lookupAll() {
    return this.answers;
  }
}

describe('SsrfGuardService.resolveSafe', () => {
  it('returns the checked addresses for a public host', async () => {
    const g = new StubGuard([{ address: '93.184.216.34', family: 4 }]);
    await expect(g.resolveSafe('example.com')).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('rejects if ANY resolved address is internal (mixed answer)', async () => {
    const g = new StubGuard([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(g.resolveSafe('rebind.example')).rejects.toThrow(BadRequestException);
  });

  it('rejects when nothing resolves', async () => {
    const g = new StubGuard([]);
    await expect(g.resolveSafe('nx.example')).rejects.toThrow('Could not resolve host');
  });

  it('handles bracketed IPv6 literals with port', async () => {
    const g = new StubGuard([]);
    await expect(g.resolveSafe('[::1]:8080')).rejects.toThrow('disallowed address range');
    await expect(g.resolveSafe('[2606:4700:4700::1111]:443')).resolves.toEqual([
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
  });
});

describe('SsrfGuardService.assertSafeHost — extended ranges', () => {
  for (const ip of ['192.0.2.1', '224.0.0.1', '::', 'ff02::1', '2002:c0a8:0101::1', '::ffff:c0a8:0101']) {
    it(`blocks ${ip}`, async () => {
      await expect(guard.assertSafeHost(ip)).rejects.toThrow(BadRequestException);
    });
  }
});
```

(`vi` wird dort nicht gebraucht; Import-Ergänzung weglassen, falls ESLint „unused" meldet.)

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/ssrf/ssrf-guard.service.spec.ts`
Expected: FAIL (`resolveSafe is not a function`)

- [ ] **Step 3: Service ersetzen**

`src/ssrf/ssrf-guard.service.ts`:

```ts
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
```

- [ ] **Step 4: Test laufen lassen — muss grün sein (inkl. der bestehenden Tests)**

Run: `npx vitest run src/ssrf`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler

- [ ] **Step 6: Commit**

```bash
git add src/ssrf
git commit -m "feat(ssrf): resolveSafe() returns checked IPs; use dns.lookup and shared range logic

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SafeHttpService` (IP-Pinning, Port-Allowlist, manuelle Redirects)

**Files:**
- Create: `src/ssrf/safe-http.service.ts`
- Create: `src/ssrf/safe-http.service.spec.ts`
- Modify: `src/ssrf/ssrf-guard.module.ts`

- [ ] **Step 1: Failing test schreiben**

`src/ssrf/safe-http.service.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SsrfGuardService, ResolvedAddress } from './ssrf-guard.service';
import { SafeHttpService, PinnedRequest, SafeResponse } from './safe-http.service';

/** Guard whose DNS answers are scripted per call. */
class ScriptedGuard extends SsrfGuardService {
  calls = 0;
  constructor(private readonly script: ResolvedAddress[][]) {
    super();
  }
  protected async lookupAll(): Promise<ResolvedAddress[]> {
    return this.script[Math.min(this.calls++, this.script.length - 1)];
  }
}

/** HTTP client with a scripted transport instead of real sockets. */
class FakeHttp extends SafeHttpService {
  sent: PinnedRequest[] = [];
  constructor(guard: SsrfGuardService, private readonly responses: SafeResponse[]) {
    super(guard);
  }
  protected async send(req: PinnedRequest): Promise<SafeResponse> {
    this.sent.push(req);
    return this.responses[this.sent.length - 1];
  }
}

const PUBLIC = [{ address: '93.184.216.34', family: 4 as const }];
const ok = (body = 'hi'): SafeResponse => ({ status: 200, headers: {}, body, truncated: false });
const redirect = (location: string): SafeResponse => ({
  status: 302, headers: { location }, body: '', truncated: false,
});

describe('SafeHttpService.request — validation', () => {
  const http = new FakeHttp(new ScriptedGuard([PUBLIC]), []);

  it('rejects credentials in the URL', async () => {
    await expect(http.request('https://user:pw@example.com/')).rejects.toThrow(BadRequestException);
  });
  it('rejects non-http(s) protocols', async () => {
    await expect(http.request('ftp://example.com/')).rejects.toThrow(BadRequestException);
  });
  it('rejects ports outside the allowlist', async () => {
    await expect(http.request('https://example.com:22/')).rejects.toThrow('Port 22 is not allowed');
  });
  it('allows a custom port when explicitly allowlisted', async () => {
    const h = new FakeHttp(new ScriptedGuard([PUBLIC]), [ok()]);
    await expect(h.request('https://example.com:8443/', { allowedPorts: [8443] })).resolves.toBeTruthy();
  });
});

describe('SafeHttpService.request — pinning', () => {
  it('connects to the checked IP, not to a re-resolved name', async () => {
    const h = new FakeHttp(new ScriptedGuard([PUBLIC]), [ok()]);
    await h.request('https://example.com/x');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].ip).toBe('93.184.216.34');
    expect(h.sent[0].url.hostname).toBe('example.com'); // Host/SNI stay the name
  });

  it('does not send anything when the host resolves to an internal IP', async () => {
    const h = new FakeHttp(new ScriptedGuard([[{ address: '10.0.0.5', family: 4 }]]), []);
    await expect(h.request('https://evil.example/')).rejects.toThrow(BadRequestException);
    expect(h.sent).toHaveLength(0);
  });
});

describe('SafeHttpService.requestFollowing — redirects', () => {
  it('follows same-host redirects and re-checks DNS on every hop (rebinding)', async () => {
    // hop 1 resolves public, hop 2 re-resolves to loopback → must be blocked
    const guard = new ScriptedGuard([PUBLIC, [{ address: '127.0.0.1', family: 4 }]]);
    const h = new FakeHttp(guard, [redirect('/next'), ok()]);
    await expect(h.requestFollowing('https://example.com/start')).rejects.toThrow(BadRequestException);
    expect(h.sent).toHaveLength(1);
  });

  it('follows a same-host redirect when DNS stays public', async () => {
    const h = new FakeHttp(new ScriptedGuard([PUBLIC]), [redirect('/next'), ok('done')]);
    const res = await h.requestFollowing('https://example.com/start');
    expect(res.body).toBe('done');
    expect(h.sent.map((r) => r.url.pathname)).toEqual(['/start', '/next']);
  });

  it('rejects a redirect to a different host WITHOUT contacting it', async () => {
    const h = new FakeHttp(new ScriptedGuard([PUBLIC]), [redirect('https://other.example/')]);
    await expect(h.requestFollowing('https://example.com/')).rejects.toThrow('different host');
    expect(h.sent).toHaveLength(1);
  });

  it('stops after maxRedirects', async () => {
    const h = new FakeHttp(new ScriptedGuard([PUBLIC]), Array(5).fill(redirect('/loop')));
    await expect(h.requestFollowing('https://example.com/', { maxRedirects: 2 })).rejects.toThrow('Too many redirects');
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/ssrf/safe-http.service.spec.ts`
Expected: FAIL (`Cannot find module './safe-http.service'`)

- [ ] **Step 3: Implementierung**

`src/ssrf/safe-http.service.ts`:

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { SsrfGuardService } from './ssrf-guard.service';

const DEFAULT_PORTS = [80, 443];

export interface SafeRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;      // default 10 000
  maxBytes?: number;       // default 1 MiB; longer bodies are truncated
  allowedPorts?: number[]; // default [80, 443]
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  truncated: boolean;
}

export interface PinnedRequest {
  url: URL;
  ip: string;
  family: 4 | 6;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
}

/**
 * Outbound HTTP for untrusted, user-supplied URLs (domain verification, AI Arena).
 *  - validates scheme, credentials and port,
 *  - resolves once through the SSRF guard and connects ONLY to that checked IP
 *    (Host header / SNI keep the original name) → no DNS-rebinding window,
 *  - never follows redirects on its own (see requestFollowing).
 */
@Injectable()
export class SafeHttpService {
  constructor(private readonly guard: SsrfGuardService) {}

  async request(rawUrl: string, opts: SafeRequestOptions = {}): Promise<SafeResponse> {
    const url = this.validateUrl(rawUrl, opts.allowedPorts ?? DEFAULT_PORTS);
    const [target] = await this.guard.resolveSafe(url.hostname);
    return this.send({
      url,
      ip: target.address,
      family: target.family,
      method: opts.method ?? 'GET',
      headers: opts.headers ?? {},
      body: opts.body,
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: opts.maxBytes ?? 1_048_576,
    });
  }

  /**
   * GET with manual redirects: every hop is validated and pinned again, and a
   * redirect to a different host is rejected before it is contacted.
   */
  async requestFollowing(
    rawUrl: string,
    opts: Omit<SafeRequestOptions, 'method' | 'body'> & { maxRedirects?: number } = {},
  ): Promise<SafeResponse> {
    const maxRedirects = opts.maxRedirects ?? 3;
    const originHost = new URL(rawUrl).hostname;
    let current = rawUrl;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await this.request(current, { ...opts, method: 'GET' });
      const location = res.headers['location'];
      if (res.status < 300 || res.status >= 400 || !location) return res;

      const next = new URL(String(location), current);
      if (next.hostname !== originHost) {
        throw new BadRequestException(
          `Redirect to a different host is not allowed: ${next.hostname}`,
        );
      }
      current = next.toString();
    }
    throw new BadRequestException('Too many redirects');
  }

  validateUrl(raw: string, allowedPorts: number[]): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException(`Invalid URL: ${raw}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('Only HTTP and HTTPS URLs are allowed');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Credentials in the URL are not allowed');
    }
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (!allowedPorts.includes(port)) {
      throw new BadRequestException(`Port ${port} is not allowed`);
    }
    return url;
  }

  /** Real transport; protected so tests can replace it. */
  protected send(req: PinnedRequest): Promise<SafeResponse> {
    return new Promise((resolve, reject) => {
      const lib = req.url.protocol === 'https:' ? https : http;
      const headers: Record<string, string | number> = {
        'User-Agent': 'PTaaS/1.0',
        ...req.headers,
      };
      if (req.body) headers['Content-Length'] = Buffer.byteLength(req.body);

      const r = lib.request(
        {
          protocol: req.url.protocol,
          hostname: req.url.hostname,
          port: req.url.port || undefined,
          path: req.url.pathname + req.url.search,
          method: req.method,
          headers,
          servername: req.url.hostname, // SNI
          timeout: req.timeoutMs,
          // Pin: ignore DNS and connect to the address the guard approved.
          lookup: (_host, options, cb) => {
            if ((options as { all?: boolean }).all) {
              (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(
                null,
                [{ address: req.ip, family: req.family }],
              );
            } else {
              cb(null, req.ip, req.family);
            }
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          let truncated = false;
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers as SafeResponse['headers'],
              body: Buffer.concat(chunks).toString('utf8'),
              truncated,
            });
          };
          res.on('data', (c: Buffer) => {
            if (size + c.length > req.maxBytes) {
              chunks.push(c.subarray(0, req.maxBytes - size));
              size = req.maxBytes;
              truncated = true;
              res.destroy();
              return;
            }
            chunks.push(c);
            size += c.length;
          });
          res.on('end', finish);
          res.on('close', finish);
        },
      );
      r.on('timeout', () => r.destroy(new Error('Request timed out')));
      r.on('error', reject);
      if (req.body) r.write(req.body);
      r.end();
    });
  }
}
```

`src/ssrf/ssrf-guard.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { SsrfGuardService } from './ssrf-guard.service';
import { SafeHttpService } from './safe-http.service';

@Global()
@Module({
  providers: [SsrfGuardService, SafeHttpService],
  exports: [SsrfGuardService, SafeHttpService],
})
export class SsrfGuardModule {}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/ssrf`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (falls `lookup`-Callback-Typen meckern: die Casts oben sind die vorgesehene Lösung, keine `any`/`@ts-ignore` einführen)

- [ ] **Step 6: Commit**

```bash
git add src/ssrf
git commit -m "feat(ssrf): SafeHttpService with IP pinning, port allowlist and manual redirects

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verifikation auf `SafeHttpService` umstellen + TTL-Helfer

**Files:**
- Create: `src/targets/verification-ttl.ts`, `src/targets/verification-ttl.spec.ts`
- Modify: `src/targets/verification.service.ts`
- Create: `src/targets/verification.service.spec.ts`

- [ ] **Step 1: Failing tests schreiben**

`src/targets/verification-ttl.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isVerificationFresh, VERIFICATION_TTL_DAYS } from './verification-ttl';

const now = new Date('2026-10-12T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('isVerificationFresh', () => {
  it('is fresh within the TTL', () => expect(isVerificationFresh(daysAgo(1), now)).toBe(true));
  it('is stale after the TTL', () =>
    expect(isVerificationFresh(daysAgo(VERIFICATION_TTL_DAYS + 1), now)).toBe(false));
  it('is stale when never verified', () => {
    expect(isVerificationFresh(null, now)).toBe(false);
    expect(isVerificationFresh(undefined, now)).toBe(false);
  });
  it('honors a custom TTL', () => expect(isVerificationFresh(daysAgo(8), now, 7)).toBe(false));
});
```

`src/targets/verification.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { VerificationService } from './verification.service';

const TOKEN = 'tok123';
const target = { id: 't1', value: 'https://example.com', verificationToken: TOKEN, organizationId: 'org1' };

function setup(requestFollowing: ReturnType<typeof vi.fn>) {
  const prisma = {
    target: { findFirst: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({}) },
  };
  const audit = { log: vi.fn() };
  const guard = { assertSafeHost: vi.fn() };
  const safeHttp = { requestFollowing };
  const svc = new VerificationService(prisma as never, audit as never, guard as never, safeHttp as never);
  return { svc, prisma, audit, safeHttp };
}

describe('VerificationService — HTTP_FILE', () => {
  it('verifies when the file contains the expected token', async () => {
    const rf = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: `ptaas-verify=${TOKEN}\n`, truncated: false });
    const { svc, prisma } = setup(rf);
    const res = await svc.verify('t1', 'HTTP_FILE', 'org1', 'u1');
    expect(res.success).toBe(true);
    expect(rf).toHaveBeenCalledWith(
      'https://example.com/.well-known/ptaas-verify.txt',
      expect.objectContaining({ maxBytes: 512 }),
    );
    expect(prisma.target.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'VERIFIED' }) }),
    );
  });

  it('fails when the safe client rejects a redirect to another host', async () => {
    const rf = vi.fn().mockRejectedValue(new BadRequestException('Redirect to a different host is not allowed: evil.example'));
    const { svc, prisma } = setup(rf);
    const res = await svc.verify('t1', 'HTTP_FILE', 'org1', 'u1');
    expect(res.success).toBe(false);
    expect(res.message).toContain('different host');
    expect(prisma.target.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'FAILED' }) }),
    );
  });

  it('fails on a content mismatch and on non-2xx', async () => {
    const mismatch = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: 'nope', truncated: false });
    expect((await setup(mismatch).svc.verify('t1', 'HTTP_FILE', 'org1', 'u1')).success).toBe(false);
    const notFound = vi.fn().mockResolvedValue({ status: 404, headers: {}, body: '', truncated: false });
    expect((await setup(notFound).svc.verify('t1', 'HTTP_FILE', 'org1', 'u1')).message).toContain('HTTP 404');
  });
});

describe('VerificationService — META_TAG', () => {
  it('verifies the ptaas-verify meta tag', async () => {
    const html = `<html><head><meta name="ptaas-verify" content="${TOKEN}"></head>`;
    const rf = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: html, truncated: false });
    const { svc } = setup(rf);
    expect((await svc.verify('t1', 'META_TAG', 'org1', 'u1')).success).toBe(true);
    expect(rf).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ maxBytes: 65_536 }));
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen scheitern**

Run: `npx vitest run src/targets`
Expected: FAIL (fehlendes Modul `verification-ttl`; Konstruktor-Argumente)

- [ ] **Step 3: TTL-Helfer**

`src/targets/verification-ttl.ts`:

```ts
/** Domain/endpoint verification is only trusted for this long (re-check required after). */
export const VERIFICATION_TTL_DAYS = 30;

export function isVerificationFresh(
  verifiedAt: Date | null | undefined,
  now: Date = new Date(),
  ttlDays: number = VERIFICATION_TTL_DAYS,
): boolean {
  if (!verifiedAt) return false;
  return now.getTime() - verifiedAt.getTime() <= ttlDays * 86_400_000;
}
```

- [ ] **Step 4: `verification.service.ts` umstellen**

Änderungen in `src/targets/verification.service.ts`:

1. Imports: `import { SafeHttpService } from '../ssrf/safe-http.service';` ergänzen.
2. Konstruktor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ssrfGuard: SsrfGuardService,
    private readonly safeHttp: SafeHttpService,
  ) {}
```

3. `verifyHttpFile` komplett ersetzen:

```ts
  private async verifyHttpFile(
    domain: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = `https://${domain}/.well-known/ptaas-verify.txt`;
    const expected = `${VERIFY_PREFIX}=${token}`;

    try {
      const res = await this.safeHttp.requestFollowing(url, {
        timeoutMs: HTTP_TIMEOUT_MS,
        maxBytes: MAX_RESPONSE_BYTES,
        headers: { 'User-Agent': 'PTaaS-Verifier/1.0' },
      });
      if (res.status < 200 || res.status >= 300) {
        return { success: false, message: `HTTP ${res.status} from ${url}` };
      }
      return res.body.trim() === expected
        ? { success: true, message: 'HTTP file verified' }
        : { success: false, message: `File content mismatch. Expected: ${expected}` };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Request failed' };
    }
  }
```

4. `verifyMetaTag` komplett ersetzen (die beiden Regex-Muster bleiben unverändert):

```ts
  private async verifyMetaTag(
    domain: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    const url = `https://${domain}/`;

    let html: string;
    try {
      const res = await this.safeHttp.requestFollowing(url, {
        timeoutMs: HTTP_TIMEOUT_MS,
        maxBytes: 65_536, // meta tag must be in <head>
        headers: { 'User-Agent': 'PTaaS-Verifier/1.0', Accept: 'text/html' },
      });
      if (res.status < 200 || res.status >= 300) {
        return { success: false, message: `HTTP ${res.status} fetching homepage` };
      }
      html = res.body;
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Request failed' };
    }

    const pattern = new RegExp(
      `<meta[^>]+name=["']ptaas-verify["'][^>]+content=["']${escapeRegex(token)}["']`,
      'i',
    );
    const altPattern = new RegExp(
      `<meta[^>]+content=["']${escapeRegex(token)}["'][^>]+name=["']ptaas-verify["']`,
      'i',
    );
    return pattern.test(html) || altPattern.test(html)
      ? { success: true, message: 'Meta tag verified' }
      : { success: false, message: `ptaas-verify meta tag with token not found on ${domain}` };
  }
```

(`ssrfGuard` bleibt injiziert; `verifyDnsTxt` bleibt unverändert. Wird `ssrfGuard` danach nirgends mehr genutzt, ESLint-Warnung `unused` akzeptieren oder das Feld entfernen **und** aus dem Spec-Setup streichen — nicht beides inkonsistent lassen.)

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `npx vitest run src/targets && npx tsc --noEmit`
Expected: PASS, keine Typfehler

- [ ] **Step 6: Commit**

```bash
git add src/targets
git commit -m "feat(verification): use SafeHttpService (same-host redirects only); add TTL helper

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `CryptoService` — Key-Validierung, Version `v2`, AAD

**Files:**
- Modify: `src/crypto/crypto.service.ts`
- Modify: `src/crypto/crypto.service.spec.ts` (Tests anhängen)

Format: Legacy bleibt `iv:tag:ct` (3 Teile, ohne AAD). Neu mit AAD: `v2:iv:tag:ct`. `decryptBound` akzeptiert **nur** `v2` (für Arena-Keys, damit kein ungebundener Legacy-Wert untergeschoben werden kann).

- [ ] **Step 1: Failing tests anhängen**

Am Ende von `src/crypto/crypto.service.spec.ts` (innerhalb einer neuen `describe`):

```ts
describe('CryptoService — AAD binding (v2)', () => {
  it('round-trips with the same AAD and uses the v2 prefix', () => {
    const svc = makeService();
    const enc = svc.encrypt('sk-secret', 'org1:target1:apiKey');
    expect(enc.split(':')[0]).toBe('v2');
    expect(enc.split(':').length).toBe(4);
    expect(svc.decrypt(enc, 'org1:target1:apiKey')).toBe('sk-secret');
    expect(svc.decryptBound(enc, 'org1:target1:apiKey')).toBe('sk-secret');
  });

  it('fails when the ciphertext is moved to another org/record (wrong AAD)', () => {
    const svc = makeService();
    const enc = svc.encrypt('sk-secret', 'org1:target1:apiKey');
    expect(() => svc.decrypt(enc, 'org2:target1:apiKey')).toThrow();
  });

  it('requires an AAD to decrypt a v2 value', () => {
    const svc = makeService();
    const enc = svc.encrypt('x', 'a');
    expect(() => svc.decrypt(enc)).toThrow('AAD required');
  });

  it('keeps legacy 3-part values readable', () => {
    const svc = makeService();
    const legacy = svc.encrypt('legacy');
    expect(svc.decrypt(legacy)).toBe('legacy');
  });

  it('decryptBound rejects unbound legacy values', () => {
    const svc = makeService();
    expect(() => svc.decryptBound(svc.encrypt('legacy'), 'any')).toThrow('not bound');
  });
});

describe('CryptoService — key validation', () => {
  it('rejects a 64-char key that is not hex', () => {
    expect(() => new CryptoService({ getOrThrow: () => 'z'.repeat(64) } as never)).toThrow(
      'ENCRYPTION_KEY must be exactly 64 hex characters',
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/crypto`
Expected: FAIL (`decryptBound is not a function`, AAD-Tests)

- [ ] **Step 3: Implementierung (`src/crypto/crypto.service.ts` ersetzen)**

```ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;    // 96-bit IV (GCM standard)
const AUTH_TAG_BYTES = 16;
const BOUND_VERSION = 'v2';

/**
 * AES-256-GCM symmetric encryption for scan credentials and integration/AI secrets.
 *
 * Formats:
 *   legacy: "iv_hex:authtag_hex:ciphertext_hex"          (no AAD, still readable)
 *   bound:  "v2:iv_hex:authtag_hex:ciphertext_hex"       (AAD-bound, e.g. "orgId:recordId:field")
 *
 * AAD ties a ciphertext to its owner: copying it to another org/record fails the
 * GCM integrity check. New code storing tenant secrets should always pass an AAD
 * and read with decryptBound().
 *
 * Key is sourced exclusively from ENCRYPTION_KEY env var (32 bytes = 64 hex chars).
 * Never log, never store the key — only in Docker Secret / env.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = config.getOrThrow<string>('ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
          'Generate with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string, aad?: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')];
    return (aad !== undefined ? [BOUND_VERSION, ...parts] : parts).join(':');
  }

  decrypt(encrypted: string, aad?: string): string {
    const parts = encrypted.split(':');
    const bound = parts.length === 4 && parts[0] === BOUND_VERSION;
    if (bound) parts.shift();
    else if (parts.length !== 3) {
      throw new InternalServerErrorException('Invalid encrypted credential format');
    }
    if (bound && aad === undefined) {
      throw new InternalServerErrorException('AAD required to decrypt this credential');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new InternalServerErrorException('Malformed encrypted credential');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      if (bound) decipher.setAAD(Buffer.from(aad as string, 'utf8'));
      return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
    } catch {
      // Auth tag mismatch = tampering, wrong key or wrong AAD (moved ciphertext)
      throw new InternalServerErrorException('Credential decryption failed — integrity check error');
    }
  }

  /** Like decrypt(), but refuses legacy (unbound) values. Use for AAD-protected secrets. */
  decryptBound(encrypted: string, aad: string): string {
    const parts = encrypted.split(':');
    if (!(parts.length === 4 && parts[0] === BOUND_VERSION)) {
      throw new InternalServerErrorException('Credential is not bound to an owner (AAD)');
    }
    return this.decrypt(encrypted, aad);
  }
}
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/crypto && npx tsc --noEmit`
Expected: PASS (alte Tests inklusive; die alte Fehlermeldung `ENCRYPTION_KEY must be exactly 64 hex characters` bleibt identisch)

- [ ] **Step 5: Commit**

```bash
git add src/crypto
git commit -m "feat(crypto): AAD-bound v2 format, hex key validation, decryptBound

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `AuditService.logStrict()` mit Redaction

**Files:**
- Create: `src/audit/redact.ts`, `src/audit/audit.service.spec.ts`
- Modify: `src/audit/audit.service.ts`

- [ ] **Step 1: Failing test schreiben**

`src/audit/audit.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AuditService } from './audit.service';
import { redactMetadata } from './redact';

describe('redactMetadata', () => {
  it('masks sensitive keys recursively and truncates long strings', () => {
    const out = redactMetadata({
      action: 'run.start',
      apiKey: 'sk-123',
      nested: { password: 'p', transcript: 'long...', ok: 1 },
      list: [{ token: 't' }],
      big: 'x'.repeat(5000),
    }) as Record<string, any>;
    expect(out.action).toBe('run.start');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.nested.password).toBe('[REDACTED]');
    expect(out.nested.transcript).toBe('[REDACTED]');
    expect(out.nested.ok).toBe(1);
    expect(out.list[0].token).toBe('[REDACTED]');
    expect(out.big.length).toBeLessThan(2100);
  });
  it('returns undefined for undefined', () => expect(redactMetadata(undefined)).toBeUndefined());
});

describe('AuditService.logStrict', () => {
  const event = { action: 'arena.run.approved', userId: 'u1', organizationId: 'o1', metadata: { roeHash: 'abc', apiKey: 'sk' } };

  it('awaits the insert and redacts metadata', async () => {
    const create = vi.fn().mockResolvedValue({});
    const svc = new AuditService({ auditLog: { create } } as never);
    await svc.logStrict(event);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.metadata).toEqual({ roeHash: 'abc', apiKey: '[REDACTED]' });
  });

  it('propagates failures (unlike log())', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const svc = new AuditService({ auditLog: { create } } as never);
    await expect(svc.logStrict(event)).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npx vitest run src/audit`
Expected: FAIL (`Cannot find module './redact'`)

- [ ] **Step 3: Implementierung**

`src/audit/redact.ts`:

```ts
const SENSITIVE_KEY = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|transcript|prompt|response)/i;
const MAX_STRING = 2000;

/** Masks sensitive keys and truncates long strings before data lands in the audit log. */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…[truncated]' : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactMetadata(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactMetadata(v, depth + 1),
      ]),
    );
  }
  return value;
}
```

In `src/audit/audit.service.ts`: Import `import { redactMetadata } from './redact';` ergänzen und **nach** `log()` hinzufügen:

```ts
  /**
   * For security-critical events (run start, consent, kill-switch): awaited and
   * NOT swallowed — if the audit record cannot be written the caller must abort.
   * Metadata is redacted so secrets/transcripts never reach the audit table.
   */
  async logStrict(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        userId: event.userId,
        organizationId: event.organizationId,
        resource: event.resource,
        resourceId: event.resourceId,
        metadata: redactMetadata(event.metadata) as object,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    });
  }
```

- [ ] **Step 4: Tests + Typecheck**

Run: `npx vitest run src/audit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audit
git commit -m "feat(audit): logStrict() awaited with metadata redaction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gesamtverifikation

- [ ] **Step 1: Alles laufen lassen**

Run: `npx tsc --noEmit && npx vitest run && npm run build && npx eslint "{src,test}/**/*.ts" | tail -3`
Expected: 0 Typfehler, alle Tests grün, Build ok, 0 ESLint-**Errors** (Warnungen erlaubt)

- [ ] **Step 2: Rauchtest der Module-Verdrahtung**

Run: `node -e "require('./dist/ssrf/safe-http.service'); require('./dist/ssrf/ip-ranges'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Nutzungsstellen prüfen**

Run: `grep -rn "new VerificationService\|VerificationService(" src --include=*.ts | grep -v spec`
Expected: keine manuellen Instanziierungen (DI übernimmt; `SafeHttpService` kommt über das globale `SsrfGuardModule`)

- [ ] **Step 4: Abschluss-Commit/Doku**

Falls im Git-Status noch Dateien offen: committen. Memory/Doku: Phase 0 als erledigt in `scope.md` unter „Phase 5" vermerken (eigene Notiz, kein Code).

---

## Self-Review (gegen die Spec, Abschnitt 6.1)

| Spec-Anforderung | Task |
|---|---|
| SSRF: IP pinnen, `dns.lookup({all})`, Redirects manuell mit Hop-Prüfung | 2, 3 |
| SSRF: IPv6-Literale korrekt, fehlende Bereiche (Doku, Multicast, 6to4, Teredo, `::`) | 1 |
| SSRF: Port-Allowlist, keine Credentials in URL | 3 (nur `SafeHttpService`; der Guard selbst bleibt für Scans unverändert, damit Scans auf anderen Ports nicht brechen) |
| Verifikation: Redirect auf anderen Host ablehnen | 4 |
| Verifikation: Token-TTL + Re-Check | 4 (Helfer); **Durchsetzung für Arena in Phase 1** (`AiTarget`), für klassische Scans bewusst nicht erzwungen |
| Verifikation pro Endpunkt-Origin | Phase 1 (braucht `AiTarget`) — `SafeHttpService` ist dafür vorbereitet |
| Crypto: Key-Version + AAD, Hex-Validierung, abwärtskompatibel | 5 |
| Audit: awaited, blockierend, ohne Roh-Transkripte | 6 |

Typkonsistenz: `ResolvedAddress` (Task 2) wird in Task 3 genutzt; `PinnedRequest`/`SafeResponse` (Task 3) in Task 3-Tests; `SafeHttpService.requestFollowing` (Task 3) in Task 4; `decryptBound` (Task 5) wird in Phase 1 genutzt; `logStrict`/`redactMetadata` (Task 6) in Phase 1/2.

Offenes Risiko: `lookup`-Callback-Typisierung in Task 3 Step 3 (Node-Typen) — bei Typfehler die Casts anpassen, keine `any`/`@ts-ignore`.
