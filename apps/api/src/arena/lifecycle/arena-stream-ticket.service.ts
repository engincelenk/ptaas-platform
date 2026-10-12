import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export const STREAM_TICKET_TTL_MS = 60_000;

export interface StreamTicketPayload {
  runId: string;
  organizationId: string;
  userId: string;
  /** epoch ms */
  exp: number;
}

/**
 * Short-lived, signed ticket for the SSE endpoint (EventSource cannot send an Authorization header,
 * and long-lived JWTs must not travel in URLs). Format: base64url(json).base64url(hmac-sha256).
 * The signing key is derived from JWT_ACCESS_SECRET with a purpose label, so the ticket can never
 * be confused with a JWT and no new environment variable is needed.
 */
@Injectable()
export class ArenaStreamTicketService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.key = createHmac('sha256', secret).update('ptaas:arena:stream-ticket:v1').digest();
  }

  create(
    runId: string,
    organizationId: string,
    userId: string,
    now: number = Date.now(),
  ): { ticket: string; expiresAt: string } {
    const exp = now + STREAM_TICKET_TTL_MS;
    const payload: StreamTicketPayload = { runId, organizationId, userId, exp };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return { ticket: `${body}.${this.sign(body)}`, expiresAt: new Date(exp).toISOString() };
  }

  /** Throws UnauthorizedException unless the ticket is authentic, unexpired and bound to `runId`. */
  verify(ticket: string, runId: string, now: number = Date.now()): StreamTicketPayload {
    const fail = (): never => {
      throw new UnauthorizedException('Invalid or expired stream ticket');
    };
    if (typeof ticket !== 'string' || ticket.length > 1024) return fail();
    const parts = ticket.split('.');
    if (parts.length !== 2) return fail();
    const [body, sig] = parts;

    const expected = Buffer.from(this.sign(body), 'utf8');
    const given = Buffer.from(sig, 'utf8');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fail();

    let payload: StreamTicketPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StreamTicketPayload;
    } catch {
      return fail();
    }
    if (
      typeof payload.runId !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return fail();
    }
    if (payload.exp <= now) return fail();
    if (payload.runId !== runId) return fail();
    return payload;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }
}
