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
