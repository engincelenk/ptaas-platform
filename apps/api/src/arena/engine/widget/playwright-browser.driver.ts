/**
 * Real Chromium driver for the AI Arena browser widget transport.
 *
 * Hardening summary:
 *  - Host pinning (`--host-resolver-rules`, every other name unresolvable) + context.route allowing only
 *    `https://<host>[:port]/...`; all WebSockets are closed (routeWebSocket); WebRTC/prefetch flags;
 *    constant init script neutralises RTCPeerConnection/WebSocket/EventSource/sendBeacon.
 *  - Secret isolation: the browser gets an explicit MINIMAL env (never process.env) and a fresh HOME/TMP
 *    directory per launch that is deleted afterwards.
 *  - Budget: request cap per session, kill-switch callback on every request, wall-clock limit per session,
 *    process-wide semaphore for concurrent browsers, bounded text reads.
 *
 * RESIDUAL RISK: `--no-sandbox` (only with ARENA_BROWSER_NO_SANDBOX=1, needed in unprivileged Docker) removes
 * Chromium's renderer sandbox, so a Chromium 0-day triggered by a hostile customer page could escape to the
 * API container's user. Recommended next hardening: run the browser in its own worker container (no secrets,
 * no DB/Redis access, egress-restricted) instead of inside the API process.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, FrameLocator, Locator, Page } from 'playwright-core';
import { ARENA_LIMITS } from '../../arena.constants';
import { RunStopError, TargetUnsafeError } from '../run-control';
import { WIDGET_DEFAULTS } from './widget-config';
import { SESSION_DEFAULTS, WidgetSessionExpiredError } from './widget-session-options';
import type { OptionsAwareBrowserDriver, WidgetSessionOptions } from './widget-session-options';
import { BrowserUnavailableError } from './widget.types';
import type { PinnedHost, WidgetConfig, WidgetSession } from './widget.types';

const NAVIGATION_TIMEOUT_MS = 20_000;
const LAUNCH_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const OPTIONAL_CLICK_TIMEOUT_MS = 2_000;
const STABLE_MS = 1_000;
const POLL_MS = 250;
const DEFAULT_MAX_BROWSERS = 2;
const SLOT_WAIT_MS = 60_000;

export interface PlaywrightDriverOptions {
  /** Only this port is reachable on the pinned host. Production: 443 (default). */
  allowedPort?: number;
  /** Accept self-signed certificates. Tests only; never enabled in production wiring. */
  ignoreHttpsErrors?: boolean;
  /** How long the reply text must stay unchanged before it counts as complete. */
  stableMs?: number;
  pollMs?: number;
  navigationTimeoutMs?: number;
  /** Explicit browser binary (default: env ARENA_BROWSER_EXECUTABLE_PATH, else Playwright's own install). */
  executablePath?: string;
  /** Max simultaneously running browsers in this process (default 2). */
  maxConcurrentBrowsers?: number;
  /** Max wait for a free browser slot (default 60 s). */
  slotWaitMs?: number;
  /** Defaults for sessions that do not pass their own WidgetSessionOptions. */
  session?: WidgetSessionOptions;
}

/**
 * True only for `https://<host>[:port]/...` where host/port are the pinned ones. Everything else
 * (other hosts, http, data:, blob:, ws:, file:, ...) must be aborted.
 */
export function isRequestAllowed(rawUrl: string, host: string, port = 443): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.hostname.toLowerCase().replace(/\.$/, '') !== host.toLowerCase().replace(/\.$/, '')) return false;
  return Number(url.port || 443) === port;
}

/** `MAP host ip` rule list: the pinned host resolves to the vetted IP, every other name is unresolvable. */
export function hostResolverRules(pinned: PinnedHost): string {
  const ip = pinned.ip.includes(':') && !pinned.ip.startsWith('[') ? `[${pinned.ip}]` : pinned.ip;
  return `MAP ${pinned.host} ${ip}, MAP * ~NOTFOUND`;
}

/**
 * Minimal environment for the browser process. Built from an explicit allowlist: process.env is NEVER
 * passed through, so API secrets (DATABASE_URL, JWT secrets, ...) cannot reach a page-controlled process.
 */
export function buildBrowserEnv(source: NodeJS.ProcessEnv, homeDir: string): Record<string, string> {
  const env: Record<string, string> = {
    PATH: source.PATH ?? source.Path ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: homeDir,
    TMPDIR: homeDir,
    LANG: source.LANG ?? 'C.UTF-8',
  };
  if (process.platform === 'win32') {
    env.TEMP = homeDir;
    env.TMP = homeDir;
    env.USERPROFILE = homeDir;
    for (const key of ['SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT']) {
      const value = source[key];
      if (value) env[key] = value;
    }
  }
  return env;
}

const BROWSER_ARGS = [
  '--disable-dev-shm-usage',
  '--no-proxy-server',
  '--disable-extensions',
  '--disable-background-networking',
  '--mute-audio',
  '--dns-prefetch-disable',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-features=WebRtcHideLocalIpsWithMdns,NetworkPrediction',
];

/** Constant script (no config strings): removes network primitives that bypass request routing. */
function neutralizeNetworkApis(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebSocket', 'WebTransport', 'EventSource']) {
    try {
      Object.defineProperty(g, name, { value: undefined, configurable: false, writable: false });
    } catch {
      /* already locked down */
    }
  }
  try {
    Object.defineProperty(g.navigator as object, 'sendBeacon', { value: () => false, configurable: false });
  } catch {
    /* ignore */
  }
}

/** Constant read function: first `max` characters of the element's rendered text. */
function readInnerText(el: Element, max: number): string {
  const node = el as unknown as { innerText?: unknown; textContent?: unknown };
  const raw = typeof node.innerText === 'string' ? node.innerText : String(node.textContent ?? '');
  return raw.slice(0, max);
}

/** Process-wide counting semaphore. */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly limit: number) {}

  async acquire(timeoutMs: number): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(grant);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new BrowserUnavailableError('No browser slot available'));
      }, timeoutMs);
      const grant = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(grant);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next(); // slot is handed over, active stays the same
    else this.active = Math.max(0, this.active - 1);
  }
}

type Root = Page | FrameLocator;
type StopReason = 'request_cap_exceeded' | 'killed' | 'session_timeout';

function errorForReason(reason: StopReason): Error {
  if (reason === 'killed') return new RunStopError('killed');
  if (reason === 'session_timeout') return new WidgetSessionExpiredError();
  return new TargetUnsafeError('request_cap_exceeded');
}

/** Shared state of one session: why it was stopped, plus the idempotent teardown. */
class SessionGuard {
  reason: StopReason | null = null;
  requests = 0;
  private closed = false;
  private timer: NodeJS.Timeout | null = null;
  browser: Browser | null = null;
  context: BrowserContext | null = null;

  constructor(
    private readonly homeDir: string,
    private readonly release: () => void,
  ) {}

  startTimer(ms: number): void {
    this.timer = setTimeout(() => this.stop('session_timeout'), ms);
    this.timer.unref();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Marks the stop reason (first one wins) and tears everything down in the background. */
  stop(reason: StopReason): void {
    this.reason ??= reason;
    void this.close();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    try {
      rmSync(this.homeDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    this.release();
  }
}

/** Real Chromium (headless) driver. One browser process per session; close() always tears it down. */
@Injectable()
export class PlaywrightBrowserDriver implements OptionsAwareBrowserDriver {
  private readonly logger = new Logger(PlaywrightBrowserDriver.name);
  private readonly slots: Semaphore;

  constructor(@Optional() private readonly options: PlaywrightDriverOptions = {}) {
    this.slots = new Semaphore(Math.max(1, options.maxConcurrentBrowsers ?? DEFAULT_MAX_BROWSERS));
  }

  async open(config: WidgetConfig, pinned: PinnedHost, sessionOptions: WidgetSessionOptions = {}): Promise<WidgetSession> {
    const port = this.options.allowedPort ?? 443;
    const maxRequests = sessionOptions.maxRequests ?? this.options.session?.maxRequests ?? SESSION_DEFAULTS.maxRequests;
    const sessionTimeoutMs = sessionOptions.sessionTimeoutMs ?? this.options.session?.sessionTimeoutMs ?? SESSION_DEFAULTS.sessionTimeoutMs;
    const shouldAbort = sessionOptions.shouldAbort ?? this.options.session?.shouldAbort;

    await this.slots.acquire(this.options.slotWaitMs ?? SLOT_WAIT_MS);
    let homeDir: string;
    try {
      homeDir = mkdtempSync(join(tmpdir(), 'arena-browser-'));
    } catch {
      this.slots.release();
      throw new BrowserUnavailableError();
    }
    const guard = new SessionGuard(homeDir, () => this.slots.release());

    const args = [`--host-resolver-rules=${hostResolverRules(pinned)}`, ...BROWSER_ARGS];
    if (process.env.ARENA_BROWSER_NO_SANDBOX === '1') args.push('--no-sandbox');

    try {
      try {
        guard.browser = await chromium.launch({
          headless: true,
          args,
          timeout: LAUNCH_TIMEOUT_MS,
          env: buildBrowserEnv(process.env, homeDir),
          executablePath: this.options.executablePath ?? (process.env.ARENA_BROWSER_EXECUTABLE_PATH || undefined),
        });
      } catch (err) {
        this.logger.warn(`Browser launch failed: ${String((err as Error)?.message ?? err).split('\n')[0].slice(0, 200)}`);
        throw new BrowserUnavailableError();
      }
      guard.startTimer(sessionTimeoutMs);

      const context = await guard.browser.newContext({
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
        ignoreHTTPSErrors: this.options.ignoreHttpsErrors === true,
        javaScriptEnabled: true,
        bypassCSP: false,
      });
      guard.context = context;

      await context.addInitScript(neutralizeNetworkApis);
      // Every WebSocket (also inside frames) is closed before it can connect anywhere.
      await context.routeWebSocket(/.*/, (ws) => {
        void ws.close().catch(() => undefined);
      });
      // Network egress policy: ONLY https://<pinned host>[:port]/...; plus per-session budget and kill-switch.
      await context.route('**/*', async (route) => {
        const proceed = async (): Promise<boolean> => {
          if (guard.reason) return false;
          if (++guard.requests > maxRequests) {
            guard.stop('request_cap_exceeded');
            return false;
          }
          if (shouldAbort) {
            let abort = true; // fail closed
            try {
              abort = await shouldAbort();
            } catch {
              abort = true;
            }
            if (abort) {
              guard.stop('killed');
              return false;
            }
          }
          return isRequestAllowed(route.request().url(), pinned.host, port);
        };
        const allowed = await proceed();
        if (allowed) await route.continue().catch(() => undefined);
        else await route.abort('blockedbyclient').catch(() => undefined);
      });

      const pages = new Set<Page>();
      // Popups / extra tabs are not part of the contract: close them immediately (1 page per session).
      context.on('page', (p) => {
        if (pages.size > 0 && !pages.has(p)) void p.close().catch(() => undefined);
      });
      const page = await context.newPage();
      pages.add(page);
      page.setDefaultTimeout(ACTION_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(this.options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS);
      page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => undefined);
      });

      await page.goto(config.pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS,
      });
      await page.waitForTimeout(config.waitAfterOpenMs ?? WIDGET_DEFAULTS.waitAfterOpenMs);

      const root: Root = config.iframeSelector ? page.frameLocator(config.iframeSelector).first() : page;
      if (config.cookieConsentSelector) {
        // Best effort: a missing banner is fine.
        await page.locator(config.cookieConsentSelector).first().click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS }).catch(() => undefined);
      }
      if (config.openSelector) {
        await page.locator(config.openSelector).first().click();
        await page.waitForTimeout(500);
      }
      if (guard.reason) throw errorForReason(guard.reason);
      return new PlaywrightWidgetSession(guard, root, config, {
        stableMs: this.options.stableMs ?? STABLE_MS,
        pollMs: this.options.pollMs ?? POLL_MS,
        shouldAbort,
      });
    } catch (err) {
      const reason = guard.reason;
      await guard.close();
      throw reason ? errorForReason(reason) : err;
    }
  }
}

class PlaywrightWidgetSession implements WidgetSession {
  constructor(
    private readonly guard: SessionGuard,
    private readonly root: Root,
    private readonly config: WidgetConfig,
    private readonly timing: { stableMs: number; pollMs: number; shouldAbort?: () => Promise<boolean> },
  ) {}

  async send(prompt: string): Promise<string> {
    try {
      return await this.sendInner(prompt);
    } catch (err) {
      // A teardown triggered by cap/kill/timeout surfaces as a Playwright error; report the real reason.
      if (this.guard.reason) throw errorForReason(this.guard.reason);
      throw err;
    }
  }

  private async sendInner(prompt: string): Promise<string> {
    this.assertUsable();
    const timeoutMs = this.config.responseTimeoutMs ?? WIDGET_DEFAULTS.responseTimeoutMs;
    // Selectors are plain data handed to locator(); they never reach evaluate()/string code.
    const input = this.root.locator(this.config.inputSelector).first();
    const responses = this.root.locator(this.config.responseSelector);

    const before = await responses.count();
    const beforeLast = before > 0 ? await this.readText(responses.nth(before - 1)) : '';

    await input.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
    await input.fill(prompt);
    if (this.config.sendSelector) {
      await this.root.locator(this.config.sendSelector).first().click();
    } else {
      await input.press('Enter');
    }

    const deadline = Date.now() + timeoutMs;
    let candidate: string | null = null;
    let stableSince = 0;
    while (Date.now() < deadline) {
      this.assertUsable();
      if (this.timing.shouldAbort && (await this.timing.shouldAbort().catch(() => true))) {
        this.guard.stop('killed');
        throw new RunStopError('killed');
      }
      const count = await responses.count();
      let text: string | null = null;
      if (count > 0) {
        const last = await this.readText(responses.nth(count - 1));
        // New reply = more matches than before, or (streaming into the same element) changed last text.
        if (count > before || last !== beforeLast) text = last;
      }
      if (text !== null && text.trim().length > 0) {
        if (text !== candidate) {
          candidate = text;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= this.timing.stableMs) {
          return this.limit(candidate);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.timing.pollMs));
    }
    throw new Error('Timed out waiting for the widget reply');
  }

  async close(): Promise<void> {
    await this.guard.close();
  }

  private assertUsable(): void {
    if (this.guard.reason) throw errorForReason(this.guard.reason);
    if (this.guard.isClosed) throw new Error('Widget session is closed');
  }

  /** Bounded text read: only the first maxResponseChars characters ever leave the page. */
  private async readText(locator: Locator): Promise<string> {
    return locator.evaluate(readInnerText, ARENA_LIMITS.maxResponseChars, { timeout: ACTION_TIMEOUT_MS }).catch(() => '');
  }

  private limit(text: string): string {
    const trimmed = text.trim();
    return trimmed.length > ARENA_LIMITS.maxResponseChars ? trimmed.slice(0, ARENA_LIMITS.maxResponseChars) : trimmed;
  }
}
