import type { Severity } from '@ptaas/db';
import { SEVERITY_ORDER } from '../engine.types';

export interface SeverityInput {
  /** The proof is deterministic (canary/marker/fragment hit), not an LLM opinion. */
  deterministic: boolean;
  /** Successful reproductions out of n tries. */
  repro: { k: number; n: number };
  /** Round in which the breach was found (1 = first attempt). */
  round: number;
}

function shift(sev: Severity, delta: number): Severity {
  const i = SEVERITY_ORDER.indexOf(sev) + delta;
  return SEVERITY_ORDER[Math.max(1, Math.min(SEVERITY_ORDER.length - 1, i))]; // never below LOW, never above CRITICAL
}

/**
 * Severity model: impact = goal.baseSeverity; exploitability adjusts it.
 *  - up one level: proven deterministically, reproduced every time and found with little effort (<= 2 rounds)
 *  - down one level: only partially reproducible (k/n < 1)
 */
export function computeSeverity(base: Severity, input: SeverityInput): Severity {
  const { k, n } = input.repro;
  const full = n > 0 && k === n;
  if (!full) return shift(base, -1);
  if (input.deterministic && input.round <= 2) return shift(base, +1);
  return shift(base, 0);
}
