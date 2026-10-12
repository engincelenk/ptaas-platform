import { ARENA_LIMITS } from '../arena.constants';

/**
 * Redaction for attempt transcripts. Applied BEFORE persistence and BEFORE SSE publishing.
 * Masks secrets and PII, never touches PTaaS canary/marker tokens (they are the evidence).
 */

const TOKEN_KEEP = /PTAAS-[A-Z]+-[A-Za-z0-9_-]+/g;

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED:PRIVATE_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED:JWT]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED:TOKEN]'],
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, '[REDACTED:API_KEY]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED:AWS_KEY]'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, '[REDACTED:API_KEY]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED:API_KEY]'],
  [
    /\b(api[_-]?key|secret|password|passwd|token)(\s*[:=]\s*)(["']?)[^\s"',;]{8,}\3/gi,
    '$1$2[REDACTED:SECRET]',
  ],
  [/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}/g, '[REDACTED:EMAIL]'],
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, '[REDACTED:IBAN]'],
];

const PHONE = /(?<![\w-])\+?\d[\d\s().\/-]{7,}\d(?![\w-])/g;

export interface RedactOptions {
  /** Exact secret values that must never appear (e.g. the target's API key if it was echoed). */
  secrets?: string[];
  maxChars?: number;
}

const TRUNC = '…[truncated]';

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(0, max - TRUNC.length)) + TRUNC : text;
}

export function redactText(input: string, opts: RedactOptions = {}): string {
  // Bound the work done by the regexes (inputs can be up to 64 KiB).
  let text = opts.maxChars ? input.slice(0, opts.maxChars * 4) : input.slice(0, 256 * 1024);

  for (const s of opts.secrets ?? []) {
    if (s && s.length >= 6) text = text.split(s).join('[REDACTED:SECRET]');
  }

  // Protect evidence tokens from the (greedy) phone/IBAN patterns.
  const kept: string[] = [];
  text = text.replace(TOKEN_KEEP, (m) => {
    kept.push(m);
    return `\u0000K${kept.length - 1}\u0000`;
  });

  for (const [re, repl] of PATTERNS) text = text.replace(re, repl);
  text = text.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[REDACTED:PHONE]' : m));

  text = text.replace(/\u0000K(\d+)\u0000/g, (_m, i: string) => kept[Number(i)] ?? '');
  return truncate(text, opts.maxChars ?? Number.MAX_SAFE_INTEGER);
}

export interface RedactedAttempt {
  attackText: string;
  responseText: string | null;
}

export function redactAttempt(
  attempt: { attackText: string; responseText: string | null },
  opts: Pick<RedactOptions, 'secrets'> = {},
): RedactedAttempt {
  return {
    attackText: redactText(attempt.attackText, { secrets: opts.secrets, maxChars: ARENA_LIMITS.maxAttackChars }),
    responseText:
      attempt.responseText === null
        ? null
        : redactText(attempt.responseText, { secrets: opts.secrets, maxChars: ARENA_LIMITS.maxResponseChars }),
  };
}
