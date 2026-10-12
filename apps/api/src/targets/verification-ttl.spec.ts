import { describe, it, expect } from 'vitest';
import { isVerificationFresh, VERIFICATION_TTL_DAYS } from './verification-ttl';

const now = new Date('2026-10-12T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('isVerificationFresh', () => {
  it('is fresh within the TTL', () => expect(isVerificationFresh(daysAgo(1), now)).toBe(true));
  it('is stale after the TTL', () =>
    expect(isVerificationFresh(daysAgo(VERIFICATION_TTL_DAYS + 1), now)).toBe(false));
  it('is stale when never verified', () => {
    expect(isVerificationFresh(null, now)).toBe(false);
    expect(isVerificationFresh(undefined, now)).toBe(false);
  });
  it('honors a custom TTL', () => expect(isVerificationFresh(daysAgo(8), now, 7)).toBe(false));
});
