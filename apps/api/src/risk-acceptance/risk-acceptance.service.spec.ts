import { describe, it, expect, vi } from 'vitest';
import { RiskAcceptanceService, MAX_EXPIRE_PER_RUN } from './risk-acceptance.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { RedisService } from '../redis/redis.service';

function setup(count: number, held = false) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `a${i}`, findingId: `f${i}`, approvedById: 'u', organizationId: 'o',
    finding: { id: `f${i}`, title: 't', createdById: 'u', organizationId: 'o', scan: { projectId: 'p' } },
  }));
  const findMany = vi.fn(async (_a: unknown) => rows);
  const raUpdate = vi.fn(async (_a: unknown) => ({}));
  const fUpdate = vi.fn(async (_a: unknown) => ({}));
  const $transaction = vi.fn(async (_ops: unknown[]) => []);
  const prisma = {
    riskAcceptance: { findMany, update: raUpdate },
    finding: { update: fUpdate },
    $transaction,
  } as unknown as PrismaService;
  const nCreate = vi.fn(async (..._a: unknown[]) => ({}));
  const setIfAbsent = vi.fn(async () => !held);
  const svc = new RiskAcceptanceService(
    prisma,
    { create: nCreate } as unknown as NotificationsService,
    {} as IntegrationsService,
    { setIfAbsent, del: vi.fn(async () => undefined) } as unknown as RedisService,
  );
  return { svc, findMany, $transaction, setIfAbsent };
}

describe('RiskAcceptanceService.expireStaleAcceptances', () => {
  it('limits the query to 200 entries and processes each in a transaction', async () => {
    const { svc, findMany, $transaction } = setup(3);
    await svc.expireStaleAcceptances();
    expect((findMany.mock.calls[0][0] as { take: number }).take).toBe(MAX_EXPIRE_PER_RUN);
    expect(MAX_EXPIRE_PER_RUN).toBe(200);
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it('one failing entry does not abort the rest', async () => {
    const { svc, $transaction } = setup(3);
    $transaction.mockRejectedValueOnce(new Error('deadlock'));
    await svc.expireStaleAcceptances();
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it('skips the run when the lock is held', async () => {
    const { svc, findMany } = setup(3, true);
    await svc.expireStaleAcceptances();
    expect(findMany).not.toHaveBeenCalled();
  });
});
