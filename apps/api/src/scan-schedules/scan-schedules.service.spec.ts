import { describe, it, expect, vi } from 'vitest';
import { ScanSchedulesService, MAX_SCHEDULED_SCANS_PER_TICK } from './scan-schedules.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ScansService } from '../scans/scans.service';

interface Sched {
  id: string; targetId: string; organizationId: string; createdById: string;
  scanType: string; policyId: string | null; cronExpr: string; isActive: boolean; nextRunAt: Date;
}

interface TargetRow { verificationStatus: string; lastVerifiedAt: Date | null; verifiedAt: Date | null }

function makeSched(i: number): Sched {
  return {
    id: `s${i}`, targetId: `t${i}`, organizationId: 'o1', createdById: 'u1',
    scanType: 'QUICK', policyId: null, cronExpr: '*/5 * * * *', isActive: true,
    nextRunAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + i),
  };
}

interface UpdateManyArg { where: { id: string; nextRunAt: Date }; data: { nextRunAt: Date } }

function setup(scheds: Sched[], opts: { claimCount?: (id: string) => number; target?: TargetRow | null } = {}) {
  const updateMany = vi.fn(async (args: UpdateManyArg) => ({ count: opts.claimCount ? opts.claimCount(args.where.id) : 1 }));
  const update = vi.fn(async (_args: unknown) => ({}));
  const findMany = vi.fn(async () => scheds);
  const fresh: TargetRow = { verificationStatus: 'VERIFIED', lastVerifiedAt: new Date(), verifiedAt: new Date() };
  const targetFind = vi.fn(async () => (opts.target === undefined ? fresh : opts.target));
  const prisma = {
    scanSchedule: { findMany, updateMany, update },
    target: { findFirst: targetFind },
  } as unknown as PrismaService;
  const create = vi.fn(async (..._args: unknown[]) => ({}));
  const scans = { create } as unknown as ScansService;
  const svc = new ScanSchedulesService(prisma, scans);
  return { svc, updateMany, update, create, findMany, targetFind };
}

describe('ScanSchedulesService.runDueSchedules', () => {
  it('claims atomically with the old nextRunAt in the where clause', async () => {
    const s = makeSched(1);
    const { svc, updateMany, create } = setup([s]);
    await svc.runDueSchedules();
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.nextRunAt).toEqual(s.nextRunAt);
    // next run is computed from now (no catch-up of missed runs)
    expect(arg.data.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not start a scan when the claim is lost (count 0)', async () => {
    const { svc, create } = setup([makeSched(1), makeSched(2)], { claimCount: (id) => (id === 's1' ? 0 : 1) });
    await svc.runDueSchedules();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('two instances: only one scan per schedule', async () => {
    const s = makeSched(1);
    let claimed = false;
    const claim = () => {
      if (claimed) return 0;
      claimed = true;
      return 1;
    };
    const a = setup([s], { claimCount: claim });
    const b = setup([s], { claimCount: claim });
    await Promise.all([a.svc.runDueSchedules(), b.svc.runDueSchedules()]);
    expect(a.create.mock.calls.length + b.create.mock.calls.length).toBe(1);
  });

  it('throttles to max 5 new scans per tick', async () => {
    const many = Array.from({ length: 12 }, (_, i) => makeSched(i));
    const { svc, create, updateMany } = setup(many);
    await svc.runDueSchedules();
    expect(create).toHaveBeenCalledTimes(MAX_SCHEDULED_SCANS_PER_TICK);
    expect(updateMany).toHaveBeenCalledTimes(MAX_SCHEDULED_SCANS_PER_TICK);
  });

  it('isolates errors per entry and bumps nextRunAt by ~1h', async () => {
    const { svc, create, update } = setup([makeSched(1), makeSched(2)]);
    create.mockRejectedValueOnce(new Error('secret-value'));
    await svc.runDueSchedules();
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps going if even the claim throws', async () => {
    const { svc, create, updateMany } = setup([makeSched(1), makeSched(2)]);
    updateMany.mockRejectedValueOnce(new Error('db'));
    await svc.runDueSchedules();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips unverified targets; only warns (no enforcement) on stale verification', async () => {
    const un = setup([makeSched(1)], { target: { verificationStatus: 'PENDING', lastVerifiedAt: null, verifiedAt: null } });
    await un.svc.runDueSchedules();
    expect(un.create).not.toHaveBeenCalled();

    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const stale = setup([makeSched(1)], { target: { verificationStatus: 'VERIFIED', lastVerifiedAt: old, verifiedAt: old } });
    const logger = (stale.svc as unknown as { logger: { warn: (m: string) => void } }).logger;
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await stale.svc.runDueSchedules();
    expect(stale.create).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('older than 30 days'))).toBe(true);
  });
});
