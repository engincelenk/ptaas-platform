import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthChecksController } from './health-checks.controller';
import { HealthChecksService } from './health-checks.service';
import { HealthChecksProcessor, HEALTH_CHECK_QUEUE } from './health-checks.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: HEALTH_CHECK_QUEUE }),
    NotificationsModule,
    IntegrationsModule,
  ],
  controllers: [HealthChecksController],
  providers: [HealthChecksService, HealthChecksProcessor],
  exports: [HealthChecksService],
})
export class HealthChecksModule {}
