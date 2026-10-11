import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { Role } from '@ptaas/types';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const GENERIC_AUTH_ERROR = 'Invalid credentials';
const MFA_PENDING_SETUP_TTL = 10 * 60; // 10 minutes to confirm setup

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly token: TokenService,
    private readonly mfa: MfaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const slugTaken = await this.prisma.organization.findUnique({
      where: { slug: dto.organizationSlug },
    });
    if (slugTaken) {
      throw new ConflictException('Organization slug is already taken');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const [user] = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });
      const org = await tx.organization.create({
        data: { name: dto.organizationName, slug: dto.organizationSlug },
      });
      await tx.organizationMember.create({
        data: {
          userId: newUser.id,
          organizationId: org.id,
          role: 'ADMIN',
          acceptedAt: new Date(),
        },
      });
      return [newUser, org] as const;
    });

    await this.audit.log({ action: 'auth.register', userId: user.id, ipAddress: ip, userAgent });

    // Return a temp token so the client can immediately proceed to MFA setup
    const tempToken = this.token.generateTempToken(user.id);
    return { userId: user.id, tempToken, message: 'Account created. Set up MFA to continue.' };
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ requiresMfa: true; tempToken: string; mfaSetupRequired?: boolean }> {
    // Fetch user — but always hash to prevent timing attacks
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      await argon2.hash(dto.password, ARGON2_OPTIONS);
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        action: 'auth.login.blocked',
        userId: user.id,
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      const newFail = user.failedLoginAttempts + 1;
      const shouldLock = newFail >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFail,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : undefined,
        },
      });
      await this.audit.log({
        action: shouldLock ? 'auth.login.locked' : 'auth.login.failed',
        userId: user.id,
        ipAddress: ip,
        userAgent,
        metadata: { attempt: newFail },
      });
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tempToken = this.token.generateTempToken(user.id);

    if (!user.mfaEnabled) {
      await this.audit.log({
        action: 'auth.login.mfa_setup_required',
        userId: user.id,
        ipAddress: ip,
        userAgent,
      });
      return { requiresMfa: true, tempToken, mfaSetupRequired: true };
    }

    await this.audit.log({
      action: 'auth.login.mfa_required',
      userId: user.id,
      ipAddress: ip,
      userAgent,
    });
    return { requiresMfa: true, tempToken };
  }

  async loginWithMfa(tempToken: string, totpCode: string, ip?: string, userAgent?: string) {
    const userId = this.validateTempToken(tempToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.membershipInclude(),
    });

    if (!user || !user.mfaSecret) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

    const totpValid = this.mfa.verifyTotp(user.mfaSecret, totpCode);
    if (!totpValid) {
      await this.audit.log({ action: 'auth.mfa.failed', userId, ipAddress: ip, userAgent });
      throw new UnauthorizedException('Invalid MFA code');
    }

    return this.issueTokens(user, ip, userAgent, 'auth.login.success');
  }

  async loginWithBackupCode(tempToken: string, backupCode: string, ip?: string, userAgent?: string) {
    const userId = this.validateTempToken(tempToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.membershipInclude(),
    });

    if (!user) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

    const { valid, remainingHashes } = await this.mfa.verifyBackupCode(
      backupCode.toUpperCase(),
      user.mfaBackupCodes,
    );

    if (!valid) {
      await this.audit.log({ action: 'auth.backup_code.failed', userId, ipAddress: ip, userAgent });
      throw new UnauthorizedException('Invalid backup code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: remainingHashes },
    });

    await this.audit.log({
      action: 'auth.backup_code.used',
      userId,
      ipAddress: ip,
      userAgent,
      metadata: { remainingCodes: remainingHashes.length },
    });

    return this.issueTokens(user, ip, userAgent, 'auth.login.success');
  }

  // ── MFA Setup ──────────────────────────────

  async initMfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');

    const setup = await this.mfa.generateSetup(user.email);

    // Store secret + hashes in Redis while user is setting up (not committed yet)
    await this.redis.setJson(
      `mfa_pending:${userId}`,
      { secret: setup.secret, backupCodeHashes: setup.backupCodeHashes },
      MFA_PENDING_SETUP_TTL,
    );

    return {
      otpauthUrl: setup.otpauthUrl,
      qrCodeDataUrl: setup.qrCodeDataUrl,
      backupCodes: setup.backupCodes, // shown to user once — never stored in plaintext
    };
  }

  async confirmMfaSetup(userId: string, totpCode: string, ip?: string, userAgent?: string) {
    const pending = await this.redis.getJson<{ secret: string; backupCodeHashes: string[] }>(
      `mfa_pending:${userId}`,
    );

    if (!pending) {
      throw new BadRequestException('No pending MFA setup found or setup session expired');
    }

    const valid = this.mfa.verifyTotp(pending.secret, totpCode);
    if (!valid) {
      throw new UnauthorizedException('TOTP code is incorrect — check your authenticator app');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: pending.secret,
        mfaBackupCodes: pending.backupCodeHashes,
      },
    });

    await this.redis.del(`mfa_pending:${userId}`);

    await this.audit.log({
      action: 'auth.mfa.enabled',
      userId,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'MFA enabled successfully' };
  }

  async logout(
    userId: string,
    jti: string,
    refreshToken: string,
    accessTokenRemainingTtl: number,
    ip?: string,
    userAgent?: string,
  ) {
    await Promise.all([
      this.token.blockAccessToken(jti, accessTokenRemainingTtl),
      this.token.revokeRefreshToken(refreshToken),
    ]);

    await this.audit.log({ action: 'auth.logout', userId, ipAddress: ip, userAgent });
  }

  // ── Helpers ────────────────────────────────

  private validateTempToken(token: string): string {
    try {
      const decoded = this.token.verifyTempToken(token);
      if (decoded.type !== 'mfa_pending') throw new Error('Wrong token type');
      return decoded.sub;
    } catch {
      throw new UnauthorizedException('Temporary token expired or invalid');
    }
  }

  private membershipInclude() {
    return {
      memberships: {
        where: { acceptedAt: { not: null as Date | null } },
        orderBy: { invitedAt: 'asc' as const },
        take: 1,
      },
    };
  }

  private async issueTokens(
    user: { id: string; memberships: Array<{ organizationId: string; role: string }> },
    ip: string | undefined,
    userAgent: string | undefined,
    auditAction: string,
  ) {
    const membership = user.memberships[0];
    if (!membership) throw new ForbiddenException('No organization found for this user');

    const tokens = await this.token.generateTokenPair(
      user.id,
      membership.organizationId,
      membership.role as Role,
      ip,
      userAgent,
    );

    await this.audit.log({
      action: auditAction,
      userId: user.id,
      organizationId: membership.organizationId,
      ipAddress: ip,
      userAgent,
    });

    return tokens;
  }

  // ── Password Reset ─────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const RESET_TTL = 60 * 60; // 1 hour
    const GENERIC_RESPONSE = undefined; // always void — caller sends same response

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) return GENERIC_RESPONSE; // same timing branch — no user-enumeration

    const token = randomBytes(32).toString('hex');
    await this.redis.set(`pw_reset:${token}`, user.id, RESET_TTL);

    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await this.mail.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresIn: '1 Stunde',
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.redis.get(`pw_reset:${token}`);
    if (!userId) {
      throw new BadRequestException('Reset-Link ungültig oder abgelaufen');
    }

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate token immediately after use
    await this.redis.del(`pw_reset:${token}`);

    // Revoke all refresh token families so old sessions can't be reused
    await this.token.revokeAllOtherSessions(userId, null);
  }

  // ── MFA Management (settings) ──────────────

  async getMfaStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaEnabled: true, mfaBackupCodes: true, updatedAt: true },
    });
    return {
      mfaEnabled: user.mfaEnabled,
      backupCodesRemaining: user.mfaBackupCodes.length,
    };
  }

  async disableMfa(userId: string, totpCode: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, mfaEnabled: true, mfaSecret: true },
    });

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled on this account');
    }

    const valid = this.mfa.verifyTotp(user.mfaSecret, totpCode);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code — MFA not disabled');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });

    await this.audit.log({ action: 'auth.mfa.disabled', userId, ipAddress: ip, userAgent });
    return { message: 'MFA disabled' };
  }

  async regenerateBackupCodes(userId: string, totpCode: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, mfaEnabled: true, mfaSecret: true },
    });

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const valid = this.mfa.verifyTotp(user.mfaSecret, totpCode);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const { plainCodes, hashedCodes } = await this.mfa.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedCodes },
    });

    await this.audit.log({ action: 'auth.mfa.backup_codes_regenerated', userId, ipAddress: ip, userAgent });
    return { backupCodes: plainCodes };
  }
}
