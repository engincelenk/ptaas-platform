import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import type { Role } from '@ptaas/types';

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  orgId: string;
  role: Role;
  jti: string;       // unique token ID for blocklist
}

/**
 * Extracts token from Bearer header OR ?token= query param.
 * Query param is needed for SSE (EventSource doesn't support custom headers).
 */
function extractToken(req: Request): string | null {
  // Prefer Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  // Fallback: query param (SSE only)
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string') return queryToken;
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractToken]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check blocklist (logout / revoked tokens)
    const isBlocked = await this.redis.exists(`token_blocklist:${payload.jti}`);
    if (isBlocked) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return payload;
  }
}
