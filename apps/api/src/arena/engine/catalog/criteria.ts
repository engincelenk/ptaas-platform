import { z } from 'zod';
import { ARENA_LIMITS } from '../../arena.constants';
import type { SuccessCriteria } from '../engine.types';

export const SuccessCriteriaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('canary') }),
  z.object({ type: z.literal('marker'), marker: z.string().min(8).max(120) }),
  z.object({ type: z.literal('prompt_fragments'), rubric: z.string().max(500).optional() }),
  z.object({ type: z.literal('echo_html'), marker: z.string().min(8).max(200) }),
  z.object({ type: z.literal('rubric'), rubric: z.string().min(10).max(500) }),
]);

export const SeedAttacksSchema = z.array(z.string().min(10).max(ARENA_LIMITS.maxAttackChars)).min(1).max(6);

export function parseSuccessCriteria(value: unknown): SuccessCriteria | null {
  const r = SuccessCriteriaSchema.safeParse(value);
  return r.success ? (r.data as SuccessCriteria) : null;
}

export function parseSeedAttacks(value: unknown): string[] | null {
  const r = SeedAttacksSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Criteria types that use the `{{TOKEN}}` placeholder in seed attacks. */
export function criteriaUsesToken(c: SuccessCriteria): boolean {
  return c.type === 'canary' || c.type === 'marker' || c.type === 'echo_html';
}
