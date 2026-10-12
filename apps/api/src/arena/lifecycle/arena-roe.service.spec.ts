import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { ArenaRoeService, CURRENT_ROE_VERSION, ROE_V1_CONTENT, ROE_V2_CONTENT, hashRoe } from './arena-roe.service';

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

  it('current version is 2; onModuleInit upserts v1 (kept) and v2 with empty updates (immutable)', async () => {
    expect(CURRENT_ROE_VERSION).toBe(2);
    const upsert = vi.fn().mockImplementation(({ create }: { create: { version: number; content: string; contentHash: string } }) =>
      Promise.resolve({ id: `r${create.version}`, ...create }),
    );
    const svc = new ArenaRoeService({ arenaRoe: { upsert, findFirst: vi.fn() } } as never);
    await svc.onModuleInit();
    expect(upsert).toHaveBeenCalledWith({
      where: { version: 1 },
      create: { version: 1, content: ROE_V1_CONTENT, contentHash: hashRoe(ROE_V1_CONTENT) },
      update: {},
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { version: 2 },
      create: { version: 2, content: ROE_V2_CONTENT, contentHash: hashRoe(ROE_V2_CONTENT) },
      update: {},
    });
  });

  it('v2 keeps v1 and adds RAG, agent and widget terms', () => {
    expect(ROE_V2_CONTENT).toContain('VERSION 2');
    expect(ROE_V2_CONTENT).toContain(ROE_V1_CONTENT.slice(ROE_V1_CONTENT.indexOf('1. Zweck')));
    for (const needle of ['RAG-Anwendungen', 'Testdokumente', 'wieder entfernt', 'Staging', 'Dry-Run', 'wirkungslos', 'Browsersitzung', 'andere Hosts']) {
      expect(ROE_V2_CONTENT).toContain(needle);
    }
    expect(hashRoe(ROE_V2_CONTENT)).not.toBe(hashRoe(ROE_V1_CONTENT));
  });

  it('onModuleInit never throws when the DB is unavailable', async () => {
    const svc = new ArenaRoeService({ arenaRoe: { upsert: vi.fn().mockRejectedValue(new Error('down')) } } as never);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('getCurrent returns the newest stored version, seeding when empty', async () => {
    const row = { id: 'r2', version: 2, content: 'x', contentHash: 'h' };
    const a = new ArenaRoeService({ arenaRoe: { findFirst: vi.fn().mockResolvedValue(row), upsert: vi.fn() } } as never);
    expect(await a.getCurrent()).toEqual(row);
    const upsert = vi.fn().mockImplementation(({ create }: { create: { version: number; content: string; contentHash: string } }) =>
      Promise.resolve({ id: `r${create.version}`, ...create }),
    );
    const b = new ArenaRoeService({ arenaRoe: { findFirst: vi.fn().mockResolvedValue(null), upsert } } as never);
    expect((await b.getCurrent()).version).toBe(2);
    expect(upsert).toHaveBeenCalled();
  });
});
