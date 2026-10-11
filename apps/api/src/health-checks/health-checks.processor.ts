import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { HealthChecksService } from './health-checks.service';

export const HEALTH_CHECK_QUEUE = 'health-check-queue';

export interface HealthCheckJobData {
  targetId: string;
}

@Processor(HEALTH_CHECK_QUEUE, { concurrency: 10 })
export class HealthChecksProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(HealthChecksProcessor.name);

  constructor(
    @InjectQueue(HEALTH_CHECK_QUEUE) private readonly queue: Queue<HealthCheckJobData>,
    private readonly prisma: PrismaService,
    private readonly healthChecks: HealthChecksService,
  ) {
    super();
  }

  async onModuleInit() {
    // Every 5 minutes: enqueue all active WEB targets
    await this.queue.upsertJobScheduler(
      'health-check-all-targets',
      { every: 5 * 60 * 1000 },
      { name: 'enqueue-all', data: { targetId: '__ALL__' } },
    );

    // Daily prune at 03:00 UTC
    await this.queue.upsertJobScheduler(
      'health-check-prune',
      { pattern: '0 3 * * *' },
      { name: 'prune', data: { targetId: '__PRUNE__' } },
    );

    this.logger.log('Health check scheduler registered (every 5 min)');
  }

  async process(job: Job<HealthCheckJobData>): Promise<void> {
    const { targetId } = job.data;

    if (targetId === '__PRUNE__') {
      const deleted = await this.healthChecks.pruneOldChecks();
      this.logger.log(`Pruned ${deleted} old health check records`);
      return;
    }

    if (targetId === '__ALL__') {
      const targets = await this.prisma.target.findMany({
        where: { type: { in: ['DOMAIN', 'SUBDOMAIN', 'URL'] }, verificationStatus: 'VERIFIED' },
        select: { id: true },
        take: 500,
      });
      await Promise.all(
        targets.map((t) =>
          this.queue.add('check', { targetId: t.id }, { removeOnComplete: 20, removeOnFail: 10 }),
        ),
      );
      this.logger.log(`Enqueued health checks for ${targets.length} targets`);
      return;
    }

    const result = await this.healthChecks.checkTarget(targetId);
    if (!result.isUp) {
      this.logger.warn(`Target ${targetId} is DOWN: ${result.error ?? `HTTP ${result.statusCode}`}`);
    }
  }
}
