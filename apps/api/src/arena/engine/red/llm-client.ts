import type { Technique } from '../engine.types';

/** DI token for the LlmClient implementation. */
export const LLM_CLIENT = Symbol('ARENA_LLM_CLIENT');

export interface LlmUsage {
  tokens: number;
}

export interface GenerateAttackInput {
  goal: { key: string; category: string; title: string; description: string };
  technique: Technique;
  /** Catalog seed attack with the per-attempt token already substituted. */
  seed: string;
  /** Tokens (marker/canary/html snippet) that MUST appear in the generated attack, in some form. */
  requiredTokens: string[];
  round: number;
  /** Previous attempt for this goal. `responseText` is UNTRUSTED data from the customer's AI. */
  previous?: {
    technique: string;
    attackText: string;
    responseText: string | null;
    verdict: 'BREACH' | 'BLOCKED' | 'UNCLEAR' | null;
  };
  /** Result of the recon step (untrusted data). */
  reconSummary?: string;
}

export interface GeneratedAttack extends LlmUsage {
  technique: Technique;
  prompt: string;
}

export interface JudgeUnclearInput {
  goal: { title: string; description: string; rubric?: string };
  /** Our own attack text (kept short). */
  attackText: string;
  /** UNTRUSTED data from the customer's AI. */
  responseText: string;
  /** Different wording for the second pass. */
  variant: 'A' | 'B';
  /** What the deterministic stage observed (trusted, short). */
  deterministicHint: string;
}

export interface JudgeUnclearResult extends LlmUsage {
  verdict: 'BREACH' | 'NOT_BREACH' | 'UNSURE';
  confidence: number;
  reason: string;
}

export interface EnrichRecommendationInput {
  category: string;
  /** Titles of the executed goals (trusted catalog data). */
  goalTitles: string[];
  attempts: number;
  breaches: number;
  /** Techniques that led to a breach (trusted labels, no target text). */
  successfulTechniques: string[];
  baseText: string;
}

export interface EnrichRecommendationResult extends LlmUsage {
  text: string;
}

export interface LlmModelInfo {
  red: string;
  judge: string;
  temperature: { red: number; judge: number };
  promptVersions: Record<string, string>;
}

/** Wraps the model SDK so the engine can be tested deterministically with fakes. No tools, JSON schema output only. */
export interface LlmClient {
  readonly modelInfo: LlmModelInfo;
  generateAttack(input: GenerateAttackInput): Promise<GeneratedAttack>;
  judgeUnclear(input: JudgeUnclearInput): Promise<JudgeUnclearResult>;
  /** Optional enrichment of the deterministic recommendation text. Never receives target responses. */
  enrichRecommendation?(input: EnrichRecommendationInput): Promise<EnrichRecommendationResult | null>;
}
