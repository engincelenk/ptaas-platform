import type {
  ApproveRunBody,
  ArenaAdapter,
  ArenaEnvironment,
  ArenaTargetKind,
  RagConfig,
  WidgetConfig,
} from './arena-types';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ---------- Approval confirmations per kind ---------- */

export interface ApprovalChecks {
  noProduction: boolean;
  noSideEffects: boolean;
  providerTosAccepted: boolean;
  noTools: boolean;
  stagingOnly: boolean;
  toolsSandboxed: boolean;
  testDocumentsMayBeIndexedAndRemoved: boolean;
}

export const EMPTY_CHECKS: ApprovalChecks = {
  noProduction: false,
  noSideEffects: false,
  providerTosAccepted: false,
  noTools: false,
  stagingOnly: false,
  toolsSandboxed: false,
  testDocumentsMayBeIndexedAndRemoved: false,
};

/** Mandatory confirmations per target kind (contract stages 2-4, section 3.7). */
export function requiredConfirmations(kind: ArenaTargetKind): (keyof ApprovalChecks)[] {
  const base: (keyof ApprovalChecks)[] = ['noProduction', 'noSideEffects', 'providerTosAccepted'];
  switch (kind) {
    case 'AGENT':
      return [...base, 'stagingOnly', 'toolsSandboxed'];
    case 'RAG':
      return [...base, 'noTools', 'testDocumentsMayBeIndexedAndRemoved'];
    default:
      return [...base, 'noTools'];
  }
}

export function canSubmitApproval(
  kind: ArenaTargetKind,
  checks: ApprovalChecks,
  emergencyContact: string,
  roeVersion: number | null,
): boolean {
  return (
    requiredConfirmations(kind).every((k) => checks[k]) &&
    emergencyContact.trim().length >= 5 &&
    roeVersion !== null
  );
}

/** Builds the confirmations body containing exactly the required keys for the kind. */
export function buildConfirmations(kind: ArenaTargetKind): ApproveRunBody['confirmations'] {
  const keys = requiredConfirmations(kind);
  return {
    noProduction: true,
    noSideEffects: true,
    providerTosAccepted: true,
    ...(keys.includes('noTools') ? { noTools: true as const } : {}),
    ...(keys.includes('stagingOnly') ? { stagingOnly: true as const } : {}),
    ...(keys.includes('toolsSandboxed') ? { toolsSandboxed: true as const } : {}),
    ...(keys.includes('testDocumentsMayBeIndexedAndRemoved')
      ? { testDocumentsMayBeIndexedAndRemoved: true as const }
      : {}),
  };
}

export const CONFIRMATION_LABEL: Record<keyof ApprovalChecks, string> = {
  noProduction: 'Das Ziel ist KEIN Produktivsystem mit echten Kunden- oder Personendaten.',
  noSideEffects: 'Die KI löst keine realen Nebenwirkungen aus (keine Zahlungen, Mails, Löschungen o. Ä.).',
  noTools: 'Die KI hat in dieser Umgebung keinen Zugriff auf schreibende Tools oder interne Systeme.',
  providerTosAccepted: 'Die Nutzungsbedingungen des Modell-Providers erlauben diesen Test; ich bin dazu berechtigt.',
  stagingOnly: 'Das Ziel ist eine reine Staging-Umgebung. Es gibt keine Verbindung zu Produktivdaten oder -systemen.',
  toolsSandboxed:
    'Alle Tools des Agenten sind sandboxed bzw. im Dry-Run: Marker-Argumente haben keine echte Wirkung.',
  testDocumentsMayBeIndexedAndRemoved:
    'PTaaS darf markierte Testdokumente in den Index einspeisen und danach wieder entfernen (nur Testdaten).',
};

/* ---------- Target kinds ---------- */

export const KIND_LABEL: Record<ArenaTargetKind, string> = {
  CHAT: 'Chat',
  RAG: 'RAG',
  AGENT: 'Agent',
  WIDGET: 'Web-Widget',
};

export const KIND_CLASS: Record<ArenaTargetKind, string> = {
  CHAT: 'bg-secondary text-secondary-foreground',
  RAG: 'bg-purple-600 text-white',
  AGENT: 'bg-orange-600 text-white',
  WIDGET: 'bg-cyan-600 text-white',
};

export function kindOf(t: { kind?: ArenaTargetKind } | null | undefined): ArenaTargetKind {
  return t?.kind ?? 'CHAT';
}

export function adapterForKind(kind: ArenaTargetKind, current: ArenaAdapter): ArenaAdapter {
  if (kind === 'WIDGET') return 'WIDGET';
  return current === 'WIDGET' ? 'OPENAI_COMPAT' : current;
}

/** Goals without a kinds list (older API) are treated as valid for every kind. */
export function goalsForKind<T extends { kinds?: ArenaTargetKind[] }>(
  goals: T[],
  kind: ArenaTargetKind,
): T[] {
  return goals.filter((g) => !g.kinds || g.kinds.includes(kind));
}

/** Agent targets may only run in staging. */
export function allowedEnvironments(kind: ArenaTargetKind): ArenaEnvironment[] {
  return kind === 'AGENT' ? ['STAGING'] : ['STAGING', 'PRODUCTION'];
}

/* ---------- Config builders / validation ---------- */

export function parseJsonObject(text: string): { value: Record<string, unknown> | null; error: string | null } {
  if (!text.trim()) return { value: null, error: null };
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { value: null, error: 'Muss ein JSON-Objekt sein.' };
    }
    return { value: v as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: 'Ungültiges JSON.' };
  }
}

const FORBIDDEN_TEMPLATE_KEYS = [
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  '__proto__',
  'constructor',
  'prototype',
];

/** Returns the first forbidden key found (any depth) or null. */
export function findForbiddenKey(value: unknown, depth = 0): string | null {
  if (depth > 8 || typeof value !== 'object' || value === null) return null;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_TEMPLATE_KEYS.includes(k)) return k;
    const nested = findForbiddenKey(v, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

/** URL on the same host as the endpoint (https, port 443, no credentials). */
export function validateSameHostUrl(value: string, endpointUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(value.replace(/\{\{docId\}\}/g, 'x').trim());
  } catch {
    return 'Ungültige URL.';
  }
  if (url.protocol !== 'https:') return 'Nur https:// ist erlaubt.';
  if (url.username || url.password) return 'Zugangsdaten in der URL sind nicht erlaubt.';
  if (url.port && url.port !== '443') return 'Nur Port 443 ist erlaubt.';
  if (!sameHost(value.replace(/\{\{docId\}\}/g, 'x'), endpointUrl)) {
    return 'Der Host muss dem Endpunkt-Host entsprechen.';
  }
  return null;
}

export interface RagFormState {
  mode: 'AUTO' | 'MANUAL';
  ingestUrl: string;
  ingestMethod: 'POST' | 'PUT';
  ingestBody: string;
  docIdPath: string;
  deleteUrl: string;
  deleteMethod: 'DELETE' | 'POST';
  deleteBody: string;
  indexingDelayMs: number;
}

export const RAG_DELAY_MAX_MS = 15000;

export function buildRagConfig(
  f: RagFormState,
  endpointUrl: string,
): { config: RagConfig | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: RagConfig = {
    mode: f.mode,
    indexingDelayMs: clamp(f.indexingDelayMs, 0, RAG_DELAY_MAX_MS),
  };
  if (f.mode === 'AUTO') {
    const urlErr = f.ingestUrl ? validateSameHostUrl(f.ingestUrl, endpointUrl) : 'Ingest-URL fehlt.';
    if (urlErr) errors.push(`Ingest: ${urlErr}`);
    const body = parseJsonObject(f.ingestBody);
    if (body.error) errors.push(`Ingest-Body: ${body.error}`);
    if (!body.value && !body.error) errors.push('Ingest-Body fehlt (JSON mit {{content}} und {{docId}}).');
    const bad = body.value ? findForbiddenKey(body.value) : null;
    if (bad) errors.push(`Ingest-Body: Schlüssel "${bad}" ist nicht erlaubt.`);
    if (!urlErr && body.value) {
      config.ingest = {
        url: f.ingestUrl.trim(),
        method: f.ingestMethod,
        bodyTemplate: body.value,
        ...(f.docIdPath.trim() ? { docIdPath: f.docIdPath.trim() } : {}),
      };
    }
    if (f.deleteUrl.trim()) {
      const dErr = validateSameHostUrl(f.deleteUrl, endpointUrl);
      if (dErr) errors.push(`Delete: ${dErr}`);
      const dBody = parseJsonObject(f.deleteBody);
      if (dBody.error) errors.push(`Delete-Body: ${dBody.error}`);
      const dBad = dBody.value ? findForbiddenKey(dBody.value) : null;
      if (dBad) errors.push(`Delete-Body: Schlüssel "${dBad}" ist nicht erlaubt.`);
      if (!dErr && !dBody.error) {
        config.delete = {
          url: f.deleteUrl.trim(),
          method: f.deleteMethod,
          ...(dBody.value ? { bodyTemplate: dBody.value } : {}),
        };
      }
    } else {
      warnings.push('Ohne Delete-Konfiguration bleiben die Testdokumente nach dem Run im Index.');
    }
  }
  return { config: errors.length ? null : config, errors, warnings };
}

export interface WidgetFormState {
  pageUrl: string;
  openSelector: string;
  iframeSelector: string;
  inputSelector: string;
  sendSelector: string;
  responseSelector: string;
  cookieConsentSelector: string;
  waitAfterOpenMs: number;
  responseTimeoutMs: number;
}

export function buildWidgetConfig(
  f: WidgetFormState,
  endpointUrl: string,
): { config: WidgetConfig | null; errors: string[] } {
  const errors: string[] = [];
  const urlErr = f.pageUrl ? validateSameHostUrl(f.pageUrl, endpointUrl) : 'Seiten-URL fehlt.';
  if (urlErr) errors.push(`Seiten-URL: ${urlErr}`);
  if (!f.inputSelector.trim()) errors.push('Eingabe-Selektor fehlt.');
  if (!f.responseSelector.trim()) errors.push('Antwort-Selektor fehlt.');
  const selectors: [string, string][] = [
    ['inputSelector', f.inputSelector],
    ['responseSelector', f.responseSelector],
    ['openSelector', f.openSelector],
    ['iframeSelector', f.iframeSelector],
    ['sendSelector', f.sendSelector],
    ['cookieConsentSelector', f.cookieConsentSelector],
  ];
  for (const [name, v] of selectors) {
    if (v.trim().length > 200) errors.push(`${name}: höchstens 200 Zeichen.`);
  }
  if (errors.length) return { config: null, errors };
  const opt = (k: string, v: string): Record<string, string> => (v.trim() ? { [k]: v.trim() } : {});
  const config: WidgetConfig = {
    pageUrl: f.pageUrl.trim(),
    inputSelector: f.inputSelector.trim(),
    responseSelector: f.responseSelector.trim(),
    ...opt('openSelector', f.openSelector),
    ...opt('iframeSelector', f.iframeSelector),
    ...opt('sendSelector', f.sendSelector),
    ...opt('cookieConsentSelector', f.cookieConsentSelector),
    waitAfterOpenMs: clamp(f.waitAfterOpenMs, 0, 15000),
    responseTimeoutMs: clamp(f.responseTimeoutMs, 1000, 60000),
  };
  return { config, errors };
}

/** Human readable cleanup status for RAG runs. */
export function ragCleanupText(
  rag: { planted: number; deleted: number; cleanupFailed: number } | undefined,
): { text: string; tone: 'good' | 'warn' | 'neutral' } {
  if (!rag || rag.planted === 0) return { text: 'Keine Testdokumente eingespielt.', tone: 'neutral' };
  if (rag.cleanupFailed > 0) {
    return {
      text: `${rag.cleanupFailed} von ${rag.planted} Testdokumenten konnten nicht entfernt werden – bitte manuell aus dem Index löschen.`,
      tone: 'warn',
    };
  }
  if (rag.deleted >= rag.planted) {
    return { text: `Alle ${rag.planted} Testdokumente wurden wieder entfernt.`, tone: 'good' };
  }
  return { text: `${rag.deleted} von ${rag.planted} Testdokumenten entfernt (Aufräumen läuft).`, tone: 'neutral' };
}
