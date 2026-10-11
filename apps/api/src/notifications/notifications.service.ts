import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Subject } from 'rxjs';

export type NotificationType =
  | 'scan.completed'
  | 'finding.critical'
  | 'retest.passed'
  | 'retest.failed'
  | 'invitation'
  | 'finding.kev'
  | 'finding.overdue'
  | 'target.down'
  | 'risk_acceptance.expired'
  | 'SLA_BREACH'
  | 'RISK_ACCEPTANCE_EXPIRING'
  | 'SCHEDULE_SCAN_FAILED'
  | 'FINDING_TAGGED'
  | 'ENGAGEMENT_SIGNED'
  | 'EVIDENCE_UPLOADED';

export const ALL_EVENT_TYPES: Array<{
  type: NotificationType;
  label: string;
  description: string;
  defaultEnabled: boolean;
}> = [
  { type: 'scan.completed',           label: 'Scan Completed',          description: 'When a scan finishes (success or error)',         defaultEnabled: true  },
  { type: 'finding.critical',         label: 'Critical Finding',        description: 'When a CRITICAL severity finding is discovered',   defaultEnabled: true  },
  { type: 'finding.kev',              label: 'KEV Finding',             description: 'When a finding matches a Known Exploited Vulnerability', defaultEnabled: true },
  { type: 'retest.passed',            label: 'Retest Passed',           description: 'When a retest confirms a finding is fixed',        defaultEnabled: true  },
  { type: 'retest.failed',            label: 'Retest Failed',           description: 'When a retest shows a finding is still open',      defaultEnabled: true  },
  { type: 'SLA_BREACH',               label: 'SLA Breach',              description: 'When findings breach their remediation deadline',  defaultEnabled: true  },
  { type: 'RISK_ACCEPTANCE_EXPIRING', label: 'Risk Acceptance Expiring',description: 'When a risk acceptance is expiring within 30 days',defaultEnabled: true  },
  { type: 'SCHEDULE_SCAN_FAILED',     label: 'Scheduled Scan Failed',   description: 'When a scheduled scan fails to start',            defaultEnabled: true  },
  { type: 'ENGAGEMENT_SIGNED',        label: 'Engagement Signed',       description: 'When an engagement is signed off',                defaultEnabled: false },
  { type: 'EVIDENCE_UPLOADED',        label: 'Evidence Uploaded',       description: 'When evidence is attached to a finding',          defaultEnabled: false },
  { type: 'FINDING_TAGGED',           label: 'Finding Tagged',          description: 'When a tag is assigned to a finding',             defaultEnabled: false },
  { type: 'invitation',               label: 'Team Invitation',         description: 'When you are invited to an organization',         defaultEnabled: true  },
];

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  userId: string;
  orgId: string;
}

// Legacy interface used by existing callers via NotificationsService.create(userId, {...})
export interface LegacyCreateDto {
  type: string;
  message: string;
  link?: string;
}

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly sseSubjects = new Map<string, Subject<NotificationEvent>>();

  constructor(private readonly prisma: PrismaService) {}

  // ── SSE subscription management ───────────────────────────────

  getOrCreateSubject(userId: string): Subject<NotificationEvent> {
    if (!this.sseSubjects.has(userId)) {
      this.sseSubjects.set(userId, new Subject<NotificationEvent>());
    }
    return this.sseSubjects.get(userId)!;
  }

  removeSubject(userId: string): void {
    this.sseSubjects.delete(userId);
  }

  // ── Preferences ───────────────────────────────────────────────

  async getPreferences(userId: string): Promise<Array<{ type: string; label: string; description: string; enabled: boolean; defaultEnabled: boolean }>> {
    const saved = await this.prisma.userNotificationPreference.findMany({ where: { userId } });
    const savedMap = new Map(saved.map((p) => [p.eventType, p.enabled]));

    return ALL_EVENT_TYPES.map(({ type, label, description, defaultEnabled }) => ({
      type,
      label,
      description,
      enabled: savedMap.has(type) ? savedMap.get(type)! : defaultEnabled,
      defaultEnabled,
    }));
  }

  async updatePreferences(userId: string, prefs: Array<{ type: string; enabled: boolean }>) {
    for (const { type, enabled } of prefs) {
      await this.prisma.userNotificationPreference.upsert({
        where:  { userId_eventType: { userId, eventType: type } },
        create: { userId, eventType: type, enabled },
        update: { enabled },
      });
    }
    return this.getPreferences(userId);
  }

  private async _isEnabled(userId: string, type: string): Promise<boolean> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType: type } },
    });
    if (pref) return pref.enabled;
    // Fall back to default
    return ALL_EVENT_TYPES.find((e) => e.type === type)?.defaultEnabled ?? true;
  }

  // ── Create ────────────────────────────────────────────────────

  async create(dto: CreateNotificationDto): Promise<void>;
  async create(userId: string, dto: LegacyCreateDto): Promise<void>;
  async create(dtoOrUserId: CreateNotificationDto | string, legacyDto?: LegacyCreateDto): Promise<void> {
    let userId: string;
    let type: string;
    let title: string;
    let body: string | undefined;
    let link: string | undefined;
    let orgId: string;

    if (typeof dtoOrUserId === 'string') {
      // Legacy call: create(userId, { type, message, link })
      userId = dtoOrUserId;
      type   = legacyDto!.type;
      title  = legacyDto!.message;
      link   = legacyDto?.link;
      const membership = await this.prisma.organizationMember.findFirst({
        where: { userId },
        orderBy: { invitedAt: 'asc' },
        select: { organizationId: true },
      });
      orgId  = membership?.organizationId ?? '';
    } else {
      userId = dtoOrUserId.userId;
      type   = dtoOrUserId.type;
      title  = dtoOrUserId.title;
      body   = dtoOrUserId.body;
      link   = dtoOrUserId.link;
      orgId  = dtoOrUserId.orgId;
    }

    // Preference gate
    const enabled = await this._isEnabled(userId, type);
    if (!enabled) return;

    const notification = await this.prisma.notification.create({
      data: { type, title, body, link, userId, orgId },
    });

    const subject = this.sseSubjects.get(userId);
    if (subject) {
      subject.next({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        createdAt: notification.createdAt,
      });
    }
  }

  async createForOrg(dto: Omit<CreateNotificationDto, 'userId'>, userIds: string[]) {
    for (const userId of userIds) {
      await this.create({ ...dto, userId }).catch((err) =>
        this.logger.warn('Failed to create notification', err),
      );
    }
  }

  // ── Query ─────────────────────────────────────────────────────

  async list(userId: string, orgId: string, page = 1, limit = 20, unreadOnly = false) {
    const skip = (page - 1) * limit;
    const where = { userId, orgId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.notification.count({ where: { userId, orgId } }),
      this.prisma.notification.count({ where: { userId, orgId, readAt: null } }),
    ]);
    return { items, total, unread, page, limit };
  }

  async unreadCount(userId: string, orgId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, orgId, readAt: null } });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string, orgId: string) {
    return this.prisma.notification.updateMany({ where: { userId, orgId, readAt: null }, data: { readAt: new Date() } });
  }

  async getUsersWithUnread(orgId: string): Promise<Array<{ userId: string; email: string; name: string; count: number }>> {
    const results = await this.prisma.$queryRaw<Array<{ user_id: string; email: string; name: string; count: bigint }>>`
      SELECT n.user_id, u.email, u.name, COUNT(*) as count
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE n.org_id = ${orgId}
        AND n.read_at IS NULL
        AND n.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY n.user_id, u.email, u.name
    `;
    return results.map((r) => ({ userId: r.user_id, email: r.email, name: r.name, count: Number(r.count) }));
  }

  async getUnreadForUser(userId: string, orgId: string, limit = 10) {
    return this.prisma.notification.findMany({
      where: { userId, orgId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Daily digest ──────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDailyDigest() {
    // Check which users have digest enabled
    const digestPrefs = await this.prisma.userNotificationPreference.findMany({
      where: { eventType: 'digest', enabled: true },
    });

    for (const pref of digestPrefs) {
      const user = await this.prisma.user.findUnique({
        where: { id: pref.userId },
        select: {
          id: true,
          email: true,
          name: true,
          memberships: { select: { organizationId: true } },
        },
      });
      if (!user) continue;
      for (const { organizationId } of user.memberships) {
        const unread = await this.getUnreadForUser(user.id, organizationId, 20);
        if (unread.length === 0) continue;
        this.logger.log(`Digest: ${unread.length} unread notifications for ${user.email}`);
        // MailService would be injected in a production scenario; log only to avoid circular dep
      }
    }
  }
}
