export interface AdapterSendContext {
  /**
   * Called before EVERY outgoing HTTP request (including retries). The orchestrator uses it to
   * check kill-switch, budget and time window; it throws RunStopError to stop the run.
   */
  beforeRequest?: () => Promise<void>;
}

export interface AdapterResponse {
  text: string;
  latencyMs: number;
  raw?: unknown;
  /** Number of HTTP requests actually made for this send (retries included). */
  requests: number;
}

export interface ArenaTargetAdapter {
  send(prompt: string, ctx?: AdapterSendContext): Promise<AdapterResponse>;
}

export interface AdapterClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: AdapterClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface AdapterConfig {
  endpointUrl: string;
  authHeaderName?: string | null;
  apiKey?: string;
  requestsPerSecond: number;
  requestMapping?: unknown;
  responseMapping?: unknown;
}

export interface AdapterStats {
  requests: number;
  failures: number;
}
