import * as http from 'node:http';
import { SafeHttpService, stripHopByHopHeaders } from '../../ssrf/safe-http.service';
import type { PinnedRequest, SafeResponse } from '../../ssrf/safe-http.service';
import { SsrfGuardService } from '../../ssrf/ssrf-guard.service';
import type { ResolvedAddress } from '../../ssrf/ssrf-guard.service';

/** A public (non-blocked) documentation-independent address: the real SSRF guard accepts it. */
export const PUBLIC_DUMMY_IP = '93.184.216.34';

/**
 * TEST ONLY. Resolves every `*.test` host to a public dummy IP so the REAL guard logic (blocked-range checks,
 * all-addresses check, pinning) runs. Production code is not touched.
 */
export class E2eSsrfGuard extends SsrfGuardService {
  protected override async lookupAll(host: string): Promise<ResolvedAddress[]> {
    if (host.endsWith('.test')) return [{ address: PUBLIC_DUMMY_IP, family: 4 }];
    return super.lookupAll(host);
  }
}

export interface PinnedRecord {
  host: string;
  ip: string;
  port: string;
  method: string;
  path: string;
}

/**
 * TEST ONLY. The real SafeHttpService validates scheme/port/credentials, resolves via the guard and builds the pinned
 * request (https, 443, public IP). This subclass replaces ONLY the final transport: the pinned request is sent as
 * plain HTTP to the local fake server registered for that host (Host header and path preserved).
 */
export class E2eSafeHttp extends SafeHttpService {
  readonly pinned: PinnedRecord[] = [];

  constructor(
    guard: SsrfGuardService,
    private readonly routes: Map<string, number>,
  ) {
    super(guard);
  }

  protected override send(req: PinnedRequest): Promise<SafeResponse> {
    this.pinned.push({
      host: req.url.hostname,
      ip: req.ip,
      port: req.url.port || (req.url.protocol === 'https:' ? '443' : '80'),
      method: req.method,
      path: req.url.pathname + req.url.search,
    });
    const port = this.routes.get(req.url.hostname);
    if (port === undefined) return Promise.reject(new Error(`no local route for ${req.url.hostname}`));

    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = {
        'User-Agent': 'PTaaS/1.0',
        ...stripHopByHopHeaders(req.headers),
        Host: req.url.host,
      };
      if (req.body) headers['Content-Length'] = Buffer.byteLength(req.body);
      const r = http.request(
        { host: '127.0.0.1', port, path: req.url.pathname + req.url.search, method: req.method, headers, timeout: req.timeoutMs },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers as SafeResponse['headers'],
              body: Buffer.concat(chunks).toString('utf8').slice(0, req.maxBytes),
              truncated: false,
            }),
          );
        },
      );
      r.on('timeout', () => r.destroy(new Error('Request timed out')));
      r.on('error', reject);
      if (req.body) r.write(req.body);
      r.end();
    });
  }
}
