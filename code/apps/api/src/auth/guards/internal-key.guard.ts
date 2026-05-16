import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const key = req.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException('Invalid internal key');
    }
    return true;
  }
}
