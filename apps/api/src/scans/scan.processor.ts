import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SCAN_QUEUE, type ScanJobData } from './scan-queue.constants';

/**
 * NestJS-side BullMQ processor — updates scan status and delegates
 * the actual Nuclei execution to the Python scanner worker.
 *
 * The Python scanner picks up jobs directly from Redis (BullMQ protocol).
 * This processor handles lifecycle events: timeout detection, failure cleanup.
 */
@Processor(SCAN_QUEUE, { concurrency: 1 })
export class ScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<ScanJobData>): Promise<void> {
    const { scanId, organizationId } = job.data;
    this.logger.log(`Processing scan job ${job.id} for scan ${scanId}`);

    // Mark scan as running
    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    await this.audit.log({
      action: 'scan.started',
      organizationId,
      resource: 'scan',
      resourceId: scanId,
      metadata: { jobId: job.id, attempt: job.attemptsMade + 1 },
    });

    // The actual scan runs in the Python worker which processes the same BullMQ job.
    // This processor acts as a fallback safety net: if the Python worker fails to
    // complete within the job TTL, BullMQ will call onFailed automatically.
    //
    // In production the Python worker marks the job done via bullmq Python SDK.
    // Here we just wait — the job will be resolved by Python or fail after retries.
    //
    // For the NestJS processor to not interfere, we return immediately and let
    // the Python worker drive job completion.
    return;
  }

  async onFailed(job: Job<ScanJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const { scanId, organizationId } = job.data;
    this.logger.error(`Scan job ${job.id} failed: ${error.message}`);

    await this.prisma.scan.update({
      where: { id: scanId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        completedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'scan.failed',
      organizationId,
      resource: 'scan',
      resourceId: scanId,
      metadata: { error: error.message, attempt: job.attemptsMade },
    });
  }
}
