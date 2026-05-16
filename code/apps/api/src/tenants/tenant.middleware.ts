import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';

type VerifyFn = (token: string) => Promise<{ sub: string; org_id?: string; org_role?: string }>;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly verify: VerifyFn;

  constructor(verify?: VerifyFn) {
    if (verify) {
      this.verify = verify;
    } else {
      this.verify = (token) =>
        verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY ?? '' }) as Promise<{
          sub: string;
          org_id?: string;
          org_role?: string;
        }>;
    }
  }

  async use(
    req: Request & { tenantId?: string; userId?: string; userRole?: string },
    _res: Response,
    next: NextFunction,
  ) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.slice(7);
    let payload: { sub: string; org_id?: string; org_role?: string };

    try {
      payload = await this.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload.org_id) {
      throw new ForbiddenException('No tenant context — join an organization first');
    }

    req.tenantId = payload.org_id;
    req.userId = payload.sub;
    req.userRole = payload.org_role;

    next();
  }
}
