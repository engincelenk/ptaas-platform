import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DigestProcessor, NOTIFICATION_QUEUE } from './digest.processor';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, DigestProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
