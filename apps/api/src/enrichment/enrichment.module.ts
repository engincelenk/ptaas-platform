import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor, ENRICHMENT_QUEUE } from './enrichment.processor';
import { EnrichmentController } from './enrichment.controller';

@Module({
  imports: [BullModule.registerQueue({ name: ENRICHMENT_QUEUE })],
  controllers: [EnrichmentController],
  providers: [EnrichmentService, EnrichmentProcessor],
  // The queue token (BullQueue_enrichment-queue) is only used inside this module; exporting the bare queue name
  // made Nest refuse to boot the whole application ("cannot export a provider that is not part of the module").
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
