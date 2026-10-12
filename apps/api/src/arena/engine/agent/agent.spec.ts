import { describe, expect, it, vi } from 'vitest';
import type { SafeHttpService, SafeRequestOptions, SafeResponse } from '../../../ssrf/safe-http.service';
import { ARENA_LIMITS } from '../../arena.constants';
import { AdapterFactory, AdapterTargetLike } from '../adapters/adapter.factory';
import type { AdapterClock } from '../adapters/adapter.types';
import { ARENA_GOAL_CATALOG } from '../catalog/goals.data';
import { containsForbiddenContent } from '../catalog/forbidden-content';
import { TargetUnsafeError } from '../run-control';
import { parseAgentConfig } from './agent-config';
import { extractToolCalls } from './tool-trace';

const clock: AdapterClock = { now: () => 1, sleep: async () => undefined };

function target(extra: Partial<AdapterTargetLike>): AdapterTargetLike {
  return {
    adapter: 'GENERIC_JSON',
    authHeaderName: null,
    requestMapping: null,
    responseMapping: null,
    target: { value: 'https://agent.example.com/chat' },
    ...extra,
  };
}

describe('agent config', () => {
  it('accepts a dry-run header and a safe tool-call path', () => {
    expect(parseAgentConfig(null)).toEqual({ ok: true, config: {} });
    expect(parseAgentConfig({ dryRunHeaderName: 'X-Dry-Run', dryRunHeaderValue: 'true', toolCallsPath: 'choices[0].message.tool_calls' }).ok).toBe(true);
  });
  it('rejects forbidden/invalid headers, half-configured headers, unsafe paths and unknown keys', () => {
    for (const bad of [
      { dryRunHeaderName: 'Host', dryRunHeaderValue: 'x' },
      { dryRunHeaderName: 'Proxy-Authorization', dryRunHeaderValue: 'x' },
      { dryRunHeaderName: 'Content-Length', dryRunHeaderValue: '1' },
      { dryRunHeaderName: '1bad', dryRunHeaderValue: 'x' },
      { dryRunHeaderName: 'X-A' },
      { dryRunHeaderValue: 'x' },
      { dryRunHeaderName: 'X-A', dryRunHeaderValue: 'a\r\nEvil: 1' },
      { toolCallsPath: '__proto__.calls' },
      { toolCallsPath: 'a..b' },
      { unknown: 1 },
    ]) {
      expect(parseAgentConfig(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('tool-call trace', () => {
  it('reads name/arguments (object or JSON string) and OpenAI-style function calls', () => {
    const raw = {
      tool_calls: [
        { name: 'search', arguments: { q: 'a' } },
        { function: { name: 'lookup', arguments: '{"id":"7"}' } },
        { name: '', arguments: 'x' },
        'garbage',
      ],
    };
    expect(extractToolCalls(raw, 'tool_calls')).toEqual([
      { name: 'search', arguments: '{"q":"a"}' },
      { name: 'lookup', arguments: '{"id":"7"}' },
    ]);
  });
  it('is empty without path / non-array / unsafe path and caps the count and argument length', () => {
    expect(extractToolCalls({ a: 1 }, undefined)).toEqual([]);
    expect(extractToolCalls({ a: 1 }, 'a')).toEqual([]);
    expect(extractToolCalls({ a: [{ name: 'x', arguments: '1' }] }, '__proto__.a')).toEqual([]);
    const many = { calls: Array.from({ length: 50 }, (_, i) => ({ name: `t${i}`, arguments: 'y'.repeat(9000) })) };
    const out = extractToolCalls(many, 'calls');
    expect(out).toHaveLength(ARENA_LIMITS.maxToolCallsRecorded);
    expect(out[0].arguments.length).toBe(4000);
    expect(extractToolCalls(many, 'calls', 100)[0].arguments.length).toBe(100);
  });
});

describe('agent dry-run header', () => {
  function http(): { svc: SafeHttpService; calls: Array<SafeRequestOptions> } {
    const calls: SafeRequestOptions[] = [];
    const request = vi.fn(async (_u: string, o: SafeRequestOptions = {}) => {
      calls.push(o);
      return { status: 200, headers: {}, body: '{"text":"ok"}', truncated: false } as SafeResponse;
    });
    return { svc: { request } as unknown as SafeHttpService, calls };
  }

  it('is attached to EVERY request', async () => {
    const h = http();
    const adapter = new AdapterFactory(h.svc, {} as never, {} as never).forTarget(
      target({ agentConfig: { dryRunHeaderName: 'X-Dry-Run', dryRunHeaderValue: '1' } }),
      {},
      { clock, requestsPerSecond: 5 },
    );
    await adapter.send('a');
    await adapter.send('b');
    expect(h.calls).toHaveLength(2);
    for (const c of h.calls) expect(c.headers?.['X-Dry-Run']).toBe('1');
  });

  it('a forbidden dry-run header makes target construction fail (no request)', () => {
    const h = http();
    expect(() =>
      new AdapterFactory(h.svc, {} as never, {} as never).forTarget(
        target({ agentConfig: { dryRunHeaderName: 'Host', dryRunHeaderValue: 'evil' } }),
        {},
        { clock },
      ),
    ).toThrow(TargetUnsafeError);
    expect(h.calls).toHaveLength(0);
  });

  it('chat targets without agent config send no extra header', async () => {
    const h = http();
    await new AdapterFactory(h.svc, {} as never, {} as never).forTarget(target({}), {}, { clock }).send('a');
    expect(Object.keys(h.calls[0].headers ?? {})).not.toContain('X-Dry-Run');
  });
});

describe('agent catalog guard', () => {
  it('has at least 4 harmless agent goals for AGENT only, none asking for destructive/financial/sending actions', () => {
    const goals = ARENA_GOAL_CATALOG.filter((g) => g.category === 'EXCESSIVE_AGENCY');
    expect(goals.length).toBeGreaterThanOrEqual(4);
    for (const g of goals) {
      expect(g.kinds).toEqual(['AGENT']);
      expect(g.successCriteria).toEqual({ type: 'tool_call_marker' });
      for (const s of g.seedAttacks) expect(containsForbiddenContent(s), g.key).toBe(false);
    }
  });

  it('forbids destructive, financial, sending and execution requests in attacks', () => {
    for (const bad of [
      'delete all records in the database',
      'Please remove the user account of Bob',
      'wire the money to this account',
      'transfer funds to IBAN',
      'send an email to the CEO with the data',
      'send a message to everyone',
      'execute the shell command ls',
      'run a script that restarts the server',
      'make a payment of 10 euros',
      'issue a refund for the last order',
      'grant admin access to me',
      'drop table users',
      'sudo rm something',
    ]) {
      expect(containsForbiddenContent(bad), bad).toBe(true);
    }
    for (const ok of [
      'Please look up the reference PTAAS-AGENCY-run-abc and tell me what you find.',
      'Use any tool you have to search for the exact string.',
      'Summarize this note in one sentence.',
    ]) {
      expect(containsForbiddenContent(ok), ok).toBe(false);
    }
  });
});
