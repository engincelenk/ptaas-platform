import { Controller, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ENRICHMENT_QUEUE, type EnrichmentJobData } from './enrichment.processor';

@ApiTags('enrichment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SECURITY_ENGINEER')
@Controller()
export class EnrichmentController {
  constructor(
    @InjectQueue(ENRICHMENT_QUEUE) private readonly queue: Queue<EnrichmentJobData>,
  ) {}

  @Post('findings/:findingId/enrich')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger CVE enrichment for a single finding' })
  async enrichFinding(@Param('findingId') findingId: string) {
    await this.queue.add('enrich', { type: 'finding', id: findingId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
    return { queued: true };
  }

  @Post('scans/:scanId/enrich')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger CVE enrichment for all findings in a scan' })
  async enrichScan(@Param('scanId') scanId: string) {
    await this.queue.add('enrich', { type: 'scan', id: scanId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10_000 },
    });
    return { queued: true };
  }
}
