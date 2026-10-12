import { describe, it, expect, vi } from 'vitest';
import { AsmService } from './asm.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SsrfGuardService } from '../ssrf/ssrf-guard.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RedisService } from '../redis/redis.service';
import type { Queue } from 'bullmq';

interface Pair { projectId: string; organizationId: string; rootDomain: string }

function fakeRedis(held = false) {
  const setIfAbsent = vi.fn(async () => !held);
  const del = vi.fn(async () => undefined);
  return { redis: { setIfAbsent, del } as unknown as RedisService, setIfAbsent, del };
}

function setup(opts: {
  pairs: Pair[];
  inFlight?: (p: string) => boolean;
  verified?: (p: string) => boolean;
  held?: boolean;
}) {
  let n = 0;
  const create = vi.fn(async (_a: unknown) => ({ id: `scan${++n}` }));
  const update = vi.fn(async (_a: unknown) => ({}));
  const prisma = {
    asmScan: {
      findMany: vi.fn(async () => opts.pairs),
      findFirst: vi.fn(async (a: { where: { projectId: string } }) =>
        opts.inFlight?.(a.where.projectId) ? { id: 'x' } : null),
      create,
      update,
    },
    target: {
      findFirst: vi.fn(async (a: { where: { projectId: string } }) =>
        (opts.verified ? opts.verified(a.where.projectId) : true) ? { id: 't' } : null),
    },
  } as unknown as PrismaService;
  const add = vi.fn(async (..._a: unknown[]) => ({}));
  const queue = { add } as unknown as Queue;
  const r = fakeRedis(opts.held);
  const svc = new AsmService(
    prisma, {} as SsrfGuardService, {} as AuditService, {} as NotificationsService, queue, r.redis,
  );
  return { svc, create, add, ...r };
}

const pair = (p: string): Pair => ({ projectId: p, organizationId: 'o', rootDomain: `${p}.example.com` });

describe('AsmService.scheduleMonitoring', () => {
  it('queues a scan for verified domains and uses a per-day lock key', async () => {
    const { svc, create, add, setIfAbsent } = setup({ pairs: [pair('p1')] });
    await svc.scheduleMonitoring();
    expect(create).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect((setIfAbsent.mock.calls[0] as unknown[])[0]).toMatch(/^cron-lock:asm:monitoring:\d{4}-\d{2}-\d{2}$/);
  });

  it('does nothing when another instance holds the lock', async () => {
    const { svc, create } = setup({ pairs: [pair('p1')], held: true });
    await svc.scheduleMonitoring();
    expect(create).not.toHaveBeenCalled();
  });

  it('skips domains with a PENDING/RUNNING scan in flight', async () => {
    const { svc, create } = setup({ pairs: [pair('p1'), pair('p2')], inFlight: (p) => p === 'p1' });
    await svc.scheduleMonitoring();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips domains that are no longer verified', async () => {
    const { svc, create } = setup({ pairs: [pair('p1'), pair('p2')], verified: (p) => p !== 'p1' });
    await svc.scheduleMonitoring();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('isolates failures per domain', async () => {
    const { svc, create, add } = setup({ pairs: [pair('p1'), pair('p2')] });
    add.mockRejectedValueOnce(new Error('queue down'));
    await svc.scheduleMonitoring();
    expect(create).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
