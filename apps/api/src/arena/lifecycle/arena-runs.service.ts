import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { ArenaTargetKind, Prisma } from '@ptaas/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RedisService } from '../../redis/redis.service';
import { SsrfGuardService } from '../../ssrf/ssrf-guard.service';
import { isVerificationFresh } from '../../targets/verification-ttl';
import {
  ARENA_APPROVER_ROLES,
  ARENA_LIMITS,
  ARENA_OPERATOR_ROLES,
  isProviderHost,
  ARENA_RUN_QUEUE,
  arenaRedisKeys,
  type ArenaRunJob,
} from '../arena.constants';
import type { ArenaAttemptView } from '../arena-events';
import { ArenaEventsService } from '../arena-events.service';
import { KillSwitchService } from '../kill-switch.service';
import type { ApproveRunDto, CreateRunDto } from '../dto/arena.dto';
import { ArenaRoeService } from './arena-roe.service';
import { ArenaScoreboardService } from './arena-scoreboard.service';
import {
  arenaUtcDayKey,
  type ArenaActor,
  type GoalView,
  type OverviewView,
  type ArtifactsSummary,
  type RecommendationView,
  type RequestMeta,
  type RunDetailView,
  type RunSummary,
  type RunView,
} from './arena-views';

type RunRow = Prisma.ArenaRunGetPayload<{
  include: { aiTarget: { include: { target: true } }; roe: true };
}>;

const TERMINAL = ['COMPLETED', 'ABORTED', 'FAILED'] as const;
const PRE_RUN = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'] as const;
const ATTEMPTS_PAGE = 500;

/** Max. lifetime of the per-target run lock (the engine releases it when the run ends). */
export const TARGET_LOCK_TTL_SECONDS = 45 * 60;

export const RUN_DEFAULTS = { maxRounds: 5, maxRequests: 100, maxTokens: 200_000, requestsPerSecond: 1 } as const;

const clampInt = (value: number | undefined, fallback: number, max: number): number => {
  const v = Number.isFinite(value) ? Math.floor(value as number) : fallback;
  return Math.min(Math.max(v, 1), max);
};

/** Clamps requested budgets to the hard platform maxima (orgs cannot raise them). */
export function clampRunBudgets(input: {
  maxRounds?: number;
  maxRequests?: number;
  maxTokens?: number;
  requestsPerSecond?: number;
}): { maxRounds: number; maxRequests: number; maxTokens: number; requestsPerSecond: number } {
  const rps = Number.isFinite(input.requestsPerSecond) ? (input.requestsPerSecond as number) : RUN_DEFAULTS.requestsPerSecond;
  return {
    maxRounds: clampInt(input.maxRounds, RUN_DEFAULTS.maxRounds, ARENA_LIMITS.maxRounds),
    maxRequests: clampInt(input.maxRequests, RUN_DEFAULTS.maxRequests, ARENA_LIMITS.maxRequestsPerRun),
    maxTokens: clampInt(input.maxTokens, RUN_DEFAULTS.maxTokens, ARENA_LIMITS.maxTokensPerRun),
    requestsPerSecond: Math.min(Math.max(rps, 0.01), ARENA_LIMITS.maxRequestsPerSecond),
  };
}

@Injectable()
export class ArenaRunsService {
  private readonly log = new Logger(ArenaRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly ssrfGuard: SsrfGuardService,
    private readonly killSwitch: KillSwitchService,
    private readonly roe: ArenaRoeService,
    private readonly scoreboard: ArenaScoreboardService,
    private readonly events: ArenaEventsService,
    @InjectQueue(ARENA_RUN_QUEUE) private readonly queue: Queue<ArenaRunJob>,
    private readonly config: ConfigService,
  ) {}

  // ── Create / list / get ──────────────────────────────

  async create(dto: CreateRunDto, actor: ArenaActor, meta: RequestMeta = {}): Promise<RunView> {
    const org = actor.organizationId;
    const aiTarget = await this.prisma.aiTarget.findFirst({
      where: { id: dto.aiTargetId, organizationId: org },
      include: { target: true },
    });
    if (!aiTarget) throw new NotFoundException('AI target not found');

    const goalIds = [...new Set(dto.goalIds)];
    if (goalIds.length === 0) throw new BadRequestException('At least one goal is required');
    const goals = await this.prisma.arenaGoal.findMany({
      where: { id: { in: goalIds }, active: true },
      select: { id: true, kinds: true },
    });
    if (goals.length !== goalIds.length) throw new BadRequestException('Unknown or inactive goal in goalIds');
    if (goals.some((g) => !(g.kinds ?? []).includes(aiTarget.kind))) {
      throw new BadRequestException(`A selected goal does not apply to targets of kind ${aiTarget.kind}`);
    }

    if (dto.retestOfRunId) {
      const prev = await this.prisma.arenaRun.findFirst({
        where: { id: dto.retestOfRunId, organizationId: org },
        select: { id: true },
      });
      if (!prev) throw new NotFoundException('Run to retest not found');
    }

    const windowStart = dto.windowStart ? new Date(dto.windowStart) : null;
    const windowEnd = dto.windowEnd ? new Date(dto.windowEnd) : null;
    if (windowStart && windowEnd && windowEnd <= windowStart) {
      throw new BadRequestException('windowEnd must be after windowStart');
    }

    const budgets = clampRunBudgets(dto);
    const run = await this.prisma.arenaRun.create({
      data: {
        status: 'DRAFT',
        goalIds,
        ...budgets,
        windowStart,
        windowEnd,
        ...(dto.retestOfRunId ? { retestOf: { connect: { id: dto.retestOfRunId } } } : {}),
        organization: { connect: { id: org } },
        aiTarget: { connect: { id: aiTarget.id } },
        createdBy: { connect: { id: actor.userId } },
        scan: {
          create: {
            type: 'AI_ARENA',
            status: 'QUEUED',
            target: { connect: { id: aiTarget.targetId } },
            project: { connect: { id: aiTarget.target.projectId } },
            organization: { connect: { id: org } },
            createdBy: { connect: { id: actor.userId } },
          },
        },
      },
      include: { aiTarget: { include: { target: true } }, roe: true },
    });

    await this.audit.log({
      action: 'arena.run.created',
      userId: actor.userId,
      organizationId: org,
      resource: 'arena_run',
      resourceId: run.id,
      metadata: { goalCount: goalIds.length, retest: Boolean(dto.retestOfRunId), ...budgets },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.toRunView(run, null, actor.role);
  }

  async list(organizationId: string, aiTargetId?: string): Promise<RunSummary[]> {
    const runs = await this.prisma.arenaRun.findMany({
      where: { organizationId, ...(aiTargetId ? { aiTargetId } : {}) },
      include: { aiTarget: { include: { target: true } }, roe: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const rates = await this.breachRates(
      runs.map((r) => r.id),
      organizationId,
    );
    return runs.map((r) => this.toSummary(r, rates.get(r.id) ?? null));
  }

  async getView(runId: string, organizationId: string, role?: string): Promise<RunView> {
    const run = await this.load(runId, organizationId);
    const rates = await this.breachRates([run.id], organizationId);
    return this.toRunView(run, rates.get(run.id) ?? null, role);
  }

  /** Current status only (cheap, org-scoped); used by the SSE endpoint. */
  async statusOf(runId: string, organizationId: string): Promise<string> {
    const run = await this.prisma.arenaRun.findFirst({ where: { id: runId, organizationId }, select: { status: true } });
    if (!run) throw new NotFoundException('Run not found');
    return run.status;
  }

  async getDetail(runId: string, organizationId: string, role?: string): Promise<RunDetailView> {
    const run = await this.load(runId, organizationId);
    const [score, recs, goals] = await Promise.all([
      this.scoreboard.compute(runId, organizationId),
      this.prisma.arenaRecommendation.findMany({
        where: { runId, organizationId },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.arenaGoal.findMany({ where: { id: { in: run.goalIds } }, orderBy: [{ category: 'asc' }, { key: 'asc' }] }),
    ]);
    const recommendations: RecommendationView[] = recs.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      text: r.text,
      priority: r.priority,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      ...this.toRunView(run, score.totals.attempts > 0 ? score.totals.breachRate : null, role),
      score,
      recommendations,
      goals: goals.map(toGoalView),
    };
  }

  async attempts(
    runId: string,
    organizationId: string,
    query: { goalId?: string; after?: string } = {},
  ): Promise<ArenaAttemptView[]> {
    await this.load(runId, organizationId);
    const rows = await this.prisma.arenaAttempt.findMany({
      where: {
        runId,
        organizationId,
        expiresAt: { gt: new Date() },
        ...(query.goalId ? { goalId: query.goalId } : {}),
        ...(query.after ? { createdAt: { gt: new Date(query.after) } } : {}),
      },
      include: { goal: { select: { key: true, category: true } } },
      orderBy: { createdAt: 'asc' },
      take: ATTEMPTS_PAGE,
    });
    return rows.map((a) => ({
      id: a.id,
      goalKey: a.goal.key,
      category: a.goal.category,
      round: a.round,
      kind: a.kind,
      technique: a.technique,
      attackText: a.attackText,
      responseText: a.responseText,
      verdict: a.verdict,
      confidence: a.confidence,
      findingId: a.findingId,
      ...toolCallsOf(a.evidence),
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async catalog(kind?: string): Promise<GoalView[]> {
    const goals = await this.prisma.arenaGoal.findMany({
      where: { active: true, ...(kind ? { kinds: { has: kind as ArenaTargetKind } } : {}) },
      select: {
        id: true,
        key: true,
        category: true,
        title: true,
        description: true,
        owaspRef: true,
        atlasRef: true,
        baseSeverity: true,
        kinds: true,
      },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return goals.map(toGoalView);
  }

  async overview(organizationId: string): Promise<OverviewView> {
    const [targets, total, running, awaitingApproval, recent] = await Promise.all([
      this.prisma.aiTarget.count({ where: { organizationId } }),
      this.prisma.arenaRun.count({ where: { organizationId } }),
      this.prisma.arenaRun.count({ where: { organizationId, status: 'RUNNING' } }),
      this.prisma.arenaRun.count({ where: { organizationId, status: 'AWAITING_APPROVAL' } }),
      this.prisma.arenaRun.findMany({
        where: { organizationId },
        include: { aiTarget: { include: { target: true } }, roe: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const rates = await this.breachRates(
      recent.map((r) => r.id),
      organizationId,
    );
    const summaries = recent.map((r) => this.toSummary(r, rates.get(r.id) ?? null));
    return {
      targets,
      runs: { total, running, awaitingApproval },
      lastRun: summaries[0] ?? null,
      breachRate: summaries.find((s) => s.breachRate !== null)?.breachRate ?? null,
    };
  }

  // ── State transitions ────────────────────────────────

  /** DRAFT → AWAITING_APPROVAL, with an early preflight so problems surface before approval. */
  async submit(runId: string, actor: ArenaActor, meta: RequestMeta = {}): Promise<RunView> {
    const run = await this.load(runId, actor.organizationId);
    if (run.status !== 'DRAFT') throw this.conflict('RUN_NOT_DRAFT', `Run is ${run.status}, only DRAFT runs can be submitted`);

    await this.checkTarget(run);
    this.checkBudgets(run);
    if (run.windowEnd && run.windowEnd.getTime() < Date.now()) {
      throw this.conflict('WINDOW_CLOSED', 'The time window has already ended');
    }

    const res = await this.prisma.arenaRun.updateMany({
      where: { id: runId, organizationId: actor.organizationId, status: 'DRAFT' },
      data: { status: 'AWAITING_APPROVAL' },
    });
    if (res.count === 0) throw this.conflict('RUN_NOT_DRAFT', 'Run state changed concurrently');

    await this.audit.log({
      action: 'arena.run.submitted',
      userId: actor.userId,
      organizationId: actor.organizationId,
      resource: 'arena_run',
      resourceId: runId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.getView(runId, actor.organizationId, actor.role);
  }

  /** AWAITING_APPROVAL → APPROVED. Admin only; records consent + RoE version. */
  async approve(runId: string, dto: ApproveRunDto, actor: ArenaActor, meta: RequestMeta = {}): Promise<RunView> {
    if (!(ARENA_APPROVER_ROLES as readonly string[]).includes(actor.role)) {
      throw new ForbiddenException('Only an organization admin can approve a run');
    }
    await this.assertCurrentRole(actor, ARENA_APPROVER_ROLES);
    const org = actor.organizationId;
    const run = await this.load(runId, org);
    if (run.status !== 'AWAITING_APPROVAL') {
      throw this.conflict('RUN_NOT_AWAITING_APPROVAL', `Run is ${run.status}, not awaiting approval`);
    }

    const c: Record<string, boolean | undefined> = { ...(dto.confirmations ?? {}) };
    const missing = requiredConfirmations(run.aiTarget.kind).filter((k) => c[k] !== true);
    if (missing.length > 0) {
      throw new BadRequestException(`All confirmations must be accepted (missing: ${missing.join(', ')})`);
    }
    const contact = dto.emergencyContact?.trim();
    if (!contact) throw new BadRequestException('An emergency contact is required');

    const roe = await this.roe.getCurrent();
    if (dto.roeVersion !== roe.version) {
      throw this.conflict('ROE_OUTDATED', `Rules of engagement changed: current version is ${roe.version}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
    const approvedByName = user?.name ?? 'unknown';

    // Claim first (conditional on the expected status), audit second; a failing audit rolls the claim back.
    const res = await this.prisma.arenaRun.updateMany({
      where: { id: runId, organizationId: org, status: 'AWAITING_APPROVAL' },
      data: {
        status: 'APPROVED',
        roeId: roe.id,
        emergencyContact: contact,
        approvedById: actor.userId,
        approvedByName,
        approvedAt: new Date(),
      },
    });
    if (res.count === 0) throw this.conflict('RUN_NOT_AWAITING_APPROVAL', 'Run state changed concurrently');

    try {
      await this.audit.logStrict({
        action: 'arena.run.approved',
        userId: actor.userId,
        organizationId: org,
        resource: 'arena_run',
        resourceId: runId,
        metadata: { roeHash: roe.contentHash, roeVersion: roe.version },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    } catch (err) {
      this.log.error(`audit write failed, approval of run ${runId} rolled back: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.arenaRun.updateMany({
        where: { id: runId, organizationId: org, status: 'APPROVED', approvedById: actor.userId },
        data: {
          status: 'AWAITING_APPROVAL',
          roeId: null,
          emergencyContact: null,
          approvedById: null,
          approvedByName: null,
          approvedAt: null,
        },
      });
      throw this.conflict('AUDIT_FAILED', 'The audit record could not be written — the run was not approved');
    }
    return this.getView(runId, org, actor.role);
  }

  /** APPROVED → RUNNING after the preflight (contract section 4). Every check fails with a 409 + code. */
  async start(runId: string, organizationId: string, userId: string, meta: RequestMeta = {}): Promise<void> {
    const run = await this.load(runId, organizationId);

    // 1. status + RoE version
    if (run.status !== 'APPROVED') {
      throw this.conflict('RUN_NOT_APPROVED', `Run is ${run.status}, it must be APPROVED to start`);
    }
    const roe = await this.roe.getCurrent();
    if (!run.roeId || run.roeId !== roe.id) {
      throw this.conflict('ROE_OUTDATED', 'The rules of engagement changed since approval — a new approval is required');
    }

    // 2 + 3. verified & fresh target, provider denylist, SSRF
    await this.checkTarget(run);
    await this.checkHostSafe(run);
    await this.checkKind(run);

    // 4. time window
    const now = new Date();
    if (run.windowStart && now < run.windowStart) throw this.conflict('WINDOW_NOT_OPEN', 'The time window has not started yet');
    if (run.windowEnd && now > run.windowEnd) throw this.conflict('WINDOW_CLOSED', 'The time window has ended');

    // 5. budgets + org daily limit
    this.checkBudgets(run);
    const usedToday = Number((await this.redis.get(arenaRedisKeys.orgDailyRequests(organizationId, arenaUtcDayKey(now)))) ?? 0);
    const used = Number.isFinite(usedToday) ? usedToday : 0;
    if (used + run.maxRequests > ARENA_LIMITS.maxRequestsPerOrgPerDay) {
      throw this.conflict(
        'DAILY_LIMIT',
        `Daily request limit of the organization would be exceeded (${used} used, limit ${ARENA_LIMITS.maxRequestsPerOrgPerDay})`,
      );
    }

    // 6. kill switch (run / organization / global) + single run per target
    if (await this.killSwitch.isKilled(runId, organizationId)) throw this.conflict('KILL_SWITCH', 'The kill switch is active');
    const busy = await this.prisma.arenaRun.findFirst({
      where: { aiTargetId: run.aiTargetId, organizationId, status: 'RUNNING', id: { not: runId } },
      select: { id: true },
    });
    if (busy) throw this.conflict('TARGET_BUSY', 'Another run is already running against this target');

    // Atomic per-target lock (the engine releases it when the run ends).
    const lockKey = arenaRedisKeys.targetLock(run.aiTargetId);
    const locked = await this.redis.setIfAbsent(lockKey, runId, TARGET_LOCK_TTL_SECONDS);
    if (!locked) throw this.conflict('TARGET_BUSY', 'Another run is starting or running against this target');

    let claimed = false;
    const startedAt = new Date();
    const revertClaim = async (): Promise<void> => {
      await this.prisma.arenaRun.updateMany({
        where: { id: runId, organizationId, status: 'RUNNING' },
        data: { status: 'APPROVED', startedAt: null },
      });
    };
    try {
      // 7. claim first (conditional), then the audit record — without it, nothing starts
      const claim = await this.prisma.arenaRun.updateMany({
        where: { id: runId, organizationId, status: 'APPROVED' },
        data: { status: 'RUNNING', startedAt },
      });
      if (claim.count === 0) throw this.conflict('RUN_NOT_APPROVED', 'Run state changed concurrently');
      claimed = true;

      try {
        await this.audit.logStrict({
          action: 'arena.run.started',
          userId,
          organizationId,
          resource: 'arena_run',
          resourceId: runId,
          metadata: {
            aiTargetId: run.aiTargetId,
            goalCount: run.goalIds.length,
            maxRounds: run.maxRounds,
            maxRequests: run.maxRequests,
            roeVersion: roe.version,
          },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        });
      } catch (err) {
        this.log.error(`audit write failed, run ${runId} not started: ${err instanceof Error ? err.message : String(err)}`);
        throw this.conflict('AUDIT_FAILED', 'The audit record could not be written — the run was not started');
      }

      await this.prisma.scan.update({ where: { id: run.scanId }, data: { status: 'RUNNING', startedAt } });
      try {
        await this.queue.add(ARENA_RUN_QUEUE, { runId, organizationId }, { jobId: `arena-run-${runId}` });
      } catch (err) {
        this.log.error(`queue add failed for run ${runId}: ${err instanceof Error ? err.message : String(err)}`);
        await this.prisma.scan.update({ where: { id: run.scanId }, data: { status: 'QUEUED', startedAt: null } });
        throw new ServiceUnavailableException('The run could not be queued');
      }
    } catch (err) {
      if (claimed) await revertClaim();
      await this.redis.del(lockKey);
      throw err;
    }
    await this.events.publish(organizationId, runId, { type: 'run.status', status: 'RUNNING' });
  }

  /**
   * Emergency stop for one run. The kill switch is set FIRST so a failing audit write can never
   * prevent the abort. A run that has not started yet is aborted immediately; a running run is
   * finalized by the engine (it checks the kill switch before every round and request).
   */
  async abort(runId: string, actor: ArenaActor, reason?: string, meta: RequestMeta = {}): Promise<RunView> {
    const org = actor.organizationId;
    const run = await this.load(runId, org);
    if ((TERMINAL as readonly string[]).includes(run.status)) return this.getView(runId, org, actor.role);

    const abortedReason = reason?.trim() || 'user_requested';
    await this.killSwitch.killRun(runId);

    let finalizedHere = false;
    if ((PRE_RUN as readonly string[]).includes(run.status)) {
      const completedAt = new Date();
      const res = await this.prisma.arenaRun.updateMany({
        where: { id: runId, organizationId: org, status: { in: [...PRE_RUN] } },
        data: { status: 'ABORTED', abortedReason, completedAt },
      });
      if (res.count > 0) {
        finalizedHere = true;
        await this.prisma.scan.update({ where: { id: run.scanId }, data: { status: 'CANCELLED', completedAt } });
      }
    }
    if (!finalizedHere) {
      await this.prisma.arenaRun.updateMany({
        where: { id: runId, organizationId: org, status: 'RUNNING' },
        data: { abortedReason },
      });
    }

    await this.audit.logStrict({
      action: 'arena.run.abort_requested',
      userId: actor.userId,
      organizationId: org,
      resource: 'arena_run',
      resourceId: runId,
      metadata: { reason: abortedReason, previousStatus: run.status },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    if (finalizedHere) {
      await this.events.publish(org, runId, { type: 'run.status', status: 'ABORTED', reason: abortedReason });
      await this.events.publish(org, runId, { type: 'done', status: 'ABORTED' });
    }
    return this.getView(runId, org, actor.role);
  }

  /** New DRAFT run with the same goals/budgets, linked via retestOfRunId. */
  async retest(runId: string, actor: ArenaActor, meta: RequestMeta = {}): Promise<RunView> {
    const run = await this.load(runId, actor.organizationId);
    if (!(TERMINAL as readonly string[]).includes(run.status)) {
      throw this.conflict('RUN_NOT_FINISHED', 'Only finished runs can be retested');
    }
    // The old time window is stale by definition and is not copied.
    return this.create(
      {
        aiTargetId: run.aiTargetId,
        goalIds: run.goalIds,
        maxRounds: run.maxRounds,
        maxRequests: run.maxRequests,
        maxTokens: run.maxTokens,
        requestsPerSecond: run.requestsPerSecond,
        retestOfRunId: run.id,
      },
      actor,
      meta,
    );
  }

  /** True if the actor is listed in ARENA_PLATFORM_ADMINS (user ids or e-mails). Empty/unset: nobody. */
  isPlatformAdmin(actor: ArenaActor): boolean {
    const raw = this.config.get<string>('ARENA_PLATFORM_ADMINS') ?? '';
    const allowed = raw
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 0);
    if (allowed.length === 0) return false;
    return allowed.includes(actor.userId.toLowerCase()) || (!!actor.email && allowed.includes(actor.email.toLowerCase()));
  }

  /**
   * Platform-wide kill switch — platform operators only (never an ordinary org admin).
   * Turning it ON never depends on the audit write; turning it OFF does.
   */
  async setGlobalKill(on: boolean, actor: ArenaActor, meta: RequestMeta = {}): Promise<{ on: boolean }> {
    if (!this.isPlatformAdmin(actor)) throw new ForbiddenException('Only platform operators can use the global kill switch');
    await this.assertCurrentRole(actor, ARENA_APPROVER_ROLES);
    const event = {
      action: 'arena.kill_switch.global',
      userId: actor.userId,
      organizationId: actor.organizationId,
      resource: 'arena',
      metadata: { on },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    };
    if (on) {
      await this.killSwitch.setGlobal(true);
      await this.audit.logStrict(event);
    } else {
      await this.audit.logStrict(event);
      await this.killSwitch.setGlobal(false);
    }
    return { on };
  }

  /** Kill switch for the actor's own organization (org admin). Same ordering policy as the global one. */
  async setOrgKill(on: boolean, actor: ArenaActor, meta: RequestMeta = {}): Promise<{ on: boolean }> {
    await this.assertCurrentRole(actor, ARENA_APPROVER_ROLES);
    const org = actor.organizationId;
    const event = {
      action: 'arena.kill_switch.org',
      userId: actor.userId,
      organizationId: org,
      resource: 'arena',
      metadata: { on },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    };
    if (on) {
      await this.killSwitch.setOrg(org, true);
      await this.audit.logStrict(event);
    } else {
      await this.audit.logStrict(event);
      await this.killSwitch.setOrg(org, false);
    }
    return { on };
  }

  /** Re-reads the role from the database: a demoted/removed member loses access immediately. */
  private async assertCurrentRole(actor: ArenaActor, allowed: readonly string[]): Promise<void> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: { role: true },
    });
    if (!member || !allowed.includes(member.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  // ── Preflight building blocks ────────────────────────

  private async checkTarget(run: RunRow): Promise<void> {
    const t = run.aiTarget.target;
    if (t.verificationStatus !== 'VERIFIED') {
      throw this.conflict('VERIFICATION_REQUIRED', 'The endpoint is not verified');
    }
    if (!isVerificationFresh(t.verifiedAt)) {
      throw this.conflict(
        'VERIFICATION_EXPIRED',
        `The verification is older than ${ARENA_LIMITS.verificationTtlDays} days — verify the endpoint again`,
      );
    }
    if (isProviderHost(hostOf(t.value))) {
      throw this.conflict('PROVIDER_HOST', 'Model-provider hosts cannot be tested');
    }
  }

  /** Stage 2-4 preconditions per target kind (each with its own error code). */
  private async checkKind(run: RunRow): Promise<void> {
    const t = run.aiTarget;
    if (t.kind === 'AGENT') {
      if (t.environment !== 'STAGING') {
        throw this.conflict('AGENT_NOT_STAGING', 'Agent targets may only be tested in a STAGING environment');
      }
      if (!t.stagingConfirmedAt || !t.sandboxAttestedAt) {
        throw this.conflict('ATTESTATION_MISSING', 'Staging and sandbox attestations are required for agent targets');
      }
    } else if (t.kind === 'RAG') {
      const cfg = asObject(t.ragConfig);
      if (cfg?.mode === 'AUTO') {
        if (!asObject(cfg.ingest)) throw this.conflict('RAG_NOT_CONFIGURED', 'RAG mode AUTO requires an ingest configuration');
      } else if (cfg?.mode === 'MANUAL') {
        if (!t.ragDocsPlacedAt) throw this.conflict('RAG_DOCS_NOT_PLACED', 'Confirm that the test documents were placed (RAG mode MANUAL)');
      } else {
        throw this.conflict('RAG_NOT_CONFIGURED', 'The RAG configuration is missing');
      }
    } else if (t.kind === 'WIDGET') {
      const cfg = asObject(t.widgetConfig);
      const pageUrl = typeof cfg?.pageUrl === 'string' ? cfg.pageUrl : '';
      let pageHost = '';
      try {
        pageHost = new URL(pageUrl).hostname.toLowerCase();
      } catch {
        /* handled below */
      }
      if (!pageHost || pageHost !== hostOf(t.target.value).toLowerCase()) {
        throw this.conflict('WIDGET_HOST_MISMATCH', 'The widget page host must equal the verified endpoint host');
      }
      try {
        await this.ssrfGuard.resolveSafe(pageHost);
      } catch (err) {
        throw this.conflict('HOST_UNSAFE', err instanceof Error ? err.message : 'Widget page host is not allowed');
      }
    }
  }

  private async checkHostSafe(run: RunRow): Promise<void> {
    try {
      await this.ssrfGuard.resolveSafe(hostOf(run.aiTarget.target.value));
    } catch (err) {
      throw this.conflict('HOST_UNSAFE', err instanceof Error ? err.message : 'Endpoint host is not allowed');
    }
  }

  private checkBudgets(run: RunRow): void {
    if (
      run.maxRounds > ARENA_LIMITS.maxRounds ||
      run.maxRequests > ARENA_LIMITS.maxRequestsPerRun ||
      run.maxTokens > ARENA_LIMITS.maxTokensPerRun ||
      run.requestsPerSecond > ARENA_LIMITS.maxRequestsPerSecond
    ) {
      throw this.conflict('BUDGET_EXCEEDS_LIMITS', 'The run budget exceeds the platform limits');
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ statusCode: 409, error: 'Conflict', code, message });
  }

  private async load(runId: string, organizationId: string): Promise<RunRow> {
    const run = await this.prisma.arenaRun.findFirst({
      where: { id: runId, organizationId },
      include: { aiTarget: { include: { target: true } }, roe: true },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  /** breachRate per run = breaches / judged ATTACK attempts; runs without verdicts are absent. */
  private async breachRates(runIds: string[], organizationId: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (runIds.length === 0) return out;
    const groups = await this.prisma.arenaAttempt.groupBy({
      by: ['runId', 'verdict'],
      where: { runId: { in: runIds }, organizationId, kind: 'ATTACK', verdict: { not: null } },
      _count: { _all: true },
    });
    const totals = new Map<string, { all: number; breach: number }>();
    for (const g of groups) {
      const t = totals.get(g.runId) ?? { all: 0, breach: 0 };
      t.all += g._count._all;
      if (g.verdict === 'BREACH') t.breach += g._count._all;
      totals.set(g.runId, t);
    }
    for (const [id, t] of totals) out.set(id, t.all > 0 ? Math.round((t.breach / t.all) * 10_000) / 10_000 : 0);
    return out;
  }

  private toSummary(run: RunRow, breachRate: number | null): RunSummary {
    return {
      id: run.id,
      aiTargetId: run.aiTargetId,
      targetName: run.aiTarget.name,
      targetKind: run.aiTarget.kind,
      status: run.status,
      goalCount: run.goalIds.length,
      breachRate,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }

  /** The emergency contact is personal data: only operators see it (fail closed without a role). */
  private toRunView(run: RunRow, breachRate: number | null, role?: string): RunView {
    const canSeeContact = role !== undefined && (ARENA_OPERATOR_ROLES as readonly string[]).includes(role);
    return {
      ...this.toSummary(run, breachRate),
      goalIds: run.goalIds,
      maxRounds: run.maxRounds,
      maxRequests: run.maxRequests,
      maxTokens: run.maxTokens,
      requestsPerSecond: run.requestsPerSecond,
      windowStart: run.windowStart?.toISOString() ?? null,
      windowEnd: run.windowEnd?.toISOString() ?? null,
      usedRequests: run.usedRequests,
      usedTokens: run.usedTokens,
      roeVersion: run.roe?.version ?? null,
      approvedByName: run.approvedByName,
      approvedAt: run.approvedAt?.toISOString() ?? null,
      emergencyContact: canSeeContact ? run.emergencyContact : null,
      retestOfRunId: run.retestOfRunId,
      abortedReason: run.abortedReason,
      scanId: run.scanId,
      artifactsSummary: summarizeArtifacts(run.artifacts),
    };
  }
}

function toGoalView(g: {
  id: string;
  key: string;
  category: string;
  title: string;
  description: string;
  owaspRef: string | null;
  atlasRef: string | null;
  baseSeverity: string;
  kinds?: string[];
}): GoalView {
  return {
    id: g.id,
    key: g.key,
    category: g.category,
    title: g.title,
    description: g.description,
    owaspRef: g.owaspRef,
    atlasRef: g.atlasRef,
    baseSeverity: g.baseSeverity,
    kinds: g.kinds ?? [],
  };
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

/** Mandatory approval confirmations per target kind. */
export function requiredConfirmations(kind: string): string[] {
  const base = ['noProduction', 'noSideEffects', 'providerTosAccepted'];
  if (kind === 'AGENT') return [...base, 'stagingOnly', 'toolsSandboxed'];
  if (kind === 'RAG') return [...base, 'noTools', 'testDocumentsMayBeIndexedAndRemoved'];
  return [...base, 'noTools'];
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Counts only — never document contents or secrets. */
function summarizeArtifacts(raw: unknown): ArtifactsSummary | null {
  const a = asObject(raw);
  if (!a) return null;
  const out: ArtifactsSummary = {};
  const rag = asObject(a.rag);
  if (rag && Array.isArray(rag.docs)) {
    const docs = rag.docs.map(asObject).filter((d): d is Record<string, unknown> => d !== null);
    out.rag = {
      planted: docs.length,
      deleted: docs.filter((d) => Boolean(d.deletedAt)).length,
      cleanupFailed: docs.filter((d) => Boolean(d.deleteError)).length,
    };
  }
  const agent = asObject(a.agent);
  if (agent && typeof agent.toolCallsObserved === 'number') out.agent = { toolCallsObserved: agent.toolCallsObserved };
  return out.rag || out.agent ? out : null;
}

/** Tool calls recorded by the engine (already redacted); defensively re-bounded here. */
function toolCallsOf(evidence: unknown): { toolCalls?: { name: string; arguments: string }[] } {
  const calls = asObject(evidence)?.toolCalls;
  if (!Array.isArray(calls)) return {};
  const list = calls
    .map(asObject)
    .filter((c): c is Record<string, unknown> => c !== null && typeof c.name === 'string')
    .slice(0, ARENA_LIMITS.maxToolCallsRecorded)
    .map((c) => ({
      name: String(c.name).slice(0, 200),
      arguments: (typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? '')).slice(0, 1000),
    }));
  return { toolCalls: list };
}
