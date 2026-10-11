import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import {
  WEBHOOK_QUEUE,
  type IntegrationEvent,
  type WebhookJobData,
  type IntegrationConfig,
} from './integrations.constants';
import type { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';

const DEFAULT_EVENTS: IntegrationEvent[] = ['finding.created', 'scan.completed'];

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJobData>,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string) {
    const rows = await this.prisma.integration.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, type: true, name: true, enabled: true, events: true,
        createdAt: true, updatedAt: true,
        // never return configEncrypted to the client
      },
    });
    return rows;
  }

  async create(dto: CreateIntegrationDto, orgId: string, userId: string) {
    this._validateConfig(dto.type, dto);

    const config: IntegrationConfig = this._extractConfig(dto);
    const configEncrypted = this.crypto.encrypt(JSON.stringify(config));

    const integration = await this.prisma.integration.create({
      data: {
        organizationId: orgId,
        type: dto.type as any,
        name: dto.name,
        events: dto.events ?? DEFAULT_EVENTS,
        configEncrypted,
      },
    });

    await this.audit.log({
      action: 'integration.created',
      userId,
      organizationId: orgId,
      metadata: { integrationId: integration.id, type: dto.type, name: dto.name },
    });

    return { id: integration.id, type: integration.type, name: integration.name };
  }

  async update(id: string, dto: UpdateIntegrationDto, orgId: string, userId: string) {
    const existing = await this._findOwned(id, orgId);

    const currentConfig: IntegrationConfig = JSON.parse(
      this.crypto.decrypt(existing.configEncrypted),
    );
    const patchedConfig = { ...currentConfig, ...this._extractConfig(dto as any) };
    const configEncrypted = this.crypto.encrypt(JSON.stringify(patchedConfig));

    const updated = await this.prisma.integration.update({
      where: { id },
      data: {
        enabled: dto.enabled ?? existing.enabled,
        events: dto.events ?? existing.events,
        configEncrypted,
      },
    });

    await this.audit.log({
      action: 'integration.updated',
      userId,
      organizationId: orgId,
      metadata: { integrationId: id },
    });

    return { id: updated.id };
  }

  async remove(id: string, orgId: string, userId: string) {
    await this._findOwned(id, orgId);
    await this.prisma.integration.delete({ where: { id, organizationId: orgId } });
    await this.audit.log({
      action: 'integration.deleted',
      userId,
      organizationId: orgId,
      metadata: { integrationId: id },
    });
  }

  async listDeliveries(integrationId: string, orgId: string) {
    await this._findOwned(integrationId, orgId);
    return this.prisma.webhookDelivery.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, event: true, status: true, responseCode: true,
        attempts: true, lastAttemptAt: true, createdAt: true,
      },
    });
  }

  // Called by FindingsService / ScansService after DB write
  async notify(event: IntegrationEvent, orgId: string, payload: Record<string, unknown>) {
    const integrations = await this.prisma.integration.findMany({
      where: { organizationId: orgId, enabled: true, events: { has: event } },
    });

    for (const integration of integrations) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          integrationId: integration.id,
          event,
          payload: JSON.stringify(payload).slice(0, 65_536),
          status: 'PENDING',
        },
      });

      await this.queue.add(
        'deliver',
        {
          integrationId: integration.id,
          organizationId: orgId,
          event,
          payload: { ...payload, _deliveryId: delivery.id },
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      );
    }
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async _findOwned(id: string, orgId: string) {
    const row = await this.prisma.integration.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Integration not found');
    return row;
  }

  private _validateConfig(type: string, dto: Partial<CreateIntegrationDto>) {
    switch (type) {
      case 'WEBHOOK':
        if (!dto.webhookUrl) throw new BadRequestException('webhookUrl is required for WEBHOOK');
        break;
      case 'GITHUB':
        if (!dto.githubToken || !dto.repoOwner || !dto.repoName)
          throw new BadRequestException('githubToken, repoOwner, repoName required for GITHUB');
        break;
      case 'JIRA':
        if (!dto.jiraBaseUrl || !dto.jiraEmail || !dto.jiraToken || !dto.jiraProjectKey)
          throw new BadRequestException('jiraBaseUrl, jiraEmail, jiraToken, jiraProjectKey required for JIRA');
        break;
      case 'SLACK':
        if (!dto.slackToken || !dto.slackChannel)
          throw new BadRequestException('slackToken, slackChannel required for SLACK');
        break;
    }
  }

  async testWebhook(id: string, orgId: string) {
    const row = await this.prisma.integration.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Integration not found');

    const job = await this.queue.add('webhook', {
      integrationId: id,
      organizationId: orgId,
      event: 'test.ping',
      payload: {
        event: 'test.ping',
        timestamp: new Date().toISOString(),
        message: 'This is a test delivery from PTaaS.',
      },
    });

    return { jobId: job.id, message: 'Test delivery queued' };
  }

  /**
   * Resolves the organization linked to a Slack workspace (config.slackTeamId).
   * Config is encrypted, so enabled SLACK integrations are decrypted and matched.
   * Returns null if no org — or more than one org — claims the workspace (fail closed).
   */
  async findOrgIdBySlackTeam(teamId: string): Promise<string | null> {
    const rows = await this.prisma.integration.findMany({
      where: { type: 'SLACK', enabled: true },
      select: { organizationId: true, configEncrypted: true },
    });
    const orgIds = new Set<string>();
    for (const row of rows) {
      try {
        const cfg: IntegrationConfig = JSON.parse(this.crypto.decrypt(row.configEncrypted));
        if (cfg.slackTeamId === teamId) orgIds.add(row.organizationId);
      } catch {
        // undecryptable row — skip
      }
    }
    return orgIds.size === 1 ? [...orgIds][0] : null;
  }

  private _extractConfig(dto: Partial<CreateIntegrationDto>): IntegrationConfig {
    const keys: (keyof IntegrationConfig)[] = [
      'webhookUrl', 'webhookSecret',
      'githubToken', 'repoOwner', 'repoName',
      'jiraBaseUrl', 'jiraEmail', 'jiraToken', 'jiraProjectKey',
      'slackToken', 'slackChannel', 'slackTeamId',
    ];
    const config: IntegrationConfig = {};
    for (const key of keys) {
      if ((dto as any)[key] !== undefined) (config as any)[key] = (dto as any)[key];
    }
    return config;
  }
}
