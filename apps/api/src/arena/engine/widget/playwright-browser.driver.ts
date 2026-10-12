import { Injectable, Logger, Optional } from '@nestjs/common';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, FrameLocator, Locator, Page } from 'playwright-core';
import { ARENA_LIMITS } from '../../arena.constants';
import { WIDGET_DEFAULTS } from './widget-config';
import { BrowserUnavailableError } from './widget.types';
import type { BrowserDriver, PinnedHost, WidgetConfig, WidgetSession } from './widget.types';

const NAVIGATION_TIMEOUT_MS = 20_000;
const LAUNCH_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const OPTIONAL_CLICK_TIMEOUT_MS = 2_000;
const STABLE_MS = 1_000;
const POLL_MS = 250;

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

type Root = Page | FrameLocator;

/** Real Chromium (headless) driver. One browser process per session; close() always tears it down. */
@Injectable()
export class PlaywrightBrowserDriver implements BrowserDriver {
  private readonly logger = new Logger(PlaywrightBrowserDriver.name);

  constructor(@Optional() private readonly options: PlaywrightDriverOptions = {}) {}

  async open(config: WidgetConfig, pinned: PinnedHost): Promise<WidgetSession> {
    const port = this.options.allowedPort ?? 443;
    const args = [
      `--host-resolver-rules=${hostResolverRules(pinned)}`,
      '--disable-dev-shm-usage',
      '--no-proxy-server',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
    ];
    if (process.env.ARENA_BROWSER_NO_SANDBOX === '1') args.push('--no-sandbox');

    let browser: Browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args,
        timeout: LAUNCH_TIMEOUT_MS,
        executablePath: this.options.executablePath ?? (process.env.ARENA_BROWSER_EXECUTABLE_PATH || undefined),
      });
    } catch (err) {
      this.logger.warn(`Browser launch failed: ${String((err as Error)?.message ?? err).split('\n')[0].slice(0, 200)}`);
      throw new BrowserUnavailableError();
    }

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext({
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
        ignoreHTTPSErrors: this.options.ignoreHttpsErrors === true,
        javaScriptEnabled: true,
        bypassCSP: false,
      });
      // Network egress policy: ONLY https://<pinned host>[:port]/...; everything else is aborted.
      await context.route('**/*', async (route) => {
        if (isRequestAllowed(route.request().url(), pinned.host, port)) {
          await route.continue();
        } else {
          await route.abort('blockedbyclient');
        }
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
      return new PlaywrightWidgetSession(browser, context, root, config, {
        stableMs: this.options.stableMs ?? STABLE_MS,
        pollMs: this.options.pollMs ?? POLL_MS,
      });
    } catch (err) {
      await context?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      throw err;
    }
  }
}

class PlaywrightWidgetSession implements WidgetSession {
  private closed = false;

  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly root: Root,
    private readonly config: WidgetConfig,
    private readonly timing: { stableMs: number; pollMs: number },
  ) {}

  async send(prompt: string): Promise<string> {
    if (this.closed) throw new Error('Widget session is closed');
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
    if (this.closed) return;
    this.closed = true;
    await this.context.close().catch(() => undefined);
    await this.browser.close().catch(() => undefined);
  }

  /** Text only: innerText (rendered text), falling back to textContent. Never innerHTML/outerHTML. */
  private async readText(locator: Locator): Promise<string> {
    const text = await locator.innerText({ timeout: ACTION_TIMEOUT_MS }).catch(() => null);
    if (text !== null) return text;
    return (await locator.textContent({ timeout: ACTION_TIMEOUT_MS }).catch(() => null)) ?? '';
  }

  private limit(text: string): string {
    const trimmed = text.trim();
    return trimmed.length > ARENA_LIMITS.maxResponseChars ? trimmed.slice(0, ARENA_LIMITS.maxResponseChars) : trimmed;
  }
}
