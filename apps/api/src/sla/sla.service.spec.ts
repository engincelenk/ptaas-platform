import { describe, it, expect, vi } from 'vitest';
import { SlaService } from './sla.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { RedisService } from '../redis/redis.service';

function setup(held = false) {
  const old = new Date(Date.now() - 400 * 24 * 3600 * 1000);
  const findings = [{ id: 'f1', title: 't', severity: 'CRITICAL', status: 'OPEN', createdAt: old, projectId: 'p' }];
  const prisma = {
    organization: { findMany: vi.fn(async () => [{ id: 'o1' }, { id: 'o2' }]) },
    slaPolicy: { findUnique: vi.fn(async () => null) },
    finding: { findMany: vi.fn(async () => findings) },
    organizationMember: { findMany: vi.fn(async () => [{ userId: 'u1' }]) },
  } as unknown as PrismaService;
  const create = vi.fn(async (..._a: unknown[]) => ({}));
  const notify = vi.fn(async (..._a: unknown[]) => undefined);
  const setIfAbsent = vi.fn(async () => !held);
  const del = vi.fn(async () => undefined);
  const svc = new SlaService(
    prisma,
    { create } as unknown as NotificationsService,
    { notify } as unknown as IntegrationsService,
    { setIfAbsent, del } as unknown as RedisService,
  );
  return { svc, create, notify, setIfAbsent, prisma };
}

describe('SlaService.notifyBreachingFindings', () => {
  it('notifies every org under a per-day lock', async () => {
    const { svc, create, setIfAbsent } = setup();
    await svc.notifyBreachingFindings();
    expect(create).toHaveBeenCalledTimes(2);
    expect((setIfAbsent.mock.calls[0] as unknown[])[0]).toMatch(/^cron-lock:sla:breach-notify:\d{4}-\d{2}-\d{2}$/);
  });

  it('does nothing if the lock is held', async () => {
    const { svc, create } = setup(true);
    await svc.notifyBreachingFindings();
    expect(create).not.toHaveBeenCalled();
  });

  it('a failing org does not stop the others', async () => {
    const { svc, create } = setup();
    create.mockRejectedValueOnce(new Error('boom'));
    await svc.notifyBreachingFindings();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
