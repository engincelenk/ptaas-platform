/**
 * WidgetAdapterFactory: builds the stage-4 browser widget transport.
 *
 * FINAL SIGNATURE (for Agent E2 wiring in AdapterFactory.forTarget, adapter === 'WIDGET'):
 *
 *   widgetAdapterFactory.create(
 *     aiTarget: { widgetConfig: unknown },     // raw Json from AiTarget.widgetConfig
 *     options: {
 *       pinned: PinnedHost;                    // REQUIRED: { host, ip } from SsrfGuardService.resolveSafe
 *       requestsPerSecond?: number;            // capped to ARENA_LIMITS.maxRequestsPerSecond
 *       clock?: AdapterClock;
 *     },
 *   ): WidgetAdapter                           // implements ArenaTargetAdapter, plus close(): Promise<void>
 *
 * - Throws WidgetConfigError (extends TargetUnsafeError) for an invalid config or a pageUrl whose
 *   host differs from `pinned.host`.
 * - The adapter opens its browser session lazily on the first send(); a missing browser surfaces as
 *   BrowserUnavailableError from send() (map it to FAILED `browser_unavailable`).
 * - The caller MUST call adapter.close() when the run ends (finally) to release the browser.
 * - Provide the driver via `{ provide: BROWSER_DRIVER, useClass: PlaywrightBrowserDriver }`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ARENA_LIMITS } from '../../arena.constants';
import type { AdapterClock } from '../adapters/adapter.types';
import { parseWidgetConfig } from './widget-config';
import { WidgetAdapter } from './widget.adapter';
import { BROWSER_DRIVER } from './widget.types';
import type { BrowserDriver, PinnedHost } from './widget.types';

export interface WidgetAdapterFactoryOptions {
  pinned: PinnedHost;
  requestsPerSecond?: number;
  clock?: AdapterClock;
}

@Injectable()
export class WidgetAdapterFactory {
  constructor(@Inject(BROWSER_DRIVER) private readonly driver: BrowserDriver) {}

  create(aiTarget: { widgetConfig: unknown }, options: WidgetAdapterFactoryOptions): WidgetAdapter {
    const config = parseWidgetConfig(aiTarget.widgetConfig, options.pinned);
    return new WidgetAdapter(this.driver, config, options.pinned, {
      requestsPerSecond: Math.min(options.requestsPerSecond ?? 1, ARENA_LIMITS.maxRequestsPerSecond),
      clock: options.clock,
    });
  }
}
