export const WEBHOOK_QUEUE = 'webhook-queue';

export type IntegrationEvent =
  | 'finding.created'
  | 'finding.critical'
  | 'finding.overdue'
  | 'target.down'
  | 'scan.completed'
  | 'scan.failed'
  | 'sla.breach'
  | 'risk.accepted'
  | 'retest.completed'
  | 'engagement.signed'
  | 'test.ping';

export interface WebhookJobData {
  integrationId: string;
  organizationId: string;
  event: IntegrationEvent;
  payload: Record<string, unknown>;
}

export interface IntegrationConfig {
  // WEBHOOK
  webhookUrl?: string;
  webhookSecret?: string;   // HMAC-SHA256 signing secret
  // GITHUB
  githubToken?: string;
  repoOwner?: string;
  repoName?: string;
  // JIRA
  jiraBaseUrl?: string;     // e.g. https://acme.atlassian.net
  jiraEmail?: string;
  jiraToken?: string;
  jiraProjectKey?: string;
  // SLACK
  slackToken?: string;
  slackChannel?: string;    // e.g. #security-alerts
  slackTeamId?: string;     // Slack workspace id (T…) — maps slash commands to this org
}
