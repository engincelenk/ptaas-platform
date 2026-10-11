import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
import type { Role } from '@ptaas/types';
import type { JwtPayload } from './strategies/jwt.strategy';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;          // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const TEMP_TOKEN_TTL_SECONDS = 5 * 60;              // 5 minutes (post-password, pre-MFA)

interface TokenFamily {
  currentTokenHash: string;
  userId: string;
  orgId: string;
  role: Role;
  createdAt: string;
  ip?: string;
  userAgent?: string;
  lastUsedAt?: string;
}

export interface SessionInfo {
  familyId: string;
  createdAt: string;
  lastUsedAt: string | null;
  ip: string | null;
  userAgent: string | null;
  expiresAt: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async generateTokenPair(
    userId: string,
    orgId: string,
    role: Role,
    ip?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const familyId = randomBytes(32).toString('hex');
    const tokenId = randomBytes(32).toString('hex');
    const jti = randomBytes(16).toString('hex');

    const accessPayload: JwtPayload = { sub: userId, email: '', orgId, role, jti };
    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    // Refresh token carries family + tokenId (not the full JwtPayload)
    const refreshToken = this.jwt.sign(
      { familyId, tokenId, userId },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    const family: TokenFamily = {
      currentTokenHash: this.hashToken(tokenId),
      userId,
      orgId,
      role,
      createdAt: new Date().toISOString(),
      ip,
      userAgent,
      lastUsedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.redis.setJson(`token_family:${familyId}`, family, REFRESH_TOKEN_TTL_SECONDS),
      this.redis.sadd(`user_families:${userId}`, familyId),
    ]);

    return { accessToken, refreshToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async rotateRefreshToken(
    rawRefreshToken: string,
  ): Promise<TokenPair & { userId: string; orgId: string; role: Role }> {
    let decoded: { familyId: string; tokenId: string; userId: string };
    try {
      decoded = this.jwt.verify(rawRefreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      }) as typeof decoded;
    } catch {
      throw new Error('Invalid or expired refresh token');
    }

    const { familyId, tokenId, userId } = decoded;
    const family = await this.redis.getJson<TokenFamily>(`token_family:${familyId}`);

    if (!family) {
      // Token expired or already wiped by reuse-detection
      throw new Error('Refresh token family not found');
    }

    if (family.currentTokenHash !== this.hashToken(tokenId)) {
      // REUSE DETECTED — wipe entire family → all sessions for this user via this family end
      await this.redis.del(`token_family:${familyId}`);
      await this.redis.srem(`user_families:${userId}`, familyId);
      throw new Error('Refresh token reuse detected — all sessions invalidated');
    }

    // Issue new token pair (new tokenId, same familyId)
    const newTokenId = randomBytes(32).toString('hex');
    const jti = randomBytes(16).toString('hex');

    const accessToken = this.jwt.sign(
      { sub: family.userId, orgId: family.orgId, role: family.role, jti },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = this.jwt.sign(
      { familyId, tokenId: newTokenId, userId },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    family.currentTokenHash = this.hashToken(newTokenId);
    family.lastUsedAt = new Date().toISOString();
    await this.redis.setJson(`token_family:${familyId}`, family, REFRESH_TOKEN_TTL_SECONDS);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      userId: family.userId,
      orgId: family.orgId,
      role: family.role,
    };
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    try {
      const decoded = this.jwt.verify(rawRefreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      }) as { familyId: string; userId: string };
      await this.redis.del(`token_family:${decoded.familyId}`);
      await this.redis.srem(`user_families:${decoded.userId}`, decoded.familyId);
    } catch {
      // Ignore — token may already be expired
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const families = await this.redis.smembers(`user_families:${userId}`);
    const keys = families.map((fid) => `token_family:${fid}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    await this.redis.del(`user_families:${userId}`);
  }

  async blockAccessToken(jti: string, remainingTtlSeconds: number): Promise<void> {
    if (remainingTtlSeconds > 0) {
      await this.redis.set(`token_blocklist:${jti}`, '1', remainingTtlSeconds);
    }
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    const familyIds = await this.redis.smembers(`user_families:${userId}`);
    const sessions: SessionInfo[] = [];

    await Promise.all(
      familyIds.map(async (familyId) => {
        const family = await this.redis.getJson<TokenFamily>(`token_family:${familyId}`);
        if (!family) {
          // Expired — clean up the set entry
          await this.redis.srem(`user_families:${userId}`, familyId);
          return;
        }
        const ttl = await this.redis.ttl(`token_family:${familyId}`);
        sessions.push({
          familyId,
          createdAt: family.createdAt,
          lastUsedAt: family.lastUsedAt ?? null,
          ip: family.ip ?? null,
          userAgent: family.userAgent ?? null,
          expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null,
        });
      }),
    );

    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async revokeSession(userId: string, familyId: string): Promise<void> {
    await this.redis.del(`token_family:${familyId}`);
    await this.redis.srem(`user_families:${userId}`, familyId);
  }

  async revokeAllOtherSessions(userId: string, currentFamilyId: string | null): Promise<void> {
    const familyIds = await this.redis.smembers(`user_families:${userId}`);
    const toRevoke = familyIds.filter((id) => id !== currentFamilyId);
    const keys = toRevoke.map((id) => `token_family:${id}`);
    if (keys.length > 0) await this.redis.del(...keys);
    if (toRevoke.length > 0) await this.redis.srem(`user_families:${userId}`, ...toRevoke);
  }

  getCurrentFamilyId(rawRefreshToken: string): string | null {
    try {
      const decoded = this.jwt.verify(rawRefreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      }) as { familyId: string };
      return decoded.familyId;
    } catch {
      return null;
    }
  }

  // Short-lived token used between password-check and MFA verification
  generateTempToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, type: 'mfa_pending' },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: TEMP_TOKEN_TTL_SECONDS,
      },
    );
  }

  verifyTempToken(token: string): { sub: string; type: string } {
    return this.jwt.verify(token, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
    }) as { sub: string; type: string };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
