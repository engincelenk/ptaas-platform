import type { BrowserDriver, PinnedHost, WidgetConfig, WidgetSession } from './widget.types';

/**
 * Per-session (per-run) options for the browser driver. Kept out of widget.types.ts on purpose:
 * drivers that do not know them (fakes) simply ignore the optional third argument of open().
 */
export interface WidgetSessionOptions {
  /** Kill-switch hook. Called for every browser request and while waiting for a reply; true = stop now. */
  shouldAbort?: () => Promise<boolean>;
  /** Max browser requests per session (default 300). The next one is aborted and the session ends. */
  maxRequests?: number;
  /** Hard wall-clock limit per session in ms (default 90 000). Afterwards the session is expired. */
  sessionTimeoutMs?: number;
}

export const SESSION_DEFAULTS = {
  maxRequests: 300,
  sessionTimeoutMs: 90_000,
} as const;

/** A driver that understands WidgetSessionOptions (PlaywrightBrowserDriver). */
export interface OptionsAwareBrowserDriver extends BrowserDriver {
  open(config: WidgetConfig, pinned: PinnedHost, options?: WidgetSessionOptions): Promise<WidgetSession>;
}

/** The session ran into its wall-clock limit; the adapter may transparently open a fresh one. */
export class WidgetSessionExpiredError extends Error {
  constructor() {
    super('Widget session expired');
    this.name = 'WidgetSessionExpiredError';
  }
}
