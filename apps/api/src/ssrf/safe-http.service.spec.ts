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

// ─── Real transport (local server; bypasses the guard on purpose to test `send`) ───

import * as http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll } from 'vitest';

class ExposedHttp extends SafeHttpService {
  sendReal(req: PinnedRequest) {
    return this.send(req);
  }
}

describe('SafeHttpService.send — real socket', () => {
  let server: http.Server;
  let port: number;
  let seenHost = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seenHost = String(req.headers.host);
      res.end('x'.repeat(5000));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const base = (over: Partial<PinnedRequest> = {}): PinnedRequest => ({
    url: new URL(`http://pinned.invalid:${port}/p`),
    ip: '127.0.0.1',
    family: 4,
    method: 'GET',
    headers: {},
    timeoutMs: 3000,
    maxBytes: 1_048_576,
    ...over,
  });
  const client = new ExposedHttp(new SsrfGuardService());

  it('connects to the pinned IP although the hostname does not resolve, keeping the Host header', async () => {
    const res = await client.sendReal(base());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5000);
    expect(seenHost).toBe(`pinned.invalid:${port}`);
  });

  it('truncates bodies at maxBytes', async () => {
    const res = await client.sendReal(base({ maxBytes: 100 }));
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(100);
  });
});
