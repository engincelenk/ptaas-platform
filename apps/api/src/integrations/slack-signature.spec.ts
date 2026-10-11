import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifySlackSignature } from './slack-signature';

const secret = 'test-signing-secret';
const body = 'team_id=T123&text=summary';
const now = 1_700_000_000;
const sign = (ts: number, b = body, s = secret) =>
  'v0=' + createHmac('sha256', s).update(`v0:${ts}:${b}`).digest('hex');

describe('verifySlackSignature', () => {
  const base = { signingSecret: secret, rawBody: body, timestamp: String(now), signature: sign(now), now };

  it('accepts a valid signature', () => expect(verifySlackSignature(base)).toBe(true));
  it('rejects a tampered body', () => expect(verifySlackSignature({ ...base, rawBody: body + 'x' })).toBe(false));
  it('rejects a wrong secret', () => expect(verifySlackSignature({ ...base, signature: sign(now, body, 'other') })).toBe(false));
  it('rejects stale timestamps (replay)', () => {
    const old = now - 60 * 6;
    expect(verifySlackSignature({ ...base, timestamp: String(old), signature: sign(old) })).toBe(false);
  });
  it('rejects missing headers or secret', () => {
    expect(verifySlackSignature({ ...base, signature: undefined })).toBe(false);
    expect(verifySlackSignature({ ...base, timestamp: undefined })).toBe(false);
    expect(verifySlackSignature({ ...base, signingSecret: '' })).toBe(false);
  });
  it('rejects garbage signatures of different length', () => {
    expect(verifySlackSignature({ ...base, signature: 'v0=abc' })).toBe(false);
  });
});
