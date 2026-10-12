import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import type { AddressInfo, Server as TcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright-core';
import { RunStopError, TargetUnsafeError } from '../run-control';
import { WidgetSessionExpiredError } from './widget-session-options';
import { PlaywrightBrowserDriver } from './playwright-browser.driver';
import { BrowserUnavailableError } from './widget.types';
import type { WidgetConfig } from './widget.types';

/**
 * Smoke test with a REAL Chromium against local HTTPS servers. Driver level only (the SSRF guard sits
 * one layer above and would block 127.0.0.1): the driver gets PinnedHost { widget.test -> 127.0.0.1 }.
 * Skips itself when openssl or a launchable Chromium is missing.
 */
/** Playwright's pinned revision may differ from what is installed locally: fall back to any installed headless shell. */
function findLocalChromium(): string | undefined {
  if (process.env.ARENA_BROWSER_EXECUTABLE_PATH) return undefined; // driver reads the env itself
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* fall through */
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.cache'), 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const shells = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of shells) {
    for (const sub of readdirSync(join(root, d))) {
      for (const exe of ['chrome-headless-shell.exe', 'chrome-headless-shell']) {
        const candidate = join(root, d, sub, exe);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}
const localChromium = findLocalChromium();

const hasOpenssl = spawnSync('openssl', ['version']).status === 0;

const PAGE = (otherPort: number, mode: 'text' | 'html', tcpPort: number) => `<!doctype html><html><body>
<div id="log"></div>
<input id="in" /><button id="send">go</button>
<script>
const log = document.getElementById('log');
const probe = (name, url, opts) => fetch(url, opts).then(
  () => fetch('/api/log', { method: 'POST', body: name + ':REACHED' }),
  () => fetch('/api/log', { method: 'POST', body: name + ':blocked' }));
probe('otherhost', 'https://other.test:${otherPort}/hit?via=name', { mode: 'no-cors' });
probe('otherip', 'https://127.0.0.1:${otherPort}/hit?via=ip', { mode: 'no-cors' });
probe('redirect', '/redir', { mode: 'no-cors' });
const report = (name, ok) => fetch('/api/log', { method: 'POST', body: name + (ok ? ':REACHED' : ':blocked') });
try { const ws = new WebSocket('ws://127.0.0.1:${tcpPort}/'); ws.onopen = () => report('ws', true); ws.onerror = () => report('ws', false); }
catch (e) { report('ws', false); }
try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${tcpPort}' }] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o)); report('rtc', true); }
catch (e) { report('rtc', false); }
document.getElementById('send').addEventListener('click', async () => {
  const res = await fetch('/api/chat', { method: 'POST', body: document.getElementById('in').value });
  const text = await res.text();
  const d = document.createElement('div');
  d.className = 'msg';
  ${mode === 'text' ? 'd.textContent = text;' : 'd.innerHTML = text;'}
  log.appendChild(d);
});
</script></body></html>`;

describe.skipIf(!hasOpenssl)('PlaywrightBrowserDriver (real Chromium smoke)', () => {
  let dir: string;
  let widgetServer: Server;
  let otherServer: Server;
  let tcpServer: TcpServer;
  let tcpPort = 0;
  let tcpConnections = 0;
  let widgetPort = 0;
  let otherPort = 0;
  let launchable = false;
  const otherHits: string[] = [];
  const widgetHits: string[] = [];
  const egressLog: string[] = [];
  let pageMode: 'text' | 'html' = 'text';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'arena-widget-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=widget.test'], { stdio: 'ignore' });
    const tls = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };

    otherServer = createHttpsServer(tls, (req: IncomingMessage, res: ServerResponse) => {
      otherHits.push(req.url ?? '');
      res.end('other');
    });
    await new Promise<void>((r) => otherServer.listen(0, '127.0.0.1', r));
    otherPort = (otherServer.address() as AddressInfo).port;

    tcpServer = createTcpServer((sock) => {
      tcpConnections++;
      sock.destroy();
    });
    await new Promise<void>((r) => tcpServer.listen(0, '127.0.0.1', r));
    tcpPort = (tcpServer.address() as AddressInfo).port;

    widgetServer = createHttpsServer(tls, (req: IncomingMessage, res: ServerResponse) => {
      widgetHits.push(`${req.method} ${req.url}`);
      if (req.url === '/redir') {
        res.writeHead(302, { Location: `https://127.0.0.1:${otherPort}/hit?via=redirect` });
        res.end();
      } else if (req.url === '/api/log') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          egressLog.push(body);
          res.end('ok');
        });
      } else if (req.url === '/api/chat') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const reply = body.includes('xss')
            ? `<img src=x onerror="fetch('/pwned')">Hello <b>bold</b>`
            : body.includes('slow')
              ? 'never' // never shown: handled client side only by timeout test
              : `Reply to: ${body}`;
          res.end(reply);
        });
      } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(PAGE(otherPort, pageMode, tcpPort));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => widgetServer.listen(0, '127.0.0.1', r));
    widgetPort = (widgetServer.address() as AddressInfo).port;

    try {
      const b = await chromium.launch({ headless: true, executablePath: localChromium });
      await b.close();
      launchable = true;
    } catch {
      launchable = false;
    }
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => widgetServer?.close(() => r()));
    await new Promise<void>((r) => otherServer?.close(() => r()));
    await new Promise<void>((r) => tcpServer?.close(() => r()));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const config = (): WidgetConfig => ({
    pageUrl: `https://widget.test:${widgetPort}/`,
    inputSelector: '#in',
    sendSelector: '#send',
    responseSelector: '.msg',
    waitAfterOpenMs: 700,
    responseTimeoutMs: 8_000,
  });
  const driver = () => new PlaywrightBrowserDriver({ allowedPort: widgetPort, ignoreHttpsErrors: true, stableMs: 300, pollMs: 100, executablePath: localChromium });
  const pinned = { host: 'widget.test', ip: '127.0.0.1' };

  it('pins the host, reads the reply as text and blocks all egress to other hosts', async (ctx) => {
    if (!launchable) return ctx.skip();
    pageMode = 'text';
    otherHits.length = 0;
    widgetHits.length = 0;
    const session = await driver().open(config(), pinned);
    try {
      // widget.test has no DNS entry: loading the page at all proves the host-resolver pin.
      expect(widgetHits).toContain('GET /');
      const first = await session.send('hello world');
      expect(first).toBe('Reply to: hello world');
      const second = await session.send('second');
      expect(second).toBe('Reply to: second');

      // Probes to other hosts (by name, by IP literal, via redirect) never reached the second server.
      expect(otherHits).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);

  it('blocks every probe to other hosts (name, IP literal, redirect) from inside the page', async (ctx) => {
    if (!launchable) return ctx.skip();
    pageMode = 'text';
    egressLog.length = 0;
    otherHits.length = 0;
    tcpConnections = 0;
    const session = await driver().open(config(), pinned);
    try {
      await session.send('wait for probes');
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      await session.close();
    }
    expect([...egressLog].sort()).toEqual(['otherhost:blocked', 'otherip:blocked', 'redirect:blocked', 'rtc:blocked', 'ws:blocked']);
    expect(otherHits).toEqual([]);
    expect(tcpConnections).toBe(0);
  }, 60_000);

  it('does not execute <img onerror> from the reply text (text-only reading)', async (ctx) => {
    if (!launchable) return ctx.skip();
    pageMode = 'text';
    widgetHits.length = 0;
    const session = await driver().open(config(), pinned);
    try {
      const reply = await session.send('xss please');
      expect(reply).toContain('<img src=x onerror=');
      expect(reply).toContain('Hello <b>bold</b>');
      expect(widgetHits.filter((h) => h.includes('/pwned'))).toEqual([]);
      expect(otherHits).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);

  it('returns innerText only (not HTML) even if the widget renders the reply as HTML', async (ctx) => {
    if (!launchable) return ctx.skip();
    pageMode = 'html';
    otherHits.length = 0;
    const session = await driver().open(config(), pinned);
    try {
      const reply = await session.send('xss please');
      expect(reply).toBe('Hello bold');
      expect(reply).not.toContain('<');
    } finally {
      await session.close();
      pageMode = 'text';
    }
  }, 60_000);

  it('times out cleanly when no reply arrives and closes without leaving errors', async (ctx) => {
    if (!launchable) return ctx.skip();
    pageMode = 'text';
    const session = await driver().open({ ...config(), responseSelector: '.does-not-exist', responseTimeoutMs: 1_200 }, pinned);
    await expect(session.send('hi')).rejects.toThrow(/timed out/i);
    await session.close();
    await session.close();
    await expect(session.send('again')).rejects.toThrow(/closed/i);
  }, 60_000);

  it('refuses to load a page on a host that is not the pinned one', async (ctx) => {
    if (!launchable) return ctx.skip();
    const d = driver();
    await expect(d.open({ ...config(), pageUrl: `https://other.test:${otherPort}/`, waitAfterOpenMs: 0 }, pinned)).rejects.toThrow();
    expect(otherHits).toEqual([]);
  }, 60_000);

  it('aborts the session when the kill-switch callback fires (open and send)', async (ctx) => {
    if (!launchable) return ctx.skip();
    await expect(driver().open(config(), pinned, { shouldAbort: async () => true })).rejects.toBeInstanceOf(RunStopError);

    let killed = false;
    const session = await driver().open(config(), pinned, { shouldAbort: async () => killed });
    killed = true;
    await expect(session.send('hello')).rejects.toBeInstanceOf(RunStopError);
    await session.close();
  }, 60_000);

  it('ends the session as request_cap_exceeded once the request cap is hit', async (ctx) => {
    if (!launchable) return ctx.skip();
    otherHits.length = 0;
    await expect(driver().open(config(), pinned, { maxRequests: 2 })).rejects.toBeInstanceOf(TargetUnsafeError);
    expect(otherHits).toEqual([]);
  }, 60_000);

  it('expires the session after the wall-clock limit', async (ctx) => {
    if (!launchable) return ctx.skip();
    const session = await driver().open({ ...config(), waitAfterOpenMs: 0 }, pinned, { sessionTimeoutMs: 6_000 });
    await new Promise((r) => setTimeout(r, 6_500));
    await expect(session.send('late')).rejects.toBeInstanceOf(WidgetSessionExpiredError);
    await session.close();
  }, 60_000);

  it('limits concurrent browsers per process (second open waits for a free slot)', async (ctx) => {
    if (!launchable) return ctx.skip();
    const d = new PlaywrightBrowserDriver({ allowedPort: widgetPort, ignoreHttpsErrors: true, stableMs: 300, pollMs: 100, executablePath: localChromium, maxConcurrentBrowsers: 1 });
    const first = await d.open({ ...config(), waitAfterOpenMs: 0 }, pinned);
    let secondDone = false;
    const secondP = d.open({ ...config(), waitAfterOpenMs: 0 }, pinned).then((s) => {
      secondDone = true;
      return s;
    });
    await new Promise((r) => setTimeout(r, 2_500));
    expect(secondDone).toBe(false);
    await first.close();
    const second = await secondP;
    expect(secondDone).toBe(true);
    await second.close();
  }, 60_000);

  it('deletes the per-launch temp HOME directory when the session closes', async (ctx) => {
    if (!launchable) return ctx.skip();
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('arena-browser-'));
    const session = await driver().open({ ...config(), waitAfterOpenMs: 0 }, pinned);
    const during = readdirSync(tmpdir()).filter((n) => n.startsWith('arena-browser-') && !before.includes(n));
    expect(during).toHaveLength(1);
    await session.close();
    expect(existsSync(join(tmpdir(), during[0]))).toBe(false);
  }, 60_000);

  it('throws BrowserUnavailableError when the browser cannot be launched', async () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(tmpdir(), 'definitely-no-browsers-here');
    try {
      await expect(new PlaywrightBrowserDriver().open(config(), pinned)).rejects.toBeInstanceOf(BrowserUnavailableError);
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
    }
  }, 60_000);
});
