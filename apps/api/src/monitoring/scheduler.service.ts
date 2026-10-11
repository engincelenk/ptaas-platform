import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCAN_QUEUE, type ScanJobData } from '../scans/scan-queue.constants';

const JOB_NAME = 'scheduled-scan';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(SCAN_QUEUE) private readonly queue: Queue<ScanJobData>,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this._syncAllSchedules();
  }

  async onModuleDestroy() {
    // Nothing to clean — BullMQ repeat jobs persist in Redis
  }

  /** Enable or update schedule for a target. */
  async setSchedule(
    targetId: string,
    cron: string,
    orgId: string,
  ): Promise<void> {
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, organizationId: orgId },
    });
    if (!target) throw new Error('Target not found');
    if (target.verificationStatus !== 'VERIFIED') {
      throw new Error('Target must be verified to schedule scans');
    }

    await this._upsertRepeatJob(target, cron);

    await this.prisma.target.update({
      where: { id: targetId },
      data: { scheduleEnabled: true, scheduleCron: cron },
    });

    this.log.log(`Schedule set for target ${targetId}: ${cron}`);
  }

  /** Disable schedule for a target. */
  async clearSchedule(targetId: string, orgId: string): Promise<void> {
    const target = await this.prisma.target.findFirst({
      where: { id: targetId, organizationId: orgId },
    });
    if (!target) throw new Error('Target not found');

    await this._removeRepeatJob(targetId);

    await this.prisma.target.update({
      where: { id: targetId },
      data: { scheduleEnabled: false, scheduleCron: null },
    });

    this.log.log(`Schedule cleared for target ${targetId}`);
  }

  // ── private ──────────────────────────────────────────────────────────────

  private async _syncAllSchedules(): Promise<void> {
    const targets = await this.prisma.target.findMany({
      where: { scheduleEnabled: true, verificationStatus: 'VERIFIED', scheduleCron: { not: null } },
    });

    this.log.log(`Syncing ${targets.length} scheduled targets on startup`);

    for (const target of targets) {
      await this._upsertRepeatJob(target, target.scheduleCron!).catch((err) =>
        this.log.error(`Failed to sync schedule for target ${target.id}`, err),
      );
    }
  }

  private _repeatKey(targetId: string): string {
    return `scheduled-scan:${targetId}`;
  }

  private async _upsertRepeatJob(
    target: {
      id: string;
      value: string;
      type: string;
      projectId: string;
      organizationId: string;
    },
    cron: string,
  ): Promise<void> {
    // Remove old repeat job if exists
    await this._removeRepeatJob(target.id);

    const jobData: ScanJobData = {
      scanId: '',            // will be filled by the processor before queuing the actual scan
      targetId: target.id,
      targetValue: target.value,
      targetType: target.type,
      projectId: target.projectId,
      organizationId: target.organizationId,
      scanType: 'FULL',
      templateCategories: ['cves', 'misconfigurations', 'exposures'],
      excludePaths: [],
      rateLimit: 30,
      hasCredentials: false,
    };

    await this.queue.add(JOB_NAME, jobData, {
      repeat: { pattern: cron, tz: 'UTC' },
      jobId: this._repeatKey(target.id),
    });
  }

  private async _removeRepeatJob(targetId: string): Promise<void> {
    try {
      const repeatKey = this._repeatKey(targetId);
      const repeatJobs = await this.queue.getRepeatableJobs();
      const job = repeatJobs.find((j) => j.key.includes(repeatKey));
      if (job) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    } catch (err) {
      this.log.warn(`Could not remove repeat job for target ${targetId}`, err);
    }
  }
}
