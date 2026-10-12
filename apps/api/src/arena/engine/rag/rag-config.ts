import { z } from 'zod';
import { ARENA_LIMITS } from '../../arena.constants';
import { parsePath, templateProblem } from '../adapters/json-path';

export interface RagConfig {
  mode: 'AUTO' | 'MANUAL';
  ingest?: { url: string; method: 'POST' | 'PUT'; bodyTemplate: Record<string, unknown>; docIdPath?: string };
  delete?: { url: string; method: 'DELETE' | 'POST'; bodyTemplate?: Record<string, unknown> };
  indexingDelayMs: number;
}

const DEFAULT_INDEXING_DELAY_MS = 3000;

const Schema = z
  .object({
    mode: z.enum(['AUTO', 'MANUAL']),
    ingest: z
      .object({
        url: z.string().max(2000),
        method: z.enum(['POST', 'PUT']),
        bodyTemplate: z.record(z.unknown()),
        docIdPath: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    delete: z
      .object({
        url: z.string().max(2000),
        method: z.enum(['DELETE', 'POST']),
        bodyTemplate: z.record(z.unknown()).optional(),
      })
      .strict()
      .optional(),
    indexingDelayMs: z.number().int().min(0).max(ARENA_LIMITS.ragIndexingDelayMaxMs).optional(),
  })
  .strict();

export type RagConfigResult = { ok: true; config: RagConfig } | { ok: false; error: string };

export function parseRagConfig(value: unknown): RagConfigResult {
  const r = Schema.safeParse(value);
  if (!r.success) return { ok: false, error: 'Invalid RAG configuration' };
  const c = r.data;
  for (const t of [c.ingest?.bodyTemplate, c.delete?.bodyTemplate]) {
    if (t !== undefined) {
      const problem = templateProblem(t);
      if (problem) return { ok: false, error: `Invalid RAG template: ${problem}` };
    }
  }
  if (c.ingest?.docIdPath && !parsePath(c.ingest.docIdPath)) return { ok: false, error: 'Invalid docIdPath' };
  return {
    ok: true,
    config: {
      mode: c.mode,
      ingest: c.ingest,
      delete: c.delete,
      indexingDelayMs: c.indexingDelayMs ?? DEFAULT_INDEXING_DELAY_MS,
    },
  };
}
