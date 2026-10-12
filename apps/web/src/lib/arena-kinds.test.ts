import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHECKS,
  adapterForKind,
  allowedEnvironments,
  buildConfirmations,
  buildRagConfig,
  buildWidgetConfig,
  canSubmitApproval,
  findForbiddenKey,
  goalsForKind,
  kindOf,
  parseJsonObject,
  ragCleanupText,
  requiredConfirmations,
  validateSameHostUrl,
  type RagFormState,
  type WidgetFormState,
} from './arena-kinds';

const ENDPOINT = 'https://bot.example.com/chat';

const rag: RagFormState = {
  mode: 'AUTO',
  ingestUrl: 'https://bot.example.com/docs',
  ingestMethod: 'POST',
  ingestBody: '{"id":"{{docId}}","text":"{{content}}"}',
  docIdPath: 'data.id',
  deleteUrl: 'https://bot.example.com/docs/{{docId}}',
  deleteMethod: 'DELETE',
  deleteBody: '',
  indexingDelayMs: 3000,
};

const widget: WidgetFormState = {
  pageUrl: 'https://bot.example.com/support',
  openSelector: '',
  iframeSelector: '',
  inputSelector: '#in',
  sendSelector: '',
  responseSelector: '.msg',
  cookieConsentSelector: '',
  waitAfterOpenMs: 1500,
  responseTimeoutMs: 20000,
};

describe('confirmations per kind', () => {
  it('noTools only for CHAT/RAG/WIDGET', () => {
    expect(requiredConfirmations('CHAT')).toContain('noTools');
    expect(requiredConfirmations('RAG')).toContain('noTools');
    expect(requiredConfirmations('WIDGET')).toContain('noTools');
    expect(requiredConfirmations('AGENT')).not.toContain('noTools');
  });

  it('AGENT additionally needs stagingOnly and toolsSandboxed', () => {
    const r = requiredConfirmations('AGENT');
    expect(r).toContain('stagingOnly');
    expect(r).toContain('toolsSandboxed');
    expect(r).not.toContain('testDocumentsMayBeIndexedAndRemoved');
  });

  it('RAG additionally needs testDocumentsMayBeIndexedAndRemoved', () => {
    expect(requiredConfirmations('RAG')).toContain('testDocumentsMayBeIndexedAndRemoved');
    expect(requiredConfirmations('CHAT')).not.toContain('testDocumentsMayBeIndexedAndRemoved');
  });

  it('builds exactly the required keys', () => {
    expect(Object.keys(buildConfirmations('AGENT')).sort()).toEqual(
      ['noProduction', 'noSideEffects', 'providerTosAccepted', 'stagingOnly', 'toolsSandboxed'].sort(),
    );
    expect(Object.keys(buildConfirmations('CHAT')).sort()).toEqual(
      ['noProduction', 'noSideEffects', 'noTools', 'providerTosAccepted'].sort(),
    );
    expect(Object.keys(buildConfirmations('RAG'))).toContain('testDocumentsMayBeIndexedAndRemoved');
  });

  it('approval requires every kind-specific check, a contact and the RoE version', () => {
    const agentOk = { ...EMPTY_CHECKS, noProduction: true, noSideEffects: true, providerTosAccepted: true, stagingOnly: true, toolsSandboxed: true };
    expect(canSubmitApproval('AGENT', agentOk, 'Max, 12345', 2)).toBe(true);
    expect(canSubmitApproval('AGENT', { ...agentOk, toolsSandboxed: false }, 'Max, 12345', 2)).toBe(false);
    expect(canSubmitApproval('CHAT', agentOk, 'Max, 12345', 2)).toBe(false); // noTools missing
    expect(canSubmitApproval('AGENT', agentOk, '  ', 2)).toBe(false);
    expect(canSubmitApproval('AGENT', agentOk, 'Max, 12345', null)).toBe(false);
    const ragOk = { ...EMPTY_CHECKS, noProduction: true, noSideEffects: true, providerTosAccepted: true, noTools: true };
    expect(canSubmitApproval('RAG', ragOk, 'Max, 12345', 2)).toBe(false);
    expect(canSubmitApproval('RAG', { ...ragOk, testDocumentsMayBeIndexedAndRemoved: true }, 'Max, 12345', 2)).toBe(true);
  });
});

describe('kind helpers', () => {
  it('defaults to CHAT and maps adapters', () => {
    expect(kindOf(null)).toBe('CHAT');
    expect(kindOf({ kind: 'AGENT' })).toBe('AGENT');
    expect(adapterForKind('WIDGET', 'OPENAI_COMPAT')).toBe('WIDGET');
    expect(adapterForKind('RAG', 'WIDGET')).toBe('OPENAI_COMPAT');
    expect(adapterForKind('AGENT', 'ANTHROPIC')).toBe('ANTHROPIC');
  });

  it('only staging is selectable for agents', () => {
    expect(allowedEnvironments('AGENT')).toEqual(['STAGING']);
    expect(allowedEnvironments('CHAT')).toContain('PRODUCTION');
  });

  it('filters goals by kind', () => {
    const goals = [
      { id: '1', kinds: ['CHAT', 'RAG'] as ('CHAT' | 'RAG')[] },
      { id: '2', kinds: ['AGENT'] as 'AGENT'[] },
      { id: '3' },
    ];
    expect(goalsForKind(goals, 'AGENT').map((g) => g.id)).toEqual(['2', '3']);
    expect(goalsForKind(goals, 'CHAT').map((g) => g.id)).toEqual(['1', '3']);
  });
});

describe('config validation', () => {
  it('parses JSON objects only', () => {
    expect(parseJsonObject('').value).toBeNull();
    expect(parseJsonObject('[1]').error).not.toBeNull();
    expect(parseJsonObject('{bad').error).not.toBeNull();
    expect(parseJsonObject('{"a":1}').value).toEqual({ a: 1 });
  });

  it('detects forbidden keys at any depth', () => {
    expect(findForbiddenKey({ a: { b: { tools: [] } } })).toBe('tools');
    expect(findForbiddenKey({ a: 1 })).toBeNull();
    expect(findForbiddenKey(JSON.parse('{"x":{"__proto__":{}}}'))).toBe('__proto__');
  });

  it('requires same-host https URLs', () => {
    expect(validateSameHostUrl('https://bot.example.com/x/{{docId}}', ENDPOINT)).toBeNull();
    expect(validateSameHostUrl('https://evil.example.org/x', ENDPOINT)).toContain('Host');
    expect(validateSameHostUrl('http://bot.example.com/x', ENDPOINT)).toContain('https');
    expect(validateSameHostUrl('https://bot.example.com:8443/x', ENDPOINT)).toContain('443');
  });

  it('builds a valid AUTO rag config', () => {
    const r = buildRagConfig(rag, ENDPOINT);
    expect(r.errors).toEqual([]);
    expect(r.config?.ingest?.url).toBe(rag.ingestUrl);
    expect(r.config?.delete?.method).toBe('DELETE');
  });

  it('rejects AUTO config without ingest, with host mismatch or forbidden keys', () => {
    expect(buildRagConfig({ ...rag, ingestUrl: '' }, ENDPOINT).config).toBeNull();
    expect(buildRagConfig({ ...rag, ingestUrl: 'https://other.example.org/d' }, ENDPOINT).config).toBeNull();
    expect(buildRagConfig({ ...rag, ingestBody: '{"tools":[]}' }, ENDPOINT).config).toBeNull();
    expect(buildRagConfig({ ...rag, ingestBody: '' }, ENDPOINT).config).toBeNull();
  });

  it('warns when delete is missing and accepts MANUAL without ingest', () => {
    expect(buildRagConfig({ ...rag, deleteUrl: '' }, ENDPOINT).warnings).toHaveLength(1);
    const m = buildRagConfig({ ...rag, mode: 'MANUAL', ingestUrl: '', ingestBody: '' }, ENDPOINT);
    expect(m.config?.mode).toBe('MANUAL');
    expect(m.errors).toEqual([]);
  });

  it('clamps the indexing delay', () => {
    expect(buildRagConfig({ ...rag, indexingDelayMs: 999999 }, ENDPOINT).config?.indexingDelayMs).toBe(15000);
  });

  it('validates widget config', () => {
    const ok = buildWidgetConfig(widget, ENDPOINT);
    expect(ok.errors).toEqual([]);
    expect(ok.config?.sendSelector).toBeUndefined();
    expect(buildWidgetConfig({ ...widget, pageUrl: 'https://other.example.org/' }, ENDPOINT).config).toBeNull();
    expect(buildWidgetConfig({ ...widget, inputSelector: '' }, ENDPOINT).config).toBeNull();
    expect(buildWidgetConfig({ ...widget, responseSelector: 'a'.repeat(201) }, ENDPOINT).config).toBeNull();
    expect(buildWidgetConfig({ ...widget, responseTimeoutMs: 999999 }, ENDPOINT).config?.responseTimeoutMs).toBe(60000);
  });
});

describe('ragCleanupText', () => {
  it('describes cleanup states', () => {
    expect(ragCleanupText(undefined).tone).toBe('neutral');
    expect(ragCleanupText({ planted: 3, deleted: 3, cleanupFailed: 0 }).tone).toBe('good');
    expect(ragCleanupText({ planted: 3, deleted: 1, cleanupFailed: 2 }).tone).toBe('warn');
    expect(ragCleanupText({ planted: 3, deleted: 1, cleanupFailed: 0 }).text).toContain('1 von 3');
  });
});
