import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { SsrfGuardService } from '../ssrf/ssrf-guard.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ASM_QUEUE, AsmJobData } from './asm.constants';

@Injectable()
export class AsmService {
  private readonly logger = new Logger(AsmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssrf: SsrfGuardService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @InjectQueue(ASM_QUEUE) private readonly asmQueue: Queue,
  ) {}

  // ─── Start Discovery ─────────────────────────────────────────────────────────

  async startDiscovery(projectId: string, rootDomain: string, orgId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // SSRF guard — ensure rootDomain doesn't resolve to internal ranges
    await this.ssrf.assertSafeHost(rootDomain);

    // Ensure the domain is already a verified target in this project
    const verifiedTarget = await this.prisma.target.findFirst({
      where: { projectId, organizationId: orgId, value: rootDomain, verificationStatus: 'VERIFIED' },
    });
    if (!verifiedTarget) {
      throw new ForbiddenException('Root domain must be a verified target before running ASM discovery');
    }

    const asmScan = await this.prisma.asmScan.create({
      data: {
        projectId,
        organizationId: orgId,
        rootDomain,
        status: 'PENDING',
      },
    });

    const job = await this.asmQueue.add('discover', {
      asmScanId: asmScan.id,
      projectId,
      organizationId: orgId,
      rootDomain,
    } satisfies AsmJobData, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    });

    await this.prisma.asmScan.update({
      where: { id: asmScan.id },
      data: { bullJobId: job.id },
    });

    await this.audit.log({
      action: 'asm.discovery_started',
      userId,
      resource: 'asm_scan',
      resourceId: asmScan.id,
      metadata: { projectId, rootDomain },
    });

    return asmScan;
  }

  // ─── List ASM Scans ───────────────────────────────────────────────────────────

  async listScans(projectId: string, orgId: string) {
    await this.assertProjectAccess(projectId, orgId);
    return this.prisma.asmScan.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ─── List Assets ──────────────────────────────────────────────────────────────

  async listAssets(projectId: string, orgId: string, status?: string) {
    await this.assertProjectAccess(projectId, orgId);
    return this.prisma.asset.findMany({
      where: {
        projectId,
        organizationId: orgId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: [{ status: 'asc' }, { discoveredAt: 'desc' }],
      include: { target: { select: { id: true, verificationStatus: true } } },
    });
  }

  // ─── Accept Suggestion (create Target) ───────────────────────────────────────

  async acceptAsset(assetId: string, orgId: string, userId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: orgId, status: 'SUGGESTED' },
    });
    if (!asset) throw new NotFoundException('Asset suggestion not found');

    // Create a new Target from the discovered asset
    const target = await this.prisma.target.create({
      data: {
        projectId: asset.projectId,
        organizationId: orgId,
        createdById: userId,
        value: asset.value,
        type: asset.type === 'IP' ? 'IP' : 'SUBDOMAIN',
        verificationStatus: 'PENDING',
        verificationToken: createId(),
      },
    });

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'ACTIVE', targetId: target.id },
    });

    return target;
  }

  // ─── Dismiss Suggestion ───────────────────────────────────────────────────────

  async dismissAsset(assetId: string, orgId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: orgId },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    return this.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'IGNORED' },
    });
  }

  // ─── Internal: Worker callbacks ──────────────────────────────────────────────

  async updateScanStatus(asmScanId: string, status: string, assetsFound?: number) {
    return this.prisma.asmScan.update({
      where: { id: asmScanId },
      data: {
        status: status as any,
        assetsFound: assetsFound ?? undefined,
        startedAt: status === 'RUNNING' ? new Date() : undefined,
        completedAt: ['COMPLETED', 'FAILED'].includes(status) ? new Date() : undefined,
      },
    });
  }

  async ingestAssets(asmScanId: string, assets: IngestAssetDto[]) {
    const scan = await this.prisma.asmScan.findUnique({ where: { id: asmScanId } });
    if (!scan) return;

    let count = 0;
    let newCount = 0;
    for (const a of assets) {
      // Check if asset already exists
      const existing = await this.prisma.asset.findUnique({
        where: { projectId_value: { projectId: scan.projectId, value: a.value } },
      });

      await this.prisma.asset.upsert({
        where: { projectId_value: { projectId: scan.projectId, value: a.value } },
        create: {
          projectId: scan.projectId,
          organizationId: scan.organizationId,
          rootDomain: scan.rootDomain,
          value: a.value,
          type: a.type as any ?? 'SUBDOMAIN',
          status: 'SUGGESTED',
          httpStatus: a.httpStatus,
          httpTitle: a.httpTitle,
          httpServer: a.httpServer,
          technologies: a.technologies ?? [],
          ipAddresses: a.ipAddresses ?? [],
          dnsRecords: a.dnsRecords as any,
          dnsIssues: a.dnsIssues ?? [],
        },
        update: {
          lastSeenAt: new Date(),
          httpStatus: a.httpStatus ?? undefined,
          httpTitle: a.httpTitle ?? undefined,
          httpServer: a.httpServer ?? undefined,
          technologies: a.technologies ?? [],
          ipAddresses: a.ipAddresses ?? [],
          dnsRecords: a.dnsRecords as any ?? undefined,
          dnsIssues: a.dnsIssues ?? [],
        },
      });

      if (!existing) newCount++;
      count++;
    }

    await this.prisma.asmScan.update({
      where: { id: asmScanId },
      data: { assetsFound: { increment: count } },
    });

    // Notify org admins when new assets are discovered
    if (newCount > 0) {
      const admins = await this.prisma.organizationMember.findMany({
        where: { organizationId: scan.organizationId, role: 'ADMIN' },
        select: { userId: true },
      });
      for (const admin of admins) {
        await this.notifications.create(admin.userId, {
          type: 'FINDING_TAGGED' as any,
          message: `${newCount} new asset(s) discovered on ${scan.rootDomain}. Review them in Attack Surface.`,
          link: `/projects/${scan.projectId}/assets`,
        }).catch(() => { /* non-fatal */ });
      }
    }
  }

  // ─── Scheduled continuous monitoring ─────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduleMonitoring() {
    // Re-queue discovery for all projects that have had at least one completed ASM scan
    const completedScans = await this.prisma.asmScan.findMany({
      where: { status: 'COMPLETED' },
      distinct: ['projectId', 'rootDomain'],
      select: { projectId: true, organizationId: true, rootDomain: true },
    });

    for (const scan of completedScans) {
      try {
        const asmScan = await this.prisma.asmScan.create({
          data: {
            projectId: scan.projectId,
            organizationId: scan.organizationId,
            rootDomain: scan.rootDomain,
            status: 'PENDING',
          },
        });

        await this.asmQueue.add('discover', {
          asmScanId: asmScan.id,
          projectId: scan.projectId,
          organizationId: scan.organizationId,
          rootDomain: scan.rootDomain,
        } satisfies AsmJobData, {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10000 },
        });

        await this.prisma.asmScan.update({
          where: { id: asmScan.id },
          data: { bullJobId: asmScan.id },
        });
      } catch (err) {
        this.logger.warn(`Failed to schedule ASM monitoring for ${scan.rootDomain}: ${err}`);
      }
    }

    this.logger.log(`Scheduled ASM monitoring for ${completedScans.length} project/domain pairs`);
  }

  async listOrgAssets(orgId: string, status?: string, type?: string, search?: string) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (status) where['status'] = status;
    if (type) where['type'] = type;
    if (search) where['value'] = { contains: search, mode: 'insensitive' };

    const [assets, total, newThisWeek, highRisk] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: [{ discoveredAt: 'desc' }],
        take: 200,
        include: {
          target: { select: { id: true, verificationStatus: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      this.prisma.asset.count({ where: { organizationId: orgId } }),
      this.prisma.asset.count({
        where: {
          organizationId: orgId,
          discoveredAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        },
      }),
      // Count assets with open critical/high findings via related targets
      this.prisma.target.count({
        where: {
          organizationId: orgId,
          asset: { isNot: null },
          findings: {
            some: {
              status: { in: ['OPEN', 'IN_PROGRESS'] },
              severity: { in: ['CRITICAL', 'HIGH'] },
            },
          },
        },
      }),
    ]);

    return {
      stats: { total, newThisWeek, highRisk, services: assets.filter((a) => a.httpStatus).length },
      assets,
    };
  }

  private async assertProjectAccess(projectId: string, orgId: string) {
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
}

export interface IngestAssetDto {
  value: string;
  type?: string;
  httpStatus?: number;
  httpTitle?: string;
  httpServer?: string;
  technologies?: string[];
  ipAddresses?: string[];
  dnsRecords?: Record<string, unknown>;
  dnsIssues?: string[];
}
