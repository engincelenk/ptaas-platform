import { describe, expect, it, vi } from 'vitest';
import { ARENA_LIMITS } from '../../arena.constants';
import type { AdapterClock } from '../adapters/adapter.types';
import { ErrorRateExceededError, RunStopError, TargetRequestError, TargetUnsafeError } from '../run-control';
import { WidgetAdapter } from './widget.adapter';
import { WidgetAdapterFactory } from './widget-adapter.factory';
import { WidgetConfigError, parseWidgetConfig } from './widget-config';
import { isRequestAllowed, hostResolverRules } from './playwright-browser.driver';
import { WidgetSessionExpiredError } from './widget-session-options';
import { BrowserUnavailableError } from './widget.types';
import type { BrowserDriver, PinnedHost, WidgetConfig, WidgetSession } from './widget.types';

const pinned: PinnedHost = { host: 'chat.example.com', ip: '93.184.216.34' };
const baseConfig: WidgetConfig = {
  pageUrl: 'https://chat.example.com/support',
  inputSelector: '#in',
  responseSelector: '.msg',
};

function fakeClock(): AdapterClock & { slept: number[]; t: number } {
  const c = {
    t: 1_000,
    slept: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.slept.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function fakeDriver(impl: (prompt: string, n: number) => Promise<string>) {
  const sessions: { closed: boolean; prompts: string[] }[] = [];
  const driver: BrowserDriver & { opens: number } = {
    opens: 0,
    async open() {
      driver.opens++;
      const state = { closed: false, prompts: [] as string[] };
      sessions.push(state);
      const session: WidgetSession = {
        send: async (p) => {
          state.prompts.push(p);
          return impl(p, state.prompts.length);
        },
        close: async () => {
          state.closed = true;
        },
      };
      return session;
    },
  };
  return { driver, sessions };
}

describe('WidgetAdapter', () => {
  it('opens a session lazily, returns text and counts one request', async () => {
    const { driver } = fakeDriver(async (p) => `echo:${p}`);
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    expect(driver.opens).toBe(0);
    const r = await a.send('hi');
    expect(r.text).toBe('echo:hi');
    expect(r.requests).toBe(1);
    await a.send('again');
    expect(driver.opens).toBe(1);
    expect(a.stats()).toEqual({ requests: 2, failures: 0 });
  });

  it('truncates long replies and attacks to the arena limits', async () => {
    const { driver, sessions } = fakeDriver(async () => 'x'.repeat(ARENA_LIMITS.maxResponseChars + 500));
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    const r = await a.send('y'.repeat(ARENA_LIMITS.maxAttackChars + 10));
    expect(r.text).toHaveLength(ARENA_LIMITS.maxResponseChars);
    expect(sessions[0].prompts[0]).toHaveLength(ARENA_LIMITS.maxAttackChars);
  });

  it('enforces the requests-per-second limit', async () => {
    const clock = fakeClock();
    const { driver } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock, requestsPerSecond: 2 });
    await a.send('1');
    await a.send('2');
    expect(clock.slept.some((ms) => ms >= 500)).toBe(true);
  });

  it('caps requestsPerSecond at the arena maximum', async () => {
    const clock = fakeClock();
    const { driver } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock, requestsPerSecond: 1000 });
    await a.send('1');
    await a.send('2');
    expect(clock.slept[0]).toBe(Math.ceil(1000 / ARENA_LIMITS.maxRequestsPerSecond));
  });

  it('calls beforeRequest before every send and stops without touching the browser when it throws', async () => {
    const { driver } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    const hook = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new RunStopError('killed'));
    await a.send('1', { beforeRequest: hook });
    await expect(a.send('2', { beforeRequest: hook })).rejects.toBeInstanceOf(RunStopError);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(a.stats().requests).toBe(1);
  });

  it('never opens a browser when the first beforeRequest stops the run', async () => {
    const { driver } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await expect(a.send('1', { beforeRequest: async () => { throw new RunStopError('budget'); } })).rejects.toBeInstanceOf(RunStopError);
    expect(driver.opens).toBe(0);
  });

  it('maps interaction errors to TargetRequestError without leaking details, timeouts as timeout', async () => {
    const { driver } = fakeDriver(async (_p, n) => {
      throw new Error(n === 1 ? 'Timed out waiting for the widget reply' : 'secret internal detail');
    });
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    const e1 = await a.send('1').catch((e) => e);
    expect(e1).toBeInstanceOf(TargetRequestError);
    expect(e1.kind).toBe('timeout');
    const e2 = await a.send('2').catch((e) => e);
    expect(e2.kind).toBe('network');
    expect(e2.message).not.toContain('secret');
    expect(a.stats().failures).toBe(2);
  });

  it('aborts with ErrorRateExceededError when half of the recent interactions failed', async () => {
    const { driver } = fakeDriver(async () => {
      throw new Error('boom');
    });
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    const errors: unknown[] = [];
    for (let i = 0; i < 6; i++) errors.push(await a.send('x').catch((e) => e));
    expect(errors.slice(0, 5).every((e) => e instanceof TargetRequestError)).toBe(true);
    expect(errors[5]).toBeInstanceOf(ErrorRateExceededError);
  });

  it('propagates BrowserUnavailableError unchanged and does not count it as a recent failure', async () => {
    const driver: BrowserDriver = {
      open: async () => {
        throw new BrowserUnavailableError();
      },
    };
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await expect(a.send('1')).rejects.toBeInstanceOf(BrowserUnavailableError);
  });

  it('serialises concurrent sends', async () => {
    let active = 0;
    let maxActive = 0;
    const { driver } = fakeDriver(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 'ok';
    });
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await Promise.all([a.send('1'), a.send('2'), a.send('3')]);
    expect(maxActive).toBe(1);
  });

  it('close() ends the session, is idempotent and blocks further sends', async () => {
    const { driver, sessions } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await a.send('1');
    await a.close();
    await a.close();
    expect(sessions[0].closed).toBe(true);
    await expect(a.send('2')).rejects.toBeInstanceOf(TargetUnsafeError);
  });

  it('close() without a session is a no-op', async () => {
    const { driver } = fakeDriver(async () => 'ok');
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await expect(a.close()).resolves.toBeUndefined();
  });
});

describe('WidgetAdapter session options', () => {
  it('passes shouldAbort and session options to the driver on open', async () => {
    const seen: unknown[] = [];
    const driver: BrowserDriver = {
      open: async (...args: unknown[]) => {
        seen.push(args[2]);
        return { send: async () => 'ok', close: async () => undefined };
      },
    };
    const shouldAbort = async () => false;
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock(), shouldAbort, sessionOptions: { maxRequests: 5 } });
    await a.send('x');
    expect(seen[0]).toEqual({ maxRequests: 5, shouldAbort });
  });

  it('transparently reopens a fresh session once when the session expired', async () => {
    let opens = 0;
    const closed: number[] = [];
    const driver: BrowserDriver = {
      open: async () => {
        const n = ++opens;
        return {
          send: async () => {
            if (n === 1) throw new WidgetSessionExpiredError();
            return `session${n}`;
          },
          close: async () => {
            closed.push(n);
          },
        };
      },
    };
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    expect((await a.send('x')).text).toBe('session2');
    expect(opens).toBe(2);
    expect(closed).toEqual([1]);
    expect(a.stats().failures).toBe(0);
  });

  it('request-cap errors (TargetUnsafeError) are terminal and not retried', async () => {
    let opens = 0;
    const driver: BrowserDriver = {
      open: async () => {
        opens++;
        return { send: async () => { throw new TargetUnsafeError('request_cap_exceeded'); }, close: async () => undefined };
      },
    };
    const a = new WidgetAdapter(driver, baseConfig, pinned, { clock: fakeClock() });
    await expect(a.send('x')).rejects.toBeInstanceOf(TargetUnsafeError);
    expect(opens).toBe(1);
  });

  it('factory forwards shouldAbort', async () => {
    const seen: unknown[] = [];
    const driver: BrowserDriver = {
      open: async (...args: unknown[]) => {
        seen.push(args[2]);
        return { send: async () => 'ok', close: async () => undefined };
      },
    };
    const shouldAbort = async () => false;
    const a = new WidgetAdapterFactory(driver).create({ widgetConfig: baseConfig }, { pinned, clock: fakeClock(), shouldAbort });
    await a.send('x');
    expect((seen[0] as { shouldAbort: unknown }).shouldAbort).toBe(shouldAbort);
  });
});

describe('parseWidgetConfig', () => {
  const ok = (over: Record<string, unknown> = {}) => parseWidgetConfig({ ...baseConfig, ...over }, pinned);
  const bad = (over: Record<string, unknown>) => expect(() => ok(over)).toThrow(WidgetConfigError);

  it('accepts a minimal valid config and a full one', () => {
    expect(ok()).toEqual(baseConfig);
    const full = ok({
      openSelector: '#launcher',
      iframeSelector: 'iframe#w',
      sendSelector: '#send',
      cookieConsentSelector: '#accept',
      waitAfterOpenMs: 0,
      responseTimeoutMs: 60_000,
      pageUrl: 'https://CHAT.example.com:443/x?y=1',
    });
    expect(full.responseTimeoutMs).toBe(60_000);
  });

  it('rejects non-objects, missing required selectors and unknown keys', () => {
    expect(() => parseWidgetConfig(null, pinned)).toThrow(WidgetConfigError);
    expect(() => parseWidgetConfig('x', pinned)).toThrow(WidgetConfigError);
    bad({ inputSelector: undefined });
    bad({ responseSelector: undefined });
    bad({ extra: 'x' });
  });

  it('rejects overlong, blank and control-character selectors', () => {
    bad({ inputSelector: 'a'.repeat(201) });
    bad({ inputSelector: '   ' });
    bad({ responseSelector: '.a\n.b' });
    expect(ok({ inputSelector: 'a'.repeat(200) }).inputSelector).toHaveLength(200);
  });

  it('bounds the timeouts', () => {
    bad({ waitAfterOpenMs: -1 });
    bad({ waitAfterOpenMs: 15_001 });
    bad({ responseTimeoutMs: 999 });
    bad({ responseTimeoutMs: ARENA_LIMITS.widgetResponseTimeoutMaxMs + 1 });
    bad({ responseTimeoutMs: 1.5 });
  });

  it('requires https on port 443 without credentials and with the verified host', () => {
    bad({ pageUrl: 'http://chat.example.com/' });
    bad({ pageUrl: 'https://chat.example.com:8443/' });
    bad({ pageUrl: 'https://user:pw@chat.example.com/' });
    bad({ pageUrl: 'https://other.example.com/' });
    bad({ pageUrl: 'https://chat.example.com.evil.com/' });
    bad({ pageUrl: 'javascript:alert(1)' });
    bad({ pageUrl: 'not a url' });
    bad({ pageUrl: 'https://' + 'a'.repeat(2000) + '.example.com/' });
  });

  it('does not echo config values in the error message', () => {
    try {
      ok({ pageUrl: 'https://user:topsecret@chat.example.com/' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('topsecret');
    }
  });
});

describe('WidgetAdapterFactory', () => {
  it('validates the raw config, binds the pinned host and returns a working adapter', async () => {
    const { driver } = fakeDriver(async () => 'hello');
    const factory = new WidgetAdapterFactory(driver);
    const a = factory.create({ widgetConfig: baseConfig }, { pinned, clock: fakeClock() });
    expect((await a.send('x')).text).toBe('hello');
    await a.close();
  });

  it('throws WidgetConfigError for invalid config or host mismatch', () => {
    const { driver } = fakeDriver(async () => 'x');
    const factory = new WidgetAdapterFactory(driver);
    expect(() => factory.create({ widgetConfig: { pageUrl: 'https://evil.com/' } }, { pinned })).toThrow(WidgetConfigError);
    expect(() => factory.create({ widgetConfig: { ...baseConfig, pageUrl: 'https://evil.com/' } }, { pinned })).toThrow(WidgetConfigError);
    expect(() => factory.create({ widgetConfig: undefined }, { pinned })).toThrow(WidgetConfigError);
  });
});

describe('network egress policy helpers', () => {
  it('allows only https on the pinned host and port', () => {
    expect(isRequestAllowed('https://chat.example.com/a?b=1', 'chat.example.com')).toBe(true);
    expect(isRequestAllowed('https://CHAT.example.com:443/', 'chat.example.com')).toBe(true);
    expect(isRequestAllowed('https://chat.example.com./', 'chat.example.com')).toBe(true);
    expect(isRequestAllowed('https://chat.example.com:8443/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('http://chat.example.com/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://cdn.example.com/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://chat.example.com.evil.com/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://evil.com/@chat.example.com', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://u:p@chat.example.com/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://127.0.0.1/', 'chat.example.com')).toBe(false);
    expect(isRequestAllowed('https://169.254.169.254/', 'chat.example.com')).toBe(false);
    for (const u of ['data:text/html,x', 'blob:https://chat.example.com/1', 'ws://chat.example.com/', 'wss://chat.example.com/', 'file:///etc/passwd', 'about:blank', 'chrome://version', '', 'garbage']) {
      expect(isRequestAllowed(u, 'chat.example.com')).toBe(false);
    }
    expect(isRequestAllowed('https://widget.test:9443/x', 'widget.test', 9443)).toBe(true);
    expect(isRequestAllowed('https://widget.test/x', 'widget.test', 9443)).toBe(false);
  });

  it('builds host-resolver rules that map only the pinned host', () => {
    expect(hostResolverRules({ host: 'a.example', ip: '1.2.3.4' })).toBe('MAP a.example 1.2.3.4, MAP * ~NOTFOUND');
    expect(hostResolverRules({ host: 'a.example', ip: '2001:db8::1' })).toBe('MAP a.example [2001:db8::1], MAP * ~NOTFOUND');
  });
});
