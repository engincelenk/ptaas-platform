import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RETENTION_QUEUE, RETENTION_MS } from './retention.constants';

/**
 * DSGVO Löschfristen-Cron (ISO-DEV-03).
 * Runs daily at 02:00 UTC and deletes records past their retention period.
 *
 * Retention periods:
 *   Findings   → 24 months (count by AI flag as sensitive)
 *   Evidence   → 12 months (HTTP request/response data in DB columns)
 *   Audit Logs → 36 months
 */
@Processor(RETENTION_QUEUE, { concurrency: 1 })
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('Running DSGVO retention cleanup');
    const now = Date.now();

    // 1. Delete findings older than 24 months
    const findingCutoff = new Date(now - RETENTION_MS.findings);
    const deletedFindings = await this.prisma.finding.deleteMany({
      where: { createdAt: { lt: findingCutoff } },
    });

    // 2. Nullify HTTP evidence in findings older than 12 months (keep metadata)
    const evidenceCutoff = new Date(now - RETENTION_MS.evidence);
    const clearedEvidence = await this.prisma.finding.updateMany({
      where: {
        createdAt: { lt: evidenceCutoff },
        OR: [{ httpRequest: { not: null } }, { httpResponse: { not: null } }],
      },
      data: { httpRequest: null, httpResponse: null },
    });

    // 3. Delete audit logs older than 36 months
    const auditCutoff = new Date(now - RETENTION_MS.auditLogs);
    const deletedAudit = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    });

    const summary = {
      findingsDeleted: deletedFindings.count,
      evidenceCleared: clearedEvidence.count,
      auditLogsDeleted: deletedAudit.count,
      ranAt: new Date().toISOString(),
    };

    this.logger.log('Retention cleanup complete', summary);

    await this.audit.log({
      action: 'retention.cleanup_completed',
      metadata: summary,
    });
  }
}
