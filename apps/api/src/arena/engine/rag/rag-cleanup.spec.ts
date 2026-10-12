import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../audit/audit.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AiTargetsService } from '../../lifecycle/ai-targets.service';
import type { RecommendationService } from '../recommendation.service';
import { RagCleanupService, deleteErrorCode } from './rag-cleanup.service';
import { RagOperationError, RagPlanter } from './rag-planter';
import { TargetUnsafeError } from '../run-control';
import { hasProgress, isOpenDoc, readRagDocs } from './rag-artifacts';
import type { SafeHttpService, SafeRequestOptions } from '../../../ssrf/safe-http.service';

const ORG = 'org-1';
const RAG_AUTO = {
  mode: 'AUTO',
  ingest: { url: 'https://bot.example.com/docs', method: 'POST', bodyTemplate: { text: '{{content}}' } },
  delete: { url: 'https://bot.example.com/docs/{{docId}}', method: 'DELETE' },
};

interface Row {
  [k: string]: unknown;
}

function setup(opts: { docs: Row[]; ragConfig?: unknown; status?: number; secretsFail?: boolean; org?: string; extraArtifacts?: Row }) {
  const calls: Array<{ url: string; opts: SafeRequestOptions }> = [];
  const request = vi.fn(async (url: string, o: SafeRequestOptions = {}) => {
    calls.push({ url, opts: o });
    return { status: opts.status ?? 200, headers: {}, body: '{}', truncated: false };
  });
  const run = {
    id: 'run-1',
    organizationId: ORG,
    aiTargetId: 'ait-1',
    createdById: 'u1',
    artifacts: { ...(opts.extraArtifacts ?? {}), rag: { docs: opts.docs } },
    aiTarget: {
      organizationId: opts.org ?? ORG,
      authHeaderName: 'Authorization',
      ragConfig: 'ragConfig' in opts ? opts.ragConfig : RAG_AUTO,
      target: { organizationId: opts.org ?? ORG, value: 'https://bot.example.com/chat' },
    },
  };
  const wheres: Row[] = [];
  const updates: Row[] = [];
  const prisma = {
    arenaRun: {
      findFirst: vi.fn(async (a: { where: Row }) => {
        wheres.push(a.where);
        return a.where.organizationId === ORG && a.where.id === 'run-1' ? run : null;
      }),
      updateMany: vi.fn(async (a: { where: Row; data: Row }) => {
        wheres.push(a.where);
        updates.push(a.data);
        return { count: 1 };
      }),
    },
  } as unknown as PrismaService;
  const aiTargets = {
    getSecrets: vi.fn(async () => {
      if (opts.secretsFail) throw new Error('no secrets');
      return { apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456' };
    }),
  } as unknown as AiTargetsService;
  const audit = { logStrict: vi.fn(async (_e: Row) => undefined) };
  const recs = { createWarning: vi.fn(async (_r: string, _o: string, _w: Row) => ({})) };
  const planter = new RagPlanter({ request } as unknown as SafeHttpService);
  const svc = new RagCleanupService(prisma, planter, aiTargets, audit as unknown as AuditService, recs as unknown as RecommendationService);
  return { svc, calls, request, updates, wheres, audit, recs };
}

const doc = (over: Row = {}): Row => ({
  docId: 'ptaas-aaaaaaaaaa',
  docIdSource: 'local',
  nonce: 'aaaaaaaaaa',
  topic: 'PTAAS-TOPIC-aaaaaaaaaa',
  plannedAt: '2026-10-13T10:00:00.000Z',
  status: 'planted',
  plantedAt: '2026-10-13T10:00:01.000Z',
  ...over,
});

describe('rag artifacts helpers', () => {
  it('reads old and new document shapes; only planned/planted documents without result are open', () => {
    const docs = readRagDocs({
      rag: { docs: [doc(), doc({ status: 'planned', plantedAt: undefined }), doc({ status: 'deleted', deletedAt: 'x' }), doc({ status: 'delete_failed', deleteError: 'http_500' }), { docId: 'old', plantedAt: 'x' }, 'junk'] },
    });
    expect(docs).toHaveLength(5);
    expect(docs.map(isOpenDoc)).toEqual([true, true, false, false, true]);
    expect(readRagDocs(null)).toEqual([]);
    expect(readRagDocs({ agent: {} })).toEqual([]);
    expect(hasProgress({ rag: {} })).toBe(true);
    expect(hasProgress({})).toBe(false);
    expect(hasProgress(null)).toBe(false);
  });
});

describe('RagCleanupService (after-the-fact cleanup)', () => {
  it('deletes open documents with the validated id and auth header, then marks them deleted without touching other artifacts', async () => {
    const h = setup({ docs: [doc()], extraArtifacts: { agent: { toolCallsObserved: 3 } } });
    const r = await h.svc.cleanupRun('run-1', ORG);
    expect(r).toEqual({ open: 1, deleted: 1, failed: 0 });
    expect(h.calls[0].url).toBe('https://bot.example.com/docs/ptaas-aaaaaaaaaa');
    expect(h.calls[0].opts.method).toBe('DELETE');
    expect(h.calls[0].opts.headers?.Authorization).toMatch(/^Bearer sk-/);
    const art = h.updates[0].artifacts as { agent: unknown; rag: { docs: Row[] } };
    expect(art.agent).toEqual({ toolCallsObserved: 3 });
    expect(art.rag.docs[0]).toMatchObject({ status: 'deleted' });
    expect(h.recs.createWarning).not.toHaveBeenCalled();
  });

  it('skips documents that are already handled', async () => {
    const h = setup({ docs: [doc({ status: 'deleted', deletedAt: 'x' }), doc({ docId: 'b', status: 'delete_failed', deleteError: 'http_500' })] });
    expect(await h.svc.cleanupRun('run-1', ORG)).toEqual({ open: 0, deleted: 0, failed: 0 });
    expect(h.request).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(0);
  });

  it('never reports an unknown or locally-guessed id as deleted; warns with the topic marker, audits without content', async () => {
    const h = setup({ docs: [doc({ docIdSource: 'unknown' }), doc({ docId: 'ptaas-bbbbbbbbbb', nonce: 'bbbbbbbbbb', topic: 'PTAAS-TOPIC-bbbbbbbbbb', plantedAt: undefined, status: 'planned' })], status: 404 });
    const r = await h.svc.cleanupRun('run-1', ORG);
    expect(r).toEqual({ open: 2, deleted: 0, failed: 2 });
    expect(h.calls).toHaveLength(1); // the unknown id produced no request at all; the local id got a 404 => unknown
    const docs = (h.updates[0].artifacts as { rag: { docs: Row[] } }).rag.docs;
    expect(docs.every((d) => d.status === 'delete_failed' && d.deleteError === 'doc_id_unknown' && !d.deletedAt)).toBe(true);
    const warn = h.recs.createWarning.mock.calls[0][2] as { text: string; priority: number };
    expect(warn.text).toContain('PTAAS-TOPIC-aaaaaaaaaa');
    expect(warn.text).toContain('PTAAS-TOPIC-bbbbbbbbbb');
    expect(warn.priority).toBe(1);
    const audit = h.audit.logStrict.mock.calls[0][0] as { action: string; metadata: { topics: string[] } };
    expect(audit.action).toBe('arena.rag.cleanup_failed');
    expect(audit.metadata.topics).toEqual(['PTAAS-TOPIC-aaaaaaaaaa', 'PTAAS-TOPIC-bbbbbbbbbb']);
  });

  it('server-supplied ids: 404 counts as gone', async () => {
    const h = setup({ docs: [doc({ docId: 'srv-1', docIdSource: 'server' })], status: 404 });
    expect(await h.svc.cleanupRun('run-1', ORG)).toEqual({ open: 1, deleted: 1, failed: 0 });
  });

  it('config no longer AUTO / no delete endpoint / no credentials => no request, reported as failed', async () => {
    for (const cfg of [{ mode: 'MANUAL' }, { ...RAG_AUTO, delete: undefined }, 'garbage', null]) {
      const h = setup({ docs: [doc()], ragConfig: cfg });
      const r = await h.svc.cleanupRun('run-1', ORG);
      expect(r.failed, JSON.stringify(cfg)).toBe(1);
      expect(h.request).not.toHaveBeenCalled();
      expect(((h.updates[0].artifacts as { rag: { docs: Row[] } }).rag.docs[0]).deleteError).toBe('no_delete_configured');
    }
    const noSecrets = setup({ docs: [doc()], secretsFail: true });
    expect((await noSecrets.svc.cleanupRun('run-1', ORG)).failed).toBe(1);
    expect(noSecrets.request).not.toHaveBeenCalled();
  });

  it('is scoped by organization (foreign org => nothing happens) and refuses a target of another org', async () => {
    const h = setup({ docs: [doc()] });
    expect(await h.svc.cleanupRun('run-1', 'other-org')).toEqual({ open: 0, deleted: 0, failed: 0 });
    expect(h.request).not.toHaveBeenCalled();
    for (const w of h.wheres) expect(w.organizationId).toBe('other-org');
    const mismatch = setup({ docs: [doc()], org: 'other-org' });
    const r = await mismatch.svc.cleanupRun('run-1', ORG);
    expect(r.failed).toBe(1);
    expect(mismatch.request).not.toHaveBeenCalled();
    const h2 = setup({ docs: [doc()] });
    await h2.svc.cleanupRun('run-1', ORG);
    for (const w of h2.wheres) expect(w.organizationId).toBe(ORG);
  });

  it('error codes never carry message text', () => {
    expect(deleteErrorCode(new RagOperationError('http_500'))).toBe('http_500');
    expect(deleteErrorCode(new TargetUnsafeError('secret detail'))).toBe('unsafe_url');
    expect(deleteErrorCode(new Error('secret detail'))).toBe('error');
  });
});
