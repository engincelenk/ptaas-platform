import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ARENA_LIMITS, isProviderHost } from '../arena.constants';
import { assertHeaderName, assertMapping } from './ai-target-validation';
import type { ArenaAdapterName, ArenaEnvironmentName, ArenaTargetKindName } from '../dto/arena.dto';

/**
 * Validation of the per-kind configuration of an AI target (stages 2-4).
 * All configs are secret-free; every URL must point at the verified endpoint host (https, 443, SSRF-checked).
 */

const JSON_PATH = /^[A-Za-z0-9_$.[\]-]{1,200}$/;
const SELECTOR = z.string().min(1).max(200);
const OBJ = z.record(z.unknown());

export const ragConfigSchema = z
  .object({
    mode: z.enum(['AUTO', 'MANUAL']),
    ingest: z
      .object({
        url: z.string().min(1).max(2048),
        method: z.enum(['POST', 'PUT']),
        bodyTemplate: OBJ,
        docIdPath: z.string().regex(JSON_PATH).optional(),
      })
      .strict()
      .optional(),
    delete: z
      .object({
        url: z.string().min(1).max(2048),
        method: z.enum(['DELETE', 'POST']),
        bodyTemplate: OBJ.optional(),
      })
      .strict()
      .optional(),
    indexingDelayMs: z.number().int().min(0).max(ARENA_LIMITS.ragIndexingDelayMaxMs).optional(),
  })
  .strict();

export const agentConfigSchema = z
  .object({
    dryRunHeaderName: z.string().min(1).max(64).optional(),
    dryRunHeaderValue: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\x20-\x7E]+$/, 'header value must be printable ASCII')
      .optional(),
    toolCallsPath: z.string().regex(JSON_PATH).optional(),
  })
  .strict();

export const widgetConfigSchema = z
  .object({
    pageUrl: z.string().min(1).max(2048),
    openSelector: SELECTOR.optional(),
    iframeSelector: SELECTOR.optional(),
    inputSelector: SELECTOR,
    sendSelector: SELECTOR.optional(),
    responseSelector: SELECTOR,
    cookieConsentSelector: SELECTOR.optional(),
    waitAfterOpenMs: z.number().int().min(0).max(15_000).optional(),
    responseTimeoutMs: z.number().int().min(1000).max(ARENA_LIMITS.widgetResponseTimeoutMaxMs).optional(),
  })
  .strict();

export type RagConfig = z.infer<typeof ragConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type WidgetConfigInput = z.infer<typeof widgetConfigSchema>;

export interface KindConfigInput {
  kind: ArenaTargetKindName;
  adapter: ArenaAdapterName;
  environment: ArenaEnvironmentName;
  ragConfig?: unknown;
  agentConfig?: unknown;
  widgetConfig?: unknown;
  /** Auth header of the chat endpoint; the dry-run header must differ from it. */
  authHeaderName?: string | null;
}

export interface KindConfigResult {
  ragConfig: RagConfig | null;
  agentConfig: AgentConfig | null;
  widgetConfig: WidgetConfigInput | null;
  warnings: string[];
}

/** Resolves a host and throws if it is internal (injected so the module has no Nest dependencies). */
export type HostChecker = (host: string) => Promise<unknown>;

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const res = schema.safeParse(value);
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new BadRequestException(`${field}: ${issue ? `${issue.path.join('.') || 'value'} ${issue.message}` : 'invalid'}`);
  }
  assertMapping(value, field); // size, depth, forbidden keys
  return res.data;
}

/** URL on the verified host, https, 443, no credentials, not a provider host, SSRF-checked. */
async function assertHostUrl(raw: string, endpointHost: string, field: string, checkHost: HostChecker): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException(`${field} is not a valid URL`);
  }
  if (url.protocol !== 'https:') throw new BadRequestException(`${field} must use https`);
  if (url.username || url.password) throw new BadRequestException(`${field} must not contain credentials`);
  if (url.port !== '' && url.port !== '443') throw new BadRequestException(`${field} must use port 443`);
  if (url.hostname.toLowerCase() !== endpointHost.toLowerCase() || isProviderHost(url.hostname)) {
    throw new BadRequestException(`${field} must point to the verified endpoint host (${endpointHost})`);
  }
  await checkHost(url.hostname);
  return url;
}

export async function validateKindConfig(
  input: KindConfigInput,
  endpointHost: string,
  checkHost: HostChecker,
): Promise<KindConfigResult> {
  const { kind, adapter, environment } = input;

  if ((kind === 'WIDGET') !== (adapter === 'WIDGET')) {
    throw new BadRequestException('adapter WIDGET is required for (and only valid with) kind WIDGET');
  }
  if (kind === 'AGENT' && environment !== 'STAGING') {
    throw new BadRequestException('Agent targets may only be tested in a STAGING environment');
  }
  const present = (v: unknown): boolean => v !== undefined && v !== null;
  if (present(input.ragConfig) && kind !== 'RAG') throw new BadRequestException('ragConfig is only allowed for kind RAG');
  if (present(input.agentConfig) && kind !== 'AGENT') throw new BadRequestException('agentConfig is only allowed for kind AGENT');
  if (present(input.widgetConfig) && kind !== 'WIDGET') throw new BadRequestException('widgetConfig is only allowed for kind WIDGET');

  const out: KindConfigResult = { ragConfig: null, agentConfig: null, widgetConfig: null, warnings: [] };

  if (kind === 'RAG') {
    if (!present(input.ragConfig)) throw new BadRequestException('ragConfig is required for kind RAG');
    const cfg = parse(ragConfigSchema, input.ragConfig, 'ragConfig');
    if (cfg.mode === 'AUTO' && !cfg.ingest) throw new BadRequestException('ragConfig.ingest is required for mode AUTO');
    if (cfg.ingest) {
      await assertHostUrl(cfg.ingest.url, endpointHost, 'ragConfig.ingest.url', checkHost);
      if (cfg.ingest.bodyTemplate) assertMapping(cfg.ingest.bodyTemplate, 'ragConfig.ingest.bodyTemplate');
    }
    if (cfg.delete) await assertHostUrl(cfg.delete.url, endpointHost, 'ragConfig.delete.url', checkHost);
    if (cfg.mode === 'AUTO' && !cfg.delete) {
      out.warnings.push('No delete configuration: planted test documents will have to be removed manually.');
    }
    out.ragConfig = cfg;
  }

  if (kind === 'AGENT' && present(input.agentConfig)) {
    const cfg = parse(agentConfigSchema, input.agentConfig, 'agentConfig');
    if (Boolean(cfg.dryRunHeaderName) !== Boolean(cfg.dryRunHeaderValue)) {
      throw new BadRequestException('dryRunHeaderName and dryRunHeaderValue must be set together');
    }
    if (cfg.dryRunHeaderName) {
      assertHeaderName(cfg.dryRunHeaderName);
      if (input.authHeaderName && cfg.dryRunHeaderName.toLowerCase() === input.authHeaderName.trim().toLowerCase()) {
        throw new BadRequestException('dryRunHeaderName must differ from authHeaderName');
      }
    }
    if (!cfg.dryRunHeaderName) out.warnings.push('No dry-run header configured: rely on a sandboxed staging environment.');
    out.agentConfig = cfg;
  }
  if (kind === 'AGENT' && !present(input.agentConfig)) {
    out.warnings.push('No dry-run header configured: rely on a sandboxed staging environment.');
  }

  if (kind === 'WIDGET') {
    if (!present(input.widgetConfig)) throw new BadRequestException('widgetConfig is required for kind WIDGET');
    const cfg = parse(widgetConfigSchema, input.widgetConfig, 'widgetConfig');
    await assertHostUrl(cfg.pageUrl, endpointHost, 'widgetConfig.pageUrl', checkHost);
    out.widgetConfig = cfg;
  }
  return out;
}

export const hostOfUrl = (value: string): string => {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
};
