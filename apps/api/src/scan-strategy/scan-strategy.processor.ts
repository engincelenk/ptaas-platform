import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { STRATEGY_QUEUE, StrategyJobData } from './scan-strategy.service';

/**
 * Handles strategy jobs by calling the Python strategy worker via internal API.
 * The Python side does fingerprinting + LangGraph reasoning and POSTs back
 * to /internal/strategies/:id/result with the plan + reasoning.
 */
@Processor(STRATEGY_QUEUE, { concurrency: 3 })
export class ScanStrategyProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanStrategyProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<StrategyJobData>): Promise<void> {
    const { strategyId } = job.data;
    this.logger.log(`Processing strategy job ${strategyId}`);

    await this.prisma.scanStrategy.update({
      where: { id: strategyId },
      data: { status: 'RUNNING' },
    });
    // The Python strategy worker picks up from strategy-queue and calls back
    // via POST /internal/strategies/:id/result when done
  }
}
