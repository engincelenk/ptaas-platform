/** Shared constants for the AI Arena (see docs/superpowers/specs/2026-10-12-ai-arena-contract.md). */

export const ARENA_RUN_QUEUE = 'arena-run';

export interface ArenaRunJob {
  runId: string;
  organizationId: string;
}

/** Hard platform maxima — run budgets are clamped to these, orgs cannot raise them. */
export const ARENA_LIMITS = {
  maxRounds: 10,
  maxRequestsPerRun: 500,
  maxTokensPerRun: 1_000_000,
  maxRequestsPerSecond: 5,
  maxRequestsPerOrgPerDay: 2_000,
  maxAttackChars: 4_000,
  maxResponseChars: 8_000,
  retentionDays: 30,
  verificationTtlDays: 30,
} as const;

/** Hosts of model providers: a customer must never "verify" these as their own endpoint. */
export const PROVIDER_HOST_DENYLIST = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.cohere.com',
  'api.groq.com',
  'api.together.xyz',
  'openrouter.ai',
  'api.x.ai',
  'api.deepseek.com',
];

/** Roles allowed to prepare/submit/start/abort runs and manage targets. */
export const ARENA_OPERATOR_ROLES = ['ADMIN', 'SECURITY_ENGINEER'] as const;
/** Only an org admin may approve (consent + rules of engagement). */
export const ARENA_APPROVER_ROLES = ['ADMIN'] as const;

export const arenaRedisKeys = {
  killGlobal: () => 'arena:kill:global',
  killRun: (runId: string) => `arena:kill:run:${runId}`,
  eventsChannel: (organizationId: string, runId: string) => `arena:events:${organizationId}:${runId}`,
  orgDailyRequests: (organizationId: string, yyyymmdd: string) => `arena:daily:${organizationId}:${yyyymmdd}`,
};
