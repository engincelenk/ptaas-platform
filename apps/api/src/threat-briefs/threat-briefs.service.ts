import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';

export interface ThreatHighlight {
  type: 'critical_finding' | 'kev_alert' | 'epss_spike' | 'recommendation';
  title: string;
  detail: string;
  severity?: string;
  cveId?: string;
}

const BRIEF_SYSTEM_PROMPT = `You are a senior penetration tester writing a concise weekly threat intelligence brief for a security team.
Given a JSON snapshot of an organization's open vulnerabilities, write a brief containing:
1. An executive summary (2–3 sentences) of the current security posture
2. Top 3 prioritized findings the team should fix this week
3. Any KEV-listed CVEs present in the environment (critical — must act immediately)
4. EPSS trend observations if notable (>0.5 EPSS score)
5. One actionable recommendation

Respond ONLY with valid JSON matching this schema:
{
  "summary": "string — executive summary paragraph",
  "highlights": [
    { "type": "critical_finding|kev_alert|epss_spike|recommendation", "title": "string", "detail": "string", "severity": "optional", "cveId": "optional" }
  ]
}
Keep the summary under 120 words. Keep each highlight detail under 60 words. Be concrete, not generic.`;

@Injectable()
export class ThreatBriefsService {
  private readonly logger = new Logger(ThreatBriefsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly mail: MailService,
  ) {}

  async list(orgId: string) {
    return this.prisma.threatBrief.findMany({
      where: { orgId },
      orderBy: { weekStart: 'desc' },
      take: 4,
    });
  }

  async generate(orgId: string): Promise<{ id: string }> {
    const weekStart = this.getWeekStart();

    const existing = await this.prisma.threatBrief.findUnique({
      where: { orgId_weekStart: { orgId, weekStart } },
    });
    if (existing) return { id: existing.id };

    const snapshot = await this.buildSnapshot(orgId);
    const raw = await this.ai.complete(BRIEF_SYSTEM_PROMPT, JSON.stringify(snapshot), {
      maxTokens: 1024,
      temperature: 0.3,
    });

    let parsed: { summary: string; highlights: ThreatHighlight[] };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      this.logger.error('Failed to parse AI response for threat brief');
      parsed = {
        summary: 'Unable to generate threat brief this week. Please review findings manually.',
        highlights: [],
      };
    }

    const brief = await this.prisma.threatBrief.create({
      data: {
        orgId,
        weekStart,
        summary: parsed.summary,
        highlights: parsed.highlights as any,
      },
    });

    // Fire-and-forget email to admins
    this.sendBriefEmail(orgId, brief.id, parsed).catch((e) =>
      this.logger.error('Failed to send threat brief email', e),
    );

    return { id: brief.id };
  }

  private async buildSnapshot(orgId: string) {
    const [openFindings, kevFindings, highEpss] = await Promise.all([
      this.prisma.finding.findMany({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: {
          id: true, title: true, severity: true, owasp: true,
          cveIds: true, aiRiskScore: true, epssScore: true,
          kevListed: true, createdAt: true,
          matchedAt: true,
        },
        orderBy: { aiRiskScore: 'desc' },
        take: 30,
      }),
      this.prisma.finding.count({
        where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] }, kevListed: true },
      }),
      this.prisma.finding.findMany({
        where: {
          organizationId: orgId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          epssScore: { gte: 0.5 },
        },
        select: { title: true, epssScore: true, cveIds: true },
        take: 5,
      }),
    ]);

    const severityCount = openFindings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});

    return {
      weekOf: new Date().toISOString().slice(0, 10),
      severityDistribution: severityCount,
      totalOpen: openFindings.length,
      kevCount: kevFindings,
      topFindings: openFindings.slice(0, 10).map((f) => ({
        title: f.title,
        severity: f.severity,
        owasp: f.owasp,
        riskScore: f.aiRiskScore,
        cveIds: f.cveIds,
        kevListed: f.kevListed,
        epssScore: f.epssScore,
        daysOpen: Math.floor((Date.now() - f.createdAt.getTime()) / 86400000),
      })),
      highEpssFindings: highEpss,
    };
  }

  private async sendBriefEmail(
    orgId: string,
    briefId: string,
    content: { summary: string; highlights: ThreatHighlight[] },
  ) {
    const admins = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, role: 'ADMIN' },
      include: { user: { select: { email: true, name: true } } },
    });

    for (const member of admins) {
      await this.mail.sendThreatBrief(member.user.email, member.user.name, content);
    }

    await this.prisma.threatBrief.update({
      where: { id: briefId },
      data: { emailSentAt: new Date() },
    });
  }

  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setUTCDate(diff);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }
}
