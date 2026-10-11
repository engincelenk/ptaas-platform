import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from './api-keys.service';

/** Accepts both Authorization: Bearer ptaas_... and X-API-Key: ptaas_... */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    const raw = this.extractKey(req);
    if (!raw) throw new UnauthorizedException('API key required');

    const { orgId, userId, scopes } = await this.apiKeys.validate(raw);

    // Attach to request so downstream controllers can read it
    (req as any).apiKeyPayload = { orgId, userId, scopes };
    return true;
  }

  private extractKey(req: Request): string | null {
    const xApiKey = req.headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.startsWith('ptaas_')) return xApiKey;

    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ptaas_')) return auth.slice(7);

    return null;
  }
}
