import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';

const makeCtx = (key: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-internal-key': key } }),
    }),
  }) as unknown as ExecutionContext;

describe('InternalKeyGuard', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, INTERNAL_API_KEY: 'secret123' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('passes when key matches', () => {
    const guard = new InternalKeyGuard();
    expect(guard.canActivate(makeCtx('secret123'))).toBe(true);
  });

  it('throws when key is wrong', () => {
    const guard = new InternalKeyGuard();
    expect(() => guard.canActivate(makeCtx('wrong'))).toThrow(UnauthorizedException);
  });

  it('throws when key is missing', () => {
    const guard = new InternalKeyGuard();
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(UnauthorizedException);
  });
});
