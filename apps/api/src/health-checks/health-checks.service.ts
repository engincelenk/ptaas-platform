import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';

@Injectable()
export class HealthChecksService {
  private readonly logger = new Logger(HealthChecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  async checkTarget(targetId: string): Promise<{ isUp: boolean; statusCode?: number; responseTimeMs?: number; error?: string }> {
    const target = await this.prisma.target.findUnique({
      where: { id: targetId },
      select: { id: true, value: true, organizationId: true, projectId: true, project: { select: { name: true } } },
    });
    if (!target) return { isUp: false, error: 'Target not found' };

    const url = target.value.startsWith('http') ? target.value : `https://${target.value}`;
    const start = Date.now();
    let isUp = false;
    let statusCode: number | undefined;
    let responseTimeMs: number | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);
      responseTimeMs = Date.now() - start;
      statusCode = res.status;
      isUp = res.status < 500;
    } catch (err: any) {
      responseTimeMs = Date.now() - start;
      error = err?.message ?? 'Unreachable';
      isUp = false;
    }

    await this.prisma.targetHealthCheck.create({
      data: { targetId, isUp, statusCode, responseTimeMs, error },
    });

    // Alert if 2x DOWN in a row
    if (!isUp) {
      const recent = await this.prisma.targetHealthCheck.findMany({
        where: { targetId },
        orderBy: { checkedAt: 'desc' },
        take: 2,
        select: { isUp: true },
      });
      const consecutiveDown = recent.length === 2 && recent.every((c) => !c.isUp);
      if (consecutiveDown) {
        await this.sendDownAlert(target, error ?? `HTTP ${statusCode}`);
      }
    }

    return { isUp, statusCode, responseTimeMs, error };
  }

  async getHistory(targetId: string, orgId: string, hours = 24) {
    // Verify access
    const target = await this.prisma.target.findFirst({ where: { id: targetId, organizationId: orgId } });
    if (!target) return [];

    const since = new Date(Date.now() - hours * 3600 * 1000);
    return this.prisma.targetHealthCheck.findMany({
      where: { targetId, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
      select: { id: true, isUp: true, statusCode: true, responseTimeMs: true, checkedAt: true, error: true },
    });
  }

  async getLatest(targetId: string, orgId: string) {
    const target = await this.prisma.target.findFirst({ where: { id: targetId, organizationId: orgId } });
    if (!target) return null;
    return this.prisma.targetHealthCheck.findFirst({
      where: { targetId },
      orderBy: { checkedAt: 'desc' },
      select: { isUp: true, statusCode: true, responseTimeMs: true, checkedAt: true, error: true },
    });
  }

  async getLatestBatch(targetIds: string[]) {
    if (targetIds.length === 0) return {};
    const rows = await this.prisma.$queryRaw<
      Array<{ target_id: string; is_up: boolean; status_code: number | null; response_time_ms: number | null; checked_at: Date }>
    >`
      SELECT DISTINCT ON (target_id) target_id, is_up, status_code, response_time_ms, checked_at
      FROM target_health_checks
      WHERE target_id = ANY(${targetIds})
      ORDER BY target_id, checked_at DESC
    `;
    return Object.fromEntries(rows.map((r) => [r.target_id, {
      isUp: r.is_up, statusCode: r.status_code, responseTimeMs: r.response_time_ms, checkedAt: r.checked_at,
    }]));
  }

  private async sendDownAlert(
    target: { id: string; value: string; organizationId: string; projectId: string; project: { name: string } },
    reason: string,
  ) {
    const admins = await this.prisma.organizationMember.findMany({
      where: { organizationId: target.organizationId, role: 'ADMIN' },
      select: { userId: true },
    });
    for (const { userId } of admins) {
      await this.notifications.create({
        type: 'target.down',
        title: `Target DOWN: ${target.value}`,
        body: reason,
        link: `/projects/${target.projectId}`,
        userId,
        orgId: target.organizationId,
      }).catch(() => {});
    }

    await this.integrations.notify('target.down', target.organizationId, {
      targetId: target.id,
      url: target.value,
      project: target.project.name,
      reason,
    }).catch(() => {});
  }

  async pruneOldChecks(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const { count } = await this.prisma.targetHealthCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
    return count;
  }
}
