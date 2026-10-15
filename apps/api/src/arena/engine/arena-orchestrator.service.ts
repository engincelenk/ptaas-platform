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
import { buildAuthHeaders } from './adapters/auth-headers';
import { parseAgentConfig, AgentConfig } from './agent/agent-config';
import { extractToolCalls } from './agent/tool-trace';
import type { AdapterClock, AdapterResponse, ArenaTargetAdapter } from './adapters/adapter.types';
import { parseSeedAttacks, parseSuccessCriteria } from './catalog/criteria';
import { ENGINE_PROMPT_VERSIONS, JudgeResult, MAX_RUN_WALLCLOCK_MS, ObservedToolCall } from './engine.types';
import { BreachCandidate, FindingsBridgeService, pickBestBreach } from './findings-bridge.service';
import { JudgeService } from './judge/judge.service';
import { computeSeverity } from './judge/severity';
import { RecommendationService, CategoryStats } from './recommendation.service';
import { RagConfig, parseRagConfig } from './rag/rag-config';
import { RagArtifactDoc, hasProgress, toArtifactDoc } from './rag/rag-artifacts';
import { RagCleanupService, deleteErrorCode } from './rag/rag-cleanup.service';
import { RagDoc, RagHttpContext, RagOperationError, RagPlanter } from './rag/rag-planter';
import { redactAttempt, redactText } from './redact-attempt';
import { buildTokens } from './red/attempt-tokens';
import { LLM_CLIENT, LlmClient } from './red/llm-client';
import { AttemptHistoryItem, RECON_PROMPTS, RedAgent } from './red/red-agent';
import { RunStopError, TargetRequestError, TargetUnsafeError } from './run-control';
import { BrowserUnavailableError } from './widget/widget.types';

export const ARENA_COUNTER_REDIS = 'REDIS_CLIENT';

/** Subset of ioredis used for the org-wide daily request counter (atomic INCR). */
export interface ArenaCounterRedis {
  incrby(key: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<string | null>;
}

/** Per-run worker marker: tells a redelivered job whether a live worker still owns the run. */
const WORKER_KEY = (runId: string): string => `arena:run-worker:${runId}`;
const WORKER_TTL_SECONDS = 120;

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
  kind: 'CHAT' | 'RAG' | 'AGENT' | 'WIDGET';
  agent?: AgentConfig;
  rag?: RagState;
  artifacts: RunArtifacts;
  warnings: Array<{ category: ArenaGoalCategory; title: string; text: string; priority: number }>;
}

interface RagState {
  config: RagConfig;
  ctx: RagHttpContext;
  /** Documents that were (or may have been) planted and must be removed again. */
  cleanup: RagDoc[];
  /** goalId -> planted doc (AUTO mode). */
  docs: Map<string, RagDoc>;
}

interface RunArtifacts {
  rag?: { docs: RagArtifactDoc[] };
  agent?: { toolCallsObserved: number };
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
    private readonly planter: RagPlanter,
    private readonly ragCleanup: RagCleanupService,
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

    // BullMQ may redeliver a job after a worker crash. A run that already made progress is NEVER restarted
    // (that would plant documents a second time): a live owner keeps it, otherwise it is cleaned up and failed.
    const workerKey = WORKER_KEY(run.id);
    const progressed =
      hasProgress(run.artifacts) ||
      run.usedRequests > 0 ||
      (await this.prisma.arenaAttempt.count({ where: { runId: run.id, organizationId } })) > 0;
    if (progressed) {
      if (await this.redis.get(workerKey)) {
        this.log.warn(`run ${runId} is owned by a live worker — redelivered job ignored`);
        return;
      }
      await this.abandonInterrupted(run);
      return;
    }
    if ((await this.redis.set(workerKey, '1', 'EX', WORKER_TTL_SECONDS, 'NX')) !== 'OK') {
      this.log.warn(`run ${runId} is already being executed — duplicate job ignored`);
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
      kind: run.aiTarget.kind ?? 'CHAT',
      artifacts: {},
      warnings: [],
    };

    try {
      let outcome: Outcome;
      try {
        outcome = await this.runAll(state);
      } catch (err) {
        outcome = this.toOutcome(err);
      }
      // Always, also after abort/kill/failure: remove planted test documents and release the browser.
      await this.cleanupRag(state);
      await this.closeAdapter(state);
      await this.finalize(state, outcome);
    } finally {
      // Release the per-target lock (set by ArenaRunsService.start) no matter how the run ended.
      try {
        await this.redis.del(arenaRedisKeys.targetLock(run.aiTargetId), workerKey);
      } catch (err) {
        this.log.error(`could not release target lock: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------

  private toOutcome(err: unknown): Outcome {
    if (err instanceof RunStopError) return { status: 'ABORTED', reason: err.reason };
    if (err instanceof BrowserUnavailableError) {
      this.log.error('browser is not available for the widget transport');
      return { status: 'FAILED', reason: 'browser_unavailable' };
    }
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

    // Defense in depth: re-check the kind-specific preconditions at runtime, independent of the preflight.
    const precondition = this.checkKindPreconditions(state);
    if (precondition) return precondition;

    const loaded = await this.loadGoals(run);
    // Only goals that apply to this kind of target (kinds missing = legacy goal = chat only).
    const goals = loaded.filter((g) => (g.kinds ?? ['CHAT']).includes(state.kind));
    if (goals.length === 0) return { status: 'FAILED', reason: 'no_goals' };
    state.goalsTotal = goals.length;

    const secrets = await this.aiTargets.getSecrets(run.aiTargetId, orgId);
    state.secrets = secrets.apiKey ? [secrets.apiKey] : [];
    state.fragments = secrets.knownPromptFragments ?? [];
    state.adapter = await this.adapters.create(run.aiTarget, { apiKey: secrets.apiKey }, {
      requestsPerSecond: run.requestsPerSecond,
      clock: this.adapterClock,
      // The browser checks the kill switch itself (every request, every wait), not only between our rounds.
      shouldAbort: () => this.killSwitch.isKilled(run.id, orgId),
    });
    if (state.rag) {
      state.rag.ctx.headers = buildAuthHeaders(run.aiTarget.authHeaderName, secrets.apiKey, 'Authorization', true);
    }

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
    if (state.rag) await this.prepareRag(state, goals);

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

  /** Redelivered job for a run that already made progress and has no live worker: clean up and fail it, never restart. */
  private async abandonInterrupted(run: RunWithTarget): Promise<void> {
    const orgId = run.organizationId;
    this.log.warn(`run ${run.id} was interrupted (redelivered job, no live worker) — cleaning up and failing it`);
    try {
      await this.ragCleanup.cleanupRun(run.id, orgId);
    } catch (err) {
      this.log.error(`cleanup of interrupted run failed: ${deleteErrorCode(err)}`);
    }
    const now = new Date(this.now());
    const upd = await this.prisma.arenaRun.updateMany({
      where: { id: run.id, organizationId: orgId, status: 'RUNNING' },
      data: { status: 'FAILED', abortedReason: 'interrupted', completedAt: now },
    });
    if (upd.count > 0) {
      await this.prisma.scan.updateMany({
        where: { id: run.scanId, organizationId: orgId },
        data: { status: 'FAILED', completedAt: now, currentActivity: null, errorMessage: 'AI Arena run failed: interrupted' },
      });
      try {
        await this.audit.logStrict({
          action: 'arena.run.failed',
          userId: run.createdById,
          organizationId: orgId,
          resource: 'arena_run',
          resourceId: run.id,
          metadata: { reason: 'interrupted' },
        });
      } catch (err) {
        this.log.error(`audit write failed for interrupted run: ${deleteErrorCode(err)}`);
      }
      await this.events.publish(orgId, run.id, { type: 'run.status', status: 'FAILED', reason: 'interrupted' });
      await this.events.publish(orgId, run.id, { type: 'done', status: 'FAILED' });
    }
    try {
      await this.redis.del(arenaRedisKeys.targetLock(run.aiTargetId));
    } catch (err) {
      this.log.error(`could not release target lock: ${deleteErrorCode(err)}`);
    }
  }

  // ---- kinds: runtime preconditions, RAG, cleanup -----------------------------------------------

  /** Re-checks the kind-specific safety preconditions at runtime. Returns a FAILED outcome if one does not hold. */
  private checkKindPreconditions(state: RunState): Outcome | null {
    const t = state.run.aiTarget;
    if ((state.kind === 'WIDGET') !== (t.adapter === 'WIDGET')) return { status: 'FAILED', reason: 'config_invalid' };

    switch (state.kind) {
      case 'AGENT': {
        // Agents may only be tested in staging with both attestations — never in production.
        if (t.environment !== 'STAGING' || !t.stagingConfirmedAt || !t.sandboxAttestedAt) {
          return { status: 'FAILED', reason: 'agent_not_attested' };
        }
        const a = parseAgentConfig(t.agentConfig);
        if (!a.ok) return { status: 'FAILED', reason: 'config_invalid' };
        state.agent = a.config;
        return null;
      }
      case 'RAG': {
        const r = parseRagConfig(t.ragConfig);
        if (!r.ok) return { status: 'FAILED', reason: 'rag_not_configured' };
        if (r.config.mode === 'AUTO' && !r.config.ingest) return { status: 'FAILED', reason: 'rag_not_configured' };
        if (r.config.mode === 'MANUAL' && !t.ragDocsPlacedAt) return { status: 'FAILED', reason: 'rag_docs_not_placed' };
        state.rag = {
          config: r.config,
          ctx: { endpointUrl: t.target.value, headers: {}, beforeRequest: this.requestHook(state) },
          cleanup: [],
          docs: new Map(),
        };
        return null;
      }
      case 'WIDGET': {
        let pageHost = '';
        try {
          pageHost = new URL(String((t.widgetConfig as { pageUrl?: unknown } | null)?.pageUrl ?? '')).hostname.toLowerCase();
        } catch {
          return { status: 'FAILED', reason: 'widget_host_mismatch' };
        }
        if (pageHost !== new URL(t.target.value).hostname.toLowerCase()) return { status: 'FAILED', reason: 'widget_host_mismatch' };
        return null;
      }
      default:
        return null;
    }
  }

  /** Plants one marked test document per RAG goal (AUTO mode) and waits for indexing. MANUAL: nothing is planted. */
  private async prepareRag(
    state: RunState,
    goals: Array<{ id: string; key: string; seedAttacks: unknown; successCriteria: unknown }>,
  ): Promise<void> {
    const rag = state.rag as RagState;
    if (rag.config.mode !== 'AUTO') return;
    const ragGoals = goals.filter((g) => parseSuccessCriteria(g.successCriteria)?.type === 'rag_marker').slice(0, ARENA_LIMITS.maxRagDocsPerRun);
    let index = 0;
    for (const goal of ragGoals) {
      const criteria = parseSuccessCriteria(goal.successCriteria);
      const seeds = parseSeedAttacks(goal.seedAttacks);
      if (!criteria || !seeds) continue;
      await this.guard(state);
      const doc = this.planter.buildDocument(goal, seeds[0], criteria, state.run.id, index++);
      doc.plannedAt = new Date(this.now());
      rag.cleanup.push(doc);
      // The intent (nonce, topic marker, time, status `planned`) is persisted BEFORE the request: if the worker dies
      // during or after the ingest, the reaper still knows what to look for and remove.
      this.syncRagArtifacts(state);
      await this.flushUsage(state);
      try {
        const ing = await this.planter.ingest(rag.ctx, rag.config, doc);
        doc.docId = ing.docId;
        doc.docIdSource = ing.source;
        doc.plantedAt = new Date(this.now());
        rag.docs.set(goal.id, doc);
        this.syncRagArtifacts(state);
        await this.flushUsage(state);
      } catch (err) {
        if (!(err instanceof RagOperationError)) throw err;
        this.log.warn(`RAG document for ${goal.key} could not be planted (${err.code})`);
        // A definite rejection (HTTP 4xx) means nothing was planted; anything else (5xx, timeout) is ambiguous: keep it for cleanup.
        if (/^http_4\d\d$/.test(err.code)) {
          rag.cleanup = rag.cleanup.filter((d) => d !== doc);
          this.syncRagArtifacts(state);
          await this.flushUsage(state);
        }
      }
    }
    if (rag.docs.size > 0) await this.planter.waitForIndexing(rag.config.indexingDelayMs, () => this.guard(state));
  }

  /**
   * RAG goals: undefined = not a RAG goal (normal chat loop), RagDoc = AUTO (planted document),
   * null = MANUAL (customer-placed documents), 'skip' = nothing to test (document was not planted).
   */
  private async ragGoalSetup(
    state: RunState,
    goal: { id: string; key: string; category: ArenaGoalCategory; successCriteria: unknown },
  ): Promise<RagDoc | null | undefined | 'skip'> {
    const criteria = parseSuccessCriteria(goal.successCriteria);
    if (criteria?.type !== 'rag_marker') return undefined;
    if (!state.rag) return 'skip';
    if (state.rag.config.mode === 'MANUAL') return null;
    const doc = state.rag.docs.get(goal.id);
    if (doc) return doc;
    const row = await this.persistAttempt(state, {
      goalId: goal.id,
      round: 1,
      kind: 'ATTACK',
      technique: 'rag_question',
      attackText: '[test document could not be planted]',
      responseText: null,
      verdict: 'UNCLEAR',
      confidence: 0,
      evidence: { rule: 'rag_marker', error: 'not_planted' },
      repro: null,
      tokens: 0,
      latencyMs: null,
    });
    await this.publishAttempt(state, row, goal.key, goal.category);
    return 'skip';
  }

  private syncRagArtifacts(state: RunState): void {
    const rag = state.rag;
    if (!rag) return;
    state.artifacts.rag = { docs: rag.cleanup.map((d) => toArtifactDoc(d)) };
  }

  /** Counts a request without enforcing limits: cleanup must run even after a kill or budget stop. */
  private countingHook(state: RunState): () => Promise<void> {
    return async () => {
      const key = arenaRedisKeys.orgDailyRequests(state.run.organizationId, arenaUtcDayKey(new Date(this.now())));
      await this.redis.incrby(key, 1);
      if ((await this.redis.ttl(key)) === -1) await this.redis.expire(key, 3 * 24 * 3600);
      state.usedRequests++;
    };
  }

  /**
   * Removes the planted test documents. DELIBERATE EXCEPTION to "check the kill switch before every request":
   * this runs after abort/kill/budget stops too, because leaving test documents (with a hidden instruction) in a
   * customer's index is worse than a few extra delete requests. It only counts requests, it does not enforce limits.
   * Never logs document content.
   */
  private async cleanupRag(state: RunState): Promise<void> {
    const rag = state.rag;
    if (!rag || rag.cleanup.length === 0) return;
    const ctx: RagHttpContext = { ...rag.ctx, beforeRequest: this.countingHook(state) };
    for (const doc of rag.cleanup) {
      try {
        await this.planter.remove(ctx, rag.config, doc);
        doc.deletedAt = new Date(this.now());
      } catch (err) {
        doc.deleteError = deleteErrorCode(err);
      }
    }
    this.syncRagArtifacts(state);
    try {
      await this.flushUsage(state);
    } catch (err) {
      this.log.error(`could not persist RAG artifacts: ${err instanceof Error ? err.message : String(err)}`);
    }

    const failed = rag.cleanup.filter((d) => d.deleteError);
    if (failed.length === 0) return;
    const docIds = failed.map((d) => d.docId);
    const topics = failed.map((d) => d.topic);
    // Created in finalize(), after the per-category recommendations.
    state.warnings.push({
      category: 'INDIRECT_INJECTION',
      title: 'Testdokumente konnten nicht entfernt werden',
      text: `PTaaS konnte ${failed.length} eingespielte Testdokument(e) nicht automatisch loeschen. Bitte suche im Index nach den Markern ${topics.join(', ')} (Dokument-IDs: ${docIds.join(', ')}) und entferne sie manuell. Die Dokumente sind harmlos, enthalten aber eine versteckte Marker-Anweisung und koennen weiterhin Antworten beeinflussen.`,
      priority: 1,
    });
    try {
      await this.audit.logStrict({
        action: 'arena.rag.cleanup_failed',
        userId: state.run.createdById,
        organizationId: state.run.organizationId,
        resource: 'arena_run',
        resourceId: state.run.id,
        // Document ids and error codes only — never document content.
        metadata: { count: failed.length, topics, docIds, errors: failed.map((d) => d.deleteError) },
      });
    } catch (err) {
      this.log.error(`audit write failed for RAG cleanup: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async closeAdapter(state: RunState): Promise<void> {
    try {
      await state.adapter?.close?.();
    } catch (err) {
      this.log.error(`adapter close failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---- limits ---------------------------------------------------------------------------------

  /** Called before every round and before every request. Throws RunStopError to end the run cleanly. */
  private async guard(state: RunState): Promise<void> {
    const { run } = state;
    if (await this.killSwitch.isKilled(run.id, run.organizationId)) throw new RunStopError('kill_switch');
    await this.redis.expire(WORKER_KEY(run.id), WORKER_TTL_SECONDS); // heartbeat: this worker still owns the run
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
      data: {
        usedRequests: state.usedRequests,
        usedTokens: state.usedTokens,
        ...(Object.keys(state.artifacts).length > 0 ? { artifacts: state.artifacts as Prisma.InputJsonValue } : {}),
      },
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
    const early = await this.ragGoalSetup(state, goal);
    if (early === 'skip') return;
    const ragDoc: RagDoc | null | undefined = early;
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
      let tokens = buildTokens(criteria, run.id);
      let plan: { technique: string; prompt: string; llmTokens: number };
      let judgeAttackText: string;
      if (ragDoc !== undefined) {
        // RAG: a harmless question about the planted document's topic (never contains the token).
        if (ragDoc) tokens = ragDoc.tokens;
        else delete tokens.marker; // MANUAL: only the customer's known markers count
        const question = this.planter.questionFor(ragDoc, round);
        plan = { technique: 'rag_question', prompt: question, llmTokens: 0 };
        // The document text counts as "attacker supplied" for echo detection (quoting the hidden instruction is no breach).
        judgeAttackText = ragDoc ? `${question} ${ragDoc.content}` : question;
      } else {
        const p = await this.red.nextAttack({
          goal: { key: goal.key, category: goal.category, title: goal.title, description: goal.description },
          seeds,
          criteria,
          tokens,
          round,
          history,
          reconSummary: state.reconSummary,
        });
        plan = p;
        judgeAttackText = p.prompt;
      }
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

      // Agent: tool calls reported by the target (raw values are only used for matching; stored form is redacted).
      let toolCalls: ObservedToolCall[] = [];
      if (res && state.kind === 'AGENT') toolCalls = extractToolCalls(res.raw, state.agent?.toolCallsPath);
      const redactedCalls = toolCalls.map((c) => ({
        name: redactText(c.name, { secrets: state.secrets, fragments: state.fragments, maxChars: 100 }),
        arguments: redactText(c.arguments, { secrets: state.secrets, fragments: state.fragments, maxChars: 500 }),
      }));
      if (toolCalls.length > 0) {
        const agentArt = (state.artifacts.agent ??= { toolCallsObserved: 0 });
        agentArt.toolCallsObserved += toolCalls.length;
      }

      const ragManual = ragDoc === null;
      const judgeInput = {
        goal: { title: goal.title, description: goal.description },
        criteria,
        attackText: judgeAttackText,
        tokens,
        // Fragments double as customer-placed markers only for RAG MANUAL goals; elsewhere they are prompt fragments.
        fragments: criteria.type === 'rag_marker' && !ragManual ? [] : state.fragments,
        toolCalls,
        toolTraceAvailable: state.kind === 'AGENT' && !!state.agent?.toolCallsPath,
      };
      let verdict: JudgeResult = res
        ? await this.judge.judge({ ...judgeInput, responseText: res.text })
        : { verdict: 'UNCLEAR', confidence: 0, evidence: { rule: 'none', error: `request_failed:${reqError}` }, deterministic: true, needsRepro: false, tokens: 0 };
      attemptTokens += verdict.tokens;

      let repro = { k: 1, n: 1 };
      if (res && verdict.verdict === 'BREACH' && verdict.needsRepro) {
        const r = await this.reproduce(state, adapter, hook, judgeInput, plan.prompt, (x) =>
          state.kind === 'AGENT' ? { toolCalls: extractToolCalls(x.raw, state.agent?.toolCallsPath) } : {},
        );
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
        evidence: redactedCalls.length > 0 ? { ...verdict.evidence, toolCalls: redactedCalls } : verdict.evidence,
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
          toolCalls: redactedCalls.length > 0 ? redactedCalls : undefined,
        });
      }

      await this.publishAttempt(state, row, goal.key, goal.category, redactedCalls);
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
    judgeInput: { goal: { title: string; description: string }; criteria: Parameters<JudgeService['judge']>[0]['criteria']; attackText: string; tokens: Parameters<JudgeService['judge']>[0]['tokens']; fragments: string[]; toolTraceAvailable?: boolean },
    prompt: string,
    extra: (res: AdapterResponse) => { toolCalls?: ObservedToolCall[] } = () => ({}),
  ): Promise<{ k: number; n: number; tokens: number }> {
    let k = 1;
    let n = 1;
    let tokens = 0;
    for (let i = 0; i < 2 && k < 2; i++) {
      n++;
      try {
        const res = await adapter.send(prompt, { beforeRequest: hook });
        tokens += estimateTokens(prompt) + estimateTokens(res.text);
        const v = await this.judge.judge({ ...judgeInput, ...extra(res), responseText: res.text });
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
    toolCalls?: { name: string; arguments: string }[],
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
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
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
    for (const w of state.warnings) {
      try {
        await this.recommendations.createWarning(run.id, orgId, w);
      } catch (err) {
        this.log.error(`warning recommendation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      // An operator's abort reason (written by ArenaRunsService.abort while the run was RUNNING) must survive
      // finalization; the engine's machine reason ("kill_switch") is only the fallback.
      let abortedReason = outcome.reason ?? null;
      if (outcome.status === 'ABORTED') {
        const current = await this.prisma.arenaRun.findFirst({
          where: { id: run.id, organizationId: orgId },
          select: { abortedReason: true },
        });
        abortedReason = current?.abortedReason || abortedReason;
      }
      await this.prisma.arenaRun.updateMany({
        where: { id: run.id, organizationId: orgId },
        data: {
          status: outcome.status,
          completedAt: new Date(this.now()),
          abortedReason,
          usedRequests: state.usedRequests,
          usedTokens: state.usedTokens,
          ...(Object.keys(state.artifacts).length > 0 ? { artifacts: state.artifacts as Prisma.InputJsonValue } : {}),
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
