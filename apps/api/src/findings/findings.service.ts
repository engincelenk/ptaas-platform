import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type { Prisma } from '@ptaas/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiService, type FindingContext } from '../ai/ai.service';
import type { UpdateFindingDto } from './dto/update-finding.dto';

// CVSS-aligned base weights
const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 7,
  MEDIUM: 4,
  LOW: 1.5,
  INFO: 0.5,
};

@Injectable()
export class FindingsService {
  private readonly logger = new Logger(FindingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
  ) {}

  async search(projectId: string, orgId: string, query: string, limit = 20) {
    // PostgreSQL Full-Text Search over the pre-built tsvector column
    // Falls back to ILIKE when query is too short for FTS
    if (query.length < 3) {
      return this.prisma.finding.findMany({
        where: {
          projectId,
          organizationId: orgId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { templateId: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        select: {
          id: true, title: true, severity: true, status: true,
          matchedAt: true, aiRiskScore: true, createdAt: true,
        },
      });
    }

    // Raw FTS query — parameterized, no injection risk
    const results = await this.prisma.$queryRaw<
      Array<{ id: string; title: string; severity: string; status: string; rank: number }>
    >`
      SELECT id, title, severity, status,
             ts_rank(search_vector, plainto_tsquery('english', ${query})) AS rank
      FROM findings
      WHERE organization_id = ${orgId}
        AND project_id = ${projectId}
        AND search_vector @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results;
  }

  async relatedFindings(findingId: string, orgId: string, limit = 5) {
    const source = await this.prisma.finding.findFirst({
      where: { id: findingId, organizationId: orgId },
      select: { templateId: true, cweIds: true, owasp: true, projectId: true },
    });
    if (!source) return [];

    // Find findings with the same templateId, CWE IDs, or OWASP category
    return this.prisma.finding.findMany({
      where: {
        id: { not: findingId },
        organizationId: orgId,
        OR: [
          ...(source.templateId ? [{ templateId: source.templateId }] : []),
          ...(source.cweIds.length > 0
            ? [{ cweIds: { hasSome: source.cweIds } }]
            : []),
          ...(source.owasp ? [{ owasp: source.owasp }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, severity: true, status: true,
        matchedAt: true, target: { select: { value: true } },
      },
    });
  }

  async findAll(
    projectId: string,
    orgId: string,
    filters: {
      severity?: string;
      status?: string;
      scanId?: string;
      q?: string;
    } = {},
  ) {
    // Delegate to FTS search if query param present
    if (filters.q) {
      return this.search(projectId, orgId, filters.q);
    }

    return this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        ...(filters.severity && { severity: filters.severity as never }),
        ...(filters.status && { status: filters.status as never }),
        ...(filters.scanId && { scanId: filters.scanId }),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        templateId: true,
        matchedAt: true,
        cvssScore: true,
        cveIds: true,
        owasp: true,
        aiRiskScore: true,
        aiFpScore: true,
        aiAnalyzedAt: true,
        assignedTo: { select: { id: true, name: true } },
        scan: { select: { id: true, type: true } },
        createdAt: true,
      },
    });
  }

  async findOne(id: string, orgId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id, organizationId: orgId },
      include: {
        scan: { select: { id: true, type: true, startedAt: true } },
        target: { select: { id: true, value: true, type: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    return finding;
  }

  async update(
    id: string,
    dto: UpdateFindingDto,
    userId: string,
    orgId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const finding = await this.prisma.finding.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!finding) throw new NotFoundException('Finding not found');

    const updated = await this.prisma.finding.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.severity && { severity: dto.severity }),
        ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.recommendation !== undefined && { recommendation: dto.recommendation }),
        ...(dto.jiraIssueKey !== undefined && { jiraIssueKey: dto.jiraIssueKey }),
      },
    });

    await this.audit.log({
      action: 'finding.updated',
      userId,
      organizationId: orgId,
      resource: 'finding',
      resourceId: id,
      metadata: {
        changes: dto,
        comment: dto.comment,
        previousStatus: finding.status,
        previousSeverity: finding.severity,
      },
      ipAddress: ip,
      userAgent,
    });

    // Activity log for status change
    if (dto.status && dto.status !== finding.status) {
      await this.prisma.findingActivity.create({
        data: {
          findingId: id,
          userId,
          type: 'status_change',
          payload: { from: finding.status, to: dto.status, comment: dto.comment ?? null },
        },
      });
    }

    return updated;
  }

  /**
   * Risk score for a project: weighted sum of non-FP findings, normalized 0–100.
   * Factors: severity, FP probability, open/unresolved status.
   */
  async projectRiskScore(projectId: string, orgId: string) {
    const findings = await this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        status: { notIn: ['CLOSED', 'FALSE_POSITIVE'] },
      },
      select: { severity: true, aiFpScore: true, aiRiskScore: true },
    });

    if (findings.length === 0) return { score: 0, level: 'NONE', findingCount: 0 };

    let weightedSum = 0;
    let maxPossible = 0;

    for (const f of findings) {
      const weight = SEVERITY_WEIGHT[f.severity] ?? 1;
      const fpAdjust = f.aiFpScore != null ? (1 - f.aiFpScore / 100) : 0.9;
      // Use AI risk score if available; fall back to severity weight × 10
      const baseScore = f.aiRiskScore ?? weight * 10;
      weightedSum += baseScore * fpAdjust;
      maxPossible += 100;
    }

    const score = Math.min(100, Math.round((weightedSum / maxPossible) * 100));
    const level = score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

    return { score, level, findingCount: findings.length };
  }

  /**
   * Trigger AI analysis for a batch of findings (fire-and-forget).
   * Called by InternalController after ingestion.
   */
  async addComment(findingId: string, body: string, userId: string, orgId: string) {
    await this.assertFindingAccess(findingId, orgId);
    const comment = await this.prisma.findingComment.create({
      data: { findingId, body, userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await this.prisma.findingActivity.create({
      data: { findingId, userId, type: 'comment', payload: { commentId: comment.id, preview: body.slice(0, 80) } },
    });
    return comment;
  }

  async getComments(findingId: string, orgId: string) {
    await this.assertFindingAccess(findingId, orgId);
    return this.prisma.findingComment.findMany({
      where: { findingId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async getActivity(findingId: string, orgId: string) {
    await this.assertFindingAccess(findingId, orgId);
    return this.prisma.findingActivity.findMany({
      where: { findingId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async updateRemediation(
    findingId: string,
    orgId: string,
    userId: string,
    dto: { assignedToId?: string | null; dueDate?: string | null },
  ) {
    const existing = await this.assertFindingAccess(findingId, orgId);
    const data: Record<string, any> = {};
    const activities: Array<{ type: string; payload: object }> = [];

    if ('assignedToId' in dto && dto.assignedToId !== existing.assignedToId) {
      data.assignedToId = dto.assignedToId ?? null;
      activities.push({ type: 'assignee_change', payload: { from: existing.assignedToId, to: dto.assignedToId } });
    }
    if ('dueDate' in dto) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      activities.push({ type: 'due_date_set', payload: { dueDate: dto.dueDate } });
    }

    if (Object.keys(data).length === 0) return existing;

    const updated = await this.prisma.finding.update({ where: { id: findingId, organizationId: orgId }, data });
    await this.prisma.findingActivity.createMany({
      data: activities.map((a) => ({ ...a, findingId, userId })),
    });
    return updated;
  }

  private async assertFindingAccess(findingId: string, orgId: string) {
    const f = await this.prisma.finding.findFirst({ where: { id: findingId, organizationId: orgId } });
    if (!f) throw new NotFoundException('Finding not found');
    return f;
  }

  async bulkUpdateStatus(
    ids: string[],
    status: string,
    orgId: string,
    userId: string,
  ): Promise<{ updated: number }> {
    const valid = await this.prisma.finding.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: { id: true },
    });
    const validIds = valid.map((f) => f.id);
    if (validIds.length === 0) return { updated: 0 };

    await this.prisma.finding.updateMany({
      where: { id: { in: validIds } },
      data: { status: status as Prisma.FindingCreateInput['status'] },
    });

    await this.audit.log({
      action: 'findings.bulk_update',
      userId,
      organizationId: orgId,
      resource: 'finding',
      metadata: { ids: validIds, status },
    });

    return { updated: validIds.length };
  }

  async aiTriage(
    projectId: string,
    orgId: string,
  ): Promise<Array<{ id: string; title: string; suggestedStatus: string; reason: string; confidence: number }>> {
    const findings = await this.prisma.finding.findMany({
      where: { projectId, organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: {
        id: true, title: true, severity: true, aiFpScore: true,
        aiRiskScore: true, kevListed: true, epssScore: true,
        owasp: true, cveIds: true, description: true,
      },
      take: 25,
      orderBy: { aiRiskScore: 'desc' },
    });

    if (findings.length === 0) return [];

    const SYSTEM = `You are a senior security analyst performing triage on open findings.
For each finding, suggest: suggestedStatus (one of: OPEN, IN_PROGRESS, FALSE_POSITIVE, ACCEPTED_RISK, FIXED), a reason (max 20 words), and confidence 0-100.
High FP score (>70) → likely FALSE_POSITIVE. KEV listed → keep OPEN or IN_PROGRESS. Low risk score (<20) with no CVE → consider ACCEPTED_RISK.
Respond ONLY with a JSON array: [{ "id": "...", "suggestedStatus": "...", "reason": "...", "confidence": 0-100 }]`;

    const userMsg = JSON.stringify(findings.map((f) => ({
      id: f.id, title: f.title, severity: f.severity,
      fpScore: f.aiFpScore, riskScore: f.aiRiskScore,
      kevListed: f.kevListed, epssScore: f.epssScore,
      owasp: f.owasp, hasCve: f.cveIds.length > 0,
    })));

    const raw = await this.ai.complete(SYSTEM, userMsg, { maxTokens: 1024, temperature: 0 });

    try {
      const match = raw.match(/\[[\s\S]*\]/);
      const suggestions = JSON.parse(match ? match[0] : raw) as Array<{
        id: string; suggestedStatus: string; reason: string; confidence: number;
      }>;
      // Enrich with title from original findings
      return suggestions.map((s) => ({
        ...s,
        title: findings.find((f) => f.id === s.id)?.title ?? '',
      }));
    } catch {
      this.logger.error('Failed to parse AI triage response');
      return [];
    }
  }

  async triggerAiAnalysis(findingIds: string[]): Promise<void> {
    const findings = await this.prisma.finding.findMany({
      where: { id: { in: findingIds }, aiAnalyzedAt: null },
      select: {
        id: true, title: true, templateId: true, templateName: true,
        severity: true, matchedAt: true, cveIds: true, cweIds: true,
        cvssScore: true, cvssVector: true, httpRequest: true, httpResponse: true,
      },
    });

    for (const finding of findings) {
      try {
        const analysis = await this.ai.analyzeFinding(finding as FindingContext);
        await this.prisma.finding.update({
          where: { id: finding.id },
          data: {
            aiExplanation: analysis.explanation,
            aiRemediation: analysis.remediation,
            aiFpScore: analysis.fpProbability,
            aiRiskScore: analysis.riskScore,
            aiBusinessImpact: analysis.businessImpact,
            ...(analysis.owaspCategory && { owasp: analysis.owaspCategory }),
            aiAnalyzedAt: new Date(),
          },
        });
        this.logger.log(`AI analysis stored for finding ${finding.id}`);
      } catch (err) {
        this.logger.error(`AI analysis failed for finding ${finding.id}`, err);
      }
    }
  }

  // ─── SLA Breach Report ──────────────────────────────────────────────────────

  static readonly SLA_DAYS: Record<string, number> = {
    CRITICAL: 7,
    HIGH: 30,
    MEDIUM: 90,
    LOW: 180,
    INFO: 365,
  };

  async getSlaBreaches(orgId: string) {
    const now = new Date();

    const findings = await this.prisma.finding.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        severity: { in: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
      },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        dueDate: true,
        assignedToId: true,
        projectId: true,
        project: { select: { name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });

    const breaches = findings
      .map((f) => {
        const slaDays = FindingsService.SLA_DAYS[f.severity] ?? 30;
        // Use dueDate if set, otherwise createdAt + slaDays
        const deadline = f.dueDate
          ? f.dueDate
          : new Date(f.createdAt.getTime() + slaDays * 24 * 3600 * 1000);
        const ageMs = now.getTime() - f.createdAt.getTime();
        const ageDays = Math.floor(ageMs / (24 * 3600 * 1000));
        const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / (24 * 3600 * 1000));
        return { ...f, slaDays, deadline, ageDays, daysOverdue };
      })
      .filter((f) => f.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const stats = {
      total: breaches.length,
      critical: breaches.filter((b) => b.severity === 'CRITICAL').length,
      high: breaches.filter((b) => b.severity === 'HIGH').length,
      medium: breaches.filter((b) => b.severity === 'MEDIUM').length,
      low: breaches.filter((b) => b.severity === 'LOW').length,
      avgDaysOverdue: breaches.length
        ? Math.round(breaches.reduce((s, b) => s + b.daysOverdue, 0) / breaches.length)
        : 0,
    };

    return { stats, breaches };
  }

  async createManual(
    projectId: string,
    orgId: string,
    userId: string,
    dto: {
      title: string;
      description?: string;
      severity: string;
      cvssScore?: number;
      cvssVector?: string;
      owasp?: string;
      cweIds?: string[];
      recommendation?: string;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: { targets: { take: 1 } },
    });
    if (!project) throw new NotFoundException('Project not found');

    const target = project.targets[0];
    if (!target) throw new NotFoundException('Project has no target — add one before creating manual findings');

    // Find or create a MANUAL placeholder scan for this project
    let manualScan = await this.prisma.scan.findFirst({
      where: { projectId, organizationId: orgId, type: 'MANUAL' as any },
    });
    if (!manualScan) {
      manualScan = await this.prisma.scan.create({
        data: {
          type: 'MANUAL' as any,
          status: 'COMPLETED',
          projectId,
          organizationId: orgId,
          targetId: target.id,
          createdById: userId,
          rateLimit: 0,
          completedAt: new Date(),
        },
      });
    }

    const finding = await this.prisma.finding.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        severity: dto.severity as any,
        status: 'OPEN',
        scanId: manualScan.id,
        targetId: target.id,
        projectId,
        organizationId: orgId,
        createdById: userId,
        cvssScore: dto.cvssScore ?? null,
        cvssVector: dto.cvssVector ?? null,
        owasp: dto.owasp ?? null,
        cweIds: dto.cweIds ?? [],
        aiRemediation: dto.recommendation ?? null,
        templateName: 'Manual Finding',
      },
    });

    await this.audit.log({
      action: 'finding.created_manual',
      userId,
      resourceId: finding.id,
      metadata: { title: dto.title, severity: dto.severity, projectId },
    });

    return finding;
  }

  async bulkAssign(findingIds: string[], assignedToId: string | null, orgId: string, actorId: string) {
    // Verify all findings belong to org
    const count = await this.prisma.finding.count({ where: { id: { in: findingIds }, organizationId: orgId } });
    if (count !== findingIds.length) throw new NotFoundException('One or more findings not found');

    await this.prisma.finding.updateMany({
      where: { id: { in: findingIds } },
      data: { assignedToId },
    });

    await this.audit.log({
      action: 'finding.bulk_assign',
      userId: actorId,
      metadata: { findingIds, assignedToId, count: findingIds.length },
    });

    return { updated: findingIds.length };
  }

  async generateNarrative(id: string, orgId: string): Promise<{
    description: string;
    impact: string;
    recommendation: string;
  }> {
    const finding = await this.prisma.finding.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true, title: true, severity: true, description: true,
        cvssScore: true, cvssVector: true, cveIds: true, cweIds: true,
        templateId: true, templateName: true,
        httpRequest: true, httpResponse: true,
      },
    });
    if (!finding) throw new NotFoundException('Finding not found');

    const NarrativeSchema = (await import('zod')).z.object({
      description: (await import('zod')).z.string()
        .describe('Professional vulnerability description (3-5 sentences). Cover what the vulnerability is, where it was found, and why it is exploitable. Write for a technical audience but avoid unnecessary jargon.'),
      impact: (await import('zod')).z.string()
        .describe('Business and technical impact if exploited (2-3 sentences). Include data at risk, affected systems, and potential attack scenarios.'),
      recommendation: (await import('zod')).z.string()
        .describe('Actionable remediation steps (numbered list, 3-5 steps). Be specific and include code-level or configuration-level guidance where possible.'),
    });

    const { generateObject } = await import('ai');
    const { createAnthropic } = await import('@ai-sdk/anthropic');

    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });

    const contextLines: string[] = [
      `Title: ${finding.title}`,
      `Severity: ${finding.severity}`,
    ];
    if (finding.cvssScore != null) contextLines.push(`CVSS Score: ${finding.cvssScore}`);
    if (finding.cvssVector) contextLines.push(`CVSS Vector: ${finding.cvssVector}`);
    if (finding.cveIds.length) contextLines.push(`CVE IDs: ${finding.cveIds.join(', ')}`);
    if (finding.cweIds.length) contextLines.push(`CWE IDs: ${finding.cweIds.join(', ')}`);
    if (finding.templateName) contextLines.push(`Scanner Template: ${finding.templateName}`);
    if (finding.description) contextLines.push(`\nExisting Description (rough / scanner output):\n${finding.description.substring(0, 800)}`);

    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: NarrativeSchema,
      system: `You are a senior penetration tester writing professional security reports for clients.
Write in clear, formal English. Descriptions should be ready to include in a deliverable report without editing.
Do not include placeholder text, do not reference the tool that found the issue.
Always write in third person (e.g. "The application is vulnerable to..." not "You are vulnerable to...").`,
      prompt: `Generate a professional pentest report narrative for this finding:\n\n${contextLines.join('\n')}`,
    });

    return object;
  }

  // M49 — AI Risk Scoring v2
  async computeAndStoreRiskScoreV2(id: string, orgId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        cvssScore: true,
        epssScore: true,
        kevListed: true,
        dueDate: true,
        duplicateOfId: true,
      },
    });
    if (!finding) throw new Error('Finding not found');

    const slaDaysRemaining = finding.dueDate
      ? Math.floor((finding.dueDate.getTime() - Date.now()) / 86_400_000)
      : null;

    const { score, breakdown } = this.ai.computeRiskScoreV2({
      cvssScore: finding.cvssScore,
      epssScore: finding.epssScore,
      kevListed: (finding as any).kevListed,
      slaDaysRemaining,
      isDuplicate: !!finding.duplicateOfId,
    });

    await this.prisma.finding.update({
      where: { id },
      data: {
        riskScoreV2: score,
        riskScoreV2Breakdown: breakdown as any,
        riskScoreV2At: new Date(),
      },
    });

    return { findingId: id, score, breakdown };
  }
}
