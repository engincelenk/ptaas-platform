import { Injectable } from '@nestjs/common';
import type { ArenaAdapter } from '@ptaas/db';
import { SafeHttpService } from '../../../ssrf/safe-http.service';
import { SsrfGuardService } from '../../../ssrf/ssrf-guard.service';
import { ARENA_LIMITS } from '../../arena.constants';
import { parseAgentConfig } from '../agent/agent-config';
import { TargetUnsafeError } from '../run-control';
import { WidgetAdapterFactory } from '../widget/widget-adapter.factory';
import type { AdapterClock, ArenaTargetAdapter } from './adapter.types';
import { AnthropicAdapter } from './anthropic.adapter';
import { GenericJsonAdapter } from './generic-json.adapter';
import { OpenAiCompatAdapter } from './openai-compat.adapter';

export interface AdapterTargetLike {
  adapter: ArenaAdapter;
  authHeaderName: string | null;
  requestMapping: unknown;
  responseMapping: unknown;
  /** AGENT targets: dry-run header etc. (no secrets). */
  agentConfig?: unknown;
  /** WIDGET targets. */
  widgetConfig?: unknown;
  /** The verified URL target (endpoint URL lives in `target.value`). */
  target: { value: string };
}

export interface AdapterFactoryOptions {
  requestsPerSecond?: number;
  clock?: AdapterClock;
  /** Kill switch for the browser (widget): true = stop now. Checked for every browser request and while waiting. */
  shouldAbort?: () => Promise<boolean>;
}

@Injectable()
export class AdapterFactory {
  constructor(
    private readonly http: SafeHttpService,
    private readonly guard: SsrfGuardService,
    private readonly widgets: WidgetAdapterFactory,
  ) {}

  /** Any adapter, including the browser widget (which needs an async SSRF resolution first). */
  async create(
    aiTarget: AdapterTargetLike,
    secrets: { apiKey?: string },
    options: AdapterFactoryOptions = {},
  ): Promise<ArenaTargetAdapter> {
    if (aiTarget.adapter !== 'WIDGET') return this.forTarget(aiTarget, secrets, options);

    const host = new URL(aiTarget.target.value).hostname;
    const [resolved] = await this.guard.resolveSafe(host);
    return this.widgets.create(
      { widgetConfig: aiTarget.widgetConfig },
      { pinned: { host, ip: resolved.address }, requestsPerSecond: options.requestsPerSecond, clock: options.clock, shouldAbort: options.shouldAbort },
    );
  }

  /** HTTP adapters (OPENAI_COMPAT / ANTHROPIC / GENERIC_JSON). */
  forTarget(
    aiTarget: AdapterTargetLike,
    secrets: { apiKey?: string },
    options: AdapterFactoryOptions = {},
  ): ArenaTargetAdapter {
    const agent = parseAgentConfig(aiTarget.agentConfig);
    if (!agent.ok) throw new TargetUnsafeError(agent.error);
    const extraHeaders =
      agent.config.dryRunHeaderName && agent.config.dryRunHeaderValue !== undefined
        ? { [agent.config.dryRunHeaderName]: agent.config.dryRunHeaderValue }
        : undefined;
    const config = {
      endpointUrl: aiTarget.target.value,
      authHeaderName: aiTarget.authHeaderName,
      apiKey: secrets.apiKey,
      requestsPerSecond: Math.min(options.requestsPerSecond ?? 1, ARENA_LIMITS.maxRequestsPerSecond),
      requestMapping: aiTarget.requestMapping,
      responseMapping: aiTarget.responseMapping,
      extraHeaders,
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
