import { describe, expect, it } from 'vitest';
import { ARENA_LIMITS } from '../arena.constants';
import { redactAttempt, redactText } from './redact-attempt';

describe('redactText', () => {
  const cases: Array<[string, string, string]> = [
    ['openai key', 'my key is sk-abcdefghijklmnopqrstuvwxyz123456 ok', '[REDACTED:API_KEY]'],
    ['anthropic key', 'sk-ant-api03-abcdefghijklmnopqrstuv', '[REDACTED:API_KEY]'],
    ['aws key', 'AKIAIOSFODNN7EXAMPLE', '[REDACTED:AWS_KEY]'],
    ['bearer', 'Authorization: Bearer abcDEF123456.token-value', 'Bearer [REDACTED:TOKEN]'],
    ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl', '[REDACTED:JWT]'],
    ['email', 'contact max.mustermann@example.com now', '[REDACTED:EMAIL]'],
    ['iban', 'IBAN DE89 3704 0044 0532 0130 00 please', '[REDACTED:IBAN]'],
    ['phone', 'call +49 170 1234567 today', '[REDACTED:PHONE]'],
    ['kv secret', 'password=SuperSecret123!', '[REDACTED:SECRET]'],
    ['private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----', '[REDACTED:PRIVATE_KEY]'],
  ];
  it.each(cases)('masks %s', (_n, input, expected) => {
    const out = redactText(input);
    expect(out).toContain(expected);
  });

  it('removes the secret itself', () => {
    const out = redactText('sk-abcdefghijklmnopqrstuvwxyz123456 / AKIAIOSFODNN7EXAMPLE / a@b.de');
    expect(out).not.toMatch(/sk-abcdef|AKIAIOSF|a@b\.de/);
  });

  it('masks exact known secrets (e.g. echoed target api key)', () => {
    expect(redactText('the key is hunter2hunter2', { secrets: ['hunter2hunter2'] })).toBe('the key is [REDACTED:SECRET]');
  });

  it('keeps PTaaS canary/marker tokens intact even with digit-heavy nonces', () => {
    const t = 'PTAAS-CNRY-clx0123456789-0123456789ab and PTAAS-PWNED-1234567890';
    expect(redactText(t)).toBe(t);
  });

  it('does not mask short numbers or ordinary text', () => {
    expect(redactText('In 2026 we had 12 releases, version 1.2.3')).toBe('In 2026 we had 12 releases, version 1.2.3');
  });

  it('truncates to the given maximum', () => {
    const out = redactText('x'.repeat(100), { maxChars: 30 });
    expect(out.length).toBe(30);
    expect(out.endsWith('[truncated]')).toBe(true);
  });
});

describe('redactAttempt', () => {
  it('applies arena limits and handles null responses', () => {
    const r = redactAttempt({ attackText: 'a'.repeat(ARENA_LIMITS.maxAttackChars + 10), responseText: null });
    expect(r.attackText.length).toBe(ARENA_LIMITS.maxAttackChars);
    expect(r.responseText).toBeNull();
    const r2 = redactAttempt({ attackText: 'x', responseText: 'b'.repeat(ARENA_LIMITS.maxResponseChars + 10) });
    expect(r2.responseText?.length).toBe(ARENA_LIMITS.maxResponseChars);
  });
});
