import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RetestController } from './retest.controller';
import { RetestService } from './retest.service';
import { SCAN_QUEUE } from '../scans/scan-queue.constants';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BullModule.registerQueue({ name: SCAN_QUEUE }), NotificationsModule],
  controllers: [RetestController],
  providers: [RetestService],
  exports: [RetestService],
})
export class RetestModule {}
