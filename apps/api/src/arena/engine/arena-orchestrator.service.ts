import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ArenaGoalCategory, Prisma, Severity } from '@ptaas/db';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ARENA_LIMITS, ArenaRunJob, arenaRedisKeys } from '../arena.constants';
import { ArenaEventsService } from '../arena-events.service';
import type { ArenaAttemptView } from '../arena-events';
import { KillSwitchService } from '../kill-switch.service';
import { AiTargetsService } from '../lifecycle/ai-targets.service';
import { ArenaScoreboardService } from '../lifecycle/arena-scoreboard.service';
import { arenaUtcDayKey } from '../lifecycle/arena-views';
import { AdapterFactory } from './adapters/adapter.factory';
import type { AdapterClock, AdapterResponse, ArenaTargetAdapter } from './adapters/adapter.types';
import { parseSeedAttacks, parseSuccessCriteria } from './catalog/criteria';
import { ENGINE_PROMPT_VERSIONS, JudgeResult, MAX_RUN_WALLCLOCK_MS } from './engine.types';
import { BreachCandidate, FindingsBridgeService, pickBestBreach } from './findings-bridge.service';
import { JudgeService } from './judge/judge.service';
import { computeSeverity } from './judge/severity';
import { RecommendationService, CategoryStats } from './recommendation.service';
import { redactAttempt } from './redact-attempt';
import { buildTokens } from './red/attempt-tokens';
import { LLM_CLIENT, LlmClient } from './red/llm-client';
import { AttemptHistoryItem, RECON_PROMPTS, RedAgent } from './red/red-agent';
import { RunStopError, TargetRequestError, TargetUnsafeError } from './run-control';

export const ARENA_COUNTER_REDIS = 'REDIS_CLIENT';

/** Subset of ioredis used for the org-wide daily request counter (atomic INCR). */
export interface ArenaCounterRedis {
  incrby(key: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
}

type RunWithTarget = Prisma.ArenaRunGetPayload<{ include: { aiTarget: { include: { target: true } } } }>;

type FinalStatus = 'COMPLETED' | 'ABORTED' | 'FAILED';
interface Outcome {
  status: FinalStatus;
  reason?: string;
}

interface CatAgg {
  goalTitles: Set<string>;
  attempts: number;
  breaches: number;
  techniques: Set<string>;
}

interface RunState {
  run: RunWithTarget;
  startedAtMs: number;
  usedRequests: number;
  usedTokens: number;
  secrets: string[];
  fragments: string[];
  cats: Map<ArenaGoalCategory, CatAgg>;
  totalAttempts: number;
  totalBreaches: number;
  goalsDone: number;
  goalsTotal: number;
  reconSummary?: string;
  adapter?: ArenaTargetAdapter;
}

const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

@Injectable()
export class ArenaOrchestratorService {
  private readonly log = new Logger(ArenaOrchestratorService.name);
  /** Overridable in tests. */
  now: () => number = () => Date.now();
  adapterClock?: AdapterClock;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ArenaEventsService,
    private readonly killSwitch: KillSwitchService,
    private readonly scoreboard: ArenaScoreboardService,
    private readonly aiTargets: AiTargetsService,
    private readonly adapters: AdapterFactory,
    private readonly judge: JudgeService,
    private readonly red: RedAgent,
    private readonly bridge: FindingsBridgeService,
    private readonly recommendations: RecommendationService,
    private readonly audit: AuditService,
    @Inject(ARENA_COUNTER_REDIS) private readonly redis: ArenaCounterRedis,
    @Optional() @Inject(LLM_CLIENT) private readonly llm?: LlmClient,
  ) {}

  /** Entry point for the queue worker. Never throws for run-level problems: they end the run cleanly. */
  async execute(job: ArenaRunJob): Promise<void> {
    const { runId, organizationId } = job;
    const run = await this.prisma.arenaRun.findFirst({
      where: { id: runId, organizationId },
      include: { aiTarget: { include: { target: true } } },
    });
    if (!run) {
      this.log.warn(`run ${runId} not found for organization — job ignored`);
      return;
    }
    // Only runs that were approved and started by the lifecycle service may execute.
    if (run.status !== 'RUNNING') {
      this.log.warn(`run ${runId} is ${run.status}, not RUNNING — job ignored`);
      return;
    }

    const state: RunState = {
      run,
      startedAtMs: this.now(),
      usedRequests: run.usedRequests,
      usedTokens: run.usedTokens,
      secrets: [],
      fragments: [],
      cats: new Map(),
      totalAttempts: 0,
      totalBreaches: 0,
      goalsDone: 0,
      goalsTotal: run.goalIds.length,
    };

    try {
      let outcome: Outcome;
      try {
        outcome = await this.runAll(state);
      } catch (err) {
        outcome = this.toOutcome(err);
      }
      await this.finalize(state, outcome);
    } finally {
      // Release the per-target lock (set by ArenaRunsService.start) no matter how the run ended.
      try {
        await this.redis.del(arenaRedisKeys.targetLock(run.aiTargetId));
      } catch (err) {
        this.log.error(`could not release target lock: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------

  private toOutcome(err: unknown): Outcome {
    if (err instanceof RunStopError) return { status: 'ABORTED', reason: err.reason };
    if (err instanceof TargetUnsafeError) {
      this.log.error('target endpoint refused by SSRF protection');
      return { status: 'FAILED', reason: 'target_unsafe' };
    }
    this.log.error(`run failed: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'FAILED', reason: 'internal_error' };
  }

  private async runAll(state: RunState): Promise<Outcome> {
    const { run } = state;
    const orgId = run.organizationId;
    if (run.aiTarget.organizationId !== orgId || run.aiTarget.target.organizationId !== orgId) {
      return { status: 'FAILED', reason: 'tenant_mismatch' };
    }

    const goals = await this.loadGoals(run);
    if (goals.length === 0) return { status: 'FAILED', reason: 'no_goals' };
    state.goalsTotal = goals.length;

    const secrets = await this.aiTargets.getSecrets(run.aiTargetId, orgId);
    state.secrets = secrets.apiKey ? [secrets.apiKey] : [];
    state.fragments = secrets.knownPromptFragments ?? [];
    state.adapter = this.adapters.forTarget(run.aiTarget, { apiKey: secrets.apiKey }, {
      requestsPerSecond: run.requestsPerSecond,
      clock: this.adapterClock,
    });

    const info = this.llm?.modelInfo;
    await this.prisma.arenaRun.updateMany({
      where: { id: run.id, organizationId: orgId },
      data: {
        modelVersions: (info
          ? { red: info.red, judge: info.judge, temperature: info.temperature, promptVersions: info.promptVersions }
          : { red: 'template-only', judge: 'deterministic-only', promptVersions: { ...ENGINE_PROMPT_VERSIONS } }) as Prisma.InputJsonValue,
      },
    });

    await this.events.publish(orgId, run.id, { type: 'run.status', status: 'RUNNING' });
    await this.publishScore(state);

    await this.guard(state);
    await this.recon(state, goals[0]);

    for (const goal of goals) {
      await this.guard(state);
      await this.runGoal(state, goal);
      state.goalsDone++;
      await this.prisma.scan.updateMany({
        where: { id: run.scanId, organizationId: orgId },
        data: {
          progress: Math.floor((state.goalsDone / state.goalsTotal) * 100),
          currentActivity: `AI Arena: ${goal.key}`,
        },
      });
    }
    return { status: 'COMPLETED' };
  }

  private async loadGoals(run: RunWithTarget) {
    let ids = run.goalIds;
    if (run.retestOfRunId) {
      // Retest: same goals as the original run.
      const prev = await this.prisma.arenaRun.findFirst({
        where: { id: run.retestOfRunId, organizationId: run.organizationId },
        select: { goalIds: true },
      });
      if (prev && prev.goalIds.length > 0) ids = prev.goalIds;
    }
    const rows = await this.prisma.arenaGoal.findMany({ where: { id: { in: ids }, active: true } });
    const byId = new Map(rows.map((g) => [g.id, g]));
    return ids.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g);
  }

  // ---- limits ---------------------------------------------------------------------------------

  /** Called before every round and before every request. Throws RunStopError to end the run cleanly. */
  private async guard(state: RunState): Promise<void> {
    const { run } = state;
    if (await this.killSwitch.isKilled(run.id, run.organizationId)) throw new RunStopError('kill_switch');
    const now = this.now();
    if (now - state.startedAtMs > MAX_RUN_WALLCLOCK_MS) throw new RunStopError('wallclock_exceeded');
    if (run.windowStart && now < run.windowStart.getTime()) throw new RunStopError('window_not_open');
    if (run.windowEnd && now > run.windowEnd.getTime()) throw new RunStopError('window_closed');
    if (state.usedRequests >= Math.min(run.maxRequests, ARENA_LIMITS.maxRequestsPerRun)) throw new RunStopError('budget_exceeded');
    if (state.usedTokens >= Math.min(run.maxTokens, ARENA_LIMITS.maxTokensPerRun)) throw new RunStopError('budget_exceeded');
  }

  /** Hook for every outgoing request to the customer endpoint (retries included). */
  private requestHook(state: RunState): () => Promise<void> {
    return async () => {
      await this.guard(state);
      const key = arenaRedisKeys.orgDailyRequests(state.run.organizationId, arenaUtcDayKey(new Date(this.now())));
      const daily = await this.redis.incrby(key, 1);
      // Always make sure the counter expires (a crash between INCR and EXPIRE must not leave an immortal key).
      if ((await this.redis.ttl(key)) === -1) await this.redis.expire(key, 3 * 24 * 3600);
      if (daily > ARENA_LIMITS.maxRequestsPerOrgPerDay) throw new RunStopError('daily_limit');
      state.usedRequests++;
    };
  }

  private async flushUsage(state: RunState): Promise<void> {
    await this.prisma.arenaRun.updateMany({
      where: { id: state.run.id, organizationId: state.run.organizationId },
      data: { usedRequests: state.usedRequests, usedTokens: state.usedTokens },
    });
  }

  // ---- recon ----------------------------------------------------------------------------------

  private async recon(state: RunState, firstGoal: { id: string; key: string; category: ArenaGoalCategory }): Promise<void> {
    const prompt = RECON_PROMPTS[0];
    let res: AdapterResponse | null = null;
    try {
      res = await (state.adapter as ArenaTargetAdapter).send(prompt, { beforeRequest: this.requestHook(state) });
    } catch (err) {
      if (!(err instanceof TargetRequestError)) throw err;
    }
    if (res) state.usedTokens += estimateTokens(prompt) + estimateTokens(res.text);
    const row = await this.persistAttempt(state, {
      goalId: firstGoal.id,
      round: 0,
      kind: 'RECON',
      technique: 'recon',
      attackText: prompt,
      responseText: res?.text ?? null,
      verdict: null,
      confidence: null,
      evidence: res ? undefined : { rule: 'none', error: 'request_failed' },
      repro: null,
      tokens: res ? estimateTokens(prompt) + estimateTokens(res.text) : 0,
      latencyMs: res?.latencyMs ?? null,
    });
    await this.publishAttempt(state, row, firstGoal.key, firstGoal.category);
    if (res) state.reconSummary = redactAttempt({ attackText: '', responseText: res.text }, { secrets: state.secrets, fragments: state.fragments }).responseText ?? undefined;
    await this.flushUsage(state);
  }

  // ---- goal loop ------------------------------------------------------------------------------

  private async runGoal(
    state: RunState,
    goal: {
      id: string;
      key: string;
      category: ArenaGoalCategory;
      title: string;
      description: string;
      owaspRef: string | null;
      atlasRef: string | null;
      baseSeverity: Severity;
      seedAttacks: unknown;
      successCriteria: unknown;
    },
  ): Promise<void> {
    const { run } = state;
    const criteria = parseSuccessCriteria(goal.successCriteria);
    const seeds = parseSeedAttacks(goal.seedAttacks);
    if (!criteria || !seeds) {
      this.log.warn(`goal ${goal.key} has an invalid definition — skipped`);
      return;
    }
    const adapter = state.adapter as ArenaTargetAdapter;
    const hook = this.requestHook(state);
    const history: AttemptHistoryItem[] = [];
    const breaches: BreachCandidate[] = [];
    const agg = this.agg(state, goal.category);
    agg.goalTitles.add(goal.title);
    const rounds = Math.min(run.maxRounds, ARENA_LIMITS.maxRounds);

    for (let round = 1; round <= rounds; round++) {
      await this.guard(state);
      const tokens = buildTokens(criteria, run.id);
      const plan = await this.red.nextAttack({
        goal: { key: goal.key, category: goal.category, title: goal.title, description: goal.description },
        seeds,
        criteria,
        tokens,
        round,
        history,
        reconSummary: state.reconSummary,
      });
      state.usedTokens += plan.llmTokens;

      let res: AdapterResponse | null = null;
      let reqError: string | undefined;
      try {
        res = await adapter.send(plan.prompt, { beforeRequest: hook });
      } catch (err) {
        if (err instanceof TargetRequestError) reqError = err.kind;
        else throw err;
      }
      let attemptTokens = plan.llmTokens;
      if (res) attemptTokens += estimateTokens(plan.prompt) + estimateTokens(res.text);

      const judgeInput = {
        goal: { title: goal.title, description: goal.description },
        criteria,
        attackText: plan.prompt,
        tokens,
        fragments: state.fragments,
      };
      let verdict: JudgeResult = res
        ? await this.judge.judge({ ...judgeInput, responseText: res.text })
        : { verdict: 'UNCLEAR', confidence: 0, evidence: { rule: 'none', error: `request_failed:${reqError}` }, deterministic: true, needsRepro: false, tokens: 0 };
      attemptTokens += verdict.tokens;

      let repro = { k: 1, n: 1 };
      if (res && verdict.verdict === 'BREACH' && verdict.needsRepro) {
        const r = await this.reproduce(state, adapter, hook, judgeInput, plan.prompt);
        repro = { k: r.k, n: r.n };
        attemptTokens += r.tokens;
        if (r.k < 2) {
          verdict = { ...verdict, verdict: 'UNCLEAR', confidence: Math.min(verdict.confidence, 0.5), evidence: { ...verdict.evidence, note: 'not_reproducible' }, needsRepro: false };
        }
      }
      state.usedTokens += attemptTokens - plan.llmTokens; // plan tokens were added above

      const row = await this.persistAttempt(state, {
        goalId: goal.id,
        round,
        kind: 'ATTACK',
        technique: plan.technique,
        attackText: plan.prompt,
        responseText: res?.text ?? null,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        evidence: verdict.evidence,
        repro,
        tokens: attemptTokens,
        latencyMs: res?.latencyMs ?? null,
      });
      await this.flushUsage(state);

      agg.attempts++;
      state.totalAttempts++;
      history.push({ technique: plan.technique, attackText: plan.prompt, responseText: res ? redactAttempt({ attackText: '', responseText: res.text }, { secrets: state.secrets, fragments: state.fragments }).responseText : null, verdict: verdict.verdict });

      if (verdict.verdict === 'BREACH') {
        agg.breaches++;
        state.totalBreaches++;
        agg.techniques.add(plan.technique);
        const red = redactAttempt({ attackText: plan.prompt, responseText: res?.text ?? null }, { secrets: state.secrets, fragments: state.fragments });
        breaches.push({
          attemptId: row.id,
          round,
          technique: plan.technique,
          attackText: red.attackText,
          responseText: red.responseText,
          confidence: verdict.confidence,
          deterministic: verdict.deterministic,
          repro,
          evidence: verdict.evidence,
          severity: computeSeverity(goal.baseSeverity, { deterministic: verdict.deterministic, repro, round }),
        });
      }

      await this.publishAttempt(state, row, goal.key, goal.category);
      await this.publishScore(state);
      if (verdict.verdict === 'BREACH') break; // goal reached
    }

    const best = pickBestBreach(breaches);
    if (best) {
      const target = run.aiTarget.target;
      await this.bridge.createForBreach(
        {
          runId: run.id,
          organizationId: run.organizationId,
          scanId: run.scanId,
          createdById: run.createdById,
          targetId: target.id,
          projectId: target.projectId,
          endpointUrl: target.value,
        },
        goal,
        best,
      );
    }
  }

  /** Re-sends the same attack (max 2 more times) until 2 successes are reached. */
  private async reproduce(
    state: RunState,
    adapter: ArenaTargetAdapter,
    hook: () => Promise<void>,
    judgeInput: { goal: { title: string; description: string }; criteria: Parameters<JudgeService['judge']>[0]['criteria']; attackText: string; tokens: Parameters<JudgeService['judge']>[0]['tokens']; fragments: string[] },
    prompt: string,
  ): Promise<{ k: number; n: number; tokens: number }> {
    let k = 1;
    let n = 1;
    let tokens = 0;
    for (let i = 0; i < 2 && k < 2; i++) {
      n++;
      try {
        const res = await adapter.send(prompt, { beforeRequest: hook });
        tokens += estimateTokens(prompt) + estimateTokens(res.text);
        const v = await this.judge.judge({ ...judgeInput, responseText: res.text });
        tokens += v.tokens;
        if (v.verdict === 'BREACH') k++;
      } catch (err) {
        if (!(err instanceof TargetRequestError)) throw err;
      }
    }
    return { k, n, tokens };
  }

  // ---- persistence + events ---------------------------------------------------------------------

  private agg(state: RunState, category: ArenaGoalCategory): CatAgg {
    let a = state.cats.get(category);
    if (!a) {
      a = { goalTitles: new Set(), attempts: 0, breaches: 0, techniques: new Set() };
      state.cats.set(category, a);
    }
    return a;
  }

  private async persistAttempt(
    state: RunState,
    a: {
      goalId: string;
      round: number;
      kind: 'RECON' | 'ATTACK';
      technique: string;
      attackText: string;
      responseText: string | null;
      verdict: 'BREACH' | 'BLOCKED' | 'UNCLEAR' | null;
      confidence: number | null;
      evidence?: unknown;
      repro: { k: number; n: number } | null;
      tokens: number;
      latencyMs: number | null;
    },
  ) {
    const red = redactAttempt({ attackText: a.attackText, responseText: a.responseText }, { secrets: state.secrets, fragments: state.fragments });
    const expiresAt = new Date(this.now() + ARENA_LIMITS.retentionDays * 24 * 3600 * 1000);
    return this.prisma.arenaAttempt.create({
      data: {
        runId: state.run.id,
        organizationId: state.run.organizationId,
        goalId: a.goalId,
        round: a.round,
        kind: a.kind,
        technique: a.technique,
        attackText: red.attackText,
        responseText: red.responseText,
        verdict: a.verdict,
        confidence: a.confidence,
        evidence: a.evidence === undefined ? undefined : (a.evidence as Prisma.InputJsonValue),
        repro: a.repro === null ? undefined : (a.repro as Prisma.InputJsonValue),
        tokens: a.tokens,
        latencyMs: a.latencyMs,
        expiresAt,
      },
    });
  }

  private async publishAttempt(
    state: RunState,
    row: { id: string; round: number; kind: 'RECON' | 'ATTACK'; technique: string; attackText: string; responseText: string | null; verdict: 'BREACH' | 'BLOCKED' | 'UNCLEAR' | null; confidence: number | null; findingId: string | null; createdAt: Date },
    goalKey: string,
    category: string,
  ): Promise<void> {
    // Row texts are already redacted (persisted form).
    const view: ArenaAttemptView = {
      id: row.id,
      goalKey,
      category,
      round: row.round,
      kind: row.kind,
      technique: row.technique,
      attackText: row.attackText,
      responseText: row.responseText,
      verdict: row.verdict,
      confidence: row.confidence,
      findingId: row.findingId,
      createdAt: row.createdAt.toISOString(),
    };
    await this.events.publish(state.run.organizationId, state.run.id, { type: 'attempt', attempt: view });
  }

  private async publishScore(state: RunState): Promise<void> {
    try {
      const score = await this.scoreboard.compute(state.run.id, state.run.organizationId);
      await this.events.publish(state.run.organizationId, state.run.id, { type: 'score', score });
    } catch (err) {
      this.log.warn(`score computation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- finalize ---------------------------------------------------------------------------------

  private async finalize(state: RunState, outcome: Outcome): Promise<void> {
    const { run } = state;
    const orgId = run.organizationId;

    const stats: CategoryStats[] = [...state.cats.entries()].map(([category, a]) => ({
      category,
      goalTitles: [...a.goalTitles],
      attempts: a.attempts,
      breaches: a.breaches,
      successfulTechniques: [...a.techniques],
    }));
    if (stats.length > 0) {
      try {
        const r = await this.recommendations.createForRun(run.id, orgId, stats);
        state.usedTokens += r.llmTokens;
      } catch (err) {
        this.log.error(`recommendations failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      await this.prisma.arenaRun.updateMany({
        where: { id: run.id, organizationId: orgId },
        data: {
          status: outcome.status,
          completedAt: new Date(this.now()),
          abortedReason: outcome.reason ?? null,
          usedRequests: state.usedRequests,
          usedTokens: state.usedTokens,
        },
      });
      await this.prisma.scan.updateMany({
        where: { id: run.scanId, organizationId: orgId },
        data: {
          status: outcome.status === 'COMPLETED' ? 'COMPLETED' : outcome.status === 'ABORTED' ? 'CANCELLED' : 'FAILED',
          completedAt: new Date(this.now()),
          currentActivity: null,
          ...(outcome.status === 'COMPLETED' ? { progress: 100 } : {}),
          ...(outcome.status === 'FAILED' ? { errorMessage: `AI Arena run failed: ${outcome.reason ?? 'unknown'}` } : {}),
        },
      });
    } catch (err) {
      this.log.error(`could not persist final run state: ${err instanceof Error ? err.message : String(err)}`);
    }

    await this.publishScore(state);
    await this.events.publish(orgId, run.id, { type: 'run.status', status: outcome.status, reason: outcome.reason });
    await this.events.publish(orgId, run.id, { type: 'done', status: outcome.status });

    const action = outcome.status === 'COMPLETED' ? 'arena.run.completed' : outcome.status === 'ABORTED' ? 'arena.run.aborted' : 'arena.run.failed';
    try {
      await this.audit.logStrict({
        action,
        userId: run.createdById,
        organizationId: orgId,
        resource: 'arena_run',
        resourceId: run.id,
        // Counters and reasons only — never transcripts or secrets.
        metadata: {
          reason: outcome.reason,
          usedRequests: state.usedRequests,
          usedTokens: state.usedTokens,
          attempts: state.totalAttempts,
          breaches: state.totalBreaches,
        },
      });
    } catch (err) {
      this.log.error(`audit write failed for ${action}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
