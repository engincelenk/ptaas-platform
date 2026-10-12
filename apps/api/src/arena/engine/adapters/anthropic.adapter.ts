import { SafeHttpService } from '../../../ssrf/safe-http.service';
import type { AdapterClock, AdapterConfig } from './adapter.types';
import { BaseArenaAdapter, BuiltRequest } from './base.adapter';

interface AnthropicMapping {
  model?: string;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/** Anthropic messages API shape: `{ model, max_tokens, messages }` → `content[].text`. */
export class AnthropicAdapter extends BaseArenaAdapter {
  constructor(http: SafeHttpService, config: AdapterConfig, clock?: AdapterClock) {
    super(http, config, clock);
  }

  protected buildRequest(prompt: string): BuiltRequest {
    const mapping = (this.config.requestMapping ?? {}) as AnthropicMapping;
    const maxTokens =
      typeof mapping.maxTokens === 'number' && mapping.maxTokens > 0 ? Math.min(Math.floor(mapping.maxTokens), 2048) : 1024;
    const body = {
      model: typeof mapping.model === 'string' ? mapping.model : DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };
    return {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-version': '2023-06-01',
        ...this.authHeaders('x-api-key', false),
      },
      body: JSON.stringify(body),
    };
  }

  protected extractText(parsed: unknown): string | null {
    const content = (parsed as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) return null;
    const parts = content
      .map((b) =>
        b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string'
          ? (b as { text: string }).text
          : '',
      )
      .filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : null;
  }
}
