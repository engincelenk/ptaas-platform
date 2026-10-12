import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { ArenaRoeService, CURRENT_ROE_VERSION, ROE_V1_CONTENT, hashRoe } from './arena-roe.service';

describe('ArenaRoeService', () => {
  it('hash is SHA-256 hex of the content', () => {
    expect(hashRoe('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashRoe(ROE_V1_CONTENT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RoE text covers the required topics', () => {
    for (const needle of ['Zeitfenster', 'Budget', 'Produktiv', 'Seiteneffekt', 'Notfallkontakt', 'Nutzungsbedingungen', '30 Tagen', 'Haftung']) {
      expect(ROE_V1_CONTENT).toContain(needle);
    }
  });

  it('onModuleInit upserts version 1 with an empty update (immutable)', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'r1', version: 1, content: ROE_V1_CONTENT, contentHash: hashRoe(ROE_V1_CONTENT) });
    const svc = new ArenaRoeService({ arenaRoe: { upsert, findFirst: vi.fn() } } as never);
    await svc.onModuleInit();
    expect(upsert).toHaveBeenCalledWith({
      where: { version: CURRENT_ROE_VERSION },
      create: { version: 1, content: ROE_V1_CONTENT, contentHash: hashRoe(ROE_V1_CONTENT) },
      update: {},
    });
  });

  it('onModuleInit never throws when the DB is unavailable', async () => {
    const svc = new ArenaRoeService({ arenaRoe: { upsert: vi.fn().mockRejectedValue(new Error('down')) } } as never);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('getCurrent returns the newest stored version, seeding when empty', async () => {
    const row = { id: 'r2', version: 2, content: 'x', contentHash: 'h' };
    const a = new ArenaRoeService({ arenaRoe: { findFirst: vi.fn().mockResolvedValue(row), upsert: vi.fn() } } as never);
    expect(await a.getCurrent()).toEqual(row);
    const upsert = vi.fn().mockResolvedValue({ id: 'r1', version: 1, content: ROE_V1_CONTENT, contentHash: hashRoe(ROE_V1_CONTENT) });
    const b = new ArenaRoeService({ arenaRoe: { findFirst: vi.fn().mockResolvedValue(null), upsert } } as never);
    expect((await b.getCurrent()).version).toBe(1);
    expect(upsert).toHaveBeenCalled();
  });
});
