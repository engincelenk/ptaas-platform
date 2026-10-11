import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUsage(orgId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [scanCount, findingCount, userCount] = await Promise.all([
      this.prisma.scan.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
      this.prisma.finding.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
      this.prisma.organizationMember.count({ where: { organizationId: orgId } }),
    ]);

    return {
      orgId,
      period: { start: monthStart, end: now },
      usage: { scanCount, findingCount, userCount },
    };
  }

  async getUsageHistory(orgId: string, months = 6) {
    const snapshots = await this.prisma.usageSnapshot.findMany({
      where: { orgId },
      orderBy: { periodStart: 'desc' },
      take: months,
    });
    return snapshots;
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async snapshotAllOrgs() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });

    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

    for (const org of orgs) {
      const [scanCount, findingCount, userCount] = await Promise.all([
        this.prisma.scan.count({ where: { organizationId: org.id, createdAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
        this.prisma.finding.count({ where: { organizationId: org.id, createdAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
        this.prisma.organizationMember.count({ where: { organizationId: org.id } }),
      ]);

      await this.prisma.usageSnapshot.upsert({
        where: { orgId_periodStart: { orgId: org.id, periodStart: prevMonthStart } },
        create: { orgId: org.id, periodStart: prevMonthStart, periodEnd: prevMonthEnd, scanCount, findingCount, userCount },
        update: { scanCount, findingCount, userCount },
      });
    }
  }
}
