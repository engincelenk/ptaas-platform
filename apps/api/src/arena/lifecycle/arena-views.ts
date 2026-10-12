import type { ArenaScoreSnapshot } from '../arena-events';

/** Public response shapes of the Arena HTTP API (contract section 3). Never contain secrets. */

export interface AiTargetView {
  id: string;
  targetId: string;
  projectId: string;
  name: string;
  endpointUrl: string;
  adapter: 'OPENAI_COMPAT' | 'ANTHROPIC' | 'GENERIC_JSON' | 'WIDGET';
  kind: 'CHAT' | 'RAG' | 'AGENT' | 'WIDGET';
  environment: 'STAGING' | 'PRODUCTION';
  /** Secret-free per-kind configuration (null when not applicable). */
  ragConfig: Record<string, unknown> | null;
  agentConfig: Record<string, unknown> | null;
  widgetConfig: Record<string, unknown> | null;
  attestations: { ragDocsPlacedAt: string | null; stagingConfirmedAt: string | null; sandboxAttestedAt: string | null };
  /** Non-blocking configuration hints (e.g. missing RAG delete configuration). */
  configWarnings: string[];
  authHeaderName: string | null;
  hasApiKey: boolean;
  fragmentCount: number;
  canaryPlacedAt: string | null;
  verification: {
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
    fresh: boolean;
    verifiedAt: string | null;
    expiresAt: string | null;
  };
  createdAt: string;
}

export interface VerificationView {
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  method: 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG' | null;
  verifiedAt: string | null;
  fresh: boolean;
  expiresAt: string | null;
  token: string;
  instructions: { DNS_TXT: string; HTTP_FILE: string; META_TAG: string };
}

export interface RunSummary {
  id: string;
  aiTargetId: string;
  targetName: string;
  targetKind: 'CHAT' | 'RAG' | 'AGENT' | 'WIDGET';
  status: string;
  goalCount: number;
  breachRate: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RunView extends RunSummary {
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
  scanId: string;
  artifactsSummary: ArtifactsSummary | null;
}

export interface ArtifactsSummary {
  rag?: { planted: number; deleted: number; cleanupFailed: number };
  agent?: { toolCallsObserved: number };
}

export interface GoalView {
  id: string;
  key: string;
  category: string;
  title: string;
  description: string;
  owaspRef: string | null;
  atlasRef: string | null;
  baseSeverity: string;
  kinds: string[];
}

export interface RecommendationView {
  id: string;
  category: string;
  title: string;
  text: string;
  priority: number;
  createdAt: string;
}

export interface RunDetailView extends RunView {
  score: ArenaScoreSnapshot;
  recommendations: RecommendationView[];
  goals: GoalView[];
}

export interface OverviewView {
  targets: number;
  runs: { total: number; running: number; awaitingApproval: number };
  lastRun: RunSummary | null;
  breachRate: number | null;
}

/** Client metadata forwarded to the audit log. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Authenticated caller as far as the lifecycle services need it. */
export interface ArenaActor {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
}

/** UTC day key (yyyymmdd) of the org-wide daily request counter (`arenaRedisKeys.orgDailyRequests`). */
export function arenaUtcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
