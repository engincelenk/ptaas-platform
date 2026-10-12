import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { withCronLock, utcMonthKey } from '../common/cron-lock';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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
    const now = new Date();
    // Zeitraum in UTC: Start inklusive, Ende (= Beginn des Folgemonats) exklusiv
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const periodEnd      = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    await withCronLock(
      this.redis,
      `billing:snapshot:${utcMonthKey(now)}`,
      3600,
      () => this.runSnapshot(prevMonthStart, periodEnd),
      { releaseOnFinish: false },
    );
  }

  async runSnapshot(prevMonthStart: Date, periodEnd: Date) {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    const range = { gte: prevMonthStart, lt: periodEnd };

    for (const org of orgs) {
      try {
        const [scanCount, findingCount, userCount] = await Promise.all([
          this.prisma.scan.count({ where: { organizationId: org.id, createdAt: range } }),
          this.prisma.finding.count({ where: { organizationId: org.id, createdAt: range } }),
          this.prisma.organizationMember.count({ where: { organizationId: org.id } }),
        ]);

        await this.prisma.usageSnapshot.upsert({
          where: { orgId_periodStart: { orgId: org.id, periodStart: prevMonthStart } },
          create: { orgId: org.id, periodStart: prevMonthStart, periodEnd, scanCount, findingCount, userCount },
          update: { periodEnd, scanCount, findingCount, userCount },
        });
      } catch (err: unknown) {
        this.logger.warn(`Usage snapshot failed: org=${org.id} error=${err instanceof Error ? err.name : 'UnknownError'}`);
      }
    }
  }
}
