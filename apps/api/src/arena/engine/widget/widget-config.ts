import { z } from 'zod';
import { ARENA_LIMITS } from '../../arena.constants';
import { TargetUnsafeError } from '../run-control';
import type { PinnedHost, WidgetConfig } from './widget.types';

export const WIDGET_DEFAULTS = {
  waitAfterOpenMs: 1_500,
  responseTimeoutMs: 20_000,
} as const;

const MAX_SELECTOR_LENGTH = 200;
const MAX_URL_LENGTH = 2_000;

/** Selectors are DATA for page.locator(); control characters have no place in them. */
const selector = z
  .string()
  .min(1)
  .max(MAX_SELECTOR_LENGTH)
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), 'control characters are not allowed')
  .refine((s) => s.trim().length > 0, 'must not be blank');

const widgetConfigSchema = z
  .object({
    pageUrl: z.string().min(1).max(MAX_URL_LENGTH),
    openSelector: selector.optional(),
    iframeSelector: selector.optional(),
    inputSelector: selector,
    sendSelector: selector.optional(),
    responseSelector: selector,
    cookieConsentSelector: selector.optional(),
    waitAfterOpenMs: z.number().int().min(0).max(15_000).optional(),
    responseTimeoutMs: z.number().int().min(1_000).max(ARENA_LIMITS.widgetResponseTimeoutMaxMs).optional(),
  })
  .strict();

export class WidgetConfigError extends TargetUnsafeError {
  constructor(message: string) {
    super(`Invalid widget configuration: ${message}`);
    this.name = 'WidgetConfigError';
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Validates an untrusted widget config (JSON from the database) and binds it to the verified host.
 * Never echoes config values in error messages (only field paths / rule names).
 */
export function parseWidgetConfig(raw: unknown, pinned: PinnedHost): WidgetConfig {
  const parsed = widgetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new WidgetConfigError(where.slice(0, 400));
  }
  const config = parsed.data;

  let url: URL;
  try {
    url = new URL(config.pageUrl);
  } catch {
    throw new WidgetConfigError('pageUrl: not a valid URL');
  }
  if (url.protocol !== 'https:') throw new WidgetConfigError('pageUrl: must use https');
  if (url.port !== '' && url.port !== '443') throw new WidgetConfigError('pageUrl: only port 443 is allowed');
  if (url.username !== '' || url.password !== '') throw new WidgetConfigError('pageUrl: credentials in the URL are not allowed');
  if (normalizeHost(url.hostname) !== normalizeHost(pinned.host)) {
    throw new WidgetConfigError('pageUrl: host does not match the verified target host');
  }
  return config;
}
