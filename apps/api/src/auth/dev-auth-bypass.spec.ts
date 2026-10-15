import { describe, expect, it } from 'vitest';
import { assertDevAuthBypassAllowed, isDevAuthBypassRequested } from './dev-auth-bypass';

describe('dev auth bypass safety', () => {
  it('is off unless DEV_AUTH_BYPASS is exactly "1"', () => {
    expect(isDevAuthBypassRequested({})).toBe(false);
    expect(isDevAuthBypassRequested({ DEV_AUTH_BYPASS: 'true' })).toBe(false);
    expect(isDevAuthBypassRequested({ DEV_AUTH_BYPASS: '1' })).toBe(true);
  });

  it('does nothing when the flag is not set, in any environment', () => {
    for (const NODE_ENV of ['production', 'development', 'test', undefined]) {
      expect(() => assertDevAuthBypassAllowed({ NODE_ENV })).not.toThrow();
    }
  });

  it('is allowed only with NODE_ENV=development', () => {
    expect(() => assertDevAuthBypassAllowed({ DEV_AUTH_BYPASS: '1', NODE_ENV: 'development' })).not.toThrow();
  });

  it.each(['production', 'test', 'staging', undefined])('refuses to start with NODE_ENV=%s', (NODE_ENV) => {
    expect(() => assertDevAuthBypassAllowed({ DEV_AUTH_BYPASS: '1', NODE_ENV })).toThrow(/only allowed/);
  });
});
