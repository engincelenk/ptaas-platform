import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EnrichmentService } from './enrichment.service';

export const ENRICHMENT_QUEUE = 'enrichment-queue';

export interface EnrichmentJobData {
  type: 'finding' | 'scan';
  id: string;
}

@Processor(ENRICHMENT_QUEUE, { concurrency: 2 })
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(private readonly enrichment: EnrichmentService) {
    super();
  }

  async process(job: Job<EnrichmentJobData>): Promise<void> {
    const { type, id } = job.data;
    this.logger.debug(`Enrichment job: ${type}=${id}`);

    if (type === 'finding') {
      await this.enrichment.enrichFinding(id);
    } else if (type === 'scan') {
      await this.enrichment.enrichScan(id);
    }
  }
}
