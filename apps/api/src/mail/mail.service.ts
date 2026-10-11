import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  invitationEmail, findingAssignedEmail, scanCompleteEmail,
  slaBreachEmail, passwordResetEmail, digestEmail, threatBriefEmail,
} from './email-templates';

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.from   = this.config.get('SMTP_FROM', 'PTaaS <noreply@ptaas.local>');
    this.appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    this.transporter = nodemailer.createTransport({
      host:   this.config.get('SMTP_HOST', 'localhost'),
      port:   this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get('SMTP_USER', ''),
        pass: this.config.get('SMTP_PASS', ''),
      },
    });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.log.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.log.error(`Failed to send email to ${to}: ${subject}`, err);
    }
  }

  async sendInvitation(opts: {
    to: string;
    orgName: string;
    inviterName: string;
    role: string;
    inviteUrl: string;
  }): Promise<void> {
    const { subject, html } = invitationEmail({ ...opts, appUrl: this.appUrl });
    await this.send(opts.to, subject, html);
  }

  async sendFindingAssigned(opts: {
    to: string;
    assigneeName: string;
    finderTitle: string;
    severity: string;
    projectName: string;
    findingUrl: string;
    assigner: string;
    dueDate?: string;
  }): Promise<void> {
    const { subject, html } = findingAssignedEmail({ ...opts, appUrl: this.appUrl });
    await this.send(opts.to, subject, html);
  }

  async sendScanComplete(opts: {
    to: string;
    userName: string;
    projectName: string;
    targetValue: string;
    scanType: string;
    duration: string;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    scanUrl: string;
  }): Promise<void> {
    const { subject, html } = scanCompleteEmail({ ...opts, appUrl: this.appUrl });
    await this.send(opts.to, subject, html);
  }

  async sendSlaBreachAlert(opts: {
    to: string;
    userName: string;
    orgName: string;
    breachCount: number;
    criticalCount: number;
    highCount: number;
    items: Array<{ title: string; severity: string; daysOverdue: number; url: string }>;
    slaUrl: string;
  }): Promise<void> {
    const { subject, html } = slaBreachEmail({ ...opts, appUrl: this.appUrl });
    await this.send(opts.to, subject, html);
  }

  async sendPasswordReset(opts: {
    to: string;
    name: string;
    resetUrl: string;
    expiresIn: string;
  }): Promise<void> {
    const { subject, html } = passwordResetEmail({ ...opts, appUrl: this.appUrl });
    await this.send(opts.to, subject, html);
  }

  async sendDigest(opts: {
    email: string;
    name: string;
    count: number;
    items: Array<{ type: string; title: string; body: string | null; link: string | null; createdAt: Date }>;
  }): Promise<void> {
    const { subject, html } = digestEmail({ name: opts.name, count: opts.count, items: opts.items, appUrl: this.appUrl });
    await this.send(opts.email, subject, html);
  }

  async sendThreatBrief(
    email: string,
    name: string,
    content: { summary: string; highlights: Array<{ type: string; title: string; detail: string; severity?: string; cveId?: string }> },
  ): Promise<void> {
    const week = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const { subject, html } = threatBriefEmail({
      name, week,
      summary: content.summary,
      highlights: content.highlights,
      briefUrl: `${this.appUrl}/threat-brief`,
      appUrl: this.appUrl,
    });
    await this.send(email, subject, html);
  }

  /** Returns raw HTML for preview (admin only) */
  previewTemplate(template: string, appUrl?: string): string {
    const url = appUrl ?? this.appUrl;
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    switch (template) {
      case 'invitation':
        return invitationEmail({ orgName: 'ACME Corp', inviterName: 'Alice Smith', role: 'SECURITY_ENGINEER', inviteUrl: `${url}/invite/demo`, appUrl: url }).html;
      case 'finding_assigned':
        return findingAssignedEmail({ assigneeName: 'Bob Johnson', finderTitle: 'SQL Injection in /api/users endpoint', severity: 'CRITICAL', projectName: 'Web App 2024 Q4', findingUrl: `${url}/projects/demo/findings/1`, assigner: 'Alice Smith', dueDate: 'Dec 31, 2024', appUrl: url }).html;
      case 'scan_complete':
        return scanCompleteEmail({ userName: 'Alice Smith', projectName: 'Web App 2024 Q4', targetValue: 'https://app.example.com', scanType: 'FULL', duration: '4m 23s', totalFindings: 7, criticalCount: 1, highCount: 2, mediumCount: 3, lowCount: 1, scanUrl: `${url}/projects/demo/scans/1`, appUrl: url }).html;
      case 'scan_complete_clean':
        return scanCompleteEmail({ userName: 'Alice Smith', projectName: 'Web App 2024 Q4', targetValue: 'https://app.example.com', scanType: 'QUICK', duration: '1m 12s', totalFindings: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, scanUrl: `${url}/projects/demo/scans/2`, appUrl: url }).html;
      case 'sla_breach':
        return slaBreachEmail({ userName: 'Alice Smith', orgName: 'ACME Corp', breachCount: 3, criticalCount: 1, highCount: 2, items: [{ title: 'SQL Injection in /api/users', severity: 'CRITICAL', daysOverdue: 5, url: `${url}/projects/demo/findings/1` }, { title: 'XSS in search field', severity: 'HIGH', daysOverdue: 12, url: `${url}/projects/demo/findings/2` }, { title: 'Outdated TLS version', severity: 'HIGH', daysOverdue: 3, url: `${url}/projects/demo/findings/3` }], slaUrl: `${url}/sla`, appUrl: url }).html;
      case 'password_reset':
        return passwordResetEmail({ name: 'Alice Smith', resetUrl: `${url}/auth/reset/demo-token`, expiresIn: '1 hour', appUrl: url }).html;
      case 'digest':
        return digestEmail({ name: 'Alice Smith', count: 5, items: [{ type: 'finding.critical', title: 'New critical finding in Web App 2024', body: 'SQL Injection detected on /api/users', link: '/projects/demo/findings/1', createdAt: new Date() }, { type: 'scan.complete', title: 'Scan completed for api.example.com', body: '4 findings discovered', link: '/projects/demo/scans/1', createdAt: new Date() }], appUrl: url }).html;
      case 'threat_brief':
        return threatBriefEmail({ name: 'Alice Smith', week: now, summary: 'This week saw elevated activity in Apache and WordPress vulnerabilities. Two KEV entries were added targeting financial sector applications. Recommend immediate patching of CVE-2024-1234.', highlights: [{ type: 'kev_alert', title: 'CVE-2024-1234 added to CISA KEV', detail: 'Apache HTTP Server path traversal — actively exploited in the wild.', severity: 'CRITICAL', cveId: 'CVE-2024-1234' }, { type: 'recommendation', title: 'Enable Content-Security-Policy headers', detail: 'Three of your targets are missing CSP headers. This reduces XSS risk significantly.' }], briefUrl: `${url}/threat-brief`, appUrl: url }).html;
      default:
        return '<p>Unknown template</p>';
    }
  }
}
