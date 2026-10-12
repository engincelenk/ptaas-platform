import { describe, expect, it } from 'vitest';
import {
  arenaLiveReducer,
  budgetPercent,
  canSubmitApproval,
  clampInt,
  computeRates,
  deltaTone,
  estimateRequests,
  formatDelta,
  formatPercent,
  groupGoalsByCategory,
  initialLiveState,
  isApprover,
  isOperator,
  isTargetSelectable,
  latestAttemptTimestamp,
  parseArenaEvent,
  parseRoleFromToken,
  runActions,
  sanitizeTranscript,
  validateEndpointUrl,
  verificationLabel,
  type ArenaLiveState,
} from './arena-logic';
import type { AiTargetView, ArenaAttemptView, ArenaScoreSnapshot } from './arena-types';

function attempt(over: Partial<ArenaAttemptView> = {}): ArenaAttemptView {
  return {
    id: 'a1',
    goalKey: 'g1',
    category: 'PROMPT_INJECTION',
    round: 1,
    kind: 'ATTACK',
    technique: 'roleplay',
    attackText: 'attack',
    responseText: null,
    verdict: null,
    confidence: null,
    findingId: null,
    createdAt: '2026-10-12T10:00:00.000Z',
    ...over,
  };
}

function target(over: Partial<AiTargetView['verification']> = {}): AiTargetView {
  return {
    id: 't1',
    targetId: 'tt1',
    projectId: 'p1',
    name: 'Bot',
    endpointUrl: 'https://bot.example.com/chat',
    adapter: 'OPENAI_COMPAT',
    authHeaderName: null,
    hasApiKey: false,
    fragmentCount: 0,
    canaryPlacedAt: null,
    verification: { status: 'VERIFIED', fresh: true, verifiedAt: null, expiresAt: null, ...over },
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

const score: ArenaScoreSnapshot = {
  totals: { attempts: 4, breaches: 1, blocked: 3, unclear: 0, breachRate: 0.25, blockRate: 0.75 },
  byCategory: {},
  budget: { usedRequests: 4, maxRequests: 100, usedTokens: 10, maxTokens: 1000 },
};

describe('arenaLiveReducer', () => {
  it('stores run status and keeps the reason', () => {
    const s = arenaLiveReducer(initialLiveState, {
      kind: 'event',
      event: { type: 'run.status', status: 'ABORTED', reason: 'kill_switch' },
    });
    expect(s.status).toBe('ABORTED');
    expect(s.reason).toBe('kill_switch');
  });

  it('merges attempts by id so a later verdict replaces the pending one', () => {
    let s: ArenaLiveState = arenaLiveReducer(initialLiveState, {
      kind: 'event',
      event: { type: 'attempt', attempt: attempt() },
    });
    s = arenaLiveReducer(s, {
      kind: 'event',
      event: { type: 'attempt', attempt: attempt({ responseText: 'no', verdict: 'BLOCKED' }) },
    });
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0].verdict).toBe('BLOCKED');
  });

  it('orders attempts chronologically and dedupes polling results', () => {
    let s = arenaLiveReducer(initialLiveState, {
      kind: 'attempts',
      attempts: [attempt({ id: 'b', createdAt: '2026-10-12T10:00:02.000Z' }), attempt({ id: 'a' })],
    });
    s = arenaLiveReducer(s, { kind: 'attempts', attempts: [attempt({ id: 'a' })] });
    expect(s.attempts.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('replaces score and upserts recommendations sorted by priority', () => {
    let s = arenaLiveReducer(initialLiveState, { kind: 'event', event: { type: 'score', score } });
    expect(s.score?.totals.breachRate).toBe(0.25);
    s = arenaLiveReducer(s, {
      kind: 'event',
      event: { type: 'recommendation', id: 'r2', category: 'X', title: 'B', text: 't', priority: 2 },
    });
    s = arenaLiveReducer(s, {
      kind: 'event',
      event: { type: 'recommendation', id: 'r1', category: 'X', title: 'A', text: 't', priority: 1 },
    });
    s = arenaLiveReducer(s, {
      kind: 'event',
      event: { type: 'recommendation', id: 'r2', category: 'X', title: 'B2', text: 't', priority: 2 },
    });
    expect(s.recommendations.map((r) => r.title)).toEqual(['A', 'B2']);
  });

  it('collects finding ids once and marks done', () => {
    let s = arenaLiveReducer(initialLiveState, {
      kind: 'event',
      event: { type: 'finding', findingId: 'f1', attemptId: 'a1' },
    });
    s = arenaLiveReducer(s, { kind: 'event', event: { type: 'finding', findingId: 'f1', attemptId: 'a1' } });
    expect(s.findingIds).toEqual(['f1']);
    s = arenaLiveReducer(s, { kind: 'event', event: { type: 'done', status: 'COMPLETED' } });
    expect(s.done).toBe(true);
    expect(s.status).toBe('COMPLETED');
  });

  it('resets state', () => {
    const s = arenaLiveReducer(
      arenaLiveReducer(initialLiveState, { kind: 'attempts', attempts: [attempt()] }),
      { kind: 'reset' },
    );
    expect(s).toEqual(initialLiveState);
  });
});

describe('parseArenaEvent', () => {
  it('parses known events and rejects garbage', () => {
    expect(parseArenaEvent('{"type":"done","status":"COMPLETED"}')).toEqual({ type: 'done', status: 'COMPLETED' });
    expect(parseArenaEvent('not json')).toBeNull();
    expect(parseArenaEvent('{"type":"evil"}')).toBeNull();
    expect(parseArenaEvent('null')).toBeNull();
    expect(parseArenaEvent('"str"')).toBeNull();
  });
});

describe('latestAttemptTimestamp', () => {
  it('returns the newest createdAt or null', () => {
    expect(latestAttemptTimestamp([])).toBeNull();
    expect(
      latestAttemptTimestamp([attempt({ id: 'a' }), attempt({ id: 'b', createdAt: '2026-10-12T11:00:00.000Z' })]),
    ).toBe('2026-10-12T11:00:00.000Z');
  });
});

describe('score formatting', () => {
  it('formats percentages and handles null', () => {
    expect(formatPercent(0.256)).toBe('26 %');
    expect(formatPercent(null)).toBe('–');
    expect(formatPercent(NaN)).toBe('–');
    expect(formatPercent(1.5)).toBe('100 %');
    expect(formatPercent(-1)).toBe('0 %');
  });

  it('formats deltas with sign and tone', () => {
    expect(formatDelta(-0.25)).toBe('−25 Pp.');
    expect(formatDelta(0.1)).toBe('+10 Pp.');
    expect(formatDelta(0)).toBe('±0 Pp.');
    expect(deltaTone(-0.25, false)).toBe('good'); // breach rate fell
    expect(deltaTone(0.25, false)).toBe('bad');
    expect(deltaTone(0.25, true)).toBe('good'); // block rate rose
    expect(deltaTone(0.001, true)).toBe('neutral');
  });

  it('computes rates and budget percent', () => {
    expect(computeRates({ breaches: 1, blocked: 2, unclear: 1 })).toEqual({ breachRate: 0.25, blockRate: 0.5 });
    expect(computeRates({ breaches: 0, blocked: 0, unclear: 0 })).toEqual({ breachRate: 0, blockRate: 0 });
    expect(budgetPercent(50, 200)).toBe(25);
    expect(budgetPercent(500, 200)).toBe(100);
    expect(budgetPercent(5, 0)).toBe(0);
  });
});

describe('sanitizeTranscript', () => {
  it('keeps markup as literal text (no stripping or interpretation)', () => {
    const evil = '<img src=x onerror=alert(1)> [click](javascript:alert(1)) <script>x</script>';
    expect(sanitizeTranscript(evil)).toBe(evil);
  });

  it('removes control and bidi override characters but keeps newlines and tabs', () => {
    expect(sanitizeTranscript('a\u0000b\u0007c\nd\te‮f')).toBe('abc\nd\tef');
  });

  it('handles empty input and bounds length', () => {
    expect(sanitizeTranscript(null)).toBe('');
    expect(sanitizeTranscript(undefined)).toBe('');
    expect(sanitizeTranscript('x'.repeat(20), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});

describe('role gating', () => {
  it('operator and approver roles', () => {
    expect(isOperator('ADMIN')).toBe(true);
    expect(isOperator('SECURITY_ENGINEER')).toBe(true);
    expect(isOperator('DEVELOPER')).toBe(false);
    expect(isOperator('VIEWER')).toBe(false);
    expect(isOperator(null)).toBe(false);
    expect(isApprover('ADMIN')).toBe(true);
    expect(isApprover('SECURITY_ENGINEER')).toBe(false);
  });

  it('only ADMIN may approve', () => {
    expect(runActions('ADMIN', 'AWAITING_APPROVAL').canApprove).toBe(true);
    expect(runActions('SECURITY_ENGINEER', 'AWAITING_APPROVAL').canApprove).toBe(false);
    expect(runActions('ADMIN', 'DRAFT').canApprove).toBe(false);
  });

  it('gates actions by status', () => {
    expect(runActions('SECURITY_ENGINEER', 'APPROVED').canStart).toBe(true);
    expect(runActions('SECURITY_ENGINEER', 'DRAFT').canStart).toBe(false);
    expect(runActions('SECURITY_ENGINEER', 'RUNNING').canAbort).toBe(true);
    expect(runActions('SECURITY_ENGINEER', 'APPROVED').canAbort).toBe(false);
    expect(runActions('SECURITY_ENGINEER', 'COMPLETED').canRetest).toBe(true);
    expect(runActions('SECURITY_ENGINEER', 'ABORTED').canRetest).toBe(true);
    expect(runActions('SECURITY_ENGINEER', 'RUNNING').canRetest).toBe(false);
    expect(runActions('SECURITY_ENGINEER', 'DRAFT').canSubmit).toBe(true);
    const viewer = runActions('VIEWER', 'RUNNING');
    expect(Object.values(viewer).every((v) => v === false)).toBe(true);
  });

  it('reads the role from a JWT payload', () => {
    const payload = btoa(JSON.stringify({ role: 'ADMIN' }));
    expect(parseRoleFromToken(`h.${payload}.s`)).toBe('ADMIN');
    expect(parseRoleFromToken('garbage')).toBeNull();
    expect(parseRoleFromToken(null)).toBeNull();
  });

  it('requires all four confirmations, contact and RoE version for approval', () => {
    const all = { noProduction: true, noSideEffects: true, noTools: true, providerTosAccepted: true };
    expect(canSubmitApproval(all, 'Max, 12345', 3)).toBe(true);
    expect(canSubmitApproval({ ...all, noTools: false }, 'Max, 12345', 3)).toBe(false);
    expect(canSubmitApproval(all, '   ', 3)).toBe(false);
    expect(canSubmitApproval(all, 'Max, 12345', null)).toBe(false);
  });
});

describe('targets', () => {
  it('only verified and fresh targets are selectable', () => {
    expect(isTargetSelectable(target())).toBe(true);
    expect(isTargetSelectable(target({ fresh: false }))).toBe(false);
    expect(isTargetSelectable(target({ status: 'PENDING' }))).toBe(false);
    expect(isTargetSelectable(target({ status: 'FAILED' }))).toBe(false);
  });

  it('labels stale verification', () => {
    expect(verificationLabel(target({ fresh: false })).text).toContain('neu verifizieren');
    expect(verificationLabel(target()).tone).toBe('good');
  });

  it('validates endpoint URLs', () => {
    expect(validateEndpointUrl('https://bot.example.com/chat')).toBeNull();
    expect(validateEndpointUrl('http://bot.example.com')).toContain('https');
    expect(validateEndpointUrl('https://api.openai.com/v1/chat')).toContain('Provider');
    expect(validateEndpointUrl('https://API.Anthropic.com/v1')).toContain('Provider');
    expect(validateEndpointUrl('https://u:p@bot.example.com')).toContain('Zugangsdaten');
    expect(validateEndpointUrl('https://bot.example.com:8443')).toContain('443');
    expect(validateEndpointUrl('nonsense')).toContain('Ungültig');
  });
});

describe('wizard helpers', () => {
  it('estimates requests clamped to the budget', () => {
    expect(estimateRequests({ goalCount: 3, maxRounds: 5, maxRequests: 200 })).toBe(15);
    expect(estimateRequests({ goalCount: 50, maxRounds: 10, maxRequests: 200 })).toBe(200);
    expect(estimateRequests({ goalCount: 0, maxRounds: 5, maxRequests: 200 })).toBe(0);
  });

  it('clamps integers', () => {
    expect(clampInt(99, 1, 10)).toBe(10);
    expect(clampInt(-5, 1, 10)).toBe(1);
    expect(clampInt(NaN, 1, 10)).toBe(1);
    expect(clampInt(3.6, 1, 10)).toBe(4);
  });

  it('groups goals by category preserving order', () => {
    const g = groupGoalsByCategory([
      { category: 'A', id: 1 },
      { category: 'B', id: 2 },
      { category: 'A', id: 3 },
    ]);
    expect(g.map(([c, l]) => [c, l.length])).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });
});
