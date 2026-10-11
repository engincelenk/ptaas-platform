import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RetentionProcessor } from './retention.processor';
import { RETENTION_QUEUE } from './retention.constants';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: RETENTION_QUEUE }),
    AuditModule,
  ],
  providers: [RetentionProcessor],
})
export class RetentionModule implements OnModuleInit {
  constructor(@InjectQueue(RETENTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // Register daily cron job — idempotent via jobId
    await this.queue.add(
      'run-retention',
      {},
      {
        repeat: { pattern: '0 2 * * *' }, // 02:00 UTC daily
        jobId: 'retention-daily',
        removeOnComplete: { count: 7 },
        removeOnFail: { count: 7 },
      },
    );
  }
}
