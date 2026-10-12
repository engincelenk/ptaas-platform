import type { DocIdSource, RagDoc } from './rag-planter';

export type RagDocStatus = 'planned' | 'planted' | 'deleted' | 'delete_failed';

/** One planted (or about to be planted) test document as stored in `ArenaRun.artifacts.rag.docs`. No content, no secrets. */
export interface RagArtifactDoc {
  docId: string;
  docIdSource: DocIdSource;
  nonce: string;
  /** `PTAAS-TOPIC-<nonce>`: lets the customer find the document manually. */
  topic: string;
  plannedAt: string;
  status: RagDocStatus;
  plantedAt?: string;
  deletedAt?: string;
  deleteError?: string;
}

export function toArtifactDoc(d: RagDoc & { plannedAt?: Date }): RagArtifactDoc {
  const status: RagDocStatus = d.deletedAt ? 'deleted' : d.deleteError ? 'delete_failed' : d.plantedAt ? 'planted' : 'planned';
  return {
    docId: d.docId,
    docIdSource: d.docIdSource,
    nonce: d.nonce,
    topic: d.topic,
    plannedAt: (d.plannedAt ?? d.plantedAt ?? new Date(0)).toISOString(),
    status,
    ...(d.plantedAt ? { plantedAt: d.plantedAt.toISOString() } : {}),
    ...(d.deletedAt ? { deletedAt: d.deletedAt.toISOString() } : {}),
    ...(d.deleteError ? { deleteError: d.deleteError } : {}),
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

const STATUSES: RagDocStatus[] = ['planned', 'planted', 'deleted', 'delete_failed'];

/** Tolerant reader (also for artifacts written by older engine versions). */
export function readRagDocs(artifacts: unknown): RagArtifactDoc[] {
  if (!isObj(artifacts) || !isObj(artifacts.rag) || !Array.isArray(artifacts.rag.docs)) return [];
  const out: RagArtifactDoc[] = [];
  for (const raw of artifacts.rag.docs) {
    if (!isObj(raw) || typeof raw.docId !== 'string') continue;
    const status = STATUSES.includes(raw.status as RagDocStatus)
      ? (raw.status as RagDocStatus)
      : raw.deletedAt
        ? 'deleted'
        : raw.deleteError
          ? 'delete_failed'
          : 'planted';
    out.push({
      docId: raw.docId,
      docIdSource: raw.docIdSource === 'server' || raw.docIdSource === 'unknown' ? raw.docIdSource : 'local',
      nonce: typeof raw.nonce === 'string' ? raw.nonce : '',
      topic: typeof raw.topic === 'string' ? raw.topic : '',
      plannedAt: typeof raw.plannedAt === 'string' ? raw.plannedAt : typeof raw.plantedAt === 'string' ? raw.plantedAt : '',
      status,
      ...(typeof raw.plantedAt === 'string' ? { plantedAt: raw.plantedAt } : {}),
      ...(typeof raw.deletedAt === 'string' ? { deletedAt: raw.deletedAt } : {}),
      ...(typeof raw.deleteError === 'string' ? { deleteError: raw.deleteError } : {}),
    });
  }
  return out;
}

/** A document that may still exist in the customer's index and has not been handled yet. */
export function isOpenDoc(d: RagArtifactDoc): boolean {
  return (d.status === 'planned' || d.status === 'planted') && !d.deletedAt && !d.deleteError;
}

export function hasProgress(artifacts: unknown): boolean {
  return isObj(artifacts) && Object.keys(artifacts).length > 0;
}
