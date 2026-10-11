import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FindingsService } from './findings.service';

export interface ImportedFinding {
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  cvssScore?: number;
  cweIds?: string[];
  cveIds?: string[];
  httpRequest?: string;
  httpResponse?: string;
  matchedAt?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  findingIds: string[];
}

const SEV_MAP: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  moderate: 'MEDIUM',
  low: 'LOW',
  informational: 'INFO',
  info: 'INFO',
  information: 'INFO',
};

function normalizeSeverity(raw: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  return SEV_MAP[raw?.toLowerCase()?.trim()] ?? 'INFO';
}

@Injectable()
export class FindingsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly findingsService: FindingsService,
  ) {}

  // ─── Burp Suite XML Parser ───────────────────────────────────────────────────

  parseBurpXml(xml: string): ImportedFinding[] {
    const findings: ImportedFinding[] = [];

    // Extract <issue> blocks
    const issueBlocks = [...xml.matchAll(/<issue>([\s\S]*?)<\/issue>/gi)];

    for (const [, block] of issueBlocks) {
      const get = (tag: string) =>
        block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))?.[1]?.trim() ??
        block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';

      const title = get('name') || get('issuename') || get('issue_name');
      const description = get('issuedetail') || get('detail') || get('description');
      const rawSeverity = get('severity');
      const confidence = get('confidence');
      const url = get('url') || get('host');
      const request = get('request');
      const response = get('response');
      const remediationDetail = get('remediationdetail') || get('remediation');

      if (!title) continue;

      findings.push({
        title,
        description: [description, remediationDetail ? `\n\n**Remediation:** ${remediationDetail}` : ''].join('').trim(),
        severity: normalizeSeverity(rawSeverity),
        matchedAt: url || undefined,
        httpRequest: request ? Buffer.from(request, 'base64').toString('utf-8').substring(0, 8192) : undefined,
        httpResponse: response ? Buffer.from(response, 'base64').toString('utf-8').substring(0, 8192) : undefined,
      });
    }

    return findings;
  }

  // ─── OWASP ZAP JSON Parser ───────────────────────────────────────────────────

  parseZapJson(json: unknown): ImportedFinding[] {
    const findings: ImportedFinding[] = [];

    const root = json as Record<string, unknown>;
    const site = (root['site'] as unknown[]) ?? (root['OWASPZAPReport'] as Record<string, unknown>)?.['site'] as unknown[];
    const sites = Array.isArray(site) ? site : site ? [site] : [];

    for (const s of sites) {
      const siteObj = s as Record<string, unknown>;
      const alerts = (siteObj['alerts'] as unknown[]) ?? [];
      for (const alert of alerts) {
        const a = alert as Record<string, unknown>;
        const instances = (a['instances'] as unknown[]) ?? [];
        const firstInstance = (instances[0] as Record<string, unknown>) ?? {};

        const title = String(a['alert'] ?? a['name'] ?? '');
        if (!title) continue;

        const cweId = a['cweid'] ? `CWE-${a['cweid']}` : undefined;
        const cvssScore = a['riskcode'] != null ? (Number(a['riskcode']) / 3) * 10 : undefined;

        findings.push({
          title,
          description: [
            a['desc'] ? String(a['desc']).replace(/<[^>]*>/g, '') : '',
            a['solution'] ? `\n\n**Solution:** ${String(a['solution']).replace(/<[^>]*>/g, '')}` : '',
            a['reference'] ? `\n\n**Reference:** ${String(a['reference']).replace(/<[^>]*>/g, '')}` : '',
          ].join('').trim(),
          severity: normalizeSeverity(
            a['riskdesc'] ? String(a['riskdesc']).split(' ')[0] : String(a['risk'] ?? ''),
          ),
          cvssScore: cvssScore && isFinite(cvssScore) ? Math.round(cvssScore * 10) / 10 : undefined,
          cweIds: cweId ? [cweId] : [],
          matchedAt: String(firstInstance['uri'] ?? a['url'] ?? ''),
        });
      }
    }

    return findings;
  }

  // ─── Generic JSON (PTaaS export format) ─────────────────────────────────────

  parseGenericJson(json: unknown): ImportedFinding[] {
    const arr = Array.isArray(json) ? json : (json as Record<string, unknown[]>)?.['findings'] ?? [];
    return (arr as Record<string, unknown>[]).map((f) => ({
      title: String(f['title'] ?? f['name'] ?? 'Untitled'),
      description: String(f['description'] ?? f['detail'] ?? ''),
      severity: normalizeSeverity(String(f['severity'] ?? 'info')),
      cvssScore: f['cvssScore'] != null ? Number(f['cvssScore']) : undefined,
      cveIds: Array.isArray(f['cveIds']) ? f['cveIds'].map(String) : [],
      cweIds: Array.isArray(f['cweIds']) ? f['cweIds'].map(String) : [],
      matchedAt: f['matchedAt'] ? String(f['matchedAt']) : undefined,
      httpRequest: f['httpRequest'] ? String(f['httpRequest']) : undefined,
      httpResponse: f['httpResponse'] ? String(f['httpResponse']) : undefined,
    }));
  }

  // ─── Persist ─────────────────────────────────────────────────────────────────

  async importFindings(
    parsed: ImportedFinding[],
    projectId: string,
    targetId: string,
    orgId: string,
    userId: string,
    deduplication: boolean,
  ): Promise<ImportResult> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
    if (!project) throw new NotFoundException('Project not found');

    const target = await this.prisma.target.findFirst({ where: { id: targetId, projectId, organizationId: orgId } });
    if (!target) throw new NotFoundException('Target not found');

    // Create a synthetic "import" scan record
    const scan = await this.prisma.scan.create({
      data: {
        type: 'QUICK',
        status: 'COMPLETED',
        templateCategories: ['import'],
        excludePaths: [],
        rateLimit: 0,
        targetId,
        projectId,
        organizationId: orgId,
        createdById: userId,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const result: ImportResult = { imported: 0, skipped: 0, errors: [], findingIds: [] };
    const existingTitles = new Set<string>();

    if (deduplication) {
      const existing = await this.prisma.finding.findMany({
        where: { targetId, organizationId: orgId },
        select: { title: true },
      });
      existing.forEach((f) => existingTitles.add(f.title.toLowerCase()));
    }

    for (const f of parsed) {
      if (!f.title?.trim()) { result.skipped++; continue; }

      if (deduplication && existingTitles.has(f.title.toLowerCase())) {
        result.skipped++;
        continue;
      }

      try {
        const finding = await this.prisma.finding.create({
          data: {
            title: f.title.substring(0, 500),
            description: f.description?.substring(0, 10000) ?? null,
            severity: f.severity,
            status: 'OPEN',
            cvssScore: f.cvssScore ?? null,
            cveIds: f.cveIds ?? [],
            cweIds: f.cweIds ?? [],
            matchedAt: f.matchedAt?.substring(0, 500) ?? null,
            httpRequest: f.httpRequest?.substring(0, 8192) ?? null,
            httpResponse: f.httpResponse?.substring(0, 8192) ?? null,
            scanId: scan.id,
            targetId,
            projectId,
            organizationId: orgId,
            createdById: userId,
          },
        });
        result.imported++;
        result.findingIds.push(finding.id);
        existingTitles.add(f.title.toLowerCase());
      } catch (err) {
        result.errors.push(`Failed to import "${f.title}": ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    await this.audit.log({
      action: 'findings.imported',
      userId,
      metadata: {
        projectId, targetId, scanId: scan.id,
        imported: result.imported, skipped: result.skipped,
      },
    });

    // Fire AI analysis for imported findings
    if (result.findingIds.length > 0) {
      this.findingsService.triggerAiAnalysis(result.findingIds).catch(() => {});
    }

    return result;
  }
}
