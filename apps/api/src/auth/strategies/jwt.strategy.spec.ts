import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { extractToken } from './jwt.strategy';

const req = (method: string, headers: Record<string, string> = {}, query: Record<string, unknown> = {}) =>
  ({ method, headers, query }) as unknown as Request;

describe('extractToken', () => {
  it('prefers the Authorization header for every method', () => {
    expect(extractToken(req('POST', { authorization: 'Bearer abc' }, { token: 'q' }))).toBe('abc');
    expect(extractToken(req('GET', { authorization: 'Bearer abc' }, { token: 'q' }))).toBe('abc');
  });
  it('accepts ?token= for GET only', () => {
    expect(extractToken(req('GET', {}, { token: 'q' }))).toBe('q');
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(extractToken(req(m, {}, { token: 'q' }))).toBeNull();
    }
  });
  it('returns null without any token', () => {
    expect(extractToken(req('GET'))).toBeNull();
  });
});
