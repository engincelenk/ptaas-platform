import {
  Controller, Get, Post, Patch, Delete, Body, Param, HttpCode,
  UseGuards, Request, Logger, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';

// Jira status → PTaaS finding status mapping
const JIRA_STATUS_MAP: Record<string, string> = {
  'to do':       'OPEN',
  'open':        'OPEN',
  'in progress': 'IN_PROGRESS',
  'in review':   'IN_PROGRESS',
  'done':        'FIXED',
  'resolved':    'FIXED',
  'closed':      'FIXED',
  'won\'t fix':  'ACCEPTED_RISK',
  "won't do":    'FALSE_POSITIVE',
};

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly svc: IntegrationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Request() req: any) {
    return this.svc.list(req.user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateIntegrationDto, @Request() req: any) {
    return this.svc.create(dto, req.user.organizationId, req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationDto, @Request() req: any) {
    return this.svc.update(id, dto, req.user.organizationId, req.user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.organizationId, req.user.sub);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id') id: string, @Request() req: any) {
    return this.svc.listDeliveries(id, req.user.organizationId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Request() req: any) {
    return this.svc.testWebhook(id, req.user.organizationId);
  }

  /**
   * POST /integrations/jira/webhook
   * Public endpoint called by Jira Automation or webhooks.
   * Payload: Jira issue_updated event with issue key + status.
   * Matches finding by jira_issue_key and updates status.
   */
  @Post('jira/webhook')
  @HttpCode(200)
  async jiraWebhook(
    @Body() body: Record<string, any>,
  ) {
    try {
      const issueKey: string | undefined = body?.issue?.key ?? body?.issueKey;
      const statusName: string | undefined =
        body?.issue?.fields?.status?.name ??
        body?.changelog?.items?.find((i: any) => i.field === 'status')?.toString;

      if (!issueKey || !statusName) {
        return { ok: true, skipped: 'missing issueKey or status' };
      }

      const ptaasStatus = JIRA_STATUS_MAP[statusName.toLowerCase()];
      if (!ptaasStatus) {
        return { ok: true, skipped: `unmapped status: ${statusName}` };
      }

      const finding = await this.prisma.finding.findFirst({
        where: { jiraIssueKey: issueKey },
      });

      if (!finding) {
        return { ok: true, skipped: `no finding linked to ${issueKey}` };
      }

      if (finding.status === ptaasStatus) {
        return { ok: true, skipped: 'status unchanged' };
      }

      await this.prisma.finding.update({
        where: { id: finding.id },
        data: { status: ptaasStatus as any },
      });

      this.logger.log(`Jira sync: ${issueKey} → ${ptaasStatus} for finding ${finding.id}`);
      return { ok: true, findingId: finding.id, newStatus: ptaasStatus };
    } catch (err) {
      this.logger.error('Jira webhook error', err);
      return { ok: false };
    }
  }
}
