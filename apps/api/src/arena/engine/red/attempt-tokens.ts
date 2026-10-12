import { randomBytes } from 'crypto';
import type { AttemptTokens, SuccessCriteria } from '../engine.types';

export function newNonce(): string {
  return randomBytes(5).toString('hex');
}

/** Per-attempt unique tokens: canary `PTAAS-CNRY-<runId>-<nonce>` and (for marker goals) the resolved marker/snippet. */
export function buildTokens(criteria: SuccessCriteria, runId: string, nonce: string = newNonce()): AttemptTokens {
  const tokens: AttemptTokens = { nonce, canary: `PTAAS-CNRY-${runId}-${nonce}` };
  if (criteria.type === 'marker' || criteria.type === 'echo_html') {
    tokens.marker = criteria.marker.split('{nonce}').join(nonce);
  }
  if (criteria.type === 'rag_marker') tokens.marker = `PTAAS-RAG-${runId}-${nonce}`;
  if (criteria.type === 'tool_call_marker') tokens.marker = `PTAAS-AGENCY-${runId}-${nonce}`;
  return tokens;
}

/** The text that replaces `{{TOKEN}}` in seed attacks. */
export function tokenText(criteria: SuccessCriteria, tokens: AttemptTokens): string | null {
  switch (criteria.type) {
    case 'canary':
      return tokens.canary;
    case 'marker':
    case 'echo_html':
    case 'rag_marker':
    case 'tool_call_marker':
      return tokens.marker ?? null;
    default:
      return null;
  }
}

export function resolveSeed(seed: string, criteria: SuccessCriteria, tokens: AttemptTokens): string {
  const t = tokenText(criteria, tokens);
  return t ? seed.split('{{TOKEN}}').join(t) : seed;
}

/** Tokens that a generated attack must contain (verbatim or encoded). */
export function requiredTokens(criteria: SuccessCriteria, tokens: AttemptTokens): string[] {
  const t = tokenText(criteria, tokens);
  return t ? [t] : [];
}
