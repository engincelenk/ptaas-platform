import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const WEBHOOK_TEMPLATES = [
  {
    id: 'finding-created',
    name: 'New Finding Alert',
    description: 'Fires when a new finding is ingested from a scan',
    eventType: 'finding.created',
    samplePayload: {
      event: 'finding.created',
      data: {
        id: 'clxyz123',
        title: 'SQL Injection in /api/users',
        severity: 'CRITICAL',
        cvssScore: 9.8,
        projectId: 'clprojabc',
        projectName: 'Main API',
      },
    },
  },
  {
    id: 'scan-completed',
    name: 'Scan Completed',
    description: 'Fires when a scan finishes (success or failure)',
    eventType: 'scan.completed',
    samplePayload: {
      event: 'scan.completed',
      data: {
        id: 'clscanxyz',
        status: 'COMPLETED',
        findingCount: 12,
        criticalCount: 2,
        projectId: 'clprojabc',
      },
    },
  },
  {
    id: 'sla-breach',
    name: 'SLA Breach Alert',
    description: 'Fires when a finding exceeds its remediation SLA',
    eventType: 'finding.sla_breach',
    samplePayload: {
      event: 'finding.sla_breach',
      data: {
        id: 'clxyz456',
        title: 'Reflected XSS in search endpoint',
        severity: 'HIGH',
        dueDate: '2026-07-01T00:00:00Z',
        daysOverdue: 5,
      },
    },
  },
  {
    id: 'finding-status-changed',
    name: 'Finding Status Changed',
    description: 'Fires when a finding is triaged (status update)',
    eventType: 'finding.status_changed',
    samplePayload: {
      event: 'finding.status_changed',
      data: {
        id: 'clxyz789',
        oldStatus: 'OPEN',
        newStatus: 'IN_PROGRESS',
        assignedTo: 'jane@example.com',
      },
    },
  },
];

const INTEGRATION_DIRECTORY = [
  { id: 'jira',       name: 'Jira',           category: 'ticketing',   status: 'available', description: 'Two-way sync findings with Jira issues' },
  { id: 'slack',      name: 'Slack',          category: 'messaging',   status: 'available', description: 'Slash commands and finding alerts in Slack' },
  { id: 'github',     name: 'GitHub',         category: 'scm',         status: 'available', description: 'Security alerts on PRs via GitHub Checks' },
  { id: 'gitlab',     name: 'GitLab',         category: 'scm',         status: 'coming_soon', description: 'GitLab CI integration with SAST findings' },
  { id: 'pagerduty',  name: 'PagerDuty',      category: 'alerting',    status: 'coming_soon', description: 'Auto-create incidents for critical findings' },
  { id: 'splunk',     name: 'Splunk',         category: 'siem',        status: 'coming_soon', description: 'Forward findings as Splunk events' },
  { id: 'vscode',     name: 'VS Code',        category: 'ide',         status: 'available', description: 'View and triage findings directly in VS Code' },
  { id: 'azure-devops', name: 'Azure DevOps', category: 'ticketing',   status: 'coming_soon', description: 'Sync findings with Azure Boards work items' },
  { id: 'teams',      name: 'Microsoft Teams', category: 'messaging',  status: 'coming_soon', description: 'Teams notifications for new critical findings' },
  { id: 'webhook',    name: 'Custom Webhook', category: 'generic',     status: 'available', description: 'Send any event to any HTTP endpoint' },
];

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  @Get('webhook-templates')
  @ApiOperation({ summary: 'M60 — Available webhook event templates' })
  getWebhookTemplates() {
    return { templates: WEBHOOK_TEMPLATES };
  }

  @Get('integrations')
  @ApiOperation({ summary: 'M60 — Integration directory' })
  getIntegrations() {
    return {
      integrations: INTEGRATION_DIRECTORY,
      categories: [...new Set(INTEGRATION_DIRECTORY.map((i) => i.category))],
    };
  }

  @Get('api-docs')
  @ApiOperation({ summary: 'M60 — API documentation hub metadata' })
  getApiDocs() {
    return {
      openapi: '/api-docs-json',
      swaggerUi: '/api-docs',
      version: '1.0.0',
      baseUrl: '/api/v1',
      authentication: {
        type: 'Bearer JWT',
        endpoints: { login: 'POST /auth/login', refresh: 'POST /auth/refresh' },
        apiKeys: 'Manage at /organizations/:orgId/api-keys',
      },
      sdks: [
        { language: 'TypeScript', status: 'coming_soon' },
        { language: 'Python', status: 'coming_soon' },
        { language: 'Go', status: 'coming_soon' },
      ],
    };
  }
}
