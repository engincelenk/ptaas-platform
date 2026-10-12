import { HttpException } from '@nestjs/common';
import { ARENA_LIMITS } from '../../arena.constants';
import { assertSafeHeaderName, assertSafeHeaderValue, buildAuthHeaders } from './auth-headers';
import { SafeHttpService, SafeResponse } from '../../../ssrf/safe-http.service';
import { ErrorRateExceededError, TargetRequestError, TargetUnsafeError } from '../run-control';
import type {
  AdapterClock,
  AdapterConfig,
  AdapterResponse,
  AdapterSendContext,
  AdapterStats,
  ArenaTargetAdapter,
} from './adapter.types';
import { realClock } from './adapter.types';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const ERROR_WINDOW = 6;
const ERROR_THRESHOLD = 0.5;

export interface BuiltRequest {
  headers: Record<string, string>;
  body: string;
}

/**
 * Shared transport logic: every request goes through SafeHttpService (SSRF-pinned, port 443,
 * no redirects, size/time limited). Enforces the requests-per-second limit, retries 429/5xx with
 * backoff and aborts when too many of the recent requests failed.
 */
export abstract class BaseArenaAdapter implements ArenaTargetAdapter {
  private lastRequestAt = 0;
  private readonly recent: boolean[] = [];
  private requests = 0;
  private failures = 0;
  private readonly minIntervalMs: number;

  protected constructor(
    protected readonly http: SafeHttpService,
    protected readonly config: AdapterConfig,
    protected readonly clock: AdapterClock = realClock,
  ) {
    const rps = Math.min(Math.max(config.requestsPerSecond || 1, 0.1), ARENA_LIMITS.maxRequestsPerSecond);
    this.minIntervalMs = Math.ceil(1000 / rps);
  }

  protected abstract buildRequest(prompt: string): BuiltRequest;
  protected abstract extractText(parsed: unknown): string | null;

  stats(): AdapterStats {
    return { requests: this.requests, failures: this.failures };
  }

  async send(prompt: string, ctx: AdapterSendContext = {}): Promise<AdapterResponse> {
    const built = this.buildRequest(prompt);
    built.headers = { ...built.headers, ...this.extraHeaders() };
    const started = this.clock.now();
    let madeRequests = 0;
    let lastError: TargetRequestError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (ctx.beforeRequest) await ctx.beforeRequest();
      await this.waitForSlot();
      madeRequests++;
      this.requests++;

      let res: SafeResponse | null = null;
      let retryAfterMs = 0;
      try {
        res = await this.http.request(this.config.endpointUrl, {
          method: 'POST',
          headers: built.headers,
          body: built.body,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxBytes: MAX_BODY_BYTES,
          allowedPorts: [443],
        });
      } catch (err) {
        if (err instanceof HttpException) {
          // SSRF guard / URL validation refused the request: never retry.
          throw new TargetUnsafeError(err.message);
        }
        lastError = new TargetRequestError(
          /timed out/i.test(String((err as Error)?.message)) ? 'timeout' : 'network',
          undefined,
          'Target request failed (network)',
        );
        this.record(false);
      }

      if (res) {
        if (res.status >= 200 && res.status < 300) {
          const parsed = this.parse(res);
          this.record(true);
          return {
            text: this.truncate(parsed.text),
            latencyMs: this.clock.now() - started,
            raw: parsed.raw,
            requests: madeRequests,
          };
        }
        lastError = new TargetRequestError('http', res.status);
        this.record(false);
        if (res.status !== 429 && res.status < 500) throw lastError; // other 4xx: retrying will not help
        retryAfterMs = this.retryAfter(res);
      }

      this.assertErrorRate();
      if (attempt === MAX_RETRIES) break;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      await this.clock.sleep(Math.max(backoff, retryAfterMs));
    }
    throw lastError ?? new TargetRequestError('network');
  }

  private parse(res: SafeResponse): { text: string; raw: unknown } {
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      this.record(false);
      throw new TargetRequestError('parse', res.status, 'Target response is not valid JSON');
    }
    const text = this.extractText(json);
    if (text === null) {
      this.record(false);
      throw new TargetRequestError('parse', res.status, 'Target response has an unexpected shape');
    }
    return { text, raw: json };
  }

  private truncate(text: string): string {
    return text.length > ARENA_LIMITS.maxResponseChars ? text.slice(0, ARENA_LIMITS.maxResponseChars) : text;
  }

  private retryAfter(res: SafeResponse): number {
    const h = res.headers['retry-after'];
    const v = Array.isArray(h) ? h[0] : h;
    const secs = v ? Number(v) : NaN;
    return Number.isFinite(secs) && secs > 0 ? Math.min(secs * 1000, MAX_BACKOFF_MS) : 0;
  }

  private async waitForSlot(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - this.clock.now();
    if (wait > 0) await this.clock.sleep(wait);
    this.lastRequestAt = this.clock.now();
  }

  private record(ok: boolean): void {
    if (!ok) this.failures++;
    this.recent.push(ok);
    if (this.recent.length > ERROR_WINDOW) this.recent.shift();
  }

  private assertErrorRate(): void {
    if (this.recent.length < ERROR_WINDOW) return;
    const failed = this.recent.filter((x) => !x).length;
    if (failed / this.recent.length >= ERROR_THRESHOLD) throw new ErrorRateExceededError();
  }

  /** Builds the auth header; header name and value are validated against header injection. */
  protected authHeaders(defaultName: string, bearer: boolean): Record<string, string> {
    return buildAuthHeaders(this.config.authHeaderName, this.config.apiKey, defaultName, bearer);
  }

  /** Extra fixed headers (e.g. the agent dry-run header), validated on every send. */
  private extraHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.config.extraHeaders ?? {})) {
      assertSafeHeaderName(k);
      assertSafeHeaderValue(v, 200);
      out[k] = v;
    }
    return out;
  }
}
