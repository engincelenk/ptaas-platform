import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ThreatBriefsService } from './threat-briefs.service';

export const THREAT_BRIEF_QUEUE = 'threat-brief-queue';

export interface ThreatBriefJobData {
  orgId: string;
}

@Processor(THREAT_BRIEF_QUEUE, { concurrency: 2 })
export class ThreatBriefsProcessor extends WorkerHost {
  private readonly logger = new Logger(ThreatBriefsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly threatBriefsService: ThreatBriefsService,
  ) {
    super();
  }

  async process(job: Job<ThreatBriefJobData>): Promise<void> {
    const { orgId } = job.data;
    this.logger.log(`Generating threat brief for org ${orgId}`);
    await this.threatBriefsService.generate(orgId);
    this.logger.log(`Threat brief generated for org ${orgId}`);
  }
}
