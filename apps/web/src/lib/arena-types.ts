/** Mirrors the AI Arena HTTP API contract (docs/superpowers/specs/2026-10-12-ai-arena-contract.md). */

export type ArenaAdapter = 'OPENAI_COMPAT' | 'ANTHROPIC' | 'GENERIC_JSON';
export type VerificationMethod = 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED';
export type ArenaVerdict = 'BREACH' | 'BLOCKED' | 'UNCLEAR';

export type ArenaRunStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'ABORTED'
  | 'FAILED';

export type ArenaRole = 'ADMIN' | 'SECURITY_ENGINEER' | 'DEVELOPER' | 'VIEWER';

export interface ArenaScoreSnapshot {
  totals: {
    attempts: number;
    breaches: number;
    blocked: number;
    unclear: number;
    breachRate: number;
    blockRate: number;
  };
  byCategory: Record<
    string,
    { attempts: number; breaches: number; blocked: number; breachRate: number }
  >;
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
  verdict: ArenaVerdict | null;
  confidence: number | null;
  findingId: string | null;
  createdAt: string;
}

export type ArenaEvent =
  | { type: 'run.status'; status: string; reason?: string }
  | { type: 'attempt'; attempt: ArenaAttemptView }
  | { type: 'score'; score: ArenaScoreSnapshot }
  | {
      type: 'recommendation';
      id: string;
      category: string;
      title: string;
      text: string;
      priority: number;
    }
  | { type: 'finding'; findingId: string; attemptId: string }
  | { type: 'done'; status: string };

export interface ArenaGoal {
  id: string;
  key: string;
  category: string;
  title: string;
  description: string;
  owaspRef: string | null;
  atlasRef: string | null;
  baseSeverity: string;
}

export interface ArenaRoe {
  id: string;
  version: number;
  content: string;
  contentHash: string;
}

export interface AiTargetView {
  id: string;
  targetId: string;
  projectId: string;
  name: string;
  endpointUrl: string;
  adapter: ArenaAdapter;
  authHeaderName: string | null;
  hasApiKey: boolean;
  fragmentCount: number;
  canaryPlacedAt: string | null;
  verification: {
    status: VerificationStatus;
    fresh: boolean;
    verifiedAt: string | null;
    expiresAt: string | null;
  };
  createdAt: string;
}

export interface AiTargetVerification {
  status: VerificationStatus;
  method: VerificationMethod | null;
  verifiedAt: string | null;
  fresh: boolean;
  expiresAt: string | null;
  token: string;
  instructions: Record<VerificationMethod, string>;
}

export interface ArenaRunSummary {
  id: string;
  aiTargetId: string;
  targetName: string;
  status: ArenaRunStatus;
  goalCount: number;
  breachRate: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ArenaRunView extends ArenaRunSummary {
  goalIds: string[];
  maxRounds: number;
  maxRequests: number;
  maxTokens: number;
  requestsPerSecond: number;
  windowStart: string | null;
  windowEnd: string | null;
  usedRequests: number;
  usedTokens: number;
  roeVersion: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  emergencyContact: string | null;
  retestOfRunId: string | null;
  abortedReason: string | null;
  scanId: string | null;
}

export interface ArenaRecommendation {
  id: string;
  category: string;
  title: string;
  text: string;
  priority: number;
}

export interface ArenaRunDetail extends ArenaRunView {
  score: ArenaScoreSnapshot;
  recommendations: ArenaRecommendation[];
  goals: ArenaGoal[];
}

export interface ArenaOverview {
  targets: number;
  runs: { total: number; running: number; awaitingApproval: number };
  lastRun: ArenaRunSummary | null;
  breachRate: number | null;
}

export interface ArenaProjectRef {
  id: string;
  name: string;
}

export interface CreateAiTargetBody {
  projectId?: string;
  name: string;
  endpointUrl: string;
  adapter: ArenaAdapter;
  requestMapping?: string;
  responseMapping?: string;
  authHeaderName?: string;
  apiKey?: string;
  knownPromptFragments?: string[];
}

export interface CreateRunBody {
  aiTargetId: string;
  goalIds: string[];
  maxRounds?: number;
  maxRequests?: number;
  maxTokens?: number;
  requestsPerSecond?: number;
  windowStart?: string;
  windowEnd?: string;
  retestOfRunId?: string;
}

export interface ApproveRunBody {
  roeVersion: number;
  emergencyContact: string;
  confirmations: {
    noProduction: true;
    noSideEffects: true;
    noTools: true;
    providerTosAccepted: true;
  };
}

/** Mirrors ARENA_LIMITS of the API (apps/api/src/arena/arena.constants.ts). */
export const ARENA_UI_LIMITS = {
  maxRounds: 10,
  maxRequestsPerRun: 500,
  maxTokensPerRun: 1_000_000,
  maxRequestsPerSecond: 5,
} as const;
