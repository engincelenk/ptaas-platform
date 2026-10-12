import { describe, it, expect, vi } from 'vitest';
import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

function setup(held = false) {
  const notifFind = vi.fn(async (_a: unknown) => [{ id: 'n' }]);
  const prisma = {
    userNotificationPreference: { findMany: vi.fn(async () => [{ userId: 'u1' }, { userId: 'u2' }]) },
    user: {
      findUnique: vi.fn(async (a: { where: { id: string } }) => ({
        id: a.where.id, email: `${a.where.id}@x.test`, name: 'n',
        memberships: [{ organizationId: 'o1' }, { organizationId: 'o2' }],
      })),
    },
    notification: { findMany: notifFind },
  } as unknown as PrismaService;
  const setIfAbsent = vi.fn(async () => !held);
  const svc = new NotificationsService(prisma, { setIfAbsent, del: vi.fn(async () => undefined) } as unknown as RedisService);
  return { svc, notifFind, setIfAbsent };
}

describe('NotificationsService.sendDailyDigest', () => {
  it('processes all user/org pairs under a per-day lock', async () => {
    const { svc, notifFind, setIfAbsent } = setup();
    await svc.sendDailyDigest();
    expect(notifFind).toHaveBeenCalledTimes(4);
    expect((setIfAbsent.mock.calls[0] as unknown[])[0]).toMatch(/^cron-lock:notifications:daily-digest:\d{4}-\d{2}-\d{2}$/);
  });

  it('skips when the lock is held', async () => {
    const { svc, notifFind } = setup(true);
    await svc.sendDailyDigest();
    expect(notifFind).not.toHaveBeenCalled();
  });

  it('a failing org does not stop the rest', async () => {
    const { svc, notifFind } = setup();
    notifFind.mockRejectedValueOnce(new Error('db'));
    await svc.sendDailyDigest();
    expect(notifFind).toHaveBeenCalledTimes(4);
  });
});
