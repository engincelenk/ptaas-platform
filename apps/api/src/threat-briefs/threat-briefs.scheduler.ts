import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { THREAT_BRIEF_QUEUE, ThreatBriefJobData } from './threat-briefs.processor';

@Injectable()
export class ThreatBriefsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ThreatBriefsScheduler.name);

  constructor(
    @InjectQueue(THREAT_BRIEF_QUEUE) private readonly queue: Queue<ThreatBriefJobData>,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Register weekly cron: every Monday at 08:00 UTC
    await this.queue.upsertJobScheduler(
      'weekly-threat-briefs',
      { pattern: '0 8 * * 1' },
      {
        name: 'weekly-all-orgs',
        data: { orgId: '__ALL__' },
      },
    );
    this.logger.log('Threat brief weekly cron registered (Mon 08:00 UTC)');
  }

  async enqueueAllOrgs(): Promise<number> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      await this.queue.add('generate', { orgId: org.id }, { removeOnComplete: 50, removeOnFail: 20 });
    }
    return orgs.length;
  }
}
