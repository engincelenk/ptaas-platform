import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ARENA_RUN_QUEUE, ArenaRunJob } from '../arena.constants';
import { ArenaOrchestratorService } from './arena-orchestrator.service';

/** One job per approved run. Concurrency is low: each run is long-lived and rate-limited towards a customer endpoint. */
@Processor(ARENA_RUN_QUEUE, { concurrency: 2 })
export class ArenaRunProcessor extends WorkerHost {
  private readonly logger = new Logger(ArenaRunProcessor.name);

  constructor(private readonly orchestrator: ArenaOrchestratorService) {
    super();
  }

  async process(job: Job<ArenaRunJob>): Promise<void> {
    const { runId, organizationId } = job.data;
    this.logger.log(`arena run job ${runId}`);
    await this.orchestrator.execute({ runId, organizationId });
  }
}
