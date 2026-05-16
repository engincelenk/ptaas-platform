import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';

const makeReq = (auth?: string) => ({
  headers: { authorization: auth },
  tenantId: undefined as string | undefined,
  userId: undefined as string | undefined,
  userRole: undefined as string | undefined,
});

const makeRes = () => ({});
const makeNext = () => jest.fn();

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let mockVerify: jest.Mock;

  beforeEach(() => {
    mockVerify = jest.fn();
    middleware = new TenantMiddleware(mockVerify as any);
  });

  it('throws UnauthorizedException when no auth header', async () => {
    const req = makeReq();
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token is invalid', async () => {
    mockVerify.mockRejectedValue(new Error('bad token'));
    const req = makeReq('Bearer badtoken');
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when org_id is missing', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1', org_id: undefined, org_role: 'org:member' });
    const req = makeReq('Bearer validtoken');
    await expect(middleware.use(req as any, makeRes() as any, makeNext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('sets tenantId, userId, userRole and calls next on success', async () => {
    mockVerify.mockResolvedValue({ sub: 'user_1', org_id: 'org_abc', org_role: 'org:admin' });
    const req = makeReq('Bearer validtoken');
    const next = makeNext();
    await middleware.use(req as any, makeRes() as any, next);
    expect(req.tenantId).toBe('org_abc');
    expect(req.userId).toBe('user_1');
    expect(req.userRole).toBe('org:admin');
    expect(next).toHaveBeenCalled();
  });
});
