/** Thrown to stop a run cleanly (status ABORTED with a reason). */
export class RunStopError extends Error {
  constructor(public readonly reason: string) {
    super(`Run stopped: ${reason}`);
    this.name = 'RunStopError';
  }
}

/** Customer endpoint failed too often (>= 50% of the last 6 requests). */
export class ErrorRateExceededError extends RunStopError {
  constructor() {
    super('error_rate');
    this.name = 'ErrorRateExceededError';
  }
}

/** A single request to the customer endpoint failed (after retries). Does not end the run. */
export class TargetRequestError extends Error {
  constructor(
    public readonly kind: 'http' | 'network' | 'parse' | 'timeout',
    public readonly status?: number,
    message?: string,
  ) {
    super(message ?? `Target request failed (${kind}${status ? ' ' + status : ''})`);
    this.name = 'TargetRequestError';
  }
}

/** The SSRF layer refused the request — never retried, the run fails. */
export class TargetUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetUnsafeError';
  }
}
