import type { Severity } from '@ptaas/db';

export type Verdict = 'BREACH' | 'BLOCKED' | 'UNCLEAR';

export type Technique =
  | 'direct'
  | 'roleplay'
  | 'encoding'
  | 'translation'
  | 'payload_splitting'
  | 'many_shot'
  | 'instruction_override';

export const ATTACK_TECHNIQUES: readonly Technique[] = [
  'direct',
  'instruction_override',
  'roleplay',
  'encoding',
  'translation',
  'payload_splitting',
  'many_shot',
];

/**
 * How a catalog goal is judged. Seed attacks contain the placeholder `{{TOKEN}}` which is replaced
 * per attempt by the canary / marker / html snippet that belongs to the criteria type.
 */
export type SuccessCriteria =
  | { type: 'canary' }
  | { type: 'marker'; marker: string } // marker may contain `{nonce}`
  | { type: 'prompt_fragments'; rubric?: string }
  | { type: 'echo_html'; marker: string } // raw HTML snippet, may contain `{nonce}`
  | { type: 'rubric'; rubric: string };

/** Per-attempt tokens (resolved from the success criteria). */
export interface AttemptTokens {
  nonce: string;
  canary: string;
  /** Marker or html snippet that the target must emit for a breach (if the criteria use one). */
  marker?: string;
}

export interface JudgeEvidence {
  rule: 'canary' | 'marker' | 'prompt_fragments' | 'echo_html' | 'rubric' | 'none';
  via?: string;
  similarity?: number;
  matchedFragments?: number[];
  echoOnly?: boolean;
  refusal?: boolean;
  injectionSuspected?: boolean;
  llm?: { verdict: string; confidence: number; passes: number };
  note?: string;
  error?: string;
}

export interface JudgeResult {
  verdict: Verdict;
  confidence: number;
  evidence: JudgeEvidence;
  /** True if the verdict rests on a deterministic proof (no LLM involved). */
  deterministic: boolean;
  /** A BREACH proposed by the LLM stage only; the orchestrator must reproduce it (2 of 3). */
  needsRepro: boolean;
  tokens: number;
}

export interface GoalRecord {
  id: string;
  key: string;
  category: string;
  title: string;
  description: string;
  owaspRef: string | null;
  atlasRef: string | null;
  baseSeverity: Severity;
  seedAttacks: unknown;
  successCriteria: unknown;
}

export const SEVERITY_ORDER: readonly Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const ENGINE_PROMPT_VERSIONS = {
  red: 'red-v1',
  judgeA: 'judge-v1a',
  judgeB: 'judge-v1b',
  recommendation: 'rec-v1',
} as const;

export const MAX_RUN_WALLCLOCK_MS = 30 * 60 * 1000;
