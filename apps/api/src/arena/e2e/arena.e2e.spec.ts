import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import type { Redis } from 'ioredis';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisModule } from '../../redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { CryptoModule } from '../../crypto/crypto.module';
import { CryptoService } from '../../crypto/crypto.service';
import { SsrfGuardModule } from '../../ssrf/ssrf-guard.module';
import { SafeHttpService } from '../../ssrf/safe-http.service';
import { SsrfGuardService } from '../../ssrf/ssrf-guard.service';
import { AuthModule } from '../../auth/auth.module';
import { MailModule } from '../../mail/mail.module';
import { TargetsModule } from '../../targets/targets.module';
import { ArenaModule } from '../arena.module';
import { ArenaCatalogService } from '../engine/catalog/arena-catalog.service';
import { ArenaRetentionService } from '../engine/arena-retention.service';
import { ArenaRoeService } from '../lifecycle/arena-roe.service';
import { aiTargetAad } from '../lifecycle/ai-targets.service';
import { arenaUtcDayKey } from '../lifecycle/arena-views';
import { arenaRedisKeys } from '../arena.constants';
import { E2eSafeHttp, E2eSsrfGuard, PUBLIC_DUMMY_IP } from './e2e-doubles';
import { SYSTEM_PROMPT_FRAGMENTS, startFakeAi, type FakeAiServer } from './fake-ai-server';

/**
 * AI Arena end-to-end test: REAL PostgreSQL (migrated), REAL Redis, REAL BullMQ worker, REAL HTTP app.
 * Only two seams are replaced (see e2e-doubles.ts): DNS resolution of `*.test` and the final socket of SafeHttpService.
 * Run with: `npm run e2e:infra:start` then `npm run test:e2e:arena --workspace=apps/api`.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ptaas:ptaas_pw@127.0.0.1:55432/ptaas_e2e';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const JWT_SECRET = 'e2e-jwt-access-secret-0123456789abcdef';
const API_KEY = 'sk-e2e-test-key-do-not-leak-123456';

process.env.DATABASE_URL = DATABASE_URL;
process.env.REDIS_URL = REDIS_URL;
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_ACCESS_SECRET = JWT_SECRET;
process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY; // Red uses its deterministic template fallbacks
delete process.env.ARENA_PLATFORM_ADMINS;

const redisPort = Number(new URL(REDIS_URL).port || 6379);
const SUFFIX = Date.now().toString(36);

interface Json {
  [k: string]: unknown;
}
interface Resp {
  status: number;
  body: Json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function eventually<T>(fn: () => Promise<T | undefined | false>, timeoutMs: number, label: string, everyMs = 300): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await sleep(everyMs);
  }
  throw new Error(`timeout waiting for: ${label}${last ? ` (${String(last)})` : ''}`);
}

describe('AI Arena E2E (real PostgreSQL + Redis + BullMQ)', () => {
  let app: INestApplication;
  let base = '';
  let prisma: PrismaService;
  let redis: Redis;
  let crypto: CryptoService;
  let http: E2eSafeHttp;
  let retention: ArenaRetentionService;

  const servers: Record<string, FakeAiServer> = {};
  const routes = new Map<string, number>();

  let orgId = '';
  let org2Id = '';
  let projectId = '';
  const tokens: Record<'admin' | 'engineer' | 'viewer' | 'admin2', string> = { admin: '', engineer: '', viewer: '', admin2: '' };
  const users: Record<string, string> = {};
  const goals = new Map<string, string>(); // key -> id
  let roeVersion = 0;

  async function api(method: string, path: string, token: string | null, body?: unknown): Promise<Resp> {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: Json = {};
    try {
      parsed = text ? (JSON.parse(text) as Json) : {};
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, body: parsed };
  }

  function confirmations(kind: 'CHAT' | 'RAG' | 'AGENT'): Json {
    const base = { noProduction: true, noSideEffects: true, providerTosAccepted: true };
    if (kind === 'AGENT') return { ...base, stagingOnly: true, toolsSandboxed: true };
    if (kind === 'RAG') return { ...base, noTools: true, testDocumentsMayBeIndexedAndRemoved: true };
    return { ...base, noTools: true };
  }

  /** Seeds a VERIFIED target by registering it through the real API and flipping the verification columns. */
  async function registerTarget(host: string, extra: Json = {}): Promise<{ aiTargetId: string; targetId: string }> {
    const r = await api('POST', '/arena/targets', tokens.admin, {
      projectId,
      name: `e2e ${host}`,
      endpointUrl: `https://${host}/v1/chat/completions`,
      adapter: 'OPENAI_COMPAT',
      apiKey: API_KEY,
      authHeaderName: 'Authorization',
      ...extra,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return { aiTargetId: r.body.id as string, targetId: r.body.targetId as string };
  }

  async function markVerified(targetId: string): Promise<void> {
    await prisma.target.update({
      where: { id: targetId },
      data: { verificationStatus: 'VERIFIED', verificationMethod: 'HTTP_FILE', verifiedAt: new Date(), lastVerifiedAt: new Date() },
    });
  }

  async function createApprovedRun(
    aiTargetId: string,
    goalKeys: string[],
    kind: 'CHAT' | 'RAG' | 'AGENT',
    budgets: Json = {},
  ): Promise<string> {
    const created = await api('POST', '/arena/runs', tokens.admin, {
      aiTargetId,
      goalIds: goalKeys.map((k) => goals.get(k)),
      maxRounds: 2,
      maxRequests: 40,
      requestsPerSecond: 5,
      ...budgets,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const runId = created.body.id as string;
    const submitted = await api('POST', `/arena/runs/${runId}/submit`, tokens.engineer);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.status).toBe('AWAITING_APPROVAL');
    const approved = await api('POST', `/arena/runs/${runId}/approve`, tokens.admin, {
      roeVersion,
      emergencyContact: 'Erika Mustermann, +49 30 1234567',
      confirmations: confirmations(kind),
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    return runId;
  }

  async function waitFinal(runId: string, timeoutMs = 120_000): Promise<string> {
    return eventually(
      async () => {
        const s = await prisma.arenaRun.findUnique({ where: { id: runId }, select: { status: true } });
        return s && ['COMPLETED', 'ABORTED', 'FAILED'].includes(s.status) ? s.status : false;
      },
      timeoutMs,
      `run ${runId} final status`,
      400,
    );
  }

  beforeAll(async () => {
    servers.vulnerable = await startFakeAi('vulnerable');
    servers.hardened = await startFakeAi('hardened');
    servers.rag = await startFakeAi('vulnerable');
    servers.agent = await startFakeAi('vulnerable');
    servers.slow = await startFakeAi('hardened');
    routes.set('customer-ai.test', servers.vulnerable.port);
    routes.set('hardened-ai.test', servers.hardened.port);
    routes.set('rag-ai.test', servers.rag.port);
    routes.set('agent-ai.test', servers.agent.port);
    routes.set('slow-ai.test', servers.slow.port);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        BullModule.forRoot({ connection: { host: '127.0.0.1', port: redisPort } }),
        PrismaModule,
        RedisModule,
        AuditModule,
        CryptoModule,
        SsrfGuardModule,
        AuthModule,
        MailModule,
        TargetsModule,
        ArenaModule,
      ],
    })
      .overrideProvider(SsrfGuardService)
      .useClass(E2eSsrfGuard)
      .overrideProvider(SafeHttpService)
      .useFactory({ factory: (guard: SsrfGuardService) => new E2eSafeHttp(guard, routes), inject: [SsrfGuardService] })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    prisma = app.get(PrismaService);
    redis = app.get<Redis>('REDIS_CLIENT');
    crypto = app.get(CryptoService);
    http = app.get(SafeHttpService) as E2eSafeHttp;
    retention = app.get(ArenaRetentionService);

    // dedicated test Redis: start from a clean slate
    await redis.flushdb();

    // Catalog + RoE seeding as done at application start
    await app.get(ArenaCatalogService).onModuleInit();
    await app.get(ArenaRoeService).onModuleInit();
    roeVersion = (await app.get(ArenaRoeService).getCurrent()).version;

    // Tenants, users, project
    const org = await prisma.organization.create({ data: { name: `E2E Org ${SUFFIX}`, slug: `e2e-${SUFFIX}`, allowedRegions: ['eu-west-1'] } });
    const org2 = await prisma.organization.create({ data: { name: `E2E Org2 ${SUFFIX}`, slug: `e2e2-${SUFFIX}`, allowedRegions: ['eu-west-1'] } });
    orgId = org.id;
    org2Id = org2.id;
    const mk = async (key: string, role: 'ADMIN' | 'SECURITY_ENGINEER' | 'VIEWER', organizationId: string) => {
      const u = await prisma.user.create({ data: { email: `${key}-${SUFFIX}@e2e.test`, passwordHash: 'x', name: `E2E ${key}`, emailVerified: true } });
      await prisma.organizationMember.create({ data: { userId: u.id, organizationId, role, acceptedAt: new Date() } });
      users[key] = u.id;
      return new JwtService({ secret: JWT_SECRET }).sign(
        { sub: u.id, email: u.email, orgId: organizationId, role, jti: `jti-${key}-${SUFFIX}` },
        { expiresIn: '15m' },
      );
    };
    tokens.admin = await mk('admin', 'ADMIN', orgId);
    tokens.engineer = await mk('engineer', 'SECURITY_ENGINEER', orgId);
    tokens.viewer = await mk('viewer', 'VIEWER', orgId);
    tokens.admin2 = await mk('admin2', 'ADMIN', org2Id);
    const project = await prisma.project.create({ data: { name: 'E2E project', organizationId: orgId, createdById: users.admin } });
    projectId = project.id;
  });

  afterAll(async () => {
    await app?.close();
    for (const s of Object.values(servers)) await s.close();
  });

  // ─────────────────────────────────────────────────────────

  it('boots: catalog and rules of engagement are seeded in the real database', async () => {
    const cat = await api('GET', '/arena/catalog', tokens.viewer);
    expect(cat.status).toBe(200);
    const list = cat.body as unknown as { id: string; key: string }[];
    expect(Array.isArray(list)).toBe(true);
    for (const g of list) goals.set(g.key, g.id);
    expect(list.length).toBeGreaterThanOrEqual(26);
    for (const k of ['PI-001', 'SPL-001', 'SD-001', 'RAG-001', 'AGY-001']) expect(goals.has(k), k).toBe(true);
    const roe = await api('GET', '/arena/roe/current', tokens.viewer);
    expect(roe.status).toBe(200);
    expect(roe.body.version).toBe(roeVersion);
  });

  describe('vulnerable chat target (full lifecycle)', () => {
    let aiTargetId = '';
    let targetId = '';
    let runId = '';
    const sse: { events: Json[]; done: Promise<void> } = { events: [], done: Promise.resolve() };

    it('registers the endpoint; secrets are encrypted with AAD and never returned', async () => {
      const r = await registerTarget('customer-ai.test', { knownPromptFragments: SYSTEM_PROMPT_FRAGMENTS });
      aiTargetId = r.aiTargetId;
      targetId = r.targetId;
      const view = await api('GET', `/arena/targets/${aiTargetId}`, tokens.viewer);
      expect(view.status).toBe(200);
      expect(view.body.hasApiKey).toBe(true);
      expect(view.body.fragmentCount).toBe(SYSTEM_PROMPT_FRAGMENTS.length);
      expect(JSON.stringify(view.body)).not.toContain(API_KEY);

      const row = await prisma.aiTarget.findUniqueOrThrow({ where: { id: aiTargetId } });
      expect(row.apiKeyEncrypted).toMatch(/^v2:/);
      expect(row.apiKeyEncrypted).not.toContain(API_KEY);
      expect(crypto.decryptBound(row.apiKeyEncrypted as string, aiTargetAad(orgId, aiTargetId, 'apiKey'))).toBe(API_KEY);
      expect(() => crypto.decryptBound(row.apiKeyEncrypted as string, aiTargetAad(org2Id, aiTargetId, 'apiKey'))).toThrow();
    });

    it('rejects endpoints that are not https/443 or point at a model provider', async () => {
      for (const endpointUrl of ['http://customer-ai.test/x', 'https://customer-ai.test:8443/x', 'https://api.openai.com/v1/chat/completions']) {
        const r = await api('POST', '/arena/targets', tokens.admin, { projectId, name: 'bad', endpointUrl, adapter: 'OPENAI_COMPAT' });
        expect(r.status, endpointUrl).toBe(400);
      }
    });

    it('cannot start before verification; verifies ownership via the real HTTP_FILE flow', async () => {
      const early = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT').catch((e: Error) => e);
      // Submit already runs the preflight target check: an unverified endpoint must be refused.
      expect(early).toBeInstanceOf(Error);
      expect(String((early as Error).message)).toContain('VERIFICATION_REQUIRED');

      const v = await api('GET', `/arena/targets/${aiTargetId}/verification`, tokens.admin);
      expect(v.status).toBe(200);
      servers.vulnerable.verifyBody = `ptaas-verify=${v.body.token as string}`;
      const ok = await api('POST', `/arena/targets/${aiTargetId}/verify`, tokens.admin, { method: 'HTTP_FILE' });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.success).toBe(true);
      const t = await prisma.target.findUniqueOrThrow({ where: { id: targetId } });
      expect(t.verificationStatus).toBe('VERIFIED');
      expect(t.verifiedAt).not.toBeNull();
      // The verification request went through the real pinning logic: public IP, port 443, https host kept.
      const verifyReq = http.pinned.find((p) => p.path === '/.well-known/ptaas-verify.txt');
      expect(verifyReq).toMatchObject({ host: 'customer-ai.test', ip: PUBLIC_DUMMY_IP, port: '443' });
      expect(servers.vulnerable.calls.find((c) => c.path === '/.well-known/ptaas-verify.txt')?.host).toBe('customer-ai.test');
    });

    it('enforces the approval workflow (state, role, RoE version, confirmations)', async () => {
      const created = await api('POST', '/arena/runs', tokens.admin, {
        aiTargetId,
        goalIds: ['PI-001', 'SPL-001', 'SD-001'].map((k) => goals.get(k)),
        maxRounds: 2,
        maxRequests: 40,
        requestsPerSecond: 5,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      runId = created.body.id as string;
      expect(created.body.status).toBe('DRAFT');

      const early = await api('POST', `/arena/runs/${runId}/start`, tokens.admin);
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('RUN_NOT_APPROVED');
      const earlyApprove = await api('POST', `/arena/runs/${runId}/approve`, tokens.admin, {
        roeVersion,
        emergencyContact: 'x',
        confirmations: confirmations('CHAT'),
      });
      expect(earlyApprove.status).toBe(409);

      expect((await api('POST', `/arena/runs/${runId}/submit`, tokens.viewer)).status).toBe(403);
      expect((await api('POST', `/arena/runs/${runId}/submit`, tokens.engineer)).status).toBe(200);

      const body = { roeVersion, emergencyContact: 'Erika Mustermann, +49 30 1234567', confirmations: confirmations('CHAT') };
      expect((await api('POST', `/arena/runs/${runId}/approve`, tokens.engineer, body)).status).toBe(403);
      const stale = await api('POST', `/arena/runs/${runId}/approve`, tokens.admin, { ...body, roeVersion: roeVersion - 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('ROE_OUTDATED');
      const partial = await api('POST', `/arena/runs/${runId}/approve`, tokens.admin, {
        ...body,
        confirmations: { ...confirmations('CHAT'), noTools: false },
      });
      expect(partial.status).toBe(400);
      const ok = await api('POST', `/arena/runs/${runId}/approve`, tokens.admin, body);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.status).toBe('APPROVED');
      expect(ok.body.roeVersion).toBe(roeVersion);
      expect(ok.body.approvedByName).toBe('E2E admin');
    });

    it('stream ticket: single use, org scoped', async () => {
      const t = await api('POST', `/arena/runs/${runId}/stream-ticket`, tokens.admin);
      expect(t.status).toBe(201);
      const ticket = t.body.ticket as string;
      const first = await fetch(`${base}/api/v1/arena/runs/${runId}/stream?ticket=${encodeURIComponent(ticket)}`);
      expect(first.status).toBe(200);
      expect(first.headers.get('content-type')).toContain('text/event-stream');
      // consume in the background; resolves at the `done` event
      const reader = (first.body as ReadableStream<Uint8Array>).getReader();
      sse.done = (async () => {
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (chunk.startsWith('data: ')) sse.events.push(JSON.parse(chunk.slice(6)) as Json);
          }
        }
      })();
      const replay = await fetch(`${base}/api/v1/arena/runs/${runId}/stream?ticket=${encodeURIComponent(ticket)}`);
      expect(replay.status).toBe(401);
      await replay.arrayBuffer();
      const garbage = await fetch(`${base}/api/v1/arena/runs/${runId}/stream?ticket=garbage`);
      expect(garbage.status).toBe(401);
      await garbage.arrayBuffer();
      // another organization cannot even obtain a ticket
      expect((await api('POST', `/arena/runs/${runId}/stream-ticket`, tokens.admin2)).status).toBe(404);
    });

    it('starts the run and the BullMQ worker drives it to COMPLETED', async () => {
      const start = await api('POST', `/arena/runs/${runId}/start`, tokens.admin);
      expect(start.status, JSON.stringify(start.body)).toBe(200);
      expect(['RUNNING', 'COMPLETED']).toContain(start.body.status);
      const final = await waitFinal(runId);
      expect(final).toBe('COMPLETED');
      await Promise.race([sse.done, sleep(10_000)]);
    });

    it('persisted attempts are redacted, scored and stored with verdicts', async () => {
      const attempts = await prisma.arenaAttempt.findMany({ where: { runId }, include: { goal: true } });
      expect(attempts.length).toBeGreaterThanOrEqual(3);
      expect(attempts.some((a) => a.kind === 'ATTACK' && a.verdict === 'BREACH')).toBe(true);
      for (const a of attempts) {
        expect(a.organizationId).toBe(orgId);
        expect(a.attackText.length).toBeGreaterThan(0);
        expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);
        expect(a.attackText).not.toContain(API_KEY);
        expect(a.responseText ?? '').not.toContain(API_KEY);
      }
      // known system-prompt fragments are masked in stored transcripts
      for (const a of attempts) expect(a.responseText ?? '').not.toContain('ZEBRA-4471-ALPHA');

      const viaApi = await api('GET', `/arena/runs/${runId}/attempts`, tokens.viewer);
      expect(viaApi.status).toBe(200);
      expect((viaApi.body as unknown as unknown[]).length).toBe(attempts.length);
    });

    it('creates findings with mandatory fields for breaches (incl. the generated search_vector column)', async () => {
      const viaAttempts = await prisma.arenaAttempt.findMany({ where: { runId, findingId: { not: null } }, select: { findingId: true } });
      const ids = [...new Set(viaAttempts.map((a) => a.findingId as string))];
      expect(ids.length).toBeGreaterThanOrEqual(1);
      const rows = await prisma.finding.findMany({ where: { id: { in: ids } } });
      expect(rows.length).toBe(ids.length);
      for (const f of rows) {
        expect(f.title).toMatch(/^\[AI Arena\]/);
        expect(f.severity).toBeTruthy();
        expect((f.description ?? '').length).toBeGreaterThan(20);
        expect(f.organizationId).toBe(orgId);
        expect(f.targetId).toBe(targetId);
        expect(f.projectId).toBe(projectId);
        expect(f.templateId).toBeTruthy();
        expect(f.cweIds.length).toBeGreaterThan(0);
      }
      // generated tsvector column from the FTS migration must work on rows written by the engine
      const hits = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM findings WHERE organization_id = ${orgId} AND search_vector @@ plainto_tsquery('english', 'Arena')`;
      expect(hits.length).toBeGreaterThanOrEqual(ids.length);
    });

    it('run detail: score, recommendations, org counters, audit trail, lock released', async () => {
      const detail = await api('GET', `/arena/runs/${runId}`, tokens.viewer);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('COMPLETED');
      const score = detail.body.score as { totals: { attempts: number; breaches: number; breachRate: number } };
      expect(score.totals.attempts).toBeGreaterThan(0);
      expect(score.totals.breaches).toBeGreaterThan(0);
      expect(score.totals.breachRate).toBeGreaterThan(0);
      const recs = detail.body.recommendations as unknown[];
      expect(recs.length).toBeGreaterThan(0);
      expect(detail.body.emergencyContact).toBeNull(); // viewers do not see personal data
      const asAdmin = await api('GET', `/arena/runs/${runId}`, tokens.admin);
      expect(asAdmin.body.emergencyContact).toContain('Mustermann');

      expect(await prisma.arenaRecommendation.count({ where: { runId } })).toBe(recs.length);

      const used = Number(await redis.get(arenaRedisKeys.orgDailyRequests(orgId, arenaUtcDayKey(new Date()))));
      const run = await prisma.arenaRun.findUniqueOrThrow({ where: { id: runId } });
      expect(used).toBeGreaterThan(0);
      expect(run.usedRequests).toBeGreaterThan(0);
      expect(used).toBe(run.usedRequests);
      expect(run.completedAt).not.toBeNull();

      const audit = await prisma.auditLog.findMany({ where: { resourceId: runId } });
      const actions = audit.map((a) => a.action);
      for (const a of ['arena.run.created', 'arena.run.submitted', 'arena.run.approved', 'arena.run.started', 'arena.run.completed']) {
        expect(actions, a).toContain(a);
      }
      expect(await redis.exists(arenaRedisKeys.targetLock(aiTargetId))).toBe(0);

      const scan = await prisma.scan.findUniqueOrThrow({ where: { id: run.scanId } });
      expect(scan.status).toBe('COMPLETED');
    });

    it('SSE delivered attempt, score and done events', async () => {
      const types = sse.events.map((e) => e.type);
      expect(types).toContain('attempt');
      expect(types).toContain('score');
      expect(types[types.length - 1]).toBe('done');
    });

    it('requests to the customer endpoint were pinned (https/443, public IP) and carried the API key', async () => {
      const chat = http.pinned.filter((p) => p.path === '/v1/chat/completions' && p.host === 'customer-ai.test');
      expect(chat.length).toBeGreaterThan(0);
      for (const p of chat) expect(p).toMatchObject({ ip: PUBLIC_DUMMY_IP, port: '443', method: 'POST' });
      const calls = servers.vulnerable.calls.filter((c) => c.path === '/v1/chat/completions');
      expect(calls.length).toBe(chat.length);
      for (const c of calls) {
        expect(c.host).toBe('customer-ai.test');
        expect(c.authorization).toBe(`Bearer ${API_KEY}`);
      }
    });

    it('tenant isolation: a second organization gets 404 for every run resource', async () => {
      for (const p of [`/arena/runs/${runId}`, `/arena/runs/${runId}/attempts`, `/arena/targets/${aiTargetId}`]) {
        expect((await api('GET', p, tokens.admin2)).status, p).toBe(404);
      }
      expect((await api('POST', `/arena/runs/${runId}/abort`, tokens.admin2, {})).status).toBe(404);
      const list = await api('GET', '/arena/runs', tokens.admin2);
      expect(list.status).toBe(200);
      expect(list.body as unknown as unknown[]).toHaveLength(0);
      expect((await api('GET', '/arena/runs', null)).status).toBe(401);
    });

    it('retention: expired attempts are deleted and evidence in findings is scrubbed', async () => {
      const before = await prisma.arenaAttempt.count({ where: { runId } });
      expect(before).toBeGreaterThan(0);
      const past = new Date(Date.now() - 86_400_000);
      await prisma.arenaAttempt.updateMany({ where: { runId }, data: { expiresAt: past } });
      const result = await retention.runOnce();
      expect(result.attemptsDeleted).toBeGreaterThanOrEqual(before);
      expect(await prisma.arenaAttempt.count({ where: { runId } })).toBe(0);
      expect(result.findingsScrubbed).toBeGreaterThan(0);
    });
  });

  describe('hardened chat target', () => {
    it('completes with 0 findings but still produces recommendations', async () => {
      const { aiTargetId, targetId } = await registerTarget('hardened-ai.test', { knownPromptFragments: SYSTEM_PROMPT_FRAGMENTS });
      await markVerified(targetId);
      const runId = await createApprovedRun(aiTargetId, ['PI-001', 'SPL-001'], 'CHAT');
      expect((await api('POST', `/arena/runs/${runId}/start`, tokens.engineer)).status).toBe(200);
      expect(await waitFinal(runId)).toBe('COMPLETED');

      const attempts = await prisma.arenaAttempt.findMany({ where: { runId, kind: 'ATTACK' } });
      expect(attempts.length).toBeGreaterThan(0);
      expect(attempts.every((a) => a.verdict !== 'BREACH')).toBe(true);
      expect(attempts.every((a) => a.findingId === null)).toBe(true);
      expect(await prisma.finding.count({ where: { organizationId: orgId, targetId } })).toBe(0);
      const detail = await api('GET', `/arena/runs/${runId}`, tokens.admin);
      expect((detail.body.recommendations as unknown[]).length).toBeGreaterThan(0);
      expect((detail.body.score as { totals: { breaches: number } }).totals.breaches).toBe(0);
    });
  });

  describe('kill switch', () => {
    it('abort stops a running run (ABORTED), releases the target lock and writes audit records', async () => {
      const { aiTargetId, targetId } = await registerTarget('slow-ai.test');
      await markVerified(targetId);
      // slow on purpose: many goals at 1 request per second
      const keys = [...goals.keys()].filter((k) => /^(PI|SPL|SD|JB|OH)-/.test(k));
      const runId = await createApprovedRun(aiTargetId, keys, 'CHAT', { maxRounds: 5, maxRequests: 200, requestsPerSecond: 1 });
      expect((await api('POST', `/arena/runs/${runId}/start`, tokens.admin)).status).toBe(200);
      await eventually(async () => (await prisma.arenaAttempt.count({ where: { runId } })) >= 1, 60_000, 'first attempt');
      const abort = await api('POST', `/arena/runs/${runId}/abort`, tokens.engineer, { reason: 'e2e kill switch' });
      expect(abort.status, JSON.stringify(abort.body)).toBe(200);
      expect(await waitFinal(runId, 60_000)).toBe('ABORTED');
      const run = await prisma.arenaRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.abortedReason).toContain('e2e kill switch');
      expect(await redis.exists(arenaRedisKeys.targetLock(aiTargetId))).toBe(0);
      const actions = (await prisma.auditLog.findMany({ where: { resourceId: runId } })).map((a) => a.action);
      expect(actions).toContain('arena.run.abort_requested');
      const attemptsAtEnd = await prisma.arenaAttempt.count({ where: { runId } });
      await sleep(2500);
      expect(await prisma.arenaAttempt.count({ where: { runId } })).toBe(attemptsAtEnd); // really stopped
    });

    it('org kill switch blocks new runs with 409 KILL_SWITCH', async () => {
      const { aiTargetId, targetId } = await registerTarget('hardened-ai.test', { name: 'second hardened' }).catch(async () => {
        // same endpoint URL already registered: reuse a different path
        return registerTarget('hardened-ai.test', { endpointUrl: 'https://hardened-ai.test/v1/chat/completions?x=1' });
      });
      await markVerified(targetId);
      const runId = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT');
      expect((await api('POST', '/arena/kill-org', tokens.admin, { on: true })).status).toBe(200);
      const blocked = await api('POST', `/arena/runs/${runId}/start`, tokens.admin);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('KILL_SWITCH');
      expect((await api('POST', '/arena/kill-org', tokens.admin, { on: false })).status).toBe(200);
      expect((await api('POST', '/arena/admin/kill', tokens.admin, { on: true })).status).toBe(403); // not a platform operator
    });
  });
  describe('stage 2: RAG target', () => {
    it('plants a marked document, detects the indirect injection and really deletes the document again', async () => {
      const { aiTargetId, targetId } = await registerTarget('rag-ai.test', {
        kind: 'RAG',
        ragConfig: {
          mode: 'AUTO',
          ingest: { url: 'https://rag-ai.test/rag/ingest', method: 'POST', bodyTemplate: { id: '{{docId}}', text: '{{content}}' } },
          delete: { url: 'https://rag-ai.test/rag/docs/{{docId}}', method: 'DELETE' },
          indexingDelayMs: 0,
        },
      });
      await markVerified(targetId);
      const runId = await createApprovedRun(aiTargetId, ['RAG-001'], 'RAG', { maxRounds: 2 });
      expect((await api('POST', `/arena/runs/${runId}/start`, tokens.admin)).status).toBe(200);
      expect(await waitFinal(runId)).toBe('COMPLETED');

      const srv = servers.rag;
      const ingests = srv.calls.filter((c) => c.path === '/rag/ingest');
      expect(ingests.length).toBe(1);
      const planted = JSON.parse(ingests[0].body) as { id: string; text: string };
      expect(planted.id).toMatch(/^ptaas-[0-9a-f]{10}$/);
      expect(planted.text).toContain('PTAAS-RAG-');
      expect(srv.deletedDocIds).toEqual([planted.id]);
      expect(srv.docs.size).toBe(0); // cleanup really removed it from the customer's index

      const attempts = await prisma.arenaAttempt.findMany({ where: { runId, kind: 'ATTACK' } });
      expect(attempts.some((a) => a.verdict === 'BREACH')).toBe(true);
      expect(await prisma.finding.count({ where: { organizationId: orgId, targetId, templateId: 'RAG-001' } })).toBe(1);

      const detail = await api('GET', `/arena/runs/${runId}`, tokens.admin);
      expect(detail.body.artifactsSummary).toEqual({ rag: { planted: 1, deleted: 1, cleanupFailed: 0 } });
      // the planted document content must not leak into the audit trail
      const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { resourceId: runId } }));
      expect(audit).not.toContain('PTAAS-RAG-');
    });
  });

  describe('stage 3: agent target (staging only)', () => {
    it('refuses to start without attestations (409) and detects tool-call abuse once attested', async () => {
      const { aiTargetId, targetId } = await registerTarget('agent-ai.test', {
        kind: 'AGENT',
        environment: 'STAGING',
        agentConfig: { dryRunHeaderName: 'X-Dry-Run', dryRunHeaderValue: '1', toolCallsPath: 'tool_calls' },
      });
      await markVerified(targetId);
      const runId = await createApprovedRun(aiTargetId, ['AGY-001'], 'AGENT');
      const refused = await api('POST', `/arena/runs/${runId}/start`, tokens.admin);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('ATTESTATION_MISSING');
      expect((await prisma.arenaRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('APPROVED');
      expect(servers.agent.calls.filter((c) => c.path === '/v1/chat/completions')).toHaveLength(0);

      const att = await api('POST', `/arena/targets/${aiTargetId}/attest`, tokens.engineer, { stagingConfirmed: true, sandboxAttested: true });
      expect(att.status, JSON.stringify(att.body)).toBe(200);
      expect((att.body.attestations as Json).stagingConfirmedAt).toBeTruthy();

      expect((await api('POST', `/arena/runs/${runId}/start`, tokens.admin)).status).toBe(200);
      expect(await waitFinal(runId)).toBe('COMPLETED');
      const chat = servers.agent.calls.filter((c) => c.path === '/v1/chat/completions');
      expect(chat.length).toBeGreaterThan(0);
      for (const c of chat) expect(c.dryRun).toBe('1'); // dry-run header sent on every request

      const attempts = await api('GET', `/arena/runs/${runId}/attempts`, tokens.admin);
      const breach = (attempts.body as unknown as { verdict: string; toolCalls?: { name: string }[] }[]).find((a) => a.verdict === 'BREACH');
      expect(breach, 'a BREACH attempt').toBeTruthy();
      expect(breach?.toolCalls?.[0]?.name).toBe('lookup_record');
      const detail = await api('GET', `/arena/runs/${runId}`, tokens.admin);
      expect((detail.body.artifactsSummary as { agent?: { toolCallsObserved: number } }).agent?.toolCallsObserved).toBeGreaterThan(0);
    });

    it('AGENT targets must be STAGING', async () => {
      const r = await api('POST', '/arena/targets', tokens.admin, {
        projectId, name: 'prod agent', endpointUrl: 'https://agent-prod.test/v1/chat/completions', adapter: 'OPENAI_COMPAT', kind: 'AGENT', environment: 'PRODUCTION',
      });
      expect(r.status).toBe(400);
    });
  });
  describe('limits, races and housekeeping against real Redis/PostgreSQL', () => {
    let aiTargetId = '';
    let targetId = '';
    beforeAll(async () => {
      ({ aiTargetId, targetId } = await registerTarget('hardened-ai.test', { endpointUrl: 'https://hardened-ai.test/v1/chat/completions?limits=1' }));
      await markVerified(targetId);
    });

    it('two simultaneous starts on one target: exactly one wins (atomic Redis lock), the other gets 409 TARGET_BUSY', async () => {
      const a = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT', { maxRounds: 1 });
      const b = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT', { maxRounds: 1 });
      const [ra, rb] = await Promise.all([api('POST', `/arena/runs/${a}/start`, tokens.admin), api('POST', `/arena/runs/${b}/start`, tokens.admin)]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      const loser = ra.status === 409 ? ra : rb;
      expect(loser.body.code).toBe('TARGET_BUSY');
      const winnerId = ra.status === 200 ? a : b;
      expect(await waitFinal(winnerId)).toBe('COMPLETED');
      expect(await redis.exists(arenaRedisKeys.targetLock(aiTargetId))).toBe(0);
      // the loser stays APPROVED and can start after the winner finished
      const loserId = ra.status === 409 ? a : b;
      expect((await prisma.arenaRun.findUniqueOrThrow({ where: { id: loserId } })).status).toBe('APPROVED');
      expect((await api('POST', `/arena/runs/${loserId}/start`, tokens.admin)).status).toBe(200);
      expect(await waitFinal(loserId)).toBe('COMPLETED');
    });

    it('organization daily request limit is enforced from the Redis counter (409 DAILY_LIMIT)', async () => {
      const runId = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT', { maxRequests: 100 });
      const key = arenaRedisKeys.orgDailyRequests(orgId, arenaUtcDayKey(new Date()));
      const original = await redis.get(key);
      await redis.set(key, '1990');
      try {
        const r = await api('POST', `/arena/runs/${runId}/start`, tokens.admin);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('DAILY_LIMIT');
        expect(await redis.exists(arenaRedisKeys.targetLock(aiTargetId))).toBe(0); // no lock leaked by the failed preflight
      } finally {
        if (original === null) await redis.del(key);
        else await redis.set(key, original);
      }
    });

    it('reaper fails a RUNNING run whose worker died and releases its target lock', async () => {
      const runId = await createApprovedRun(aiTargetId, ['PI-001'], 'CHAT');
      await prisma.arenaRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: new Date(Date.now() - 6 * 3_600_000) } });
      await redis.set(arenaRedisKeys.targetLock(aiTargetId), runId);
      const result = await retention.runOnce();
      expect(result.runsReaped).toBeGreaterThanOrEqual(1);
      const run = await prisma.arenaRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.status).toBe('FAILED');
      expect(run.abortedReason).toBe('stalled');
      expect(await redis.exists(arenaRedisKeys.targetLock(aiTargetId))).toBe(0);
      expect((await prisma.auditLog.findMany({ where: { resourceId: runId } })).map((x) => x.action)).toContain('arena.run.failed');
    });

    it('retention tick() is guarded by a Redis lock (second concurrent tick is a no-op)', async () => {
      const first = await retention.tick();
      expect(first).not.toBeNull();
      expect(await retention.tick()).toBeNull();
      await redis.del('arena:retention:lock');
    });
  });
});
