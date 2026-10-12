import { SafeHttpService } from '../../../ssrf/safe-http.service';
import type { AdapterClock, AdapterConfig } from './adapter.types';
import { BaseArenaAdapter, BuiltRequest } from './base.adapter';
import { getAtPath, setAtPath, templateProblem } from './json-path';
import { TargetUnsafeError } from '../run-control';

interface GenericRequestMapping {
  /** JSON path where the prompt is inserted (default `prompt`). */
  promptPath?: string;
  /** Static JSON body the prompt is merged into. */
  template?: Record<string, unknown>;
}

interface GenericResponseMapping {
  /** JSON path of the reply text (default tries common fields). */
  textPath?: string;
}

const FALLBACK_TEXT_PATHS = ['text', 'response', 'output', 'reply', 'message', 'answer', 'content'];

/** Configurable JSON endpoint: request/response mapped via simple JSON paths (no code, no templates). */
export class GenericJsonAdapter extends BaseArenaAdapter {
  constructor(http: SafeHttpService, config: AdapterConfig, clock?: AdapterClock) {
    super(http, config, clock);
  }

  protected buildRequest(prompt: string): BuiltRequest {
    const mapping = (this.config.requestMapping ?? {}) as GenericRequestMapping;
    if (mapping.template !== undefined && mapping.template !== null) {
      const problem = templateProblem(mapping.template);
      if (problem) throw new TargetUnsafeError(`Invalid request template: ${problem}`);
    }
    const body: Record<string, unknown> =
      mapping.template && typeof mapping.template === 'object'
        ? (JSON.parse(JSON.stringify(mapping.template)) as Record<string, unknown>)
        : {};
    const path = mapping.promptPath ?? 'prompt';
    if (!setAtPath(body, path, prompt)) throw new TargetUnsafeError('Invalid request mapping path');
    return {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...this.authHeaders('Authorization', true) },
      body: JSON.stringify(body),
    };
  }

  protected extractText(parsed: unknown): string | null {
    const mapping = (this.config.responseMapping ?? {}) as GenericResponseMapping;
    const paths = mapping.textPath ? [mapping.textPath] : FALLBACK_TEXT_PATHS;
    for (const p of paths) {
      const v = getAtPath(parsed, p);
      if (typeof v === 'string') return v;
    }
    return null;
  }
}
