import { z } from 'zod';
import { isForbiddenHeaderName } from '../../arena.constants';
import { parsePath } from '../adapters/json-path';

export interface AgentConfig {
  dryRunHeaderName?: string;
  dryRunHeaderValue?: string;
  toolCallsPath?: string;
}

const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

const Schema = z
  .object({
    dryRunHeaderName: z.string().regex(HEADER_NAME).optional(),
    dryRunHeaderValue: z
      .string()
      .max(200)
      .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
      .optional(),
    toolCallsPath: z.string().max(200).optional(),
  })
  .strict();

export type AgentConfigResult = { ok: true; config: AgentConfig } | { ok: false; error: string };

export function parseAgentConfig(value: unknown): AgentConfigResult {
  if (value === null || value === undefined) return { ok: true, config: {} };
  const r = Schema.safeParse(value);
  if (!r.success) return { ok: false, error: 'Invalid agent configuration' };
  const c = r.data;
  if (c.dryRunHeaderName && isForbiddenHeaderName(c.dryRunHeaderName)) return { ok: false, error: 'Forbidden dry-run header name' };
  if (c.dryRunHeaderName && c.dryRunHeaderValue === undefined) return { ok: false, error: 'Dry-run header needs a value' };
  if (c.dryRunHeaderValue !== undefined && !c.dryRunHeaderName) return { ok: false, error: 'Dry-run value needs a header name' };
  if (c.toolCallsPath && !parsePath(c.toolCallsPath)) return { ok: false, error: 'Invalid tool-call path' };
  return { ok: true, config: c };
}
