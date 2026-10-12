import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@ptaas/db';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ARENA_LIMITS, arenaRedisKeys } from '../arena.constants';
import { ArenaEventsService } from '../arena-events.service';
import { MAX_RUN_WALLCLOCK_MS } from './engine.types';
import { isOpenDoc, readRagDocs } from './rag/rag-artifacts';
import { RagCleanupService } from './rag/rag-cleanup.service';

export const RETENTION_REDIS = 'REDIS_CLIENT';
export const RETENTION_PLACEHOLDER = '[expired — retention]';
export const RETENTION_LOCK_KEY = 'arena:retention:lock';
// Reaper must notice stalled runs quickly; retention queries are cheap (indexed on expires_at).
export const RETENTION_INTERVAL_MS = 15 * 60 * 1000;
const LOCK_TTL_SECONDS = 15 * 60;
const REAPER_BUFFER_MS = 10 * 60 * 1000;

export interface RetentionRedis {
  set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
}

export interface RetentionResult {
  findingsScrubbed: number;
  attemptsDeleted: number;
  contactsCleared: number;
  runsReaped: number;
  ragRunsCleaned: number;
}

/**
 * Self-contained housekeeping. ScheduleModule is active in this app, but this timer is deliberately independent of it:
 * it must not depend on a cron decorator being wired and it uses its own Redis lock so several instances never overlap.
 * Duties:
 *  - retention: expired attempts are deleted, evidence copied into findings is scrubbed, emergency contacts are cleared,
 *  - reaper: runs stuck in RUNNING (worker crash) are failed and their target lock released.
 * A Redis SET NX EX lock keeps multiple API instances from running it at the same time.
 */
@Injectable()
export class ArenaRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ArenaRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ArenaEventsService,
    private readonly audit: AuditService,
    private readonly ragCleanup: RagCleanupService,
    @Inject(RETENTION_REDIS) private readonly redis: RetentionRedis,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), RETENTION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Guarded by a distributed lock; never throws. */
  async tick(now: Date = new Date()): Promise<RetentionResult | null> {
    try {
      const got = await this.redis.set(RETENTION_LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      if (got !== 'OK') return null;
      return await this.runOnce(now);
    } catch (err) {
      this.log.error(`retention run failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async runOnce(now: Date = new Date()): Promise<RetentionResult> {
    const result: RetentionResult = { findingsScrubbed: 0, attemptsDeleted: 0, contactsCleared: 0, runsReaped: 0, ragRunsCleaned: 0 };

    // (a) scrub evidence in findings that originate from expired attempts
    const withFinding = await this.prisma.arenaAttempt.findMany({
      where: { expiresAt: { lt: now }, findingId: { not: null } },
      select: { findingId: true, organizationId: true },
    });
    const byOrg = new Map<string, Set<string>>();
    for (const a of withFinding) {
      if (!a.findingId) continue;
      const set = byOrg.get(a.organizationId) ?? new Set<string>();
      set.add(a.findingId);
      byOrg.set(a.organizationId, set);
    }
    for (const [organizationId, ids] of byOrg) {
      const r = await this.prisma.finding.updateMany({
        where: { id: { in: [...ids] }, organizationId },
        data: { httpRequest: RETENTION_PLACEHOLDER, httpResponse: RETENTION_PLACEHOLDER },
      });
      result.findingsScrubbed += r.count;
    }

    // (b) delete expired attempts (per organization)
    const orgs = await this.prisma.arenaAttempt.findMany({
      where: { expiresAt: { lt: now } },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    for (const { organizationId } of orgs) {
      const r = await this.prisma.arenaAttempt.deleteMany({ where: { organizationId, expiresAt: { lt: now } } });
      result.attemptsDeleted += r.count;
    }

    // (c) emergency contacts of old runs
    const cutoff = new Date(now.getTime() - ARENA_LIMITS.retentionDays * 24 * 3600 * 1000);
    const oldRuns = await this.prisma.arenaRun.findMany({
      where: { completedAt: { lt: cutoff }, emergencyContact: { not: null } },
      select: { id: true, organizationId: true },
    });
    const runsByOrg = new Map<string, string[]>();
    for (const r of oldRuns) runsByOrg.set(r.organizationId, [...(runsByOrg.get(r.organizationId) ?? []), r.id]);
    for (const [organizationId, ids] of runsByOrg) {
      const r = await this.prisma.arenaRun.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { emergencyContact: null },
      });
      result.contactsCleared += r.count;
    }

    // Reaper: RUNNING runs far beyond the maximum wallclock are dead.
    result.runsReaped = await this.reap(now);
    result.ragRunsCleaned = await this.sweepRagDocs(now);
    return result;
  }

  /**
   * Planted RAG test documents of runs that are no longer running (crashed worker, redelivery, failed cleanup):
   * delete them after the fact, or report them by topic marker if that is not possible.
   */
  private async sweepRagDocs(now: Date): Promise<number> {
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const runs = await this.prisma.arenaRun.findMany({
      where: { status: { in: ['COMPLETED', 'ABORTED', 'FAILED'] }, completedAt: { gte: since }, artifacts: { not: Prisma.DbNull } },
      select: { id: true, organizationId: true, artifacts: true },
      take: 100,
    });
    let cleaned = 0;
    for (const r of runs) {
      if (!readRagDocs(r.artifacts).some(isOpenDoc)) continue;
      try {
        await this.ragCleanup.cleanupRun(r.id, r.organizationId);
        cleaned++;
      } catch (err) {
        this.log.error(`RAG cleanup sweep failed for a run: ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return cleaned;
  }

  private async reap(now: Date): Promise<number> {
    const limit = new Date(now.getTime() - MAX_RUN_WALLCLOCK_MS - REAPER_BUFFER_MS);
    const stalled = await this.prisma.arenaRun.findMany({
      where: { status: 'RUNNING', startedAt: { lt: limit } },
      select: { id: true, organizationId: true, scanId: true, aiTargetId: true, createdById: true },
    });
    let reaped = 0;
    for (const run of stalled) {
      const upd = await this.prisma.arenaRun.updateMany({
        where: { id: run.id, organizationId: run.organizationId, status: 'RUNNING' },
        data: { status: 'FAILED', abortedReason: 'stalled', completedAt: now },
      });
      if (upd.count === 0) continue; // finished meanwhile
      reaped++;
      try {
        // A dead worker cannot clean up after itself: remove planted RAG test documents now.
        await this.ragCleanup.cleanupRun(run.id, run.organizationId);
      } catch (err) {
        this.log.error(`RAG cleanup of a stalled run failed: ${err instanceof Error ? err.name : 'error'}`);
      }
      await this.prisma.scan.updateMany({
        where: { id: run.scanId, organizationId: run.organizationId },
        data: { status: 'FAILED', completedAt: now, currentActivity: null, errorMessage: 'AI Arena run failed: stalled' },
      });
      await this.redis.del(arenaRedisKeys.targetLock(run.aiTargetId));
      try {
        await this.audit.logStrict({
          action: 'arena.run.failed',
          userId: run.createdById,
          organizationId: run.organizationId,
          resource: 'arena_run',
          resourceId: run.id,
          metadata: { reason: 'stalled' },
        });
      } catch (err) {
        this.log.error(`audit write failed for stalled run: ${err instanceof Error ? err.message : String(err)}`);
      }
      await this.events.publish(run.organizationId, run.id, { type: 'run.status', status: 'FAILED', reason: 'stalled' });
      await this.events.publish(run.organizationId, run.id, { type: 'done', status: 'FAILED' });
    }
    return reaped;
  }
}
