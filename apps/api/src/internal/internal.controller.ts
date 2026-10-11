import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Prisma } from '@ptaas/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScansService } from '../scans/scans.service';
import { MinioService, BUCKET_EVIDENCE } from '../minio/minio.service';
import { FindingsService } from '../findings/findings.service';
import { AsmService, IngestAssetDto } from '../asm/asm.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { DiffService } from '../monitoring/diff.service';
import { resolveOwaspCategory } from '../compliance/compliance.maps';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { RetestService } from '../retest/retest.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';

interface FindingPayload {
  templateId: string;
  templateName: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  matchedAt: string;
  httpRequest?: string;
  httpResponse?: string;
  cvssScore?: number;
  cvssVector?: string;
  cveIds?: string[];
  cweIds?: string[];
  nucleiOutput: Record<string, unknown>;
}

interface ProgressPayload {
  status?: 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  totalTemplates?: number;
  currentActivity?: string;
  errorMessage?: string;
  findingsCount?: number;
}

/**
 * Internal-only endpoints consumed by the Python scanner worker.
 * Protected by SCANNER_API_KEY (pre-shared secret, never exposed publicly).
 * Not included in Swagger docs.
 *
 * Network-level protection: these routes only reachable from scanner_bridge network.
 */
@ApiExcludeController()
@Controller('internal')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scansService: ScansService,
    private readonly minio: MinioService,
    private readonly findingsService: FindingsService,
    private readonly asmService: AsmService,
    private readonly integrations: IntegrationsService,
    private readonly diff: DiffService,
    private readonly enrichment: EnrichmentService,
    private readonly retestService: RetestService,
    private readonly notificationsService: NotificationsService,
    private readonly aiService: AiService,
  ) {}

  private verifyApiKey(apiKey: string | undefined): void {
    const expected = this.config.getOrThrow<string>('SCANNER_API_KEY');
    if (!apiKey || apiKey !== expected) {
      throw new ForbiddenException('Invalid scanner API key');
    }
  }

  /** GET /api/v1/internal/scans/:scanId/credentials */
  @Get('scans/:scanId/credentials')
  async getCredentials(
    @Param('scanId') scanId: string,
    @Headers('x-scanner-api-key') apiKey: string,
  ) {
    this.verifyApiKey(apiKey);

    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      select: { organizationId: true, credentialValue: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');

    const credentials = await this.scansService.getDecryptedCredentials(
      scanId,
      scan.organizationId,
    );

    return { credentials };
  }

  /** POST /api/v1/internal/scans/:scanId/progress */
  @Post('scans/:scanId/progress')
  async updateProgress(
    @Param('scanId') scanId: string,
    @Headers('x-scanner-api-key') apiKey: string,
    @Body() body: ProgressPayload,
  ) {
    this.verifyApiKey(apiKey);

    const now = new Date();
    const data: Record<string, unknown> = {};

    if (body.status) data.status = body.status;
    if (body.progress !== undefined) data.progress = body.progress;
    if (body.totalTemplates !== undefined) data.totalTemplates = body.totalTemplates;
    if (body.currentActivity !== undefined) data.currentActivity = body.currentActivity;
    if (body.errorMessage !== undefined) data.errorMessage = body.errorMessage;

    if (body.status === 'RUNNING') data.startedAt = now;
    if (body.status === 'COMPLETED' || body.status === 'FAILED') data.completedAt = now;

    const scan = await this.prisma.scan.update({
      where: { id: scanId },
      data,
      select: {
        organizationId: true,
        targetId: true,
        previousScanId: true,
        target: { select: { value: true } },
      },
    });

    if (body.status === 'COMPLETED') {
      // Run diff against previous scan (fire-and-forget, non-blocking)
      this.diff
        .computeDiff(scanId, scan.previousScanId ?? null)
        .then(() => this.diff.getNewFindings(scanId))
        .then((newFindings) => {
          // Notify integrations for each new finding surfaced by diff
          for (const finding of newFindings) {
            const findingPayload = {
              id: finding.id,
              projectId: finding.projectId,
              scanId,
              title: finding.title,
              severity: finding.severity,
              matchedAt: finding.matchedAt,
              cvssScore: finding.cvssScore,
              cveIds: finding.cveIds,
              diffStatus: 'NEW',
            };
            this.integrations
              .notify('finding.created', scan.organizationId, findingPayload)
              .catch((err) => this.logger.error('Integration notify (diff) failed', err));
            // Also fire finding.critical for CRITICAL severity
            if (finding.severity === 'CRITICAL') {
              this.integrations
                .notify('finding.critical', scan.organizationId, findingPayload)
                .catch((err) => this.logger.error('Integration notify (critical) failed', err));
            }
          }
        })
        .catch((err) => this.logger.error('Diff computation failed', err));
    }

    // Fire CVE enrichment after scan completes (fire-and-forget)
    if (body.status === 'COMPLETED') {
      this.enrichment.enrichScan(scanId)
        .catch((err) => this.logger.warn('Enrichment failed for scan', err));
    }

    // Handle retest completion (fire-and-forget)
    if (body.status === 'COMPLETED' || body.status === 'FAILED') {
      this.retestService
        .handleRetestCompletion(scanId, [])
        .catch((err) => this.logger.warn('Retest completion handler failed', err));
    }

    // Notify scan creator on completion/failure (fire-and-forget)
    if (body.status === 'COMPLETED' || body.status === 'FAILED') {
      this.prisma.scan.findUnique({
        where: { id: scanId },
        select: { createdById: true, organizationId: true, projectId: true, type: true },
      }).then(async (s) => {
        if (!s) return;
        const type = body.status === 'COMPLETED' ? 'scan.completed' : 'scan.completed';
        const title = body.status === 'COMPLETED'
          ? `Scan completed — ${body.findingsCount ?? 0} finding${body.findingsCount !== 1 ? 's' : ''} found`
          : `Scan failed${body.errorMessage ? `: ${body.errorMessage.slice(0, 80)}` : ''}`;
        await this.notificationsService.create({
          type: type as any,
          title,
          body: `Scan type: ${s.type}`,
          link: `/projects/${s.projectId}/scans/${scanId}`,
          userId: s.createdById,
          orgId: s.organizationId,
        });
      }).catch(() => null);
    }

    if (body.status === 'COMPLETED' || body.status === 'FAILED') {
      const event = body.status === 'COMPLETED' ? 'scan.completed' : ('scan.failed' as const);
      this.integrations
        .notify(event, scan.organizationId, {
          scanId,
          targetValue: scan.target?.value,
          findingsCount: body.findingsCount,
          errorMessage: body.errorMessage,
        })
        .catch((err) => this.logger.error('Integration scan notify failed', err));
    }

    return { ok: true };
  }

  /** POST /api/v1/internal/scans/:scanId/findings */
  @Post('scans/:scanId/findings')
  async ingestFindings(
    @Param('scanId') scanId: string,
    @Headers('x-scanner-api-key') apiKey: string,
    @Body() body: { findings: FindingPayload[] },
  ) {
    this.verifyApiKey(apiKey);

    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      select: { targetId: true, projectId: true, organizationId: true, createdById: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');

    const { targetId, projectId, organizationId } = scan;

    // Create findings in DB
    const findingData = body.findings.map((f) => ({
      title: f.title,
      severity: f.severity,
      templateId: f.templateId,
      templateName: f.templateName,
      matchedAt: f.matchedAt,
      // Truncated in DB — full evidence uploaded to MinIO below
      httpRequest: f.httpRequest?.substring(0, 8192),
      httpResponse: f.httpResponse?.substring(0, 8192),
      cvssScore: f.cvssScore,
      cvssVector: f.cvssVector,
      cveIds: f.cveIds ?? [],
      cweIds: f.cweIds ?? [],
      nucleiOutput: f.nucleiOutput as unknown as Prisma.InputJsonValue,
      owasp: resolveOwaspCategory({ cweIds: f.cweIds, templateName: f.templateName }),
      scanId,
      targetId,
      projectId,
      organizationId,
      createdById: scan.createdById,
    }));

    // createMany doesn't return IDs — use transaction for evidence upload
    const created = await this.prisma.$transaction(
      findingData.map((d) => this.prisma.finding.create({ data: d })),
    );

    // M38: AI Deduplication — check pgvector similarity against open findings
    // Runs fire-and-forget after ingest so it doesn't block the scanner response
    this.deduplicateFindings(created.map((f) => f.id), projectId, organizationId)
      .catch((err) => this.logger.warn('Deduplication check failed', err));

    // M50: Auto-prioritize new findings with Risk Score v2 (fire-and-forget)
    this.autoPrioritize(created.map((f) => f.id), organizationId)
      .catch((err) => this.logger.warn('Auto-prioritization failed', err));

    // Upload full evidence to MinIO (fire-and-forget)
    this.uploadEvidence(scanId, created, body.findings).catch((err) =>
      this.logger.error('Evidence upload failed', err),
    );

    // Trigger AI analysis asynchronously (fire-and-forget)
    this.findingsService
      .triggerAiAnalysis(created.map((f) => f.id))
      .catch((err) => this.logger.error('AI analysis trigger failed', err));

    // Notify integrations for each new finding (fire-and-forget)
    for (const finding of created) {
      const fp = {
        id: finding.id,
        projectId: finding.projectId,
        scanId,
        title: finding.title,
        severity: finding.severity,
        matchedAt: finding.matchedAt,
        cvssScore: finding.cvssScore,
        cveIds: finding.cveIds,
      };
      this.integrations
        .notify('finding.created', organizationId, fp)
        .catch((err) => this.logger.error('Integration notify failed', err));
      if (finding.severity === 'CRITICAL') {
        this.integrations
          .notify('finding.critical', organizationId, fp)
          .catch((err) => this.logger.error('Integration notify (critical) failed', err));
      }
    }

    // Notify on critical findings
    const criticals = created.filter((f) => f.severity === 'CRITICAL');
    if (criticals.length > 0) {
      this.logger.warn(`CRITICAL findings: ${criticals.length} in scan ${scanId}`);
      this.prisma.scan.findUnique({
        where: { id: scanId },
        select: { createdById: true, organizationId: true, projectId: true },
      }).then(async (s) => {
        if (!s) return;
        for (const f of criticals) {
          await this.notificationsService.create({
            type: 'finding.critical',
            title: `Critical: ${f.title}`,
            body: f.matchedAt ? `Found at ${f.matchedAt}` : undefined,
            link: `/projects/${s.projectId}/findings/${f.id}`,
            userId: s.createdById,
            orgId: s.organizationId,
          });
        }
      }).catch(() => null);
    }

    this.logger.log(`Ingested ${created.length} findings for scan ${scanId}`);

    await this.audit.log({
      action: 'scan.findings_ingested',
      organizationId,
      resource: 'scan',
      resourceId: scanId,
      metadata: {
        count: created.length,
        critical: criticals.length,
        high: created.filter((f) => f.severity === 'HIGH').length,
      },
    });

    return { ingested: created.length };
  }

  /** POST /api/v1/internal/strategies/:strategyId/result — called by Python strategy worker */
  @Post('strategies/:strategyId/result')
  async strategyResult(
    @Param('strategyId') strategyId: string,
    @Headers('x-scanner-api-key') apiKey: string,
    @Body() body: { status: 'COMPLETED' | 'FAILED'; fingerprint?: object; plan?: object[]; reasoning?: string; errorMessage?: string },
  ) {
    this.verifyApiKey(apiKey);

    await this.prisma.scanStrategy.update({
      where: { id: strategyId },
      data: {
        status: body.status,
        fingerprint: body.fingerprint as any,
        plan: (body.plan ?? []) as any,
        reasoning: body.reasoning,
        errorMessage: body.errorMessage,
        completedAt: new Date(),
      },
    });

    this.logger.log(`Strategy ${strategyId} → ${body.status}`);
    return { ok: true };
  }

  /** POST /api/v1/internal/asm/:asmScanId/progress */
  @Post('asm/:asmScanId/progress')
  async asmProgress(
    @Param('asmScanId') asmScanId: string,
    @Headers('x-scanner-api-key') apiKey: string,
    @Body() body: { status: string; assetsFound?: number },
  ) {
    this.verifyApiKey(apiKey);
    return this.asmService.updateScanStatus(asmScanId, body.status, body.assetsFound);
  }

  /** POST /api/v1/internal/asm/:asmScanId/assets — batch ingest discovered assets */
  @Post('asm/:asmScanId/assets')
  async asmAssets(
    @Param('asmScanId') asmScanId: string,
    @Headers('x-scanner-api-key') apiKey: string,
    @Body() body: { assets: IngestAssetDto[] },
  ) {
    this.verifyApiKey(apiKey);
    await this.asmService.ingestAssets(asmScanId, body.assets);
    return { ingested: body.assets.length };
  }

  private async autoPrioritize(findingIds: string[], orgId: string) {
    const findings = await this.prisma.finding.findMany({
      where: { id: { in: findingIds }, organizationId: orgId },
      select: { id: true, cvssScore: true, epssScore: true, kevListed: true, dueDate: true, duplicateOfId: true },
    });

    const updates = findings.map((f) => {
      const slaDaysRemaining = f.dueDate
        ? Math.floor((f.dueDate.getTime() - Date.now()) / 86_400_000)
        : null;
      const { score, breakdown } = this.aiService.computeRiskScoreV2({
        cvssScore: f.cvssScore,
        epssScore: f.epssScore,
        kevListed: (f as any).kevListed,
        slaDaysRemaining,
        isDuplicate: !!f.duplicateOfId,
      });
      return this.prisma.finding.update({
        where: { id: f.id },
        data: { riskScoreV2: score, riskScoreV2Breakdown: breakdown as any, riskScoreV2At: new Date() },
      });
    });

    await this.prisma.$transaction(updates);
    this.logger.log(`Auto-prioritized ${findings.length} findings with Risk Score v2`);
  }

  private async deduplicateFindings(newIds: string[], projectId: string, orgId: string) {
    // Title-based deduplication: same title + same severity → mark as duplicate
    // pgvector embedding similarity is ideal but requires stored embeddings;
    // title-hash approach covers the common case (repeated scans, same template)
    const newFindings = await this.prisma.finding.findMany({
      where: { id: { in: newIds } },
      select: { id: true, title: true, severity: true, templateId: true },
    });

    const existingOpen = await this.prisma.finding.findMany({
      where: {
        projectId,
        organizationId: orgId,
        id: { notIn: newIds },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        duplicateOfId: null,
      },
      select: { id: true, title: true, severity: true, templateId: true },
    });

    const toMark: Array<{ id: string; duplicateOfId: string }> = [];

    for (const nf of newFindings) {
      const existing = existingOpen.find(
        (e) => e.title === nf.title && e.severity === nf.severity && e.templateId === nf.templateId,
      );
      if (existing) {
        toMark.push({ id: nf.id, duplicateOfId: existing.id });
      }
    }

    if (toMark.length > 0) {
      await this.prisma.$transaction(
        toMark.map(({ id, duplicateOfId }) =>
          this.prisma.finding.update({ where: { id }, data: { duplicateOfId, status: 'CLOSED' } }),
        ),
      );
      this.logger.log(`Dedup: marked ${toMark.length} findings as duplicates in project ${projectId}`);
    }
  }

  private async uploadEvidence(
    scanId: string,
    findings: Array<{ id: string }>,
    payloads: FindingPayload[],
  ) {
    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      const payload = payloads[i];

      if (!payload.httpRequest && !payload.httpResponse) continue;

      const key = this.minio.evidenceKey(scanId, finding.id);
      const evidence = JSON.stringify({
        findingId: finding.id,
        scanId,
        templateId: payload.templateId,
        matchedAt: payload.matchedAt,
        httpRequest: payload.httpRequest ?? null,
        httpResponse: payload.httpResponse ?? null,
        capturedAt: new Date().toISOString(),
      });

      await this.minio.putObject(BUCKET_EVIDENCE, key, evidence);
    }
  }
}
