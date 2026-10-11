import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { AiService } from '../ai/ai.service';
import { SCAN_QUEUE, type ScanJobData } from './scan-queue.constants';
import type { CreateScanDto } from './dto/scan.dto';

const RATE_LIMITS: Record<string, number> = { QUICK: 100, FULL: 30, WEB_CRAWL: 0, API_SCAN: 0 };
const DEFAULT_CATEGORIES = ['cves', 'misconfigurations', 'exposures'];

@Injectable()
export class ScansService {
  constructor(
    @InjectQueue(SCAN_QUEUE) private readonly queue: Queue<ScanJobData>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly ai: AiService,
  ) {}

  async create(
    dto: CreateScanDto,
    userId: string,
    orgId: string,
    ip?: string,
    userAgent?: string,
  ) {
    // Verify target exists and belongs to org
    const target = await this.prisma.target.findFirst({
      where: { id: dto.targetId, organizationId: orgId },
    });
    if (!target) throw new NotFoundException('Target not found');

    // Scan gate: only verified targets can be scanned
    if (target.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'Target must be verified before scanning. Complete domain verification first.',
      );
    }

    const scanType = dto.type ?? 'QUICK';
    const rateLimit = RATE_LIMITS[scanType];

    // Encrypt credentials if provided
    let encryptedCredential: string | undefined;
    if (dto.credentialType && dto.credentialValue) {
      encryptedCredential = this.crypto.encrypt(dto.credentialValue);
    }

    // API_SCAN requires an OpenAPI spec
    if (scanType === 'API_SCAN' && !dto.openApiSpec) {
      throw new BadRequestException('API_SCAN requires an openApiSpec (URL or inline YAML/JSON)');
    }

    // Find most recent completed scan on same target for diff engine
    const previousScan = await this.prisma.scan.findFirst({
      where: { targetId: dto.targetId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    // Resolve custom scan policy if provided
    let policy: {
      id: string; nucleiTags: string[]; nucleiSeverities: string[];
      excludedTemplates: string[]; maxDurationSeconds: number; rateLimit: number;
    } | null = null;
    if (dto.policyId) {
      policy = await this.prisma.scanPolicy.findFirst({
        where: { id: dto.policyId, organizationId: orgId },
        select: {
          id: true, nucleiTags: true, nucleiSeverities: true,
          excludedTemplates: true, maxDurationSeconds: true, rateLimit: true,
        },
      });
    }

    const scan = await this.prisma.scan.create({
      data: {
        type: scanType as any,
        templateCategories: dto.templateCategories ?? DEFAULT_CATEGORIES,
        excludePaths: dto.excludePaths ?? [],
        rateLimit: policy?.rateLimit ?? rateLimit ?? 0,
        credentialType: dto.credentialType,
        credentialValue: encryptedCredential,
        openApiSpec: dto.openApiSpec,
        crawlDepth: dto.crawlDepth ?? 5,
        previousScanId: previousScan?.id ?? null,
        policyId: policy?.id ?? null,
        targetId: dto.targetId,
        projectId: target.projectId,
        organizationId: orgId,
        createdById: userId,
      },
    });

    // Enqueue BullMQ job
    const jobData: ScanJobData = {
      scanId: scan.id,
      targetId: target.id,
      targetValue: target.value,
      targetType: target.type,
      projectId: target.projectId,
      organizationId: orgId,
      scanType,
      templateCategories: scan.templateCategories,
      excludePaths: scan.excludePaths,
      rateLimit: scan.rateLimit,
      crawlDepth: scan.crawlDepth,
      openApiSpec: scan.openApiSpec ?? undefined,
      hasCredentials: !!encryptedCredential,
      policyId: policy?.id,
      policyNucleiTags: policy?.nucleiTags,
      policyNucleiSeverities: policy?.nucleiSeverities,
      policyExcludedTemplates: policy?.excludedTemplates,
      policyMaxDurationSeconds: policy?.maxDurationSeconds,
      policyRateLimit: policy?.rateLimit,
    };

    const job = await this.queue.add('run-scan', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    await this.prisma.scan.update({
      where: { id: scan.id },
      data: { bullJobId: job.id?.toString() },
    });

    await this.audit.log({
      action: 'scan.queued',
      userId,
      organizationId: orgId,
      resource: 'scan',
      resourceId: scan.id,
      metadata: { scanType, targetId: dto.targetId, targetValue: target.value },
      ipAddress: ip,
      userAgent,
    });

    return scan;
  }

  async findAll(projectId: string, orgId: string) {
    return this.prisma.scan.findMany({
      where: { projectId, organizationId: orgId },
      include: {
        target: { select: { id: true, value: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { findings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, orgId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id, organizationId: orgId },
      include: {
        target: { select: { id: true, value: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        findings: {
          orderBy: { severity: 'asc' },
          select: {
            id: true, title: true, severity: true, status: true,
            templateId: true, matchedAt: true, createdAt: true,
          },
        },
        _count: { select: { findings: true } },
      },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    // Never expose encrypted credentials via API
    const { credentialValue: _, ...safeScan } = scan;
    return safeScan;
  }

  async cancel(id: string, userId: string, orgId: string, ip?: string, userAgent?: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    if (!['QUEUED', 'RUNNING'].includes(scan.status)) {
      throw new BadRequestException(`Cannot cancel scan with status: ${scan.status}`);
    }

    // Remove from queue if still queued
    if (scan.bullJobId) {
      const job = await this.queue.getJob(scan.bullJobId);
      if (job) await job.remove();
    }

    await this.prisma.scan.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.audit.log({
      action: 'scan.cancelled',
      userId,
      organizationId: orgId,
      resource: 'scan',
      resourceId: id,
      ipAddress: ip,
      userAgent,
    });
  }

  /**
   * Re-scan: create a targeted verification scan after a finding is marked FIXED.
   * Scopes the scan to only the template(s) relevant to the original finding.
   */
  async rescan(
    findingId: string,
    userId: string,
    orgId: string,
    type: 'QUICK' | 'FULL' = 'QUICK',
    ip?: string,
    userAgent?: string,
  ) {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, organizationId: orgId },
      select: {
        id: true,
        targetId: true,
        projectId: true,
        templateId: true,
        status: true,
        target: { select: { verificationStatus: true, value: true, type: true } },
        scan: {
          select: {
            credentialType: true,
            credentialValue: true,
            templateCategories: true,
          },
        },
      },
    });

    if (!finding) throw new NotFoundException('Finding not found');
    if (finding.target.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException('Target must still be verified to re-scan');
    }

    // Scope to the specific template if available, else use the original categories
    const templateCategories = finding.templateId
      ? [finding.templateId]
      : (finding.scan?.templateCategories ?? ['cves', 'misconfigurations', 'exposures']);

    // Carry over original credentials (they're already encrypted)
    const scan = await this.prisma.scan.create({
      data: {
        type,
        templateCategories,
        excludePaths: [],
        rateLimit: type === 'QUICK' ? 100 : 30,
        credentialType: finding.scan?.credentialType,
        credentialValue: finding.scan?.credentialValue,
        targetId: finding.targetId,
        projectId: finding.projectId,
        organizationId: orgId,
        createdById: userId,
      },
    });

    const jobData: ScanJobData = {
      scanId: scan.id,
      targetId: finding.targetId,
      targetValue: finding.target.value,
      targetType: finding.target.type,
      projectId: finding.projectId,
      organizationId: orgId,
      scanType: type,
      templateCategories,
      excludePaths: [],
      rateLimit: scan.rateLimit,
      hasCredentials: !!finding.scan?.credentialValue,
    };

    const job = await this.queue.add('run-scan', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    await this.prisma.scan.update({
      where: { id: scan.id },
      data: { bullJobId: job.id?.toString() },
    });

    // Mark original finding as being re-verified
    await this.prisma.finding.update({
      where: { id: findingId },
      data: { status: 'VERIFIED' },
    });

    await this.audit.log({
      action: 'scan.rescan_queued',
      userId,
      organizationId: orgId,
      resource: 'scan',
      resourceId: scan.id,
      metadata: { findingId, originalFindingTemplate: finding.templateId },
      ipAddress: ip,
      userAgent,
    });

    return scan;
  }

  // ── Scan Diff ─────────────────────────────────────────────────

  async diff(projectId: string, orgId: string, scanAId: string, scanBId: string) {
    const [scanA, scanB] = await Promise.all([
      this.prisma.scan.findFirst({
        where: { id: scanAId, projectId, organizationId: orgId },
        include: {
          target:    { select: { value: true } },
          findings:  { select: { id: true, title: true, severity: true, status: true, owasp: true, cweIds: true, aiRiskScore: true, createdAt: true } },
        },
      }),
      this.prisma.scan.findFirst({
        where: { id: scanBId, projectId, organizationId: orgId },
        include: {
          target:    { select: { value: true } },
          findings:  { select: { id: true, title: true, severity: true, status: true, owasp: true, cweIds: true, aiRiskScore: true, createdAt: true } },
        },
      }),
    ]);

    if (!scanA) throw new NotFoundException(`Scan A (${scanAId}) not found`);
    if (!scanB) throw new NotFoundException(`Scan B (${scanBId}) not found`);

    // Normalise title for matching: lowercase, strip punctuation/whitespace
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Build lookup key: normalised-title + owasp (or just normalised-title)
    const keyOf = (f: { title: string; owasp: string | null }) =>
      `${normalise(f.title)}|${f.owasp ?? ''}`;

    const aKeys = new Map(scanA.findings.map((f) => [keyOf(f), f]));
    const bKeys = new Map(scanB.findings.map((f) => [keyOf(f), f]));

    const newFindings:       typeof scanB.findings = [];
    const recurringFindings: Array<{ scanA: typeof scanA.findings[0]; scanB: typeof scanB.findings[0] }> = [];

    for (const [key, f] of bKeys) {
      if (aKeys.has(key)) {
        recurringFindings.push({ scanA: aKeys.get(key)!, scanB: f });
      } else {
        newFindings.push(f);
      }
    }

    const fixedFindings: typeof scanA.findings = [];
    for (const [key, f] of aKeys) {
      if (!bKeys.has(key)) fixedFindings.push(f);
    }

    const avgRisk = (findings: Array<{ aiRiskScore: number | null }>) => {
      const scored = findings.filter((f) => f.aiRiskScore !== null);
      if (!scored.length) return 0;
      return Math.round(scored.reduce((s, f) => s + (f.aiRiskScore ?? 0), 0) / scored.length);
    };

    const riskA = avgRisk(scanA.findings);
    const riskB = avgRisk(scanB.findings);

    return {
      scanA: { id: scanA.id, type: scanA.type, status: scanA.status, target: scanA.target.value, createdAt: scanA.createdAt, findingCount: scanA.findings.length },
      scanB: { id: scanB.id, type: scanB.type, status: scanB.status, target: scanB.target.value, createdAt: scanB.createdAt, findingCount: scanB.findings.length },
      summary: {
        newCount:       newFindings.length,
        fixedCount:     fixedFindings.length,
        recurringCount: recurringFindings.length,
        riskDelta:      riskB - riskA,
        avgRiskA:       riskA,
        avgRiskB:       riskB,
      },
      new:       newFindings,
      fixed:     fixedFindings,
      recurring: recurringFindings.map((r) => ({ ...r.scanB, prevStatus: r.scanA.status })),
    };
  }

  async getQueue(orgId: string) {
    return this.prisma.scan.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        createdAt: true,
        startedAt: true,
        target: { select: { id: true, value: true, type: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Called by internal scanner callback endpoint
  async getDecryptedCredentials(scanId: string, orgId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, organizationId: orgId },
      select: { credentialType: true, credentialValue: true },
    });
    if (!scan || !scan.credentialValue) return null;
    return {
      type: scan.credentialType,
      value: this.crypto.decrypt(scan.credentialValue),
    };
  }

  async suggestScope(projectId: string, orgId: string): Promise<{
    categories: string[];
    reasoning: string;
  }> {
    const [project, assets, recentFindings] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { name: true, description: true },
      }),
      this.prisma.asset.findMany({
        where: { projectId, organizationId: orgId },
        select: { type: true, httpServer: true, httpTitle: true, technologies: true },
        take: 20,
      }),
      this.prisma.finding.findMany({
        where: { projectId, organizationId: orgId },
        select: { templateId: true, severity: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const techStack = [...new Set(assets.flatMap((a) => a.technologies))].filter(Boolean);
    const servers = [...new Set(assets.map((a) => a.httpServer).filter(Boolean))];
    const templateIds = [...new Set(recentFindings.map((f) => f.templateId).filter(Boolean))];

    const context = [
      project ? `Project: ${project.name}` : '',
      techStack.length ? `Technologies: ${techStack.slice(0, 15).join(', ')}` : '',
      servers.length ? `Servers: ${servers.slice(0, 5).join(', ')}` : '',
      templateIds.length ? `Previous finding templates: ${templateIds.slice(0, 10).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const { z } = await import('zod');
    const { generateObject } = await import('ai');
    const { createAnthropic } = await import('@ai-sdk/anthropic');

    const anthropic = createAnthropic({ apiKey: this.ai['config'].getOrThrow('ANTHROPIC_API_KEY') });

    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: z.object({
        categories: z
          .array(z.enum(['cves', 'misconfigurations', 'exposures', 'technologies', 'vulnerabilities']))
          .describe('Recommended Nuclei template categories for this target'),
        reasoning: z
          .string()
          .describe('Brief (1-2 sentence) explanation of why these categories are recommended'),
      }),
      system:
        'You are a penetration testing expert. Recommend Nuclei template categories based on the target tech stack and context. ' +
        'Available categories: cves (known CVEs), misconfigurations (server/app misconfig), exposures (sensitive data leaks), ' +
        'technologies (fingerprinting), vulnerabilities (generic XSS, SQLi, SSRF etc.).',
      prompt: `Recommend scan categories for this target:\n\n${context || 'No prior data — recommend a standard comprehensive set.'}`,
    });

    return object;
  }
}
