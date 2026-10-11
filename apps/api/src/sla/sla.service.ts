import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';

export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export interface SlaPolicy {
  criticalDays: number;
  highDays: number;
  mediumDays: number;
  lowDays: number;
  infoDays: number;
}

const DEFAULTS: SlaPolicy = {
  criticalDays: 7,
  highDays: 30,
  mediumDays: 90,
  lowDays: 180,
  infoDays: 365,
};

@Injectable()
export class SlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  async getPolicy(orgId: string): Promise<SlaPolicy> {
    const p = await this.prisma.slaPolicy.findUnique({ where: { organizationId: orgId } });
    return p ? {
      criticalDays: p.criticalDays,
      highDays:     p.highDays,
      mediumDays:   p.mediumDays,
      lowDays:      p.lowDays,
      infoDays:     p.infoDays,
    } : { ...DEFAULTS };
  }

  async updatePolicy(orgId: string, dto: Partial<SlaPolicy>): Promise<SlaPolicy> {
    const data: any = {};
    if (dto.criticalDays !== undefined) data.criticalDays = dto.criticalDays;
    if (dto.highDays     !== undefined) data.highDays     = dto.highDays;
    if (dto.mediumDays   !== undefined) data.mediumDays   = dto.mediumDays;
    if (dto.lowDays      !== undefined) data.lowDays      = dto.lowDays;
    if (dto.infoDays     !== undefined) data.infoDays     = dto.infoDays;

    const p = await this.prisma.slaPolicy.upsert({
      where:  { organizationId: orgId },
      create: { organizationId: orgId, ...DEFAULTS, ...data },
      update: data,
    });
    return {
      criticalDays: p.criticalDays,
      highDays: p.highDays,
      mediumDays: p.mediumDays,
      lowDays: p.lowDays,
      infoDays: p.infoDays,
    };
  }

  slaDaysForSeverity(severity: string, policy: SlaPolicy): number {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return policy.criticalDays;
      case 'HIGH':     return policy.highDays;
      case 'MEDIUM':   return policy.mediumDays;
      case 'LOW':      return policy.lowDays;
      default:         return policy.infoDays;
    }
  }

  enrichFinding<T extends { severity: string; createdAt: Date; status: string }>(
    finding: T,
    policy: SlaPolicy,
  ): T & { slaDeadline: Date; slaStatus: SlaStatus; slaDaysRemaining: number } {
    const days = this.slaDaysForSeverity(finding.severity, policy);
    const deadline = new Date(finding.createdAt.getTime() + days * 86400000);
    const now = Date.now();
    const remaining = Math.ceil((deadline.getTime() - now) / 86400000);

    let slaStatus: SlaStatus;
    const isFixed = ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'].includes(finding.status);
    if (isFixed) {
      slaStatus = 'ON_TRACK';
    } else if (remaining < 0) {
      slaStatus = 'BREACHED';
    } else if (remaining / days <= 0.25) {
      slaStatus = 'AT_RISK';
    } else {
      slaStatus = 'ON_TRACK';
    }

    return { ...finding, slaDeadline: deadline, slaStatus, slaDaysRemaining: remaining };
  }

  async getFindingsWithSla(projectId: string, orgId: string) {
    const [findings, policy] = await Promise.all([
      this.prisma.finding.findMany({
        where: { projectId, organizationId: orgId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, title: true, severity: true, status: true,
          createdAt: true, owasp: true,
        },
      }),
      this.getPolicy(orgId),
    ]);
    return findings.map((f) => this.enrichFinding(f, policy));
  }

  async getDashboardSummary(orgId: string) {
    const policy = await this.getPolicy(orgId);
    const findings = await this.prisma.finding.findMany({
      where: { organizationId: orgId, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
      select: { id: true, severity: true, status: true, createdAt: true },
    });
    let breached = 0;
    let atRisk = 0;
    for (const f of findings) {
      const { slaStatus } = this.enrichFinding(f, policy);
      if (slaStatus === 'BREACHED')  breached++;
      else if (slaStatus === 'AT_RISK') atRisk++;
    }
    return { breached, atRisk, total: findings.length };
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async notifyBreachingFindings() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      const policy = await this.getPolicy(org.id);
      const findings = await this.prisma.finding.findMany({
        where: { organizationId: org.id, status: { notIn: ['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] } },
        select: { id: true, title: true, severity: true, status: true, createdAt: true, projectId: true },
      });
      const breaching = findings
        .map((f) => this.enrichFinding(f, policy))
        .filter((f) => f.slaStatus === 'BREACHED' || (f.slaStatus === 'AT_RISK' && f.slaDaysRemaining <= 1));

      if (breaching.length === 0) continue;

      // Fire integration webhook for SLA breach
      await this.integrations.notify('sla.breach', org.id, {
        breachedCount: breaching.filter((f) => f.slaStatus === 'BREACHED').length,
        atRiskCount: breaching.filter((f) => f.slaStatus === 'AT_RISK').length,
        totalCount: breaching.length,
        findingIds: breaching.map((f) => f.id),
      }).catch(() => { /* non-fatal */ });

      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId: org.id, role: 'ADMIN' },
        select: { userId: true },
      });
      for (const m of members) {
        await this.notifications.create(m.userId, {
          type:    'SLA_BREACH',
          message: `${breaching.length} finding(s) have breached or are about to breach their SLA remediation deadline.`,
          link:    '/dashboard',
        });
      }
    }
  }
}
