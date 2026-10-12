const SENSITIVE_KEY = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|transcript|prompt|response)/i;
const MAX_STRING = 2000;

/** Masks sensitive keys and truncates long strings before data lands in the audit log. */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…[truncated]' : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactMetadata(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactMetadata(v, depth + 1),
      ]),
    );
  }
  return value;
}
