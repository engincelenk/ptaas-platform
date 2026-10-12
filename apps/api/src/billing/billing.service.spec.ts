import { describe, it, expect, vi, afterEach } from 'vitest';
import { BillingService } from './billing.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

interface CountArg { where: { organizationId: string; createdAt: { gte: Date; lt: Date } } }

function setup(held = false) {
  const scanCount = vi.fn(async (_a: CountArg) => 1);
  const findingCount = vi.fn(async (_a: CountArg) => 2);
  const upsert = vi.fn(async (_a: unknown) => ({}));
  const prisma = {
    organization: { findMany: vi.fn(async () => [{ id: 'o1' }, { id: 'o2' }]) },
    scan: { count: scanCount },
    finding: { count: findingCount },
    organizationMember: { count: vi.fn(async () => 3) },
    usageSnapshot: { upsert },
  } as unknown as PrismaService;
  const setIfAbsent = vi.fn(async () => !held);
  const svc = new BillingService(prisma, { setIfAbsent, del: vi.fn(async () => undefined) } as unknown as RedisService);
  return { svc, scanCount, upsert, setIfAbsent };
}

describe('BillingService.snapshotAllOrgs', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('uses UTC month bounds: start inclusive, next month start exclusive (lt)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:05Z'));
    const { svc, scanCount, upsert, setIfAbsent } = setup();
    await svc.snapshotAllOrgs();
    const range = scanCount.mock.calls[0][0].where.createdAt;
    expect(range.gte.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(range.lt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(upsert).toHaveBeenCalledTimes(2);
    expect((setIfAbsent.mock.calls[0] as unknown[])[0]).toBe('cron-lock:billing:snapshot:2026-03');
  });

  it('handles the January -> December rollover', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:05Z'));
    const { svc, scanCount } = setup();
    await svc.snapshotAllOrgs();
    const range = scanCount.mock.calls[0][0].where.createdAt;
    expect(range.gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(range.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('does nothing when the lock is held', async () => {
    const { svc, upsert } = setup(true);
    await svc.snapshotAllOrgs();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a failing org does not stop the others', async () => {
    const { svc, upsert } = setup();
    upsert.mockRejectedValueOnce(new Error('db'));
    await svc.snapshotAllOrgs();
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
