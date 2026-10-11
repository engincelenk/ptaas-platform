import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor, ENRICHMENT_QUEUE } from './enrichment.processor';
import { EnrichmentController } from './enrichment.controller';

@Module({
  imports: [BullModule.registerQueue({ name: ENRICHMENT_QUEUE })],
  controllers: [EnrichmentController],
  providers: [EnrichmentService, EnrichmentProcessor],
  exports: [EnrichmentService, ENRICHMENT_QUEUE],
})
export class EnrichmentModule {}
