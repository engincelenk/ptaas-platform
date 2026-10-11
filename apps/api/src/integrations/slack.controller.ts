import {
  Controller, Post, Body, HttpCode, Headers, Req, Logger,
  ForbiddenException, ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifySlackSignature } from './slack-signature';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

const ephemeral = (text: string) => ({
  response_type: 'ephemeral',
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
});

/**
 * M59 — Slack Bot v2: slash command endpoint.
 *
 * Deliberately NOT behind JwtAuthGuard (Slack cannot send a JWT). Instead:
 *  1. the request signature is verified against SLACK_SIGNING_SECRET (fail closed if unset),
 *  2. team_id is mapped to exactly one organization via the integration's slackTeamId,
 *  3. every query is scoped to that organization.
 * Supported commands: /ptaas summary | /ptaas critical | /ptaas help
 */
@ApiTags('integrations')
@Controller('integrations/slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('slash')
  @HttpCode(200)
  async slash(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: Record<string, string>,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ) {
    const signingSecret = this.config.get<string>('SLACK_SIGNING_SECRET');
    if (!signingSecret) {
      throw new ServiceUnavailableException('Slack integration not configured');
    }
    if (
      !req.rawBody ||
      !verifySlackSignature({ signingSecret, rawBody: req.rawBody.toString('utf8'), timestamp, signature })
    ) {
      throw new ForbiddenException('Invalid Slack signature');
    }

    const orgId = body.team_id ? await this.integrations.findOrgIdBySlackTeam(body.team_id) : null;
    if (!orgId) {
      this.logger.warn(`Slack slash command from unlinked workspace ${body.team_id ?? '(none)'}`);
      return ephemeral(
        'This Slack workspace is not linked to a PTaaS organization. Ask an admin to set the Team ID on the Slack integration.',
      );
    }

    const text = (body.text ?? '').trim().toLowerCase();
    const open = { organizationId: orgId, status: { in: [...OPEN_STATUSES] } };

    if (text === 'summary' || text === '') {
      const [total, critical, high] = await Promise.all([
        this.prisma.finding.count({ where: open }),
        this.prisma.finding.count({ where: { ...open, severity: 'CRITICAL' } }),
        this.prisma.finding.count({ where: { ...open, severity: 'HIGH' } }),
      ]);
      return {
        response_type: 'ephemeral',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: ':shield: PTaaS Security Summary' } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: `*Total Open:*\n${total}` },
            { type: 'mrkdwn', text: `*Critical:*\n:red_circle: ${critical}` },
            { type: 'mrkdwn', text: `*High:*\n:large_orange_circle: ${high}` },
          ]},
        ],
      };
    }

    if (text === 'critical') {
      const findings = await this.prisma.finding.findMany({
        where: { ...open, severity: 'CRITICAL' },
        select: { id: true, title: true, cvssScore: true },
        orderBy: { cvssScore: 'desc' },
        take: 5,
      });
      const rows = findings.length > 0
        ? findings.map((f) => `• *${f.title}* (CVSS ${f.cvssScore ?? 'N/A'})`).join('\n')
        : '_No critical findings — great work!_';
      return {
        response_type: 'ephemeral',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: ':red_circle: Top Critical Findings' } },
          { type: 'section', text: { type: 'mrkdwn', text: rows } },
        ],
      };
    }

    return ephemeral(
      '*PTaaS Slack Bot v2*\n`/ptaas summary` — security overview\n`/ptaas critical` — top critical findings\n`/ptaas help` — this message',
    );
  }
}
