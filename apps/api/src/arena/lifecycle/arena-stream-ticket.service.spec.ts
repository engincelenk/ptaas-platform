import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ArenaStreamTicketService, STREAM_TICKET_TTL_MS } from './arena-stream-ticket.service';

const svc = (secret = 'jwt-secret-for-tests') => new ArenaStreamTicketService({ getOrThrow: () => secret } as never);

describe('ArenaStreamTicketService', () => {
  it('accepts a fresh ticket and returns the bound identity', () => {
    const s = svc();
    const now = 1_000_000;
    const { ticket, expiresAt } = s.create('run1', 'org1', 'u1', now);
    expect(new Date(expiresAt).getTime()).toBe(now + STREAM_TICKET_TTL_MS);
    expect(s.verify(ticket, 'run1', now + 1000)).toMatchObject({ runId: 'run1', organizationId: 'org1', userId: 'u1' });
  });

  it('is valid for 60 s and not a millisecond longer', () => {
    const s = svc();
    const { ticket } = s.create('run1', 'org1', 'u1', 0);
    expect(() => s.verify(ticket, 'run1', 59_999)).not.toThrow();
    expect(() => s.verify(ticket, 'run1', 60_000)).toThrow(UnauthorizedException);
    expect(() => s.verify(ticket, 'run1', 3_600_000)).toThrow(UnauthorizedException);
  });

  it('rejects a ticket for another run', () => {
    const s = svc();
    const { ticket } = s.create('run1', 'org1', 'u1');
    expect(() => s.verify(ticket, 'run2')).toThrow(UnauthorizedException);
  });

  it('rejects a tampered payload (e.g. switched organization) and a tampered signature', () => {
    const s = svc();
    const { ticket } = s.create('run1', 'org1', 'u1');
    const [body, sig] = ticket.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    forged.organizationId = 'org2';
    forged.exp = Date.now() + 10 * 60_000;
    const forgedBody = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect(() => s.verify(`${forgedBody}.${sig}`, 'run1')).toThrow(UnauthorizedException);
    expect(() => s.verify(`${body}.${sig.slice(0, -2)}AA`, 'run1')).toThrow(UnauthorizedException);
    expect(() => s.verify(`${body}.`, 'run1')).toThrow(UnauthorizedException);
  });

  it('rejects malformed input', () => {
    const s = svc();
    for (const t of ['', 'abc', 'a.b.c', '.', 'x'.repeat(2000), undefined as unknown as string]) {
      expect(() => s.verify(t, 'run1')).toThrow(UnauthorizedException);
    }
  });

  it('rejects a ticket signed with another secret', () => {
    const { ticket } = svc('secret-A').create('run1', 'org1', 'u1');
    expect(() => svc('secret-B').verify(ticket, 'run1')).toThrow(UnauthorizedException);
  });
});
