type Loose = { [key: string]: Loose } & string;
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ARENA_LIMITS, ARENA_RUN_QUEUE, arenaRedisKeys } from '../arena.constants';
import { ArenaRunsService, clampRunBudgets } from './arena-runs.service';
import { arenaUtcDayKey, type ArenaActor } from './arena-views';

const ADMIN: ArenaActor = { userId: 'u-admin', organizationId: 'org1', role: 'ADMIN' };
const ENGINEER: ArenaActor = { userId: 'u-eng', organizationId: 'org1', role: 'SECURITY_ENGINEER' };
const OPERATOR_ADMIN: ArenaActor = { ...ADMIN, email: 'ops@platform.example' };
const ROE = { id: 'roe1', version: 1, content: 'RoE', contentHash: 'hash1' };
const DAY = 86_400_000;

function runRow(over: Record<string, unknown> = {}) {
  return {
    id: 'run1',
    organizationId: 'org1',
    aiTargetId: 'ai1',
    scanId: 'scan1',
    status: 'APPROVED',
    goalIds: ['g1', 'g2'],
    maxRounds: 5,
    maxRequests: 100,
    maxTokens: 200_000,
    requestsPerSecond: 1,
    windowStart: null,
    windowEnd: null,
    usedRequests: 0,
    usedTokens: 0,
    roeId: 'roe1',
    emergencyContact: '+49 1',
    approvedById: 'u-admin',
    approvedByName: 'Ada',
    approvedAt: new Date('2026-10-12T08:00:00Z'),
    modelVersions: null,
    retestOfRunId: null,
    abortedReason: null,
    startedAt: null,
    completedAt: null,
    createdById: 'u-eng',
    createdAt: new Date('2026-10-12T07:00:00Z'),
    updatedAt: new Date('2026-10-12T07:00:00Z'),
    roe: { id: 'roe1', version: 1 },
    aiTarget: {
      id: 'ai1',
      name: 'Bot',
      targetId: 't1',
      organizationId: 'org1',
      target: {
        id: 't1',
        value: 'https://chat.example.com/api/chat',
        projectId: 'p1',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(Date.now() - 2 * DAY),
      },
    },
    ...over,
  };
}

function setup(run: Record<string, unknown> = runRow()) {
  const prisma = {
    arenaRun: {
      findFirst: vi.fn().mockImplementation((args: { where: { id?: unknown } }) =>
        Promise.resolve(typeof args.where.id === 'object' ? null : run),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(() => Promise.resolve(runRow({ status: 'DRAFT', roeId: null, roe: null }))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    aiTarget: { findFirst: vi.fn().mockResolvedValue(runRow().aiTarget), count: vi.fn().mockResolvedValue(0) },
    arenaGoal: { findMany: vi.fn().mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]) },
    arenaAttempt: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    arenaRecommendation: { findMany: vi.fn().mockResolvedValue([]) },
    scan: { update: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Ada Admin' }) },
    organizationMember: { findFirst: vi.fn().mockResolvedValue({ role: 'ADMIN' }) },
  };
  const audit = { log: vi.fn(), logStrict: vi.fn().mockResolvedValue(undefined) };
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    setIfAbsent: vi.fn().mockResolvedValue(true),
    del: vi.fn().mockResolvedValue(undefined),
  };
  const ssrf = { resolveSafe: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) };
  const kill = {
    isKilled: vi.fn().mockResolvedValue(false),
    killRun: vi.fn().mockResolvedValue(undefined),
    setGlobal: vi.fn().mockResolvedValue(undefined),
    setOrg: vi.fn().mockResolvedValue(undefined),
  };
  const roe = { getCurrent: vi.fn().mockResolvedValue(ROE) };
  const scoreboard = { compute: vi.fn() };
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  const queue = { add: vi.fn().mockResolvedValue({}) };
  const env: Record<string, string | undefined> = {};
  const config = { get: vi.fn().mockImplementation((k: string) => env[k]) };
  const svc = new ArenaRunsService(
    prisma as never,
    audit as never,
    redis as never,
    ssrf as never,
    kill as never,
    roe as never,
    scoreboard as never,
    events as never,
    queue as never,
    config as never,
  );
  return { svc, prisma, audit, redis, ssrf, kill, roe, scoreboard, events, queue, env };
}

const code = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ConflictException) return (e.getResponse() as { code?: string }).code;
    throw e;
  }
  return undefined;
};

describe('clampRunBudgets', () => {
  it('applies defaults', () => {
    expect(clampRunBudgets({})).toEqual({ maxRounds: 5, maxRequests: 100, maxTokens: 200_000, requestsPerSecond: 1 });
  });
  it('clamps everything to ARENA_LIMITS and to at least 1', () => {
    expect(clampRunBudgets({ maxRounds: 999, maxRequests: 99_999, maxTokens: 99_999_999, requestsPerSecond: 50 })).toEqual({
      maxRounds: ARENA_LIMITS.maxRounds,
      maxRequests: ARENA_LIMITS.maxRequestsPerRun,
      maxTokens: ARENA_LIMITS.maxTokensPerRun,
      requestsPerSecond: ARENA_LIMITS.maxRequestsPerSecond,
    });
    const low = clampRunBudgets({ maxRounds: 0, maxRequests: -5, maxTokens: 0.2, requestsPerSecond: 0 });
    expect(low.maxRounds).toBe(1);
    expect(low.maxRequests).toBe(1);
    expect(low.maxTokens).toBe(1);
    expect(low.requestsPerSecond).toBeGreaterThan(0);
  });
});

describe('ArenaRunsService.create', () => {
  it('creates a DRAFT run with an AI_ARENA scan and clamped budgets', async () => {
    const { svc, prisma } = setup();
    await svc.create({ aiTargetId: 'ai1', goalIds: ['g1', 'g2', 'g1'], maxRounds: 99, maxRequests: 100_000 }, ENGINEER);
    const data = (prisma.arenaRun.create.mock.calls[0][0] as { data: Loose }).data;
    expect(data.status).toBe('DRAFT');
    expect(data.goalIds).toEqual(['g1', 'g2']);
    expect(data.maxRounds).toBe(ARENA_LIMITS.maxRounds);
    expect(data.maxRequests).toBe(ARENA_LIMITS.maxRequestsPerRun);
    expect(data.organization).toEqual({ connect: { id: 'org1' } });
    expect(data.scan.create).toMatchObject({
      type: 'AI_ARENA',
      status: 'QUEUED',
      target: { connect: { id: 't1' } },
      project: { connect: { id: 'p1' } },
      organization: { connect: { id: 'org1' } },
      createdBy: { connect: { id: 'u-eng' } },
    });
  });

  it('rejects goals that do not exist or are inactive', async () => {
    const { svc, prisma } = setup();
    prisma.arenaGoal.findMany.mockResolvedValue([{ id: 'g1' }]);
    await expect(svc.create({ aiTargetId: 'ai1', goalIds: ['g1', 'gX'] }, ENGINEER)).rejects.toThrow(BadRequestException);
    expect(prisma.arenaGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['g1', 'gX'] }, active: true } }),
    );
    expect(prisma.arenaRun.create).not.toHaveBeenCalled();
  });

  it('rejects a foreign AI target / foreign retest run (404)', async () => {
    const { svc, prisma } = setup();
    prisma.aiTarget.findFirst.mockResolvedValue(null);
    await expect(svc.create({ aiTargetId: 'ai1', goalIds: ['g1'] }, ENGINEER)).rejects.toThrow(NotFoundException);
    expect(prisma.aiTarget.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ai1', organizationId: 'org1' } }));

    prisma.aiTarget.findFirst.mockResolvedValue(runRow().aiTarget);
    prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(
      svc.create({ aiTargetId: 'ai1', goalIds: ['g1', 'g2'], retestOfRunId: 'foreign' }, ENGINEER),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an inverted time window', async () => {
    const { svc } = setup();
    await expect(
      svc.create(
        { aiTargetId: 'ai1', goalIds: ['g1'], windowStart: '2026-10-13T00:00:00Z', windowEnd: '2026-10-12T00:00:00Z' },
        ENGINEER,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ArenaRunsService.submit', () => {
  it('moves DRAFT to AWAITING_APPROVAL', async () => {
    const { svc, prisma } = setup(runRow({ status: 'DRAFT' }));
    await svc.submit('run1', ENGINEER);
    expect(prisma.arenaRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run1', organizationId: 'org1', status: 'DRAFT' },
      data: { status: 'AWAITING_APPROVAL' },
    });
  });

  it('refuses non-DRAFT runs and runs with a stale verification (pre-check)', async () => {
    expect(await code(setup(runRow({ status: 'APPROVED' })).svc.submit('run1', ENGINEER))).toBe('RUN_NOT_DRAFT');
    const stale = runRow({ status: 'DRAFT' });
    stale.aiTarget.target.verifiedAt = new Date(Date.now() - 31 * DAY);
    expect(await code(setup(stale).svc.submit('run1', ENGINEER))).toBe('VERIFICATION_EXPIRED');
  });

  it('is tenant-scoped (foreign org → 404)', async () => {
    const { svc, prisma } = setup();
    prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(svc.submit('run1', { ...ENGINEER, organizationId: 'other' })).rejects.toThrow(NotFoundException);
    expect(prisma.arenaRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run1', organizationId: 'other' } }));
  });
});

describe('ArenaRunsService.approve', () => {
  const dto = {
    roeVersion: 1,
    emergencyContact: ' Max Muster +49 170 1 ',
    confirmations: { noProduction: true, noSideEffects: true, noTools: true, providerTosAccepted: true },
  };

  it('approves: stores name, time, roeId and contact; conditional claim, then logStrict', async () => {
    const { svc, prisma, audit } = setup(runRow({ status: 'AWAITING_APPROVAL', roeId: null, roe: null }));
    const order: string[] = [];
    audit.logStrict.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    prisma.arenaRun.updateMany.mockImplementation(() => {
      order.push('update');
      return Promise.resolve({ count: 1 });
    });
    await svc.approve('run1', dto, ADMIN);
    expect(order).toEqual(['update', 'audit']); // conditional claim first, audit second
    expect(audit.logStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'arena.run.approved', metadata: { roeHash: 'hash1', roeVersion: 1 } }),
    );
    const call = prisma.arenaRun.updateMany.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
    expect(call.where).toEqual({ id: 'run1', organizationId: 'org1', status: 'AWAITING_APPROVAL' });
    expect(call.data).toMatchObject({
      status: 'APPROVED',
      roeId: 'roe1',
      emergencyContact: 'Max Muster +49 170 1',
      approvedById: 'u-admin',
      approvedByName: 'Ada Admin',
    });
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });

  it('only ADMIN may approve (SECURITY_ENGINEER, DEVELOPER, VIEWER are forbidden)', async () => {
    for (const role of ['SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER']) {
      const { svc, prisma, audit } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
      await expect(svc.approve('run1', dto, { ...ADMIN, role })).rejects.toThrow(ForbiddenException);
      expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
      expect(audit.logStrict).not.toHaveBeenCalled();
    }
  });

  it('requires every confirmation to be true and a non-empty contact', async () => {
    for (const key of ['noProduction', 'noSideEffects', 'noTools', 'providerTosAccepted'] as const) {
      const { svc, prisma } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
      await expect(
        svc.approve('run1', { ...dto, confirmations: { ...dto.confirmations, [key]: false } }, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
    }
    const { svc } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
    await expect(svc.approve('run1', { ...dto, emergencyContact: '   ' }, ADMIN)).rejects.toThrow(BadRequestException);
  });

  it('rejects an outdated RoE version (409 ROE_OUTDATED)', async () => {
    const { svc, prisma } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
    expect(await code(svc.approve('run1', { ...dto, roeVersion: 0 }, ADMIN))).toBe('ROE_OUTDATED');
    expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
  });

  it('only AWAITING_APPROVAL runs can be approved', async () => {
    const { svc } = setup(runRow({ status: 'DRAFT' }));
    expect(await code(svc.approve('run1', dto, ADMIN))).toBe('RUN_NOT_AWAITING_APPROVAL');
  });

  it('a failing audit write rolls the approval back and answers 409 AUDIT_FAILED', async () => {
    const { svc, prisma, audit } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
    audit.logStrict.mockRejectedValue(new Error('db down'));
    expect(await code(svc.approve('run1', dto, ADMIN))).toBe('AUDIT_FAILED');
    expect(prisma.arenaRun.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.arenaRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'run1', organizationId: 'org1', status: 'APPROVED', approvedById: 'u-admin' },
      data: { status: 'AWAITING_APPROVAL', roeId: null, emergencyContact: null, approvedById: null, approvedByName: null, approvedAt: null },
    });
  });

  it('a race loser writes no audit entry', async () => {
    const { svc, prisma, audit } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
    prisma.arenaRun.updateMany.mockResolvedValue({ count: 0 });
    expect(await code(svc.approve('run1', dto, ADMIN))).toBe('RUN_NOT_AWAITING_APPROVAL');
    expect(audit.logStrict).not.toHaveBeenCalled();
  });

  it('re-reads the role from the database: a demoted or removed admin is rejected (403)', async () => {
    for (const member of [{ role: 'VIEWER' }, { role: 'SECURITY_ENGINEER' }, null]) {
      const { svc, prisma, audit } = setup(runRow({ status: 'AWAITING_APPROVAL' }));
      prisma.organizationMember.findFirst.mockResolvedValue(member);
      await expect(svc.approve('run1', dto, ADMIN)).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-admin', organizationId: 'org1' } }),
      );
      expect(prisma.arenaRun.updateMany).not.toHaveBeenCalled();
      expect(audit.logStrict).not.toHaveBeenCalled();
    }
  });

  it('foreign org → 404', async () => {
    const { svc, prisma } = setup();
    prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(svc.approve('run1', dto, { ...ADMIN, organizationId: 'other' })).rejects.toThrow(NotFoundException);
  });
});

describe('ArenaRunsService.start (preflight)', () => {
  beforeEach(() => vi.useRealTimers());

  it('happy path: lock, then claim, then audit, then queue; RUNNING + scan RUNNING + job', async () => {
    const { svc, prisma, audit, queue, redis } = setup();
    const order: string[] = [];
    audit.logStrict.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    prisma.arenaRun.updateMany.mockImplementation(() => {
      order.push('claim');
      return Promise.resolve({ count: 1 });
    });
    queue.add.mockImplementation(() => {
      order.push('queue');
      return Promise.resolve({});
    });
    await svc.start('run1', 'org1', 'u-eng');
    expect(order).toEqual(['claim', 'audit', 'queue']);
    expect(redis.setIfAbsent).toHaveBeenCalledWith('arena:target-lock:ai1', 'run1', 45 * 60);
    expect(redis.del).not.toHaveBeenCalled();
    expect(audit.logStrict).toHaveBeenCalledWith(expect.objectContaining({ action: 'arena.run.started', organizationId: 'org1', userId: 'u-eng' }));
    expect(prisma.arenaRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1', organizationId: 'org1', status: 'APPROVED' }, data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
    expect(prisma.scan.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scan1' }, data: expect.objectContaining({ status: 'RUNNING' }) }));
    expect(queue.add).toHaveBeenCalledWith(ARENA_RUN_QUEUE, { runId: 'run1', organizationId: 'org1' }, expect.objectContaining({ jobId: 'arena-run-run1' }));
  });

  const blocked = async (mutate: (s: ReturnType<typeof setup>) => void, run = runRow()) => {
    const s = setup(run);
    mutate(s);
    const c = await code(s.svc.start('run1', 'org1', 'u-eng'));
    expect(s.queue.add).not.toHaveBeenCalled();
    expect(s.audit.logStrict).not.toHaveBeenCalled();
    expect(s.prisma.arenaRun.updateMany).not.toHaveBeenCalled();
    return c;
  };

  it('1a. run must be APPROVED', async () => {
    for (const status of ['DRAFT', 'AWAITING_APPROVAL', 'RUNNING', 'COMPLETED', 'ABORTED']) {
      expect(await blocked(() => undefined, runRow({ status }))).toBe('RUN_NOT_APPROVED');
    }
  });

  it('1b. RoE changed since approval → new approval required', async () => {
    expect(await blocked((s) => s.roe.getCurrent.mockResolvedValue({ ...ROE, id: 'roe2', version: 2 }))).toBe('ROE_OUTDATED');
    expect(await blocked(() => undefined, runRow({ roeId: null }))).toBe('ROE_OUTDATED');
  });

  it('2a. target must be VERIFIED', async () => {
    const r = runRow();
    r.aiTarget.target.verificationStatus = 'PENDING';
    expect(await blocked(() => undefined, r)).toBe('VERIFICATION_REQUIRED');
    const f = runRow();
    f.aiTarget.target.verificationStatus = 'FAILED';
    expect(await blocked(() => undefined, f)).toBe('VERIFICATION_REQUIRED');
  });

  it('2b. expired verification (> 30 days) blocks the start', async () => {
    const r = runRow();
    r.aiTarget.target.verifiedAt = new Date(Date.now() - 31 * DAY);
    expect(await blocked(() => undefined, r)).toBe('VERIFICATION_EXPIRED');
    const n = runRow();
    n.aiTarget.target.verifiedAt = null as never;
    expect(await blocked(() => undefined, n)).toBe('VERIFICATION_EXPIRED');
  });

  it('3a. provider host is blocked even if it was verified', async () => {
    const r = runRow();
    r.aiTarget.target.value = 'https://api.openai.com/v1/chat/completions';
    expect(await blocked(() => undefined, r)).toBe('PROVIDER_HOST');
  });

  it('3b. SSRF: host resolving to an internal address is blocked', async () => {
    expect(await blocked((s) => s.ssrf.resolveSafe.mockRejectedValue(new BadRequestException('internal address')))).toBe('HOST_UNSAFE');
  });

  it('4. time window: not yet open / already closed', async () => {
    expect(await blocked(() => undefined, runRow({ windowStart: new Date(Date.now() + 3_600_000) }))).toBe('WINDOW_NOT_OPEN');
    expect(await blocked(() => undefined, runRow({ windowEnd: new Date(Date.now() - 3_600_000) }))).toBe('WINDOW_CLOSED');
  });

  it('4b. inside the window is fine', async () => {
    const { svc, queue } = setup(runRow({ windowStart: new Date(Date.now() - 3_600_000), windowEnd: new Date(Date.now() + 3_600_000) }));
    await svc.start('run1', 'org1', 'u-eng');
    expect(queue.add).toHaveBeenCalled();
  });

  it('5a. stored budget above platform limits is blocked', async () => {
    expect(await blocked(() => undefined, runRow({ maxRequests: ARENA_LIMITS.maxRequestsPerRun + 1 }))).toBe('BUDGET_EXCEEDS_LIMITS');
    expect(await blocked(() => undefined, runRow({ maxRounds: ARENA_LIMITS.maxRounds + 1 }))).toBe('BUDGET_EXCEEDS_LIMITS');
    expect(await blocked(() => undefined, runRow({ maxTokens: ARENA_LIMITS.maxTokensPerRun + 1 }))).toBe('BUDGET_EXCEEDS_LIMITS');
    expect(await blocked(() => undefined, runRow({ requestsPerSecond: ARENA_LIMITS.maxRequestsPerSecond + 1 }))).toBe('BUDGET_EXCEEDS_LIMITS');
  });

  it('5b. organization daily limit: used + run budget must fit; reads the UTC-day key', async () => {
    const s = setup();
    s.redis.get.mockResolvedValue(String(ARENA_LIMITS.maxRequestsPerOrgPerDay - 99)); // 99 left, run needs 100
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('DAILY_LIMIT');
    expect(s.redis.get).toHaveBeenCalledWith(arenaRedisKeys.orgDailyRequests('org1', arenaUtcDayKey()));
    expect(s.queue.add).not.toHaveBeenCalled();

    const ok = setup();
    ok.redis.get.mockResolvedValue(String(ARENA_LIMITS.maxRequestsPerOrgPerDay - 100)); // exactly fits
    await ok.svc.start('run1', 'org1', 'u-eng');
    expect(ok.queue.add).toHaveBeenCalled();
  });

  it('6a. kill switch (global or run) blocks the start', async () => {
    const s = setup();
    s.kill.isKilled.mockResolvedValue(true);
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('KILL_SWITCH');
    expect(s.kill.isKilled).toHaveBeenCalledWith('run1', 'org1');
    expect(s.queue.add).not.toHaveBeenCalled();
  });

  it('6b. another RUNNING run on the same AI target blocks the start', async () => {
    const s = setup();
    s.prisma.arenaRun.findFirst.mockImplementation((args: { where: { id?: unknown } }) =>
      Promise.resolve(typeof args.where.id === 'object' ? { id: 'other-run' } : runRow()),
    );
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('TARGET_BUSY');
    expect(s.prisma.arenaRun.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { aiTargetId: 'ai1', organizationId: 'org1', status: 'RUNNING', id: { not: 'run1' } } }),
    );
    expect(s.queue.add).not.toHaveBeenCalled();
  });

  it('6c. an already held target lock (atomic) blocks the start', async () => {
    const s = setup();
    s.redis.setIfAbsent.mockResolvedValue(false);
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('TARGET_BUSY');
    expect(s.prisma.arenaRun.updateMany).not.toHaveBeenCalled();
    expect(s.audit.logStrict).not.toHaveBeenCalled();
    expect(s.queue.add).not.toHaveBeenCalled();
    expect(s.redis.del).not.toHaveBeenCalled(); // never release a lock we do not own
  });

  it('7. a failing audit write rolls the claim back, releases the lock and prevents the start', async () => {
    const s = setup();
    s.audit.logStrict.mockRejectedValue(new Error('audit table unavailable'));
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('AUDIT_FAILED');
    expect(s.prisma.arenaRun.updateMany).toHaveBeenCalledTimes(2);
    expect(s.prisma.arenaRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'run1', organizationId: 'org1', status: 'RUNNING' },
      data: { status: 'APPROVED', startedAt: null },
    });
    expect(s.redis.del).toHaveBeenCalledWith('arena:target-lock:ai1');
    expect(s.prisma.scan.update).not.toHaveBeenCalled();
    expect(s.queue.add).not.toHaveBeenCalled();
  });

  it('a lost claim race writes no audit entry, does not enqueue and releases the lock', async () => {
    const s = setup();
    s.prisma.arenaRun.updateMany.mockResolvedValue({ count: 0 });
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('RUN_NOT_APPROVED');
    expect(s.audit.logStrict).not.toHaveBeenCalled();
    expect(s.queue.add).not.toHaveBeenCalled();
    expect(s.prisma.arenaRun.updateMany).toHaveBeenCalledTimes(1); // no revert: we never owned the claim
    expect(s.redis.del).toHaveBeenCalledWith('arena:target-lock:ai1');
  });

  it('an org kill switch blocks the start (isKilled receives the organization)', async () => {
    const s = setup();
    s.kill.isKilled.mockImplementation((_r: string, org?: string) => Promise.resolve(org === 'org1'));
    expect(await code(s.svc.start('run1', 'org1', 'u-eng'))).toBe('KILL_SWITCH');
  });

  it('a queue failure reverts the run to APPROVED', async () => {
    const s = setup();
    s.queue.add.mockRejectedValue(new Error('redis down'));
    await expect(s.svc.start('run1', 'org1', 'u-eng')).rejects.toThrow(ServiceUnavailableException);
    expect(s.prisma.arenaRun.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED', startedAt: null } }),
    );
    expect(s.redis.del).toHaveBeenCalledWith('arena:target-lock:ai1');
  });

  it('foreign org → 404 and nothing happens', async () => {
    const s = setup();
    s.prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(s.svc.start('run1', 'other', 'u')).rejects.toThrow(NotFoundException);
    expect(s.queue.add).not.toHaveBeenCalled();
  });
});

describe('ArenaRunsService.abort', () => {
  it('RUNNING: sets the kill switch first (before audit), leaves final status to the engine', async () => {
    const s = setup(runRow({ status: 'RUNNING' }));
    const order: string[] = [];
    s.kill.killRun.mockImplementation(() => {
      order.push('kill');
      return Promise.resolve();
    });
    s.audit.logStrict.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    await s.svc.abort('run1', ENGINEER, 'customer asked');
    expect(order).toEqual(['kill', 'audit']);
    expect(s.audit.logStrict).toHaveBeenCalledWith(expect.objectContaining({ action: 'arena.run.abort_requested' }));
    // no status flip to ABORTED here
    for (const c of s.prisma.arenaRun.updateMany.mock.calls) {
      expect((c[0] as { data: { status?: string } }).data.status).toBeUndefined();
    }
    expect(s.prisma.scan.update).not.toHaveBeenCalled();
  });

  it('a failing audit still leaves the kill switch set', async () => {
    const s = setup(runRow({ status: 'RUNNING' }));
    s.audit.logStrict.mockRejectedValue(new Error('audit down'));
    await expect(s.svc.abort('run1', ENGINEER)).rejects.toThrow('audit down');
    expect(s.kill.killRun).toHaveBeenCalledWith('run1');
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'])('%s: aborted immediately, scan cancelled, done event', async (status) => {
    const s = setup(runRow({ status }));
    await s.svc.abort('run1', ENGINEER, 'changed my mind');
    expect(s.prisma.arenaRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run1', organizationId: 'org1', status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'] } },
        data: expect.objectContaining({ status: 'ABORTED', abortedReason: 'changed my mind' }),
      }),
    );
    expect(s.prisma.scan.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scan1' }, data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(s.events.publish).toHaveBeenCalledWith('org1', 'run1', { type: 'done', status: 'ABORTED' });
  });

  it('terminal runs are left alone (idempotent)', async () => {
    const s = setup(runRow({ status: 'COMPLETED' }));
    await s.svc.abort('run1', ENGINEER);
    expect(s.kill.killRun).not.toHaveBeenCalled();
    expect(s.audit.logStrict).not.toHaveBeenCalled();
  });

  it('foreign org → 404 without touching the kill switch', async () => {
    const s = setup();
    s.prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(s.svc.abort('run1', { ...ENGINEER, organizationId: 'other' })).rejects.toThrow(NotFoundException);
    expect(s.kill.killRun).not.toHaveBeenCalled();
  });
});

describe('ArenaRunsService.retest / setGlobalKill / reads', () => {
  it('retest copies goals and budgets (not the window) and links the previous run', async () => {
    const s = setup(runRow({ status: 'COMPLETED', maxRounds: 3, windowStart: new Date(), windowEnd: new Date() }));
    await s.svc.retest('run1', ENGINEER);
    const data = (s.prisma.arenaRun.create.mock.calls[0][0] as { data: Loose }).data;
    expect(data.goalIds).toEqual(['g1', 'g2']);
    expect(data.maxRounds).toBe(3);
    expect(data.retestOf).toEqual({ connect: { id: 'run1' } });
    expect(data.windowStart).toBeNull();
  });

  it('retest only for finished runs', async () => {
    expect(await code(setup(runRow({ status: 'RUNNING' })).svc.retest('run1', ENGINEER))).toBe('RUN_NOT_FINISHED');
  });

  it('global kill ON sets first then audits; OFF audits first (audit failure keeps it on)', async () => {
    const on = setup();
    on.env.ARENA_PLATFORM_ADMINS = 'u-admin';
    const order: string[] = [];
    on.kill.setGlobal.mockImplementation(() => {
      order.push('set');
      return Promise.resolve();
    });
    on.audit.logStrict.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    expect(await on.svc.setGlobalKill(true, ADMIN)).toEqual({ on: true });
    expect(order).toEqual(['set', 'audit']);

    const off = setup();
    off.env.ARENA_PLATFORM_ADMINS = 'u-admin';
    off.audit.logStrict.mockRejectedValue(new Error('x'));
    await expect(off.svc.setGlobalKill(false, ADMIN)).rejects.toThrow('x');
    expect(off.kill.setGlobal).not.toHaveBeenCalled();
  });

  it('global kill: an ordinary org admin is forbidden; unset/empty allowlist fails closed', async () => {
    for (const value of [undefined, '', '  ,, ', 'someone-else,other@x.example']) {
      const s = setup();
      s.env.ARENA_PLATFORM_ADMINS = value;
      await expect(s.svc.setGlobalKill(true, ADMIN)).rejects.toThrow(ForbiddenException);
      expect(s.kill.setGlobal).not.toHaveBeenCalled();
      expect(s.audit.logStrict).not.toHaveBeenCalled();
    }
  });

  it('global kill: allowlist matches user id or e-mail (case-insensitive), role still re-read from the DB', async () => {
    const byId = setup();
    byId.env.ARENA_PLATFORM_ADMINS = 'x, u-admin ';
    await expect(byId.svc.setGlobalKill(true, ADMIN)).resolves.toEqual({ on: true });
    expect(byId.kill.setGlobal).toHaveBeenCalledWith(true);

    const byMail = setup();
    byMail.env.ARENA_PLATFORM_ADMINS = 'OPS@platform.example';
    await expect(byMail.svc.setGlobalKill(true, OPERATOR_ADMIN)).resolves.toEqual({ on: true });

    const demoted = setup();
    demoted.env.ARENA_PLATFORM_ADMINS = 'u-admin';
    demoted.prisma.organizationMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
    await expect(demoted.svc.setGlobalKill(true, ADMIN)).rejects.toThrow(ForbiddenException);
    expect(demoted.kill.setGlobal).not.toHaveBeenCalled();
  });

  it('org kill: sets only the own organization, audits, and never touches the global switch', async () => {
    const s = setup();
    const order: string[] = [];
    s.kill.setOrg.mockImplementation(() => {
      order.push('set');
      return Promise.resolve();
    });
    s.audit.logStrict.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve();
    });
    await expect(s.svc.setOrgKill(true, { ...ADMIN, organizationId: 'org1' })).resolves.toEqual({ on: true });
    expect(order).toEqual(['set', 'audit']);
    expect(s.kill.setOrg).toHaveBeenCalledWith('org1', true);
    expect(s.kill.setGlobal).not.toHaveBeenCalled();
    expect(s.audit.logStrict).toHaveBeenCalledWith(expect.objectContaining({ action: 'arena.kill_switch.org', organizationId: 'org1' }));
  });

  it('org kill OFF audits first; audit failure keeps it on; non-admins (by DB role) are forbidden', async () => {
    const off = setup();
    off.audit.logStrict.mockRejectedValue(new Error('x'));
    await expect(off.svc.setOrgKill(false, ADMIN)).rejects.toThrow('x');
    expect(off.kill.setOrg).not.toHaveBeenCalled();

    const eng = setup();
    eng.prisma.organizationMember.findFirst.mockResolvedValue({ role: 'SECURITY_ENGINEER' });
    await expect(eng.svc.setOrgKill(true, ADMIN)).rejects.toThrow(ForbiddenException);
    expect(eng.kill.setOrg).not.toHaveBeenCalled();
  });

  it('emergencyContact is visible to operators only (null for DEVELOPER/VIEWER/unknown role)', async () => {
    const s = setup();
    expect((await s.svc.getView('run1', 'org1', 'ADMIN')).emergencyContact).toBe('+49 1');
    expect((await s.svc.getView('run1', 'org1', 'SECURITY_ENGINEER')).emergencyContact).toBe('+49 1');
    expect((await s.svc.getView('run1', 'org1', 'DEVELOPER')).emergencyContact).toBeNull();
    expect((await s.svc.getView('run1', 'org1', 'VIEWER')).emergencyContact).toBeNull();
    expect((await s.svc.getView('run1', 'org1')).emergencyContact).toBeNull();
    s.scoreboard.compute.mockResolvedValue({ totals: { attempts: 0, breachRate: 0 } });
    s.prisma.arenaGoal.findMany.mockResolvedValue([]);
    expect((await s.svc.getDetail('run1', 'org1', 'VIEWER')).emergencyContact).toBeNull();
    expect((await s.svc.getDetail('run1', 'org1', 'ADMIN')).emergencyContact).toBe('+49 1');
  });

  it('list/get/attempts/detail are tenant-scoped', async () => {
    const s = setup();
    await s.svc.list('org1', 'ai1');
    expect(s.prisma.arenaRun.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1', aiTargetId: 'ai1' } }));
    s.prisma.arenaRun.findFirst.mockResolvedValue(null);
    await expect(s.svc.getView('run1', 'other')).rejects.toThrow(NotFoundException);
    await expect(s.svc.getDetail('run1', 'other')).rejects.toThrow(NotFoundException);
    await expect(s.svc.attempts('run1', 'other')).rejects.toThrow(NotFoundException);
    await expect(s.svc.statusOf('run1', 'other')).rejects.toThrow(NotFoundException);
    expect(s.prisma.arenaAttempt.findMany).not.toHaveBeenCalled();
  });

  it('attempts are filtered by org, retention, goal and cursor', async () => {
    const s = setup();
    await s.svc.attempts('run1', 'org1', { goalId: 'g1', after: '2026-10-12T08:00:00.000Z' });
    const where = (s.prisma.arenaAttempt.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ runId: 'run1', organizationId: 'org1', goalId: 'g1', createdAt: { gt: new Date('2026-10-12T08:00:00.000Z') } });
    expect(where.expiresAt).toBeDefined();
  });

  it('catalog never selects seedAttacks / successCriteria', async () => {
    const s = setup();
    (s.prisma.arenaGoal.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await s.svc.catalog();
    const select = (s.prisma.arenaGoal.findMany.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    expect(select).not.toHaveProperty('seedAttacks');
    expect(select).not.toHaveProperty('successCriteria');
    expect(Object.keys(select)).toEqual(expect.arrayContaining(['id', 'key', 'category', 'title', 'description', 'owaspRef', 'atlasRef', 'baseSeverity']));
  });

  it('detail view does not leak seed attacks of the run goals', async () => {
    const s = setup();
    s.scoreboard.compute.mockResolvedValue({ totals: { attempts: 0, breachRate: 0 } });
    s.prisma.arenaGoal.findMany.mockResolvedValue([
      { id: 'g1', key: 'PI-001', category: 'PROMPT_INJECTION', title: 'T', description: 'D', owaspRef: 'LLM01', atlasRef: null, baseSeverity: 'HIGH', seedAttacks: ['SECRET ATTACK'], successCriteria: { type: 'canary' } },
    ]);
    const detail = await s.svc.getDetail('run1', 'org1');
    expect(JSON.stringify(detail)).not.toMatch(/SECRET ATTACK|successCriteria|seedAttacks/);
  });

  it('overview aggregates counts, last run and breach rate', async () => {
    const s = setup();
    s.prisma.aiTarget.count.mockResolvedValue(2);
    s.prisma.arenaRun.count.mockResolvedValueOnce(5).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    s.prisma.arenaRun.findMany.mockResolvedValue([runRow({ id: 'r2', status: 'DRAFT' }), runRow({ id: 'r1', status: 'COMPLETED' })]);
    s.prisma.arenaAttempt.groupBy.mockResolvedValue([
      { runId: 'r1', verdict: 'BREACH', _count: { _all: 1 } },
      { runId: 'r1', verdict: 'BLOCKED', _count: { _all: 3 } },
    ]);
    const o = await s.svc.overview('org1');
    expect(o.targets).toBe(2);
    expect(o.runs).toEqual({ total: 5, running: 1, awaitingApproval: 2 });
    expect(o.lastRun?.id).toBe('r2');
    expect(o.breachRate).toBe(0.25);
  });
});
