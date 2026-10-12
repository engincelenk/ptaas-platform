import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import type { SafeHttpService, SafeResponse, SafeRequestOptions } from '../../../ssrf/safe-http.service';
import { ARENA_LIMITS } from '../../arena.constants';
import { AdapterFactory, AdapterTargetLike } from './adapter.factory';
import type { AdapterClock } from './adapter.types';
import { ErrorRateExceededError, RunStopError, TargetRequestError, TargetUnsafeError } from '../run-control';
import { getAtPath, parsePath, setAtPath } from './json-path';

type Call = { url: string; opts: SafeRequestOptions };

function ok(body: unknown, status = 200, headers: SafeResponse['headers'] = {}): SafeResponse {
  return { status, headers, body: typeof body === 'string' ? body : JSON.stringify(body), truncated: false };
}

function fakeHttp(responses: Array<SafeResponse | Error>) {
  const calls: Call[] = [];
  let i = 0;
  const request = vi.fn(async (url: string, opts: SafeRequestOptions = {}) => {
    calls.push({ url, opts });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  });
  return { http: { request } as unknown as SafeHttpService, calls, request };
}

function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const clock: AdapterClock = {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
  return { clock, sleeps };
}

function target(adapter: AdapterTargetLike['adapter'], extra: Partial<AdapterTargetLike> = {}): AdapterTargetLike {
  return {
    adapter,
    authHeaderName: null,
    requestMapping: null,
    responseMapping: null,
    target: { value: 'https://bot.example.com/chat' },
    ...extra,
  };
}

describe('json-path', () => {
  it('parses, reads and writes paths; rejects prototype pollution', () => {
    expect(parsePath('a.b[0].c')).toEqual(['a', 'b', 0, 'c']);
    expect(parsePath('__proto__.x')).toBeNull();
    expect(parsePath('a..b')).toBeNull();
    expect(getAtPath({ a: { b: [{ c: 'x' }] } }, 'a.b[0].c')).toBe('x');
    expect(getAtPath({ a: 1 }, 'a.b')).toBeUndefined();
    const obj: Record<string, unknown> = {};
    expect(setAtPath(obj, 'in.msgs[0].text', 'hi')).toBe(true);
    expect(obj).toEqual({ in: { msgs: [{ text: 'hi' }] } });
    expect(setAtPath(obj, 'constructor.prototype.x', 'y')).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('adapters', () => {
  it('OPENAI_COMPAT posts messages with Bearer auth through SafeHttpService on port 443', async () => {
    const { http, calls } = fakeHttp([ok({ choices: [{ message: { content: 'hello' } }] })]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(
      target('OPENAI_COMPAT', { authHeaderName: 'Authorization', requestMapping: { model: 'm1' } }),
      { apiKey: 'sk-test-secret-key-0000' },
      { clock, requestsPerSecond: 5 },
    );
    const res = await adapter.send('ping');
    expect(res.text).toBe('hello');
    expect(res.requests).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://bot.example.com/chat');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.allowedPorts).toEqual([443]);
    expect(calls[0].opts.timeoutMs).toBe(15_000);
    expect(calls[0].opts.maxBytes).toBe(64 * 1024);
    expect(calls[0].opts.headers?.Authorization).toBe('Bearer sk-test-secret-key-0000');
    expect(JSON.parse(calls[0].opts.body ?? '')).toEqual({ model: 'm1', messages: [{ role: 'user', content: 'ping' }] });
  });

  it('ANTHROPIC uses x-api-key and content[].text', async () => {
    const { http, calls } = fakeHttp([ok({ content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'there' }] })]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('ANTHROPIC'), { apiKey: 'k-1' }, { clock });
    const res = await adapter.send('ping');
    expect(res.text).toBe('hi\nthere');
    expect(calls[0].opts.headers?.['x-api-key']).toBe('k-1');
    expect(calls[0].opts.headers?.['anthropic-version']).toBeDefined();
    const body = JSON.parse(calls[0].opts.body ?? '') as { messages: unknown[]; max_tokens: number };
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('GENERIC_JSON maps prompt and reply via JSON paths', async () => {
    const { http, calls } = fakeHttp([ok({ data: { reply: 'yo' } })]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(
      target('GENERIC_JSON', {
        authHeaderName: 'X-Token',
        requestMapping: { promptPath: 'input.text', template: { lang: 'de' } },
        responseMapping: { textPath: 'data.reply' },
      }),
      { apiKey: 'abc' },
      { clock },
    );
    const res = await adapter.send('ping');
    expect(res.text).toBe('yo');
    expect(JSON.parse(calls[0].opts.body ?? '')).toEqual({ lang: 'de', input: { text: 'ping' } });
    expect(calls[0].opts.headers?.['X-Token']).toBe('abc');
  });

  it('rejects header injection in auth header configuration', async () => {
    const { http, request } = fakeHttp([ok({})]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(
      target('GENERIC_JSON', { authHeaderName: 'X-A\r\nEvil: 1' }),
      { apiKey: 'abc' },
      { clock },
    );
    await expect(adapter.send('x')).rejects.toBeInstanceOf(TargetUnsafeError);
    expect(request).not.toHaveBeenCalled();
  });

  it('truncates long responses to ARENA_LIMITS.maxResponseChars', async () => {
    const long = 'a'.repeat(ARENA_LIMITS.maxResponseChars + 500);
    const { http } = fakeHttp([ok({ choices: [{ message: { content: long } }] })]);
    const { clock } = fakeClock();
    const res = await new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock }).send('x');
    expect(res.text.length).toBe(ARENA_LIMITS.maxResponseChars);
  });

  it('retries 429/5xx with backoff, honours Retry-After and counts requests', async () => {
    const { http, request } = fakeHttp([
      ok('busy', 429, { 'retry-after': '2' }),
      ok('oops', 503),
      ok({ choices: [{ message: { content: 'finally' } }] }),
    ]);
    const { clock, sleeps } = fakeClock();
    const res = await new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock, requestsPerSecond: 5 }).send('x');
    expect(res.text).toBe('finally');
    expect(res.requests).toBe(3);
    expect(request).toHaveBeenCalledTimes(3);
    expect(sleeps.some((s) => s >= 2000)).toBe(true);
  });

  it('does not retry other 4xx and surfaces a TargetRequestError', async () => {
    const { http, request } = fakeHttp([ok('nope', 401)]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock });
    await expect(adapter.send('x')).rejects.toMatchObject({ name: 'TargetRequestError', kind: 'http', status: 401 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('enforces requestsPerSecond between requests', async () => {
    const { http } = fakeHttp([ok({ choices: [{ message: { content: 'a' } }] })]);
    const { clock, sleeps } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock, requestsPerSecond: 2 });
    await adapter.send('1');
    await adapter.send('2');
    expect(sleeps).toContain(500);
  });

  it('aborts with ErrorRateExceededError when >= 50% of the last 6 requests failed', async () => {
    const { http } = fakeHttp([ok('boom', 500)]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock });
    await expect(adapter.send('1')).rejects.toBeInstanceOf(TargetRequestError); // 4 failures
    await expect(adapter.send('2')).rejects.toBeInstanceOf(ErrorRateExceededError); // 6th failure
    await expect(adapter.send('3').catch((e) => e)).resolves.toBeInstanceOf(RunStopError);
  });

  it('calls beforeRequest before every HTTP request (kill-switch hook) and stops when it throws', async () => {
    const { http, request } = fakeHttp([ok('x', 500), ok({ choices: [{ message: { content: 'ok' } }] })]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock });
    const hook = vi.fn(async () => undefined);
    await adapter.send('x', { beforeRequest: hook });
    expect(hook).toHaveBeenCalledTimes(2);

    const stopper = vi.fn(async () => {
      throw new RunStopError('kill_switch');
    });
    request.mockClear();
    await expect(adapter.send('x', { beforeRequest: stopper })).rejects.toBeInstanceOf(RunStopError);
    expect(request).not.toHaveBeenCalled();
  });

  it('treats SSRF/validation refusals as fatal and never retries', async () => {
    const { http, request } = fakeHttp([new BadRequestException('Resolved to a private address')]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock });
    await expect(adapter.send('x')).rejects.toBeInstanceOf(TargetUnsafeError);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fails with a parse error on malformed responses', async () => {
    const { http } = fakeHttp([ok('<html>not json</html>')]);
    const { clock } = fakeClock();
    const adapter = new AdapterFactory(http).forTarget(target('OPENAI_COMPAT'), {}, { clock });
    await expect(adapter.send('x')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('adapter sources never use fetch/axios directly (SafeHttpService only)', () => {
    const dir = __dirname;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/from 'axios'|require\('axios'\)|from 'https?'|from 'node:https?'/);
    }
  });
});
