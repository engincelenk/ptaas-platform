import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { SlackController } from './slack.controller';
import { IntegrationsProcessor } from './integrations.processor';
import { WEBHOOK_QUEUE } from './integrations.constants';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_QUEUE, defaultJobOptions: { removeOnComplete: 200 } }),
    PrismaModule,
  ],
  controllers: [IntegrationsController, SlackController],
  providers: [IntegrationsService, IntegrationsProcessor],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
