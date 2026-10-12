import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ArenaScoreSnapshot } from '../arena-events';

type Totals = ArenaScoreSnapshot['totals'];

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Score of a run. Only ATTACK attempts that already have a verdict count (RECON probes and
 * attempts still being judged are ignored). Rates are fractions in [0, 1].
 */
@Injectable()
export class ArenaScoreboardService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(runId: string, organizationId: string): Promise<ArenaScoreSnapshot> {
    const run = await this.prisma.arenaRun.findFirst({ where: { id: runId, organizationId } });
    if (!run) throw new NotFoundException('Run not found');

    const [attempts, goals] = await Promise.all([
      this.prisma.arenaAttempt.findMany({
        where: { runId, organizationId, kind: 'ATTACK', verdict: { not: null } },
        select: { verdict: true, goal: { select: { category: true } } },
      }),
      this.prisma.arenaGoal.findMany({ where: { id: { in: run.goalIds } }, select: { category: true } }),
    ]);

    const byCategory: ArenaScoreSnapshot['byCategory'] = {};
    for (const g of goals) byCategory[g.category] ??= { attempts: 0, breaches: 0, blocked: 0, breachRate: 0 };

    let breaches = 0;
    let blocked = 0;
    let unclear = 0;
    for (const a of attempts) {
      const cat = (byCategory[a.goal.category] ??= { attempts: 0, breaches: 0, blocked: 0, breachRate: 0 });
      cat.attempts += 1;
      if (a.verdict === 'BREACH') {
        breaches += 1;
        cat.breaches += 1;
      } else if (a.verdict === 'BLOCKED') {
        blocked += 1;
        cat.blocked += 1;
      } else {
        unclear += 1;
      }
    }
    for (const cat of Object.values(byCategory)) {
      cat.breachRate = cat.attempts > 0 ? round4(cat.breaches / cat.attempts) : 0;
    }

    const total = attempts.length;
    const totals: Totals = {
      attempts: total,
      breaches,
      blocked,
      unclear,
      breachRate: total > 0 ? round4(breaches / total) : 0,
      blockRate: total > 0 ? round4(blocked / total) : 0,
    };

    const snapshot: ArenaScoreSnapshot = {
      totals,
      byCategory,
      budget: {
        usedRequests: run.usedRequests,
        maxRequests: run.maxRequests,
        usedTokens: run.usedTokens,
        maxTokens: run.maxTokens,
      },
    };

    if (run.retestOfRunId) {
      const prev = await this.previousTotals(run.retestOfRunId, organizationId);
      if (prev) {
        snapshot.compareToPrevious = {
          previousRunId: run.retestOfRunId,
          // Negative breachRateDelta = improvement.
          breachRateDelta: round4(totals.breachRate - prev.breachRate),
          blockRateDelta: round4(totals.blockRate - prev.blockRate),
        };
      }
    }
    return snapshot;
  }

  /** Breach/block rate of a run (no category breakdown); null if unknown to the org or without verdicts. */
  async rateOf(runId: string, organizationId: string): Promise<{ breachRate: number; blockRate: number } | null> {
    return this.previousTotals(runId, organizationId);
  }

  private async previousTotals(
    runId: string,
    organizationId: string,
  ): Promise<{ breachRate: number; blockRate: number } | null> {
    const prev = await this.prisma.arenaRun.findFirst({ where: { id: runId, organizationId }, select: { id: true } });
    if (!prev) return null;
    const rows = await this.prisma.arenaAttempt.findMany({
      where: { runId, organizationId, kind: 'ATTACK', verdict: { not: null } },
      select: { verdict: true },
    });
    if (rows.length === 0) return null;
    const breaches = rows.filter((r) => r.verdict === 'BREACH').length;
    const blocked = rows.filter((r) => r.verdict === 'BLOCKED').length;
    return { breachRate: round4(breaches / rows.length), blockRate: round4(blocked / rows.length) };
  }
}
