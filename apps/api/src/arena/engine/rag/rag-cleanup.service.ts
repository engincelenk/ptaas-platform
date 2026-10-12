import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@ptaas/db';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiTargetsService } from '../../lifecycle/ai-targets.service';
import { buildAuthHeaders } from '../adapters/auth-headers';
import { RecommendationService } from '../recommendation.service';
import { TargetUnsafeError } from '../run-control';
import { RagArtifactDoc, isOpenDoc, readRagDocs } from './rag-artifacts';
import { parseRagConfig, RagConfig } from './rag-config';
import { RagDoc, RagHttpContext, RagOperationError, RagPlanter } from './rag-planter';

export interface RagCleanupResult {
  open: number;
  deleted: number;
  failed: number;
}

/** Error code for a failed delete attempt. Never contains document content or customer response text. */
export function deleteErrorCode(err: unknown): string {
  return err instanceof RagOperationError ? err.code : err instanceof TargetUnsafeError ? 'unsafe_url' : 'error';
}

/**
 * After-the-fact cleanup of planted RAG test documents of a run that is no longer being executed
 * (crashed/stalled worker, BullMQ redelivery). Used by the retention reaper and by `execute()`.
 * Documents whose id is unknown are never reported as deleted: they are reported to the customer by topic marker.
 */
@Injectable()
export class RagCleanupService {
  private readonly log = new Logger(RagCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planter: RagPlanter,
    private readonly aiTargets: AiTargetsService,
    private readonly audit: AuditService,
    private readonly recommendations: RecommendationService,
  ) {}

  async cleanupRun(runId: string, organizationId: string): Promise<RagCleanupResult> {
    const run = await this.prisma.arenaRun.findFirst({
      where: { id: runId, organizationId },
      include: { aiTarget: { include: { target: true } } },
    });
    const result: RagCleanupResult = { open: 0, deleted: 0, failed: 0 };
    if (!run) return result;
    const all = readRagDocs(run.artifacts);
    const open = all.filter(isOpenDoc);
    result.open = open.length;
    if (open.length === 0) return result;

    // Re-check the config: only an AUTO target with a delete endpoint can be cleaned automatically.
    const parsed = parseRagConfig(run.aiTarget.ragConfig);
    const config: RagConfig | null = parsed.ok && parsed.config.mode === 'AUTO' && parsed.config.delete ? parsed.config : null;
    let ctx: RagHttpContext | null = null;
    if (config && run.aiTarget.organizationId === organizationId && run.aiTarget.target.organizationId === organizationId) {
      try {
        const secrets = await this.aiTargets.getSecrets(run.aiTargetId, organizationId);
        ctx = {
          endpointUrl: run.aiTarget.target.value,
          headers: buildAuthHeaders(run.aiTarget.authHeaderName, secrets.apiKey, 'Authorization', true),
          beforeRequest: async () => undefined, // maintenance: not part of any run budget
        };
      } catch (err) {
        this.log.warn(`RAG cleanup: could not prepare credentials: ${deleteErrorCode(err)}`);
      }
    }

    const updated = new Map<string, RagArtifactDoc>();
    for (const d of open) {
      const doc: RagDoc = {
        goalId: '',
        goalKey: '',
        docId: d.docId,
        docIdSource: d.docIdSource,
        nonce: d.nonce,
        tokens: { nonce: d.nonce, canary: '' },
        topic: d.topic,
        topicPhrase: '',
        content: '',
      };
      try {
        if (!config || !ctx) throw new RagOperationError('no_delete_configured');
        await this.planter.remove(ctx, config, doc);
        updated.set(key(d), { ...d, status: 'deleted', deletedAt: new Date().toISOString() });
        result.deleted++;
      } catch (err) {
        updated.set(key(d), { ...d, status: 'delete_failed', deleteError: deleteErrorCode(err) });
        result.failed++;
      }
    }

    const merged = all.map((d) => updated.get(key(d)) ?? d);
    const artifacts = { ...(asRecord(run.artifacts) ?? {}), rag: { docs: merged } };
    await this.prisma.arenaRun.updateMany({
      where: { id: runId, organizationId },
      data: { artifacts: artifacts as unknown as Prisma.InputJsonValue },
    });

    if (result.failed > 0) await this.reportFailures(runId, organizationId, run.createdById, [...updated.values()].filter((d) => d.deleteError));
    return result;
  }

  private async reportFailures(runId: string, organizationId: string, userId: string, failed: RagArtifactDoc[]): Promise<void> {
    const topics = failed.map((d) => d.topic).filter(Boolean);
    try {
      await this.recommendations.createWarning(runId, organizationId, {
        category: 'INDIRECT_INJECTION',
        title: 'Testdokumente konnten nicht entfernt werden',
        text: `PTaaS konnte ${failed.length} eingespielte Testdokument(e) nicht automatisch loeschen. Bitte suche im Index nach den Markern ${topics.join(', ')} (Dokument-IDs: ${failed.map((d) => d.docId).join(', ')}) und entferne die Dokumente manuell. Sie sind harmlos, enthalten aber eine versteckte Marker-Anweisung.`,
        priority: 1,
      });
    } catch (err) {
      this.log.error(`cleanup warning failed: ${deleteErrorCode(err)}`);
    }
    try {
      await this.audit.logStrict({
        action: 'arena.rag.cleanup_failed',
        userId,
        organizationId,
        resource: 'arena_run',
        resourceId: runId,
        // Topic markers, ids and error codes only — never document text.
        metadata: { count: failed.length, topics, docIds: failed.map((d) => d.docId), errors: failed.map((d) => d.deleteError) },
      });
    } catch (err) {
      this.log.error(`audit write failed for RAG cleanup: ${deleteErrorCode(err)}`);
    }
  }
}

function key(d: RagArtifactDoc): string {
  return `${d.nonce}|${d.docId}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
