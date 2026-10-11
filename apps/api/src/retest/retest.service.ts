import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SCAN_QUEUE, ScanJobData } from '../scans/scan-queue.constants';
import { NotificationsService } from '../notifications/notifications.service';

export const RETEST_STATUS = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
} as const;

@Injectable()
export class RetestService {
  private readonly logger = new Logger(RetestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCAN_QUEUE) private readonly scanQueue: Queue,
    private readonly notifications: NotificationsService,
  ) {}

  async requestRetest(findingId: string, orgId: string, userId?: string): Promise<{ scanId: string }> {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId },
      include: {
        scan: {
          select: {
            projectId: true,
            createdById: true,
            templateCategories: true,
            excludePaths: true,
            project: {
              select: {
                organizationId: true,
                targets: { take: 1, select: { id: true, value: true, type: true } },
              },
            },
          },
        },
      },
    });

    if (!finding) throw new NotFoundException('Finding not found');

    const requestedByUserId = userId ?? finding.scan.createdById;
    if (finding.scan.project.organizationId !== orgId) {
      throw new NotFoundException('Finding not found');
    }
    if (!['FIXED', 'VERIFIED', 'OPEN', 'IN_PROGRESS'].includes(finding.status)) {
      throw new BadRequestException('Only findings with status FIXED, VERIFIED, OPEN, or IN_PROGRESS can be retested');
    }
    if (finding.retestStatus === RETEST_STATUS.PENDING) {
      throw new BadRequestException('A retest is already pending for this finding');
    }

    const target = finding.scan.project.targets[0];
    if (!target) throw new BadRequestException('Project has no target configured');

    // Create a RETEST scan record
    const retestScan = await this.prisma.scan.create({
      data: {
        type: 'RETEST' as any,
        status: 'QUEUED',
        projectId: finding.scan.projectId,
        organizationId: orgId,
        targetId: target.id,
        createdById: requestedByUserId,
        templateCategories: finding.scan.templateCategories,
        excludePaths: finding.scan.excludePaths,
        rateLimit: 50,
        retestFindingIds: [findingId],
      },
    });

    // Mark finding as retest pending
    await this.prisma.finding.update({
      where: { id: findingId },
      data: {
        retestStatus: RETEST_STATUS.PENDING,
        retestScanId: retestScan.id,
        retestRequestedAt: new Date(),
        retestCompletedAt: null,
      },
    });

    const jobData: ScanJobData = {
      scanId: retestScan.id,
      targetId: target.id,
      targetValue: target.value,
      targetType: target.type,
      projectId: finding.scan.projectId,
      organizationId: orgId,
      scanType: 'RETEST',
      templateCategories: [],
      excludePaths: [],
      rateLimit: 50,
      hasCredentials: false,
      retestFindingIds: [findingId],
      retestTemplateId: finding.templateId ?? undefined,
      retestMatchedAt: finding.matchedAt ?? undefined,
    };

    await this.scanQueue.add('scan', jobData, { attempts: 2, backoff: { type: 'exponential', delay: 5000 } });

    this.logger.log(`Retest scan ${retestScan.id} queued for finding ${findingId}`);
    return { scanId: retestScan.id };
  }

  async handleRetestCompletion(retestScanId: string, foundCveIds: string[]): Promise<void> {
    const retestScan = await this.prisma.scan.findUnique({
      where: { id: retestScanId },
    });
    if (!retestScan || retestScan.type !== 'RETEST') return;

    for (const findingId of retestScan.retestFindingIds) {
      const finding = await this.prisma.finding.findUnique({ where: { id: findingId } });
      if (!finding || finding.retestStatus !== RETEST_STATUS.PENDING) continue;

      // Check if any new finding in retest scan matches this finding
      const retestFindings = await this.prisma.finding.findMany({
        where: { scanId: retestScanId },
      });

      const stillVulnerable = retestFindings.some(
        (rf) =>
          rf.templateId === finding.templateId ||
          (rf.matchedAt && rf.matchedAt === finding.matchedAt),
      );

      const now = new Date();
      const requestorId = retestScan.createdById;
      const orgId = retestScan.organizationId;

      if (stillVulnerable) {
        await this.prisma.finding.update({
          where: { id: findingId },
          data: { retestStatus: RETEST_STATUS.FAILED, retestCompletedAt: now, status: 'OPEN' },
        });
        this.logger.log(`Retest FAILED for finding ${findingId}`);
        this.notifications.create({
          type: 'retest.failed',
          title: `Retest failed — vulnerability still present`,
          body: finding.title,
          link: `/projects/${retestScan.projectId}/findings/${findingId}`,
          userId: requestorId,
          orgId,
        }).catch(() => null);
      } else {
        await this.prisma.finding.update({
          where: { id: findingId },
          data: { retestStatus: RETEST_STATUS.PASSED, retestCompletedAt: now, status: 'VERIFIED' },
        });
        this.logger.log(`Retest PASSED for finding ${findingId} — marked VERIFIED`);
        this.notifications.create({
          type: 'retest.passed',
          title: `Retest passed — vulnerability fixed`,
          body: finding.title,
          link: `/projects/${retestScan.projectId}/findings/${findingId}`,
          userId: requestorId,
          orgId,
        }).catch(() => null);
      }
    }
  }

  async getRetestHistory(findingId: string, orgId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId },
      include: {
        scan: { include: { project: true } },
      },
    });
    if (!finding || finding.scan.project.organizationId !== orgId) {
      throw new NotFoundException('Finding not found');
    }

    const retestScan = finding.retestScanId
      ? await this.prisma.scan.findUnique({
          where: { id: finding.retestScanId },
          select: { id: true, status: true, type: true, createdAt: true, completedAt: true },
        })
      : null;

    return {
      retestStatus: finding.retestStatus,
      retestRequestedAt: finding.retestRequestedAt,
      retestCompletedAt: finding.retestCompletedAt,
      retestScan,
    };
  }
}
