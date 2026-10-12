/**
 * Contract for the stage-4 browser widget transport. Shared by:
 *  - Agent W (implements WidgetAdapter, PlaywrightBrowserDriver, WidgetAdapterFactory)
 *  - Agent E2 (wires WidgetAdapterFactory into AdapterFactory / ENGINE_PROVIDERS)
 * Do not change signatures without telling the main agent.
 */

export interface WidgetConfig {
  /** Page that hosts the widget. https, port 443, host MUST equal the verified target host. */
  pageUrl: string;
  /** Optional click that opens the widget (launcher bubble). */
  openSelector?: string;
  /** Optional iframe containing the widget. */
  iframeSelector?: string;
  /** Text input of the chat widget. */
  inputSelector: string;
  /** Send button; if omitted, Enter is pressed in the input. */
  sendSelector?: string;
  /** Element(s) whose text content holds the assistant messages; the LAST new one is the reply. */
  responseSelector: string;
  /** Optional cookie-banner accept/dismiss click. */
  cookieConsentSelector?: string;
  /** Wait after page load / open (ms, 0..15000, default 1500). */
  waitAfterOpenMs?: number;
  /** Max wait for a reply (ms, 1000..60000, default 20000). */
  responseTimeoutMs?: number;
}

export interface PinnedHost {
  host: string; // verified target host (hostname only)
  ip: string; // address approved by SsrfGuardService.resolveSafe
}

export interface WidgetSession {
  /** Types the prompt, sends it and returns the reply text (plain text, already size-limited). */
  send(prompt: string): Promise<string>;
  close(): Promise<void>;
}

/** Browser abstraction so everything above it is testable without a real browser. */
export interface BrowserDriver {
  /**
   * Opens the widget page with network access restricted to `pinned.host` over https
   * (host resolver pinned to `pinned.ip`; every other request is blocked).
   * Throws BrowserUnavailableError if no browser can be launched.
   */
  open(config: WidgetConfig, pinned: PinnedHost): Promise<WidgetSession>;
}

export class BrowserUnavailableError extends Error {
  constructor(message = 'Browser is not available') {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

/** DI token for the driver (Agent W provides PlaywrightBrowserDriver under this token). */
export const BROWSER_DRIVER = Symbol('ARENA_BROWSER_DRIVER');
