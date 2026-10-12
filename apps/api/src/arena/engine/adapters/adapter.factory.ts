import { Injectable } from '@nestjs/common';
import type { ArenaAdapter } from '@ptaas/db';
import { SafeHttpService } from '../../../ssrf/safe-http.service';
import { ARENA_LIMITS } from '../../arena.constants';
import type { AdapterClock, ArenaTargetAdapter } from './adapter.types';
import { AnthropicAdapter } from './anthropic.adapter';
import { GenericJsonAdapter } from './generic-json.adapter';
import { OpenAiCompatAdapter } from './openai-compat.adapter';

export interface AdapterTargetLike {
  adapter: ArenaAdapter;
  authHeaderName: string | null;
  requestMapping: unknown;
  responseMapping: unknown;
  /** The verified URL target (endpoint URL lives in `target.value`). */
  target: { value: string };
}

export interface AdapterFactoryOptions {
  requestsPerSecond?: number;
  clock?: AdapterClock;
}

@Injectable()
export class AdapterFactory {
  constructor(private readonly http: SafeHttpService) {}

  forTarget(
    aiTarget: AdapterTargetLike,
    secrets: { apiKey?: string },
    options: AdapterFactoryOptions = {},
  ): ArenaTargetAdapter {
    const config = {
      endpointUrl: aiTarget.target.value,
      authHeaderName: aiTarget.authHeaderName,
      apiKey: secrets.apiKey,
      requestsPerSecond: Math.min(options.requestsPerSecond ?? 1, ARENA_LIMITS.maxRequestsPerSecond),
      requestMapping: aiTarget.requestMapping,
      responseMapping: aiTarget.responseMapping,
    };
    switch (aiTarget.adapter) {
      case 'OPENAI_COMPAT':
        return new OpenAiCompatAdapter(this.http, config, options.clock);
      case 'ANTHROPIC':
        return new AnthropicAdapter(this.http, config, options.clock);
      case 'GENERIC_JSON':
        return new GenericJsonAdapter(this.http, config, options.clock);
      default:
        throw new Error(`Unsupported adapter: ${String(aiTarget.adapter)}`);
    }
  }
}
