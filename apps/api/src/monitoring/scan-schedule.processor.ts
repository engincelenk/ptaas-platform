import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScansService } from '../scans/scans.service';
import { SCAN_QUEUE, type ScanJobData } from '../scans/scan-queue.constants';

/**
 * Intercepts scheduled-scan repeat-jobs and materialises a real Scan record.
 *
 * Flow:
 *   BullMQ repeat job fires (jobName = 'scheduled-scan')
 *   → This processor creates a real Scan in DB via ScansService
 *   → ScansService.create() re-enqueues as 'run-scan' with the real scanId
 *   → Python worker picks up 'run-scan' and executes it
 */
@Processor(SCAN_QUEUE)
export class ScanScheduleProcessor extends WorkerHost {
  private readonly log = new Logger(ScanScheduleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: ScansService,
  ) {
    super();
  }

  async process(job: Job<ScanJobData>): Promise<void> {
    if (job.name !== 'scheduled-scan') return; // only handle scheduled jobs

    const { targetId, organizationId } = job.data;

    this.log.log(`Scheduled scan triggered for target ${targetId}`);

    // Fetch target to verify it's still valid
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, organizationId, scheduleEnabled: true, verificationStatus: 'VERIFIED' },
    });

    if (!target) {
      this.log.warn(`Scheduled scan skipped — target ${targetId} not found or no longer eligible`);
      return;
    }

    // Use a synthetic userId='scheduler' for audit log
    await this.scans.create(
      {
        targetId,
        type: 'FULL',
        templateCategories: ['cves', 'misconfigurations', 'exposures'],
        excludePaths: [],
      },
      'scheduler',
      organizationId,
    );

    // Update lastScheduledAt
    await this.prisma.target.update({
      where: { id: targetId },
      data: { lastScheduledAt: new Date() },
    });

    this.log.log(`Scheduled scan queued for target ${targetId}`);
  }
}
