import type {
  AiTargetView,
  ArenaAttemptView,
  ArenaEvent,
  ArenaRecommendation,
  ArenaRole,
  ArenaRunStatus,
  ArenaScoreSnapshot,
  ArenaVerdict,
} from './arena-types';

/* ---------- Event reducer ---------- */

export interface ArenaLiveState {
  status: string | null;
  reason: string | null;
  attempts: ArenaAttemptView[];
  score: ArenaScoreSnapshot | null;
  recommendations: ArenaRecommendation[];
  findingIds: string[];
  done: boolean;
}

export const initialLiveState: ArenaLiveState = {
  status: null,
  reason: null,
  attempts: [],
  score: null,
  recommendations: [],
  findingIds: [],
  done: false,
};

export type ArenaLiveAction =
  | { kind: 'event'; event: ArenaEvent }
  | { kind: 'attempts'; attempts: ArenaAttemptView[] }
  | { kind: 'reset'; state?: Partial<ArenaLiveState> };

function mergeAttempts(
  current: ArenaAttemptView[],
  incoming: ArenaAttemptView[],
): ArenaAttemptView[] {
  const byId = new Map<string, ArenaAttemptView>();
  for (const a of current) byId.set(a.id, a);
  // Later data (e.g. a verdict arriving after the first frame) replaces earlier data.
  for (const a of incoming) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => {
    const t = a.createdAt.localeCompare(b.createdAt);
    return t !== 0 ? t : a.round - b.round;
  });
}

export function arenaLiveReducer(
  state: ArenaLiveState,
  action: ArenaLiveAction,
): ArenaLiveState {
  if (action.kind === 'reset') return { ...initialLiveState, ...action.state };
  if (action.kind === 'attempts') {
    return { ...state, attempts: mergeAttempts(state.attempts, action.attempts) };
  }
  const ev = action.event;
  switch (ev.type) {
    case 'run.status':
      return { ...state, status: ev.status, reason: ev.reason ?? state.reason };
    case 'attempt':
      return { ...state, attempts: mergeAttempts(state.attempts, [ev.attempt]) };
    case 'score':
      return { ...state, score: ev.score };
    case 'recommendation': {
      const rec: ArenaRecommendation = {
        id: ev.id,
        category: ev.category,
        title: ev.title,
        text: ev.text,
        priority: ev.priority,
      };
      const rest = state.recommendations.filter((r) => r.id !== rec.id);
      return {
        ...state,
        recommendations: [...rest, rec].sort((a, b) => a.priority - b.priority),
      };
    }
    case 'finding':
      return state.findingIds.includes(ev.findingId)
        ? state
        : { ...state, findingIds: [...state.findingIds, ev.findingId] };
    case 'done':
      return { ...state, status: ev.status, done: true };
    default:
      return state;
  }
}

/** Parse an SSE `data:` frame. Returns null for anything that is not a known event. */
export function parseArenaEvent(raw: string): ArenaEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const type = (value as { type?: unknown }).type;
  const known = ['run.status', 'attempt', 'score', 'recommendation', 'finding', 'done'];
  if (typeof type !== 'string' || !known.includes(type)) return null;
  return value as ArenaEvent;
}

/** Latest ISO timestamp among attempts, for the polling fallback (`?after=`). */
export function latestAttemptTimestamp(attempts: ArenaAttemptView[]): string | null {
  let latest: string | null = null;
  for (const a of attempts) if (latest === null || a.createdAt > latest) latest = a.createdAt;
  return latest;
}

/* ---------- Score formatting ---------- */

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '–';
  const clamped = Math.min(Math.max(rate, 0), 1);
  return `${Math.round(clamped * 100)} %`;
}

/** Signed percentage-point delta, e.g. -0.25 -> "−25 Pp." */
export function formatDelta(delta: number): string {
  const pts = Math.round(delta * 100);
  if (pts === 0) return '±0 Pp.';
  return `${pts > 0 ? '+' : '−'}${Math.abs(pts)} Pp.`;
}

/** For breach rate a decrease is good, for block rate an increase is good. */
export function deltaTone(delta: number, higherIsBetter: boolean): 'good' | 'bad' | 'neutral' {
  if (Math.round(delta * 100) === 0) return 'neutral';
  return delta > 0 === higherIsBetter ? 'good' : 'bad';
}

export function budgetPercent(used: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / max) * 100)));
}

export function computeRates(totals: { breaches: number; blocked: number; unclear: number }): {
  breachRate: number;
  blockRate: number;
} {
  const n = totals.breaches + totals.blocked + totals.unclear;
  if (n === 0) return { breachRate: 0, blockRate: 0 };
  return { breachRate: totals.breaches / n, blockRate: totals.blocked / n };
}

/* ---------- Verdict / status presentation ---------- */

export const VERDICT_LABEL: Record<ArenaVerdict, string> = {
  BREACH: 'Durchbruch',
  BLOCKED: 'Abgewehrt',
  UNCLEAR: 'Unklar',
};

export const VERDICT_CLASS: Record<ArenaVerdict, string> = {
  BREACH: 'bg-red-600 text-white',
  BLOCKED: 'bg-green-600 text-white',
  UNCLEAR: 'bg-yellow-500 text-black',
};

export const RUN_STATUS_LABEL: Record<ArenaRunStatus, string> = {
  DRAFT: 'Entwurf',
  AWAITING_APPROVAL: 'Wartet auf Freigabe',
  APPROVED: 'Freigegeben',
  RUNNING: 'Läuft',
  COMPLETED: 'Abgeschlossen',
  ABORTED: 'Abgebrochen',
  FAILED: 'Fehlgeschlagen',
};

export const RUN_STATUS_CLASS: Record<ArenaRunStatus, string> = {
  DRAFT: 'bg-secondary text-secondary-foreground',
  AWAITING_APPROVAL: 'bg-yellow-500 text-black',
  APPROVED: 'bg-blue-600 text-white',
  RUNNING: 'bg-orange-500 text-white',
  COMPLETED: 'bg-green-600 text-white',
  ABORTED: 'bg-red-600 text-white',
  FAILED: 'bg-red-700 text-white',
};

export function runStatusLabel(status: string): string {
  return (RUN_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

export function runStatusClass(status: string): string {
  return (RUN_STATUS_CLASS as Record<string, string>)[status] ?? RUN_STATUS_CLASS.DRAFT;
}

export const CATEGORY_LABEL: Record<string, string> = {
  PROMPT_INJECTION: 'Prompt Injection',
  JAILBREAK: 'Jailbreak',
  DATA_EXFILTRATION: 'Datenabfluss',
  SYSTEM_PROMPT_LEAK: 'System-Prompt-Leak',
  INSECURE_OUTPUT: 'Unsichere Ausgabe',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}

/* ---------- Transcript sanitizing ---------- */

/**
 * Transcripts are hostile input. They are always rendered as plain React text nodes
 * (never HTML). This helper only strips control characters (except \n and \t) and
 * bidi-override characters that could visually reorder text, and bounds the length.
 * Markup such as "<img onerror=...>" or "[x](javascript:...)" is intentionally kept
 * as literal text: React escapes it.
 */
export function sanitizeTranscript(text: string | null | undefined, maxChars = 8000): string {
  if (!text) return '';
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[‪-‮⁦-⁩]/g, '');
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}

/* ---------- Role gating ---------- */

const OPERATOR_ROLES: readonly ArenaRole[] = ['ADMIN', 'SECURITY_ENGINEER'];

export function isOperator(role: string | null | undefined): boolean {
  return !!role && (OPERATOR_ROLES as readonly string[]).includes(role);
}

export function isApprover(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}

export function parseRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    if (typeof payload === 'object' && payload !== null) {
      const role = (payload as { role?: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
  } catch {
    return null;
  }
  return null;
}

export interface RunActionPermissions {
  canSubmit: boolean;
  canApprove: boolean;
  canStart: boolean;
  canAbort: boolean;
  canRetest: boolean;
}

export function runActions(role: string | null | undefined, status: string): RunActionPermissions {
  const operator = isOperator(role);
  return {
    canSubmit: operator && status === 'DRAFT',
    canApprove: isApprover(role) && status === 'AWAITING_APPROVAL',
    canStart: operator && status === 'APPROVED',
    canAbort: operator && status === 'RUNNING',
    canRetest: operator && (status === 'COMPLETED' || status === 'ABORTED'),
  };
}

/* ---------- Targets ---------- */

/** Only verified targets with a fresh verification may be used for a run. */
export function isTargetSelectable(t: AiTargetView): boolean {
  return t.verification.status === 'VERIFIED' && t.verification.fresh;
}

export function verificationLabel(t: AiTargetView): { text: string; tone: 'good' | 'warn' | 'bad' } {
  const v = t.verification;
  if (v.status === 'VERIFIED' && v.fresh) return { text: 'Verifiziert', tone: 'good' };
  if (v.status === 'VERIFIED') return { text: 'Veraltet – neu verifizieren', tone: 'warn' };
  if (v.status === 'FAILED') return { text: 'Fehlgeschlagen', tone: 'bad' };
  return { text: 'Nicht verifiziert', tone: 'warn' };
}

const PROVIDER_HOSTS = [
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

/** Client-side pre-check; the API remains the authority. Returns an error message or null. */
export function validateEndpointUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'Ungültige URL.';
  }
  if (url.protocol !== 'https:') return 'Nur https:// ist erlaubt.';
  if (url.username || url.password) return 'Zugangsdaten in der URL sind nicht erlaubt.';
  if (url.port && url.port !== '443') return 'Nur Port 443 ist erlaubt.';
  if (PROVIDER_HOSTS.includes(url.hostname.toLowerCase())) {
    return 'Provider-Hosts (z. B. OpenAI, Anthropic) sind nicht erlaubt – nur dein eigener Endpunkt.';
  }
  return null;
}

/* ---------- Run wizard ---------- */

export interface RunBudgetInput {
  goalCount: number;
  maxRounds: number;
  maxRequests: number;
}

/** Rough request estimate: one request per goal and round, clamped to the request budget. */
export function estimateRequests(input: RunBudgetInput): number {
  const raw = Math.max(0, input.goalCount) * Math.max(0, input.maxRounds);
  return Math.min(raw, Math.max(0, input.maxRequests));
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function groupGoalsByCategory<T extends { category: string }>(goals: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const g of goals) {
    const list = map.get(g.category) ?? [];
    list.push(g);
    map.set(g.category, list);
  }
  return [...map.entries()];
}
