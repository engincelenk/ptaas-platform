/** Events streamed to the Live Arena (SSE). All text fields are already redacted. */
export interface ArenaScoreSnapshot {
  totals: { attempts: number; breaches: number; blocked: number; unclear: number; breachRate: number; blockRate: number };
  byCategory: Record<string, { attempts: number; breaches: number; blocked: number; breachRate: number }>;
  budget: { usedRequests: number; maxRequests: number; usedTokens: number; maxTokens: number };
  compareToPrevious?: { previousRunId: string; breachRateDelta: number; blockRateDelta: number };
}

export interface ArenaAttemptView {
  id: string;
  goalKey: string;
  category: string;
  round: number;
  kind: 'RECON' | 'ATTACK';
  technique: string;
  attackText: string;
  responseText: string | null;
  verdict: 'BREACH' | 'BLOCKED' | 'UNCLEAR' | null;
  confidence: number | null;
  findingId: string | null;
  createdAt: string;
}

export type ArenaEvent =
  | { type: 'run.status'; status: string; reason?: string }
  | { type: 'attempt'; attempt: ArenaAttemptView }
  | { type: 'score'; score: ArenaScoreSnapshot }
  | { type: 'recommendation'; id: string; category: string; title: string; text: string; priority: number }
  | { type: 'finding'; findingId: string; attemptId: string }
  | { type: 'done'; status: string };
