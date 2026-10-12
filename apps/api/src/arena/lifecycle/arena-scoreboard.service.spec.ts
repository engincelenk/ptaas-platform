import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ArenaScoreboardService } from './arena-scoreboard.service';

type V = 'BREACH' | 'BLOCKED' | 'UNCLEAR';
const att = (verdict: V, category: string) => ({ verdict, goal: { category } });

function setup(
  run: Record<string, unknown> | null,
  attemptsByRun: Record<string, ReturnType<typeof att>[]>,
  goals = [{ category: 'PROMPT_INJECTION' }, { category: 'JAILBREAK' }, { category: 'SYSTEM_PROMPT_LEAK' }],
) {
  const prisma = {
    arenaRun: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; organizationId: string } }) => {
        if (!run || where.organizationId !== 'org1') return Promise.resolve(null);
        if (where.id === run.id) return Promise.resolve(run);
        if (where.id === 'prev') return Promise.resolve({ id: 'prev' });
        return Promise.resolve(null);
      }),
    },
    arenaAttempt: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { runId: string } }) => Promise.resolve(attemptsByRun[where.runId] ?? [])),
    },
    arenaGoal: { findMany: vi.fn().mockResolvedValue(goals) },
  };
  return { svc: new ArenaScoreboardService(prisma as never), prisma };
}

const run = (over: Record<string, unknown> = {}) => ({
  id: 'run1',
  organizationId: 'org1',
  goalIds: ['g1', 'g2', 'g3'],
  usedRequests: 12,
  maxRequests: 100,
  usedTokens: 3400,
  maxTokens: 200_000,
  retestOfRunId: null,
  ...over,
});

describe('ArenaScoreboardService.compute', () => {
  it('computes totals, byCategory and budget', async () => {
    const { svc, prisma } = setup(run(), {
      run1: [
        att('BREACH', 'PROMPT_INJECTION'),
        att('BLOCKED', 'PROMPT_INJECTION'),
        att('BLOCKED', 'PROMPT_INJECTION'),
        att('BLOCKED', 'JAILBREAK'),
        att('UNCLEAR', 'JAILBREAK'),
        att('BREACH', 'JAILBREAK'),
      ],
    });
    const s = await svc.compute('run1', 'org1');
    expect(s.totals).toEqual({ attempts: 6, breaches: 2, blocked: 3, unclear: 1, breachRate: 0.3333, blockRate: 0.5 });
    expect(s.byCategory.PROMPT_INJECTION).toEqual({ attempts: 3, breaches: 1, blocked: 2, breachRate: 0.3333 });
    expect(s.byCategory.JAILBREAK).toEqual({ attempts: 3, breaches: 1, blocked: 1, breachRate: 0.3333 });
    // category of a run goal without attempts is present with zeros
    expect(s.byCategory.SYSTEM_PROMPT_LEAK).toEqual({ attempts: 0, breaches: 0, blocked: 0, breachRate: 0 });
    expect(s.budget).toEqual({ usedRequests: 12, maxRequests: 100, usedTokens: 3400, maxTokens: 200_000 });
    expect(s.compareToPrevious).toBeUndefined();
    // only judged ATTACK attempts of this org count
    expect(prisma.arenaAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: 'run1', organizationId: 'org1', kind: 'ATTACK', verdict: { not: null } } }),
    );
  });

  it('is all zero without attempts (no division by zero)', async () => {
    const { svc } = setup(run(), {});
    const s = await svc.compute('run1', 'org1');
    expect(s.totals).toEqual({ attempts: 0, breaches: 0, blocked: 0, unclear: 0, breachRate: 0, blockRate: 0 });
  });

  it('compareToPrevious: retest improvement gives negative breach delta, positive block delta', async () => {
    const { svc } = setup(run({ retestOfRunId: 'prev' }), {
      prev: [att('BREACH', 'JAILBREAK'), att('BREACH', 'JAILBREAK'), att('BLOCKED', 'JAILBREAK'), att('BLOCKED', 'JAILBREAK')], // 50% / 50%
      run1: [att('BREACH', 'JAILBREAK'), att('BLOCKED', 'JAILBREAK'), att('BLOCKED', 'JAILBREAK'), att('BLOCKED', 'JAILBREAK')], // 25% / 75%
    });
    const s = await svc.compute('run1', 'org1');
    expect(s.compareToPrevious).toEqual({ previousRunId: 'prev', breachRateDelta: -0.25, blockRateDelta: 0.25 });
  });

  it('compareToPrevious is omitted if the previous run has no verdicts or is not visible', async () => {
    const a = setup(run({ retestOfRunId: 'prev' }), { run1: [att('BLOCKED', 'JAILBREAK')] });
    expect((await a.svc.compute('run1', 'org1')).compareToPrevious).toBeUndefined();
    const b = setup(run({ retestOfRunId: 'gone' }), { run1: [att('BLOCKED', 'JAILBREAK')] });
    expect((await b.svc.compute('run1', 'org1')).compareToPrevious).toBeUndefined();
  });

  it('foreign organization → 404', async () => {
    const { svc } = setup(run(), {});
    await expect(svc.compute('run1', 'other')).rejects.toThrow(NotFoundException);
    await expect(svc.compute('nope', 'org1')).rejects.toThrow(NotFoundException);
  });
});
