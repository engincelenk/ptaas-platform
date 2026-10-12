import { SafeHttpService } from '../../../ssrf/safe-http.service';
import type { AdapterClock, AdapterConfig } from './adapter.types';
import { BaseArenaAdapter, BuiltRequest } from './base.adapter';
import { getAtPath } from './json-path';

interface OpenAiMapping {
  model?: string;
  extra?: Record<string, unknown>;
}

/** OpenAI-compatible chat endpoint: `{ messages:[{role:'user',content}] }` → `choices[0].message.content`. */
export class OpenAiCompatAdapter extends BaseArenaAdapter {
  constructor(http: SafeHttpService, config: AdapterConfig, clock?: AdapterClock) {
    super(http, config, clock);
  }

  protected buildRequest(prompt: string): BuiltRequest {
    const mapping = (this.config.requestMapping ?? {}) as OpenAiMapping;
    const body: Record<string, unknown> = {};
    if (mapping.extra && typeof mapping.extra === 'object') {
      for (const [k, v] of Object.entries(mapping.extra)) {
        if (k !== '__proto__' && k !== 'messages') body[k] = v;
      }
    }
    if (typeof mapping.model === 'string') body.model = mapping.model;
    body.messages = [{ role: 'user', content: prompt }];
    return {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...this.authHeaders('Authorization', true) },
      body: JSON.stringify(body),
    };
  }

  protected extractText(parsed: unknown): string | null {
    const content = getAtPath(parsed, 'choices[0].message.content');
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const parts = content
        .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
        .filter(Boolean);
      return parts.length > 0 ? parts.join('\n') : null;
    }
    return null;
  }
}
