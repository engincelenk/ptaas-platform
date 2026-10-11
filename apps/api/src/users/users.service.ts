import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** DSGVO Art. 20 — Data Portability: export all personal data */
  async exportMyData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        mfaEnabled: true,
        aiConsent: true,
        aiConsentAt: true,
        createdAt: true,
        deletedAt: true,
        memberships: {
          select: {
            role: true,
            invitedAt: true,
            acceptedAt: true,
            organization: { select: { name: true, slug: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { action: true, resource: true, createdAt: true, ipAddress: true },
        },
        _count: { select: { scans: true, projects: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.deletedAt) throw new NotFoundException('Account no longer active');

    return {
      exportedAt: new Date().toISOString(),
      note: 'This export contains all personal data stored by PTaaS for your account.',
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        aiConsent: user.aiConsent,
        aiConsentAt: user.aiConsentAt,
        memberSince: user.createdAt,
      },
      organizations: user.memberships,
      activity: {
        scans: user._count.scans,
        projects: user._count.projects,
        recentAuditEvents: user.auditLogs,
      },
    };
  }

  /** DSGVO Art. 20 — full data export as structured ZIP payload (M52) */
  async exportMyDataFull(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, emailVerified: true,
        mfaEnabled: true, aiConsent: true, aiConsentAt: true, createdAt: true,
        memberships: {
          select: {
            role: true, invitedAt: true, acceptedAt: true,
            organization: { select: { name: true, slug: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10_000,
          select: { action: true, resource: true, resourceId: true, createdAt: true, ipAddress: true, userAgent: true },
        },
        scans: {
          select: { id: true, status: true, target: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        notificationPreferences: {
          select: { eventType: true, enabled: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      profile: {
        id: user.id, email: user.email, name: user.name,
        emailVerified: user.emailVerified, mfaEnabled: user.mfaEnabled,
        aiConsent: user.aiConsent, aiConsentAt: user.aiConsentAt, memberSince: user.createdAt,
      },
      organizations: user.memberships,
      scans: user.scans,
      audit_logs: user.auditLogs,
      notification_preferences: user.notificationPreferences,
    };
  }

  /** DSGVO Art. 17 — Right to Erasure: anonymize account */
  async deleteMyAccount(userId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Anonymize — audit logs retain anonymized reference (legal obligation)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@ptaas.invalid`,
        name: 'Deleted User',
        passwordHash: '',
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        emailVerified: false,
        emailVerificationToken: null,
        deletedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'user.account_deleted',
      userId,
      metadata: { gdpr: 'Art. 17 - Right to Erasure', method: 'self-service' },
      ipAddress: ip,
    });
  }

  /** Get current user profile */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, mfaEnabled: true, emailVerified: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Update display name */
  async updateMe(userId: string, name: string, ip?: string) {
    if (!name?.trim()) throw new BadRequestException('Name cannot be empty');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true },
    });
    await this.audit.log({ action: 'user.profile_updated', userId, ipAddress: ip });
    return user;
  }

  /** Change password — requires current password */
  async changePassword(userId: string, currentPassword: string, newPassword: string, ip?: string) {
    if (newPassword.length < 12) throw new BadRequestException('Password must be at least 12 characters');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user?.passwordHash) throw new NotFoundException('User not found');

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await argon2.hash(newPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    await this.audit.log({ action: 'user.password_changed', userId, ipAddress: ip });

    return { success: true };
  }

  /** Get notification preferences — returns all known event types with enabled status */
  async getNotificationPreferences(userId: string) {
    const EVENT_TYPES = [
      'scan.complete', 'scan.failed', 'finding.critical', 'finding.overdue',
      'target.down', 'threat.brief.generated', 'member.invited',
    ];
    const rows = await this.prisma.userNotificationPreference.findMany({
      where: { userId },
      select: { eventType: true, enabled: true },
    });
    const map = Object.fromEntries(rows.map((r) => [r.eventType, r.enabled]));
    return EVENT_TYPES.map((type) => ({ eventType: type, enabled: map[type] !== false }));
  }

  /** Upsert notification preferences */
  async updateNotificationPreferences(userId: string, prefs: Array<{ eventType: string; enabled: boolean }>) {
    await Promise.all(
      prefs.map((p) =>
        this.prisma.userNotificationPreference.upsert({
          where: { userId_eventType: { userId, eventType: p.eventType } },
          create: { userId, eventType: p.eventType, enabled: p.enabled },
          update: { enabled: p.enabled },
        }),
      ),
    );
    return this.getNotificationPreferences(userId);
  }

  /** DSGVO Art. 7 — Consent management for AI analysis */
  async updateAiConsent(userId: string, consent: boolean, ip?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        aiConsent: consent,
        aiConsentAt: new Date(),
      },
    });

    await this.audit.log({
      action: consent ? 'user.ai_consent_granted' : 'user.ai_consent_revoked',
      userId,
      metadata: { gdpr: 'Art. 7 - Consent', aiConsent: consent },
      ipAddress: ip,
    });

    return { aiConsent: consent, aiConsentAt: new Date() };
  }
}
