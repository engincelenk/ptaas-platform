import { ARENA_LIMITS } from '../../arena.constants';
import { realClock } from '../adapters/adapter.types';
import type {
  AdapterClock,
  AdapterResponse,
  AdapterSendContext,
  AdapterStats,
  ArenaTargetAdapter,
} from '../adapters/adapter.types';
import { ErrorRateExceededError, RunStopError, TargetRequestError, TargetUnsafeError } from '../run-control';
import { WidgetSessionExpiredError } from './widget-session-options';
import type { OptionsAwareBrowserDriver, WidgetSessionOptions } from './widget-session-options';
import { BrowserUnavailableError } from './widget.types';
import type { BrowserDriver, PinnedHost, WidgetConfig, WidgetSession } from './widget.types';

const ERROR_WINDOW = 6;
const ERROR_THRESHOLD = 0.5;

export interface WidgetAdapterOptions {
  requestsPerSecond?: number;
  clock?: AdapterClock;
  /** Kill-switch hook handed to the browser session (checked on every browser request). */
  shouldAbort?: () => Promise<boolean>;
  sessionOptions?: Omit<WidgetSessionOptions, 'shouldAbort'>;
}

/**
 * Talks to a customer chat widget through a restricted browser session. One `send` = one browser
 * interaction (no automatic retries: a resend would post the message twice).
 * Same guarantees as the HTTP adapters: rate limit, beforeRequest hook (kill-switch/budget/window)
 * before every interaction, abort when too many recent interactions failed.
 */
export class WidgetAdapter implements ArenaTargetAdapter {
  private session: WidgetSession | null = null;
  private lastRequestAt = 0;
  private readonly recent: boolean[] = [];
  private requests = 0;
  private failures = 0;
  private readonly minIntervalMs: number;
  private readonly clock: AdapterClock;
  private readonly sessionOptions: WidgetSessionOptions;
  private closed = false;
  /** Serialises sends so that two callers never type into the widget concurrently. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly driver: BrowserDriver,
    private readonly config: WidgetConfig,
    private readonly pinned: PinnedHost,
    options: WidgetAdapterOptions = {},
  ) {
    this.clock = options.clock ?? realClock;
    this.sessionOptions = { ...options.sessionOptions, shouldAbort: options.shouldAbort };
    const rps = Math.min(Math.max(options.requestsPerSecond || 1, 0.1), ARENA_LIMITS.maxRequestsPerSecond);
    this.minIntervalMs = Math.ceil(1000 / rps);
  }

  stats(): AdapterStats {
    return { requests: this.requests, failures: this.failures };
  }

  send(prompt: string, ctx: AdapterSendContext = {}): Promise<AdapterResponse> {
    const run = this.queue.then(() => this.sendOnce(prompt, ctx));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.queue.catch(() => undefined);
    const session = this.session;
    this.session = null;
    if (session) await session.close().catch(() => undefined);
  }

  private async sendOnce(prompt: string, ctx: AdapterSendContext): Promise<AdapterResponse> {
    if (this.closed) throw new TargetUnsafeError('Widget adapter is closed');
    if (ctx.beforeRequest) await ctx.beforeRequest();
    await this.waitForSlot();
    const started = this.clock.now();
    this.requests++;
    try {
      const attack = prompt.slice(0, ARENA_LIMITS.maxAttackChars);
      let text: string;
      try {
        text = await (await this.ensureSession()).send(attack);
      } catch (err) {
        if (!(err instanceof WidgetSessionExpiredError)) throw err;
        // Wall-clock limit of the session reached: continue transparently in a fresh one.
        await this.dropSession();
        text = await (await this.ensureSession()).send(attack);
      }
      this.record(true);
      return {
        text: text.length > ARENA_LIMITS.maxResponseChars ? text.slice(0, ARENA_LIMITS.maxResponseChars) : text,
        latencyMs: this.clock.now() - started,
        requests: 1,
      };
    } catch (err) {
      if (err instanceof RunStopError || err instanceof BrowserUnavailableError || err instanceof TargetUnsafeError) {
        throw err;
      }
      this.record(false);
      this.assertErrorRate();
      const message = String((err as Error)?.message ?? '');
      throw new TargetRequestError(/time(d)?\s?out/i.test(message) ? 'timeout' : 'network', undefined, 'Widget interaction failed');
    }
  }

  private async ensureSession(): Promise<WidgetSession> {
    if (!this.session) {
      // Drivers that do not know WidgetSessionOptions ignore the third argument.
      this.session = await (this.driver as OptionsAwareBrowserDriver).open(this.config, this.pinned, this.sessionOptions);
    }
    return this.session;
  }

  private async dropSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (session) await session.close().catch(() => undefined);
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
}
