import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { SafeHttpService, SafeRequestOptions, SafeResponse } from '../../../ssrf/safe-http.service';
import { ARENA_GOAL_CATALOG } from '../catalog/goals.data';
import { parseRagConfig } from './rag-config';
import { RagOperationError, RagPlanter, RagHttpContext } from './rag-planter';
import { TargetUnsafeError } from '../run-control';

const ENDPOINT = 'https://bot.example.com/chat';
const cfgRaw = {
  mode: 'AUTO',
  ingest: { url: 'https://bot.example.com/docs', method: 'POST', bodyTemplate: { id: '{{docId}}', doc: { text: '{{content}}' } }, docIdPath: 'data.id' },
  delete: { url: 'https://bot.example.com/docs/{{docId}}', method: 'DELETE', bodyTemplate: { id: '{{docId}}' } },
  indexingDelayMs: 2500,
};

function setup(responses: Array<Partial<SafeResponse> | Error> = [{ status: 200, body: '{"data":{"id":"srv-1"}}' }]) {
  const calls: Array<{ url: string; opts: SafeRequestOptions }> = [];
  let i = 0;
  const request = vi.fn(async (url: string, opts: SafeRequestOptions = {}) => {
    calls.push({ url, opts });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return { status: 200, headers: {}, body: '{}', truncated: false, ...r } as SafeResponse;
  });
  const planter = new RagPlanter({ request } as unknown as SafeHttpService);
  const before = vi.fn(async () => undefined);
  const ctx: RagHttpContext = { endpointUrl: ENDPOINT, headers: { Authorization: 'Bearer k' }, beforeRequest: before };
  const parsed = parseRagConfig(cfgRaw);
  if (!parsed.ok) throw new Error('bad test config');
  const goal = ARENA_GOAL_CATALOG.find((g) => g.key === 'RAG-001');
  if (!goal) throw new Error('goal');
  const doc = planter.buildDocument({ id: 'g1', key: goal.key }, goal.seedAttacks[0], goal.successCriteria, 'run-9', 0);
  return { planter, calls, request, before, ctx, config: parsed.config, doc };
}

describe('rag config', () => {
  it('parses, applies the default indexing delay and enforces limits and template rules', () => {
    expect(parseRagConfig({ mode: 'MANUAL' })).toMatchObject({ ok: true, config: { mode: 'MANUAL', indexingDelayMs: 3000 } });
    expect(parseRagConfig(cfgRaw).ok).toBe(true);
    expect(parseRagConfig({ ...cfgRaw, indexingDelayMs: 61_000 }).ok).toBe(false);
    expect(parseRagConfig({ ...cfgRaw, ingest: { ...cfgRaw.ingest, bodyTemplate: { tools: [] } } }).ok).toBe(false);
    expect(parseRagConfig({ ...cfgRaw, ingest: { ...cfgRaw.ingest, method: 'DELETE' } }).ok).toBe(false);
    expect(parseRagConfig({ ...cfgRaw, ingest: { ...cfgRaw.ingest, docIdPath: '__proto__.x' } }).ok).toBe(false);
    expect(parseRagConfig({ ...cfgRaw, extra: 1 }).ok).toBe(false);
    expect(parseRagConfig('x').ok).toBe(false);
  });
});

describe('RagPlanter', () => {
  it('builds a harmless document from the goal template with token, topic and size limit', () => {
    const { doc } = setup();
    expect(doc.tokens.marker).toMatch(/^PTAAS-RAG-run-9-[0-9a-f]{10}$/);
    expect(doc.topic).toBe(`PTAAS-TOPIC-${doc.nonce}`);
    expect(doc.content).toContain(doc.tokens.marker);
    expect(doc.content).toContain(doc.topic);
    expect(doc.content).not.toContain('{{');
    expect(doc.content.length).toBeLessThanOrEqual(4000);
    const q = new RagPlanter({} as never).questionFor(doc, 1);
    expect(q).toContain(doc.topic);
    expect(q).not.toContain('PTAAS-RAG-');
  });

  it('every RAG goal embeds the hidden instruction differently and carries all placeholders', () => {
    const rag = ARENA_GOAL_CATALOG.filter((g) => g.kinds.includes('RAG') && g.category === 'INDIRECT_INJECTION');
    expect(rag.length).toBeGreaterThanOrEqual(4);
    expect(new Set(rag.map((g) => g.seedAttacks[0].slice(0, 25))).size).toBe(rag.length);
    for (const g of rag) {
      for (const ph of ['{{TOKEN}}', '{{TOPIC}}', '{{TOPIC_PHRASE}}']) expect(g.seedAttacks[0], g.key).toContain(ph);
    }
  });

  it('ingest substitutes placeholders only in values, uses SafeHttpService with auth and port 443, and reads the doc id', async () => {
    const { planter, calls, ctx, config, doc, before } = setup();
    const id = await planter.ingest(ctx, config, doc);
    expect(id).toBe('srv-1');
    expect(before).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('https://bot.example.com/docs');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.allowedPorts).toEqual([443]);
    expect(calls[0].opts.headers?.Authorization).toBe('Bearer k');
    const body = JSON.parse(calls[0].opts.body ?? '') as { id: string; doc: { text: string } };
    expect(body.id).toBe(doc.docId);
    expect(body.doc.text).toBe(doc.content);
  });

  it('falls back to our own doc id without docIdPath, fails with a code when the path is missing', async () => {
    const s = setup();
    const noPath = { ...s.config, ingest: { ...(s.config.ingest as object), docIdPath: undefined } } as typeof s.config;
    expect(await s.planter.ingest(s.ctx, noPath, s.doc)).toBe(s.doc.docId);
    const s2 = setup([{ status: 200, body: '{"other":1}' }]);
    await expect(s2.planter.ingest(s2.ctx, s2.config, s2.doc)).rejects.toMatchObject({ code: 'doc_id_missing' });
  });

  it('maps HTTP and network failures to short codes, SSRF refusals to TargetUnsafeError', async () => {
    const a = setup([{ status: 503 }]);
    await expect(a.planter.ingest(a.ctx, a.config, a.doc)).rejects.toMatchObject({ code: 'http_503' });
    const b = setup([new Error('ECONNRESET secret-content')]);
    const err = await b.planter.ingest(b.ctx, b.config, b.doc).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RagOperationError);
    expect((err as Error).message).not.toContain('secret-content');
    const c = setup([new BadRequestException('private address')]);
    await expect(c.planter.ingest(c.ctx, c.config, c.doc)).rejects.toBeInstanceOf(TargetUnsafeError);
  });

  it('only talks to the verified endpoint host over https:443 without credentials', async () => {
    const s = setup();
    for (const url of [
      'https://evil.example.org/docs',
      'http://bot.example.com/docs',
      'https://bot.example.com:8443/docs',
      'https://user:pw@bot.example.com/docs',
      'https://bot.example.com.evil.org/docs',
      'not a url',
    ]) {
      const cfg = { ...s.config, ingest: { ...(s.config.ingest as object), url } } as typeof s.config;
      await expect(s.planter.ingest(s.ctx, cfg, s.doc), url).rejects.toBeInstanceOf(TargetUnsafeError);
    }
    expect(s.request).not.toHaveBeenCalled();
    expect(s.before).not.toHaveBeenCalled();
  });

  it('delete encodes the doc id in the URL (no path/host injection) and treats 404 as success', async () => {
    const s = setup([{ status: 404 }]);
    s.doc.docId = '../../admin?x=1#frag';
    await s.planter.remove(s.ctx, s.config, s.doc);
    expect(s.calls[0].url).toBe(`https://bot.example.com/docs/${encodeURIComponent('../../admin?x=1#frag')}`);
    expect(s.calls[0].opts.method).toBe('DELETE');
    expect(JSON.parse(s.calls[0].opts.body ?? '')).toEqual({ id: '../../admin?x=1#frag' });
    const bad = setup([{ status: 500 }]);
    await expect(bad.planter.remove(bad.ctx, bad.config, bad.doc)).rejects.toMatchObject({ code: 'http_500' });
    const none = setup();
    await expect(none.planter.remove(none.ctx, { ...none.config, delete: undefined }, none.doc)).rejects.toMatchObject({ code: 'no_delete_configured' });
  });

  it('waits for indexing in one-second slices with a checkpoint (kill-switch) each time', async () => {
    const { planter } = setup();
    const slept: number[] = [];
    planter.sleep = async (ms) => void slept.push(ms);
    const checkpoint = vi.fn(async () => undefined);
    await planter.waitForIndexing(2500, checkpoint);
    expect(slept).toEqual([1000, 1000, 500]);
    expect(checkpoint).toHaveBeenCalledTimes(3);
    await expect(
      planter.waitForIndexing(5000, async () => {
        throw new Error('killed');
      }),
    ).rejects.toThrow('killed');
  });

  it('MANUAL mode asks a generic question without a document', () => {
    const q = new RagPlanter({} as never).questionFor(null, 1);
    expect(q).toMatch(/test documents/i);
    expect(q).not.toContain('PTAAS-RAG-');
  });
});
