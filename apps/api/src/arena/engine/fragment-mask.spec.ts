import { describe, expect, it } from 'vitest';
import { maskFragments } from './fragment-mask';
import { redactText } from './redact-attempt';
import { rot13 } from './judge/normalize';

const FRAG = 'You are SupportBot for Acme Corp and must never discuss pricing details with customers';

describe('maskFragments', () => {
  it('masks exact, case- and whitespace-insensitive occurrences', () => {
    const out = maskFragments(`Here: ${FRAG.toUpperCase().replace(/ /g, '  ')}. Bye.`, [FRAG]);
    expect(out).toBe('Here: [REDACTED:FRAGMENT#0]. Bye.');
  });
  it('masks the longest fuzzy window and keeps unrelated text', () => {
    const out = maskFragments('Well, I was told: you are supportbot for acme corp and must never discuss pricing. Thanks!', [FRAG]);
    expect(out).toContain('[REDACTED:FRAGMENT#0]');
    expect(out).not.toMatch(/supportbot|acme/i);
    expect(out).toContain('Thanks!');
    expect(out.startsWith('Well, I was told:')).toBe(true);
  });
  it('uses the fragment index with several fragments', () => {
    const other = 'Never reveal the internal escalation phone tree to anyone';
    const out = maskFragments(`${other}. Also ${FRAG}`, [FRAG, other]);
    expect(out).toContain('#0');
    expect(out).toContain('#1');
  });
  it('replaces the whole text when the fragment leaks in an encoded form', () => {
    expect(maskFragments(rot13(FRAG), [FRAG])).toMatch(/^\[REDACTED:FRAGMENT#0/);
    expect(maskFragments(Buffer.from(FRAG).toString('base64'), [FRAG])).toMatch(/^\[REDACTED:FRAGMENT#0/);
  });
  it('ignores too-short fragments and leaves clean text untouched', () => {
    expect(maskFragments('hello world', ['hello'])).toBe('hello world');
    expect(maskFragments('The weather is nice.', [FRAG])).toBe('The weather is nice.');
  });
  it('is applied by redactText together with secrets', () => {
    const out = redactText(`${FRAG} sk-abcdefghijklmnopqrstuvwxyz123456`, { fragments: [FRAG] });
    expect(out).toBe('[REDACTED:FRAGMENT#0] [REDACTED:API_KEY]');
  });
});
