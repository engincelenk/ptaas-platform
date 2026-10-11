import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { MailService } from '../mail/mail.service';
import { FindingsService } from './findings.service';

const OVERDUE_QUEUE = 'overdue-queue';

@Injectable()
export class OverdueScheduler implements OnModuleInit {
  private readonly logger = new Logger(OverdueScheduler.name);

  constructor(
    @InjectQueue(OVERDUE_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'daily-overdue-check',
      { pattern: '0 9 * * *' },
      { name: 'check-overdue', data: {} },
    );
    this.logger.log('Overdue finding check cron registered (daily 09:00 UTC)');
  }

  async checkOverdue(): Promise<void> {
    const now = new Date();

    const overdue = await this.prisma.finding.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lt: now },
      },
      select: {
        id: true, title: true, severity: true, dueDate: true,
        organizationId: true, projectId: true,
        assignedToId: true,
        scan: { select: { projectId: true } },
      },
      take: 100,
    });

    if (overdue.length === 0) return;

    // Group by org
    const byOrg = overdue.reduce<Record<string, typeof overdue>>((acc, f) => {
      (acc[f.organizationId] ??= []).push(f);
      return acc;
    }, {});

    for (const [orgId, findings] of Object.entries(byOrg)) {
      // Get all members who have assigned findings or are admins
      const assigneeIds = [...new Set(findings.map((f) => f.assignedToId).filter(Boolean))] as string[];

      for (const finding of findings) {
        if (finding.assignedToId) {
          await this.notifications.create({
            type: 'finding.overdue',
            title: `Overdue: ${finding.title}`,
            body: `Due date passed · ${finding.severity}`,
            link: finding.projectId ? `/projects/${finding.projectId}/findings/${finding.id}` : undefined,
            userId: finding.assignedToId,
            orgId,
          }).catch(() => {});
        }
      }

      // Slack/Webhook notification for critical overdue
      const criticalOverdue = findings.filter((f) => f.severity === 'CRITICAL');
      if (criticalOverdue.length > 0) {
        await this.integrations.notify('finding.overdue', orgId, {
          count: criticalOverdue.length,
          findings: criticalOverdue.map((f) => ({ id: f.id, title: f.title, severity: f.severity })),
        }).catch(() => {});
      }
    }

    // Send SLA breach email to org admins
    for (const [orgId, findings] of Object.entries(byOrg)) {
      const admins = await this.prisma.organizationMember.findMany({
        where: { organizationId: orgId, role: 'ADMIN', acceptedAt: { not: null } },
        include: { user: { select: { email: true, name: true } } },
      });

      const slaUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/sla`;
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

      const criticalBreaches = findings.filter((f) => f.severity === 'CRITICAL');
      const highBreaches = findings.filter((f) => f.severity === 'HIGH');

      for (const admin of admins) {
        const daysOverdueMap = findings.map((f) => ({
          title: f.title,
          severity: f.severity,
          daysOverdue: f.dueDate ? Math.floor((Date.now() - new Date(f.dueDate).getTime()) / 86400000) : 0,
          url: f.projectId ? `${appUrl}/projects/${f.projectId}/findings/${f.id}` : slaUrl,
        }));

        await this.mail.sendSlaBreachAlert({
          to: admin.user.email,
          userName: admin.user.name,
          orgName: orgId,
          breachCount: findings.length,
          criticalCount: criticalBreaches.length,
          highCount: highBreaches.length,
          items: daysOverdueMap,
          slaUrl,
        }).catch(() => {});
      }
    }

    this.logger.log(`Overdue check: ${overdue.length} findings flagged across ${Object.keys(byOrg).length} orgs`);
  }
}

export { OVERDUE_QUEUE };
