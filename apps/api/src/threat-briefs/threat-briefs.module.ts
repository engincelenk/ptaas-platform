import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThreatBriefsController } from './threat-briefs.controller';
import { ThreatBriefsService } from './threat-briefs.service';
import { ThreatBriefsProcessor, THREAT_BRIEF_QUEUE } from './threat-briefs.processor';
import { ThreatBriefsScheduler } from './threat-briefs.scheduler';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: THREAT_BRIEF_QUEUE }),
    AiModule,
    MailModule,
  ],
  controllers: [ThreatBriefsController],
  providers: [ThreatBriefsService, ThreatBriefsProcessor, ThreatBriefsScheduler],
})
export class ThreatBriefsModule {}
