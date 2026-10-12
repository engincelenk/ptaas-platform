import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ArenaCatalogService } from './arena-catalog.service';
import { criteriaUsesToken, parseSuccessCriteria } from './criteria';
import { ARENA_GOAL_CATALOG } from './goals.data';

describe('catalog kinds (stages 1-4)', () => {
  it('chat goals apply to all four kinds', () => {
    const chat = ARENA_GOAL_CATALOG.filter((g) => !['INDIRECT_INJECTION', 'EXCESSIVE_AGENCY'].includes(g.category));
    expect(chat.length).toBeGreaterThanOrEqual(12);
    for (const g of chat) expect([...g.kinds].sort()).toEqual(['AGENT', 'CHAT', 'RAG', 'WIDGET']);
  });

  it('has at least 4 RAG goals (INDIRECT_INJECTION, RAG only) and 4 agent goals (EXCESSIVE_AGENCY, AGENT only)', () => {
    const rag = ARENA_GOAL_CATALOG.filter((g) => g.category === 'INDIRECT_INJECTION');
    const agent = ARENA_GOAL_CATALOG.filter((g) => g.category === 'EXCESSIVE_AGENCY');
    expect(rag.length).toBeGreaterThanOrEqual(4);
    expect(agent.length).toBeGreaterThanOrEqual(4);
    for (const g of rag) {
      expect(g.kinds).toEqual(['RAG']);
      expect(g.successCriteria).toEqual({ type: 'rag_marker' });
    }
    for (const g of agent) expect(g.kinds).toEqual(['AGENT']);
  });

  it('new criterion types parse and use the token placeholder', () => {
    for (const t of ['rag_marker', 'tool_call_marker']) {
      const c = parseSuccessCriteria({ type: t });
      expect(c).not.toBeNull();
      expect(c && criteriaUsesToken(c)).toBe(true);
    }
    expect(parseSuccessCriteria({ type: 'tool_call_marker', extra: 1 })).toEqual({ type: 'tool_call_marker' });
  });

  it('the catalog upsert writes kinds', async () => {
    const upsert = vi.fn(async (_a: unknown) => ({}));
    const svc = new ArenaCatalogService({ arenaGoal: { upsert } } as unknown as PrismaService);
    await svc.seed();
    const calls = upsert.mock.calls as unknown as Array<[{ create: { key: string; kinds: string[] }; update: { kinds: string[] } }]>;
    expect(calls).toHaveLength(ARENA_GOAL_CATALOG.length);
    const ag = calls.find((c) => c[0].create.key === 'AGY-001');
    expect(ag?.[0].create.kinds).toEqual(['AGENT']);
    expect(ag?.[0].update.kinds).toEqual(['AGENT']);
  });
});
