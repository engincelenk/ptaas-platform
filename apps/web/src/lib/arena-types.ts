/** Mirrors the AI Arena HTTP API contract (docs/superpowers/specs/2026-10-12-ai-arena-contract.md). */

export type ArenaAdapter = 'OPENAI_COMPAT' | 'ANTHROPIC' | 'GENERIC_JSON' | 'WIDGET';
export type ArenaTargetKind = 'CHAT' | 'RAG' | 'AGENT' | 'WIDGET';
export type ArenaEnvironment = 'STAGING' | 'PRODUCTION';
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
  /** Observed tool calls (Agent targets). Already redacted by the engine; render as text only. */
  toolCalls?: ArenaToolCall[];
}

export interface ArenaToolCall {
  name: string;
  arguments: string;
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
  kinds?: ArenaTargetKind[];
}

export interface ArenaRoe {
  id: string;
  version: number;
  content: string;
  contentHash: string;
}

export interface RagConfig {
  mode: 'AUTO' | 'MANUAL';
  ingest?: {
    url: string;
    method: 'POST' | 'PUT';
    bodyTemplate: Record<string, unknown>;
    docIdPath?: string;
  };
  delete?: {
    url: string;
    method: 'DELETE' | 'POST';
    bodyTemplate?: Record<string, unknown>;
  };
  indexingDelayMs?: number;
}

export interface AgentConfig {
  dryRunHeaderName?: string;
  dryRunHeaderValue?: string;
  toolCallsPath?: string;
}

export interface WidgetConfig {
  pageUrl: string;
  openSelector?: string;
  iframeSelector?: string;
  inputSelector: string;
  sendSelector?: string;
  responseSelector: string;
  cookieConsentSelector?: string;
  waitAfterOpenMs?: number;
  responseTimeoutMs?: number;
}

export interface TargetAttestations {
  ragDocsPlacedAt: string | null;
  stagingConfirmedAt: string | null;
  sandboxAttestedAt: string | null;
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
  kind?: ArenaTargetKind;
  environment?: ArenaEnvironment;
  ragConfig?: RagConfig | null;
  agentConfig?: AgentConfig | null;
  widgetConfig?: WidgetConfig | null;
  attestations?: TargetAttestations;
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
  artifactsSummary?: ArenaArtifactsSummary | null;
}

export interface ArenaArtifactsSummary {
  rag?: { planted: number; deleted: number; cleanupFailed: number };
  agent?: { toolCallsObserved: number };
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
  kind?: ArenaTargetKind;
  environment?: ArenaEnvironment;
  ragConfig?: RagConfig;
  agentConfig?: AgentConfig;
  widgetConfig?: WidgetConfig;
}

export interface AttestBody {
  ragDocsPlaced?: true;
  stagingConfirmed?: true;
  sandboxAttested?: true;
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
    providerTosAccepted: true;
    noTools?: true;
    stagingOnly?: true;
    toolsSandboxed?: true;
    testDocumentsMayBeIndexedAndRemoved?: true;
  };
}

/** Mirrors ARENA_LIMITS of the API (apps/api/src/arena/arena.constants.ts). */
export const ARENA_UI_LIMITS = {
  maxRounds: 10,
  maxRequestsPerRun: 500,
  maxTokensPerRun: 1_000_000,
  maxRequestsPerSecond: 5,
} as const;
