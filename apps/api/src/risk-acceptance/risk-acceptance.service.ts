import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';

const VALID_DECISIONS = new Set(['ACCEPTED', 'DEFERRED', 'FALSE_POSITIVE']);

const DECISION_STATUS_MAP: Record<string, string> = {
  ACCEPTED:       'OPEN',         // stays open but accepted
  DEFERRED:       'OPEN',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
};

@Injectable()
export class RiskAcceptanceService {
  private readonly logger = new Logger(RiskAcceptanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
  ) {}

  async get(findingId: string, orgId: string) {
    await this._assertFinding(findingId, orgId);
    return this.prisma.riskAcceptance.findUnique({
      where: { findingId },
      include: { approvedBy: { select: { id: true, name: true, email: true } } },
    });
  }

  async create(
    findingId: string,
    orgId: string,
    userId: string,
    dto: { decision: string; justification: string; expiresAt?: string },
  ) {
    if (!VALID_DECISIONS.has(dto.decision)) {
      throw new BadRequestException(`decision must be one of: ${[...VALID_DECISIONS].join(', ')}`);
    }
    if (!dto.justification?.trim()) {
      throw new BadRequestException('justification is required');
    }

    const finding = await this._assertFinding(findingId, orgId);

    const existing = await this.prisma.riskAcceptance.findUnique({ where: { findingId } });
    if (existing && !existing.revokedAt) {
      throw new BadRequestException('A risk acceptance already exists for this finding. Revoke it first.');
    }

    const [acceptance] = await this.prisma.$transaction([
      this.prisma.riskAcceptance.upsert({
        where: { findingId },
        update: {
          decision: dto.decision,
          justification: dto.justification.trim(),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          approvedById: userId,
          reviewedAt: new Date(),
          revokedAt: null,
        },
        create: {
          findingId,
          organizationId: orgId,
          approvedById: userId,
          decision: dto.decision,
          justification: dto.justification.trim(),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        include: { approvedBy: { select: { id: true, name: true, email: true } } },
      }),
      // Update finding status if FALSE_POSITIVE
      ...(dto.decision === 'FALSE_POSITIVE'
        ? [this.prisma.finding.update({ where: { id: findingId }, data: { status: 'FALSE_POSITIVE' as any } })]
        : []),
    ]);

    // Fire integration webhook for risk acceptance
    await this.integrations.notify('risk.accepted', orgId, {
      findingId,
      decision: dto.decision,
      justification: dto.justification.trim(),
      approvedById: userId,
    }).catch(() => { /* non-fatal */ });

    return acceptance;
  }

  async revoke(findingId: string, orgId: string) {
    await this._assertFinding(findingId, orgId);
    const existing = await this.prisma.riskAcceptance.findUnique({ where: { findingId } });
    if (!existing || existing.revokedAt) {
      throw new NotFoundException('No active risk acceptance for this finding');
    }

    await this.prisma.$transaction([
      this.prisma.riskAcceptance.update({
        where: { findingId },
        data: { revokedAt: new Date() },
      }),
      // Reopen finding if it was FALSE_POSITIVE
      ...(existing.decision === 'FALSE_POSITIVE'
        ? [this.prisma.finding.update({ where: { id: findingId }, data: { status: 'OPEN' } })]
        : []),
    ]);
  }

  async listForProject(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.riskAcceptance.findMany({
      where: {
        organizationId: orgId,
        finding: { projectId },
        revokedAt: null,
      },
      include: {
        finding: { select: { id: true, title: true, severity: true, status: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExpiring(orgId: string, daysAhead = 30) {
    const threshold = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return this.prisma.riskAcceptance.findMany({
      where: {
        organizationId: orgId,
        revokedAt: null,
        expiresAt: { not: null, lte: threshold },
      },
      include: {
        finding: { select: { id: true, title: true, severity: true, scan: { select: { projectId: true } } } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  // Runs daily at 08:00 — expire stale risk acceptances
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async expireStaleAcceptances() {
    const now = new Date();
    const expired = await this.prisma.riskAcceptance.findMany({
      where: { revokedAt: null, expiresAt: { not: null, lte: now } },
      include: {
        finding: { select: { id: true, title: true, createdById: true, organizationId: true, scan: { select: { projectId: true } } } },
      },
    });

    for (const acc of expired) {
      await this.prisma.$transaction([
        this.prisma.riskAcceptance.update({ where: { id: acc.id }, data: { revokedAt: now } }),
        this.prisma.finding.update({ where: { id: acc.findingId }, data: { status: 'OPEN' } }),
      ]);

      this.notifications.create({
        type: 'risk_acceptance.expired',
        title: 'Risk acceptance expired',
        body: acc.finding.title,
        link: `/projects/${acc.finding.scan?.projectId}/findings/${acc.findingId}`,
        userId: acc.approvedById,
        orgId: acc.organizationId,
      }).catch(() => null);

      this.logger.log(`Risk acceptance ${acc.id} expired → finding ${acc.findingId} reopened`);
    }
  }

  private async _assertFinding(findingId: string, orgId: string) {
    const f = await this.prisma.finding.findFirst({ where: { id: findingId, organizationId: orgId } });
    if (!f) throw new NotFoundException('Finding not found');
    return f;
  }
}
