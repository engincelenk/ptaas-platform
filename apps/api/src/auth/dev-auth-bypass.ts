import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@ptaas/types';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

/**
 * LOCAL DEVELOPMENT ONLY. With DEV_AUTH_BYPASS=1 every request is authenticated as a fixed dev user, so the UI
 * can be explored without password and MFA. The bypass refuses to start unless NODE_ENV=development.
 */
export const DEV_SESSION_PATH = '/api/v1/auth/dev-session';
const DEFAULT_EMAIL = 'admin@ptaas.local';
const RENEW_MARGIN_MS = 2 * 60 * 1000;

export function isDevAuthBypassRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_AUTH_BYPASS === '1';
}

export function assertDevAuthBypassAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (isDevAuthBypassRequested(env) && env.NODE_ENV !== 'development') {
    throw new Error('DEV_AUTH_BYPASS=1 is only allowed with NODE_ENV=development. Refusing to start.');
  }
}

/** Replaces the Authorization header of every request with a fresh token of the dev user. */
export function installDevAuthBypass(app: INestApplication): void {
  assertDevAuthBypassAllowed();
  const logger = new Logger('DevAuthBypass');
  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokenService, { strict: false });
  const email = config.get<string>('DEV_AUTH_BYPASS_EMAIL') ?? DEFAULT_EMAIL;

  let cached: { token: string; renewAt: number } | null = null;

  async function currentToken(): Promise<string> {
    if (cached && Date.now() < cached.renewAt) return cached.token;
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`DEV_AUTH_BYPASS: user ${email} not found`);
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      select: { organizationId: true, role: true },
    });
    if (!membership) throw new Error(`DEV_AUTH_BYPASS: user ${email} has no organization`);
    const pair = await tokens.generateTokenPair(user.id, membership.organizationId, membership.role as Role);
    cached = { token: pair.accessToken, renewAt: Date.now() + pair.accessTokenExpiresIn * 1000 - RENEW_MARGIN_MS };
    return cached.token;
  }

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = await currentToken();
      if (req.method === 'GET' && req.path === DEV_SESSION_PATH) {
        res.json({ accessToken: token });
        return;
      }
      req.headers.authorization = `Bearer ${token}`;
      next();
    } catch (err) {
      next(err);
    }
  });

  logger.warn(`DEV_AUTH_BYPASS is ON — all requests are authenticated as ${email}. Never use outside local development.`);
}
