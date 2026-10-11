import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import { Version3Client } from 'jira.js';
import { WebClient, type KnownBlock } from '@slack/web-api';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { WEBHOOK_QUEUE, type WebhookJobData, type IntegrationConfig } from './integrations.constants';

const SEVERITY_TO_JIRA_PRIORITY: Record<string, string> = {
  CRITICAL: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  INFO: 'Lowest',
};

const SEVERITY_TO_GITHUB_LABEL: Record<string, string> = {
  CRITICAL: 'severity: critical',
  HIGH: 'severity: high',
  MEDIUM: 'severity: medium',
  LOW: 'severity: low',
  INFO: 'severity: info',
};

@Processor(WEBHOOK_QUEUE, { concurrency: 5 })
export class IntegrationsProcessor extends WorkerHost {
  private readonly log = new Logger(IntegrationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { integrationId, event, payload } = job.data;
    const deliveryId = (payload as any)._deliveryId as string | undefined;

    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration) return;

    const config: IntegrationConfig = JSON.parse(this.crypto.decrypt(integration.configEncrypted));

    let status = 'SUCCESS';
    let responseCode: number | undefined;
    let responseBody: string | undefined;

    try {
      switch (integration.type) {
        case 'WEBHOOK':
          ({ responseCode, responseBody } = await this._deliverWebhook(config, event, payload));
          break;
        case 'GITHUB':
          await this._deliverGithub(config, event, payload);
          break;
        case 'JIRA':
          await this._deliverJira(config, event, payload);
          break;
        case 'SLACK':
          await this._deliverSlack(config, event, payload);
          break;
      }
    } catch (err: unknown) {
      status = 'FAILED';
      responseBody = err instanceof Error ? err.message : String(err);
      this.log.error(`Integration ${integrationId} delivery failed: ${responseBody}`);
      throw err; // BullMQ will retry
    } finally {
      if (deliveryId) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status,
            responseCode,
            responseBody: responseBody?.slice(0, 2048),
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
      }
    }
  }

  // ── WEBHOOK ────────────────────────────────────────────────────────────────

  private async _deliverWebhook(config: IntegrationConfig, event: string, payload: unknown) {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PTaaS-Event': event,
    };

    if (config.webhookSecret) {
      const sig = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(body)
        .digest('hex');
      headers['X-PTaaS-Signature'] = `sha256=${sig}`;
    }

    const res = await fetch(config.webhookUrl!, { method: 'POST', headers, body });
    const responseBody = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 500)}`);
    return { responseCode: res.status, responseBody: responseBody.slice(0, 500) };
  }

  // ── GITHUB ─────────────────────────────────────────────────────────────────

  private async _deliverGithub(config: IntegrationConfig, event: string, payload: any) {
    if (event !== 'finding.created') return;  // only create issues for findings

    const octokit = new Octokit({ auth: config.githubToken });
    const label = SEVERITY_TO_GITHUB_LABEL[payload.severity] ?? 'severity: info';

    // Ensure labels exist (best effort)
    try {
      await octokit.issues.createLabel({
        owner: config.repoOwner!,
        repo: config.repoName!,
        name: label,
        color: payload.severity === 'CRITICAL' ? 'B60205'
          : payload.severity === 'HIGH' ? 'D93F0B'
          : payload.severity === 'MEDIUM' ? 'E4E669'
          : '0E8A16',
      });
    } catch { /* label may already exist */ }

    await octokit.issues.create({
      owner: config.repoOwner!,
      repo: config.repoName!,
      title: `[PTaaS] ${payload.severity}: ${payload.title}`,
      labels: ['ptaas', label],
      body: this._githubIssueBody(payload),
    });
  }

  private _githubIssueBody(f: any): string {
    return [
      `## Security Finding — ${f.title}`,
      '',
      `**Severity:** ${f.severity}`,
      `**URL:** ${f.matchedAt ?? 'N/A'}`,
      f.cvssScore ? `**CVSS:** ${f.cvssScore}` : '',
      f.cveIds?.length ? `**CVEs:** ${f.cveIds.join(', ')}` : '',
      '',
      f.description ?? '',
      '',
      `---`,
      `*Generated by PTaaS — [View finding](${process.env.APP_URL ?? ''}/projects/${f.projectId}/findings/${f.id})*`,
    ].filter(Boolean).join('\n');
  }

  // ── JIRA ───────────────────────────────────────────────────────────────────

  private async _deliverJira(config: IntegrationConfig, event: string, payload: any) {
    if (event !== 'finding.created') return;

    const jira = new Version3Client({
      host: config.jiraBaseUrl!,
      authentication: { basic: { email: config.jiraEmail!, apiToken: config.jiraToken! } },
    });

    await jira.issues.createIssue({
      fields: {
        project: { key: config.jiraProjectKey },
        issuetype: { name: 'Story' },
        summary: `[PTaaS] ${payload.severity}: ${payload.title}`,
        priority: { name: SEVERITY_TO_JIRA_PRIORITY[payload.severity] ?? 'Medium' },
        description: {
          version: 1,
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: this._jiraDescription(payload) }],
          }],
        },
        labels: ['ptaas', `severity-${payload.severity?.toLowerCase()}`],
      } as any,
    });
  }

  private _jiraDescription(f: any): string {
    return [
      `Security Finding: ${f.title}`,
      `Severity: ${f.severity}`,
      `URL: ${f.matchedAt ?? 'N/A'}`,
      f.description ?? '',
      `View in PTaaS: ${process.env.APP_URL ?? ''}/projects/${f.projectId}/findings/${f.id}`,
    ].filter(Boolean).join('\n\n');
  }

  // ── SLACK ──────────────────────────────────────────────────────────────────

  private async _deliverSlack(config: IntegrationConfig, event: string, payload: any) {
    const slack = new WebClient(config.slackToken);

    const blocks = this._slackBlocks(event, payload);
    await slack.chat.postMessage({
      channel: config.slackChannel!,
      text: this._slackFallbackText(event, payload),
      blocks,
    });
  }

  private _slackFallbackText(event: string, payload: any): string {
    if (event === 'finding.created') {
      return `🔴 PTaaS: ${payload.severity} finding — ${payload.title}`;
    }
    if (event === 'scan.completed') {
      return `✅ PTaaS: Scan completed — ${payload.findingsCount ?? 0} findings`;
    }
    return `⚠️ PTaaS: ${event}`;
  }

  private _slackBlocks(event: string, payload: any): KnownBlock[] {
    const EMOJI: Record<string, string> = {
      CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵', INFO: '⚪',
    };

    if (event === 'finding.created') {
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${EMOJI[payload.severity] ?? '⚠️'} *${payload.severity} — ${payload.title}*\n${payload.matchedAt ?? ''}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Severity*\n${payload.severity}` },
            { type: 'mrkdwn', text: `*CVEs*\n${payload.cveIds?.join(', ') || 'None'}` },
          ],
        },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'View Finding' },
            url: `${process.env.APP_URL ?? ''}/projects/${payload.projectId}/findings/${payload.id}`,
          }],
        },
      ];
    }

    if (event === 'scan.completed') {
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Scan completed* — ${payload.targetValue ?? ''}\n${payload.findingsCount ?? 0} findings detected`,
          },
        },
      ];
    }

    return [{ type: 'section', text: { type: 'mrkdwn', text: `⚠️ PTaaS event: \`${event}\`` } }];
  }
}
