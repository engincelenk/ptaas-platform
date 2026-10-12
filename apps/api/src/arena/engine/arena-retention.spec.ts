import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ArenaEvent } from '../arena-events';
import type { ArenaEventsService } from '../arena-events.service';
import {
  ArenaRetentionService,
  RETENTION_INTERVAL_MS,
  RETENTION_LOCK_KEY,
  RETENTION_PLACEHOLDER,
} from './arena-retention.service';

const NOW = new Date('2026-10-12T12:00:00Z');

function setup(lock: 'OK' | null = 'OK') {
  const events: ArenaEvent[] = [];
  const prisma = {
    arenaAttempt: {
      findMany: vi.fn(async (a: { distinct?: string[] }) =>
        a.distinct
          ? [{ organizationId: 'org-1' }, { organizationId: 'org-2' }]
          : [
              { findingId: 'f1', organizationId: 'org-1' },
              { findingId: 'f1', organizationId: 'org-1' },
              { findingId: 'f2', organizationId: 'org-2' },
            ],
      ),
      deleteMany: vi.fn(async () => ({ count: 4 })),
    },
    finding: { updateMany: vi.fn(async () => ({ count: 1 })) },
    arenaRun: {
      findMany: vi.fn(async (a: { where: { status?: string } }) =>
        a.where.status === 'RUNNING'
          ? [{ id: 'run-s', organizationId: 'org-1', scanId: 'scan-s', aiTargetId: 'ait-s', createdById: 'u1' }]
          : [{ id: 'run-old', organizationId: 'org-1' }],
      ),
      updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
    },
    scan: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const audit = { logStrict: vi.fn(async () => undefined) };
  const redis = { set: vi.fn(async () => lock), del: vi.fn(async () => 1) };
  const eventsSvc = { publish: vi.fn(async (_o: string, _r: string, e: ArenaEvent) => void events.push(e)) };
  const svc = new ArenaRetentionService(
    prisma as unknown as PrismaService,
    eventsSvc as unknown as ArenaEventsService,
    audit as unknown as AuditService,
    redis,
  );
  return { svc, prisma, audit, redis, events };
}

describe('ArenaRetentionService', () => {
  it('scrubs findings from expired attempts, deletes expired attempts and clears old emergency contacts', async () => {
    const { svc, prisma } = setup();
    const r = await svc.runOnce(NOW);
    expect(prisma.finding.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['f1'] }, organizationId: 'org-1' },
      data: { httpRequest: RETENTION_PLACEHOLDER, httpResponse: RETENTION_PLACEHOLDER },
    });
    expect(prisma.finding.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.arenaAttempt.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', expiresAt: { lt: NOW } } });
    expect(prisma.arenaAttempt.deleteMany).toHaveBeenCalledTimes(2);
    const contact = prisma.arenaRun.updateMany.mock.calls.find((c) => 'emergencyContact' in (c[0] as { data: object }).data);
    expect((contact?.[0] as { data: object }).data).toEqual({ emergencyContact: null });
    expect(r).toMatchObject({ findingsScrubbed: 2, attemptsDeleted: 8, contactsCleared: 1 });
  });

  it('only touches expired data (query bounds)', async () => {
    const { svc, prisma } = setup();
    await svc.runOnce(NOW);
    const first = prisma.arenaAttempt.findMany.mock.calls[0] as unknown as [{ where: { expiresAt: { lt: Date } } }];
    expect(first[0].where.expiresAt.lt).toEqual(NOW);
    const runQ = prisma.arenaRun.findMany.mock.calls[0] as unknown as [{ where: { completedAt: { lt: Date } } }];
    expect(NOW.getTime() - runQ[0].where.completedAt.lt.getTime()).toBe(30 * 24 * 3600 * 1000);
  });

  it('reaps stalled RUNNING runs: FAILED(stalled), scan failed, lock released, audited, events', async () => {
    const { svc, prisma, audit, redis, events } = setup();
    const r = await svc.runOnce(NOW);
    expect(r.runsReaped).toBe(1);
    const q = prisma.arenaRun.findMany.mock.calls.find((c) => (c[0] as { where: { status?: string } }).where.status === 'RUNNING') as unknown as [
      { where: { startedAt: { lt: Date } } },
    ];
    expect(NOW.getTime() - q[0].where.startedAt.lt.getTime()).toBe(40 * 60 * 1000);
    expect(prisma.arenaRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-s', organizationId: 'org-1', status: 'RUNNING' },
      data: { status: 'FAILED', abortedReason: 'stalled', completedAt: NOW },
    });
    expect(prisma.scan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'scan-s', organizationId: 'org-1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(redis.del).toHaveBeenCalledWith('arena:target-lock:ait-s');
    expect(audit.logStrict).toHaveBeenCalledWith(expect.objectContaining({ action: 'arena.run.failed', organizationId: 'org-1' }));
    expect(events).toEqual([
      { type: 'run.status', status: 'FAILED', reason: 'stalled' },
      { type: 'done', status: 'FAILED' },
    ]);
  });

  it('does not reap a run that finished in the meantime', async () => {
    const { svc, prisma, audit } = setup();
    prisma.arenaRun.updateMany.mockImplementation(async (a: unknown) => ({
      count: (a as { where: { status?: string } }).where.status === 'RUNNING' ? 0 : 1,
    }));
    const r = await svc.runOnce(NOW);
    expect(r.runsReaped).toBe(0);
    expect(audit.logStrict).not.toHaveBeenCalled();
  });

  it('tick() takes a SET NX EX lock and skips when another instance holds it', async () => {
    const a = setup('OK');
    expect(await a.svc.tick(NOW)).not.toBeNull();
    expect(a.redis.set).toHaveBeenCalledWith(RETENTION_LOCK_KEY, '1', 'EX', expect.any(Number), 'NX');
    const b = setup(null);
    expect(await b.svc.tick(NOW)).toBeNull();
    expect(b.prisma.arenaAttempt.findMany).not.toHaveBeenCalled();
  });

  it('tick() never throws', async () => {
    const { svc, prisma } = setup();
    prisma.arenaAttempt.findMany.mockRejectedValue(new Error('db'));
    await expect(svc.tick(NOW)).resolves.toBeNull();
  });

  it('starts an interval every RETENTION_INTERVAL_MS and clears it on destroy', () => {
    vi.useFakeTimers();
    const { svc } = setup();
    const spy = vi.spyOn(svc, 'tick').mockResolvedValue(null);
    svc.onModuleInit();
    vi.advanceTimersByTime(RETENTION_INTERVAL_MS + 1);
    expect(spy).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy();
    vi.advanceTimersByTime(12 * 3600 * 1000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
