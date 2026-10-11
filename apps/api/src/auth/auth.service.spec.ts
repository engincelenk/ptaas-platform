import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

// ── Mfa.verifyTotp ────────────────────────────────────────────────

describe('MfaService.verifyTotp', () => {
  const mfa = new MfaService();

  it('returns false for empty code', () => {
    expect(mfa.verifyTotp('INVALIDSECRET', '')).toBe(false);
  });

  it('returns false for wrong code', () => {
    expect(mfa.verifyTotp('JBSWY3DPEHPK3PXP', '000000')).toBe(false);
  });
});

// ── AuthService helpers ───────────────────────────────────────────

describe('AuthService.register — duplicate email', () => {
  it('throws ConflictException when email already taken', async () => {
    const prismaMock = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: '1' }) },
      organization: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const service = new AuthService(
      prismaMock as never,
      { log: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.register(
        {
          email: 'dup@test.com',
          password: 'Test123!@#abc',
          name: 'Test',
          organizationSlug: 'test',
          organizationName: 'Test Org',
        },
        undefined,
        undefined,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('AuthService.login — locked account', () => {
  it('throws UnauthorizedException for locked user', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: '1',
          passwordHash: '$argon2id$...',
          lockedUntil: new Date(Date.now() + 60_000),
          failedLoginAttempts: 5,
          mfaEnabled: false,
        }),
      },
    };
    const auditMock = { log: vi.fn() };
    const service = new AuthService(
      prismaMock as never,
      auditMock as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.login({ email: 'locked@test.com', password: 'anything' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(auditMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.blocked' }),
    );
  });
});
