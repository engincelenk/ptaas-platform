import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright-core';
import { PlaywrightBrowserDriver, buildBrowserEnv } from './playwright-browser.driver';
import { BrowserUnavailableError } from './widget.types';

const pinned = { host: 'chat.example.com', ip: '93.184.216.34' };
const config = { pageUrl: 'https://chat.example.com/', inputSelector: '#i', responseSelector: '.m' };

describe('browser launch isolation (launch spied, no real browser)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes an explicit minimal env without any process.env secrets and cleans the temp HOME', async () => {
    process.env.DATABASE_URL = 'postgres://secret';
    process.env.JWT_ACCESS_SECRET = 'jwt-secret';
    const spy = vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('no browser'));
    try {
      await expect(new PlaywrightBrowserDriver().open(config, pinned)).rejects.toBeInstanceOf(BrowserUnavailableError);
    } finally {
      delete process.env.DATABASE_URL;
      delete process.env.JWT_ACCESS_SECRET;
    }
    const opts = spy.mock.calls[0][0]!;
    const env = opts.env as Record<string, string>;
    expect(env).toBeDefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.JWT_ACCESS_SECRET).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain('secret');
    const allowed = new Set(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TEMP', 'TMP', 'USERPROFILE', 'SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT']);
    expect(Object.keys(env).every((k) => allowed.has(k))).toBe(true);
    expect(env.HOME).toBe(env.TMPDIR);
    expect(existsSync(env.HOME)).toBe(false); // fresh temp dir deleted after the failed launch
    expect(opts.args).toEqual(
      expect.arrayContaining([
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-features=WebRtcHideLocalIpsWithMdns,NetworkPrediction',
        '--dns-prefetch-disable',
        '--disable-background-networking',
      ]),
    );
  });

  it('buildBrowserEnv is allowlist based', () => {
    const env = buildBrowserEnv({ PATH: '/bin', DATABASE_URL: 'x', LANG: 'de_DE.UTF-8', HOME: '/root' }, '/tmp/h');
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/tmp/h');
    expect(env.LANG).toBe('de_DE.UTF-8');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('adds --no-sandbox only with ARENA_BROWSER_NO_SANDBOX=1', async () => {
    const spy = vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('x'));
    await new PlaywrightBrowserDriver().open(config, pinned).catch(() => undefined);
    expect(spy.mock.calls[0][0]!.args).not.toContain('--no-sandbox');
    process.env.ARENA_BROWSER_NO_SANDBOX = '1';
    try {
      await new PlaywrightBrowserDriver().open(config, pinned).catch(() => undefined);
    } finally {
      delete process.env.ARENA_BROWSER_NO_SANDBOX;
    }
    expect(spy.mock.calls[1][0]!.args).toContain('--no-sandbox');
  });

  it('releases the browser slot after failed launches (no deadlock with limit 1)', async () => {
    vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('x'));
    const d = new PlaywrightBrowserDriver({ maxConcurrentBrowsers: 1, slotWaitMs: 500 });
    for (let i = 0; i < 3; i++) await expect(d.open(config, pinned)).rejects.toBeInstanceOf(BrowserUnavailableError);
  });
});
