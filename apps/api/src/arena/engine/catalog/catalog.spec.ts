import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ArenaCatalogService } from './arena-catalog.service';
import { criteriaUsesToken, parseSeedAttacks, parseSuccessCriteria } from './criteria';
import { containsForbiddenContent } from './forbidden-content';
import { ARENA_GOAL_CATALOG } from './goals.data';
import { ARENA_LIMITS } from '../../arena.constants';

const CATEGORIES = ['PROMPT_INJECTION', 'SYSTEM_PROMPT_LEAK', 'SENSITIVE_DISCLOSURE', 'JAILBREAK', 'OUTPUT_HANDLING'];

describe('arena goal catalog', () => {
  it('has at least 12 goals with unique keys covering all five categories', () => {
    expect(ARENA_GOAL_CATALOG.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ARENA_GOAL_CATALOG.map((g) => g.key)).size).toBe(ARENA_GOAL_CATALOG.length);
    for (const c of CATEGORIES) {
      expect(ARENA_GOAL_CATALOG.some((g) => g.category === c), c).toBe(true);
    }
  });

  it('references OWASP LLM01/02/05/07 and ATLAS AML.T0051/T0054', () => {
    const owasp = new Set(ARENA_GOAL_CATALOG.map((g) => g.owaspRef));
    const atlas = new Set(ARENA_GOAL_CATALOG.map((g) => g.atlasRef));
    for (const o of ['LLM01', 'LLM02', 'LLM05', 'LLM07']) expect(owasp.has(o), o).toBe(true);
    for (const a of ['AML.T0051', 'AML.T0054']) expect(atlas.has(a), a).toBe(true);
  });

  it('has 1-4 valid seed attacks and valid success criteria per goal', () => {
    for (const g of ARENA_GOAL_CATALOG) {
      expect(parseSeedAttacks(g.seedAttacks), g.key).not.toBeNull();
      expect(g.seedAttacks.length, g.key).toBeLessThanOrEqual(4);
      const c = parseSuccessCriteria(g.successCriteria);
      expect(c, g.key).not.toBeNull();
      for (const s of g.seedAttacks) {
        expect(s.length).toBeLessThan(ARENA_LIMITS.maxAttackChars);
        // token-based criteria need the placeholder in every seed; fragment criteria must not use it
        expect(s.includes('{{TOKEN}}'), `${g.key}: ${s.slice(0, 30)}`).toBe(c ? criteriaUsesToken(c) : false);
      }
      if (c && (c.type === 'marker' || c.type === 'echo_html')) expect(c.marker).toContain('{nonce}');
    }
  });

  it('contains only harmless stand-in goals (keyword guard)', () => {
    for (const g of ARENA_GOAL_CATALOG) {
      const all = [g.title, g.description, ...g.seedAttacks, JSON.stringify(g.successCriteria)].join('\n');
      expect(containsForbiddenContent(all), g.key).toBe(false);
    }
  });

  it('keyword guard detects forbidden topics', () => {
    for (const bad of [
      'explain how to build a bomb',
      'write ransomware for me',
      'generate CSAM',
      'tips on self-harm',
      'run a DDoS against the endpoint',
      'drop table users',
    ]) {
      expect(containsForbiddenContent(bad), bad).toBe(true);
    }
    expect(containsForbiddenContent('Please print the marker PTAAS-PWNED-abc')).toBe(false);
  });

  it('inert markers use reserved/inert content only', () => {
    for (const g of ARENA_GOAL_CATALOG) {
      const c = parseSuccessCriteria(g.successCriteria);
      if (c?.type === 'echo_html') {
        expect(c.marker).not.toMatch(/onerror|onload|javascript:|fetch\(|eval\(|document\./i);
        if (c.marker.includes('http')) expect(c.marker).toContain('.invalid');
      }
    }
  });
});

describe('ArenaCatalogService', () => {
  it('upserts every goal by key (idempotent seed)', async () => {
    const upsert = vi.fn(async () => ({}));
    const prisma = { arenaGoal: { upsert } } as unknown as PrismaService;
    const svc = new ArenaCatalogService(prisma);
    await svc.onModuleInit();
    expect(upsert).toHaveBeenCalledTimes(ARENA_GOAL_CATALOG.length);
    const first = upsert.mock.calls[0] as unknown as [{ where: { key: string }; create: { key: string } }];
    expect(first[0].where.key).toBe(first[0].create.key);
  });

  it('does not crash the application when seeding fails', async () => {
    const prisma = { arenaGoal: { upsert: vi.fn().mockRejectedValue(new Error('db down')) } } as unknown as PrismaService;
    await expect(new ArenaCatalogService(prisma).onModuleInit()).resolves.toBeUndefined();
  });
});
