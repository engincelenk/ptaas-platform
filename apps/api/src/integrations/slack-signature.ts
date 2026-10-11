import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verifies a Slack request signature (https://api.slack.com/authentication/verifying-requests-from-slack).
 * Signature = "v0=" + HMAC-SHA256(signingSecret, "v0:{timestamp}:{rawBody}").
 * Rejects stale timestamps (replay protection) and compares in constant time.
 */
export function verifySlackSignature(opts: {
  signingSecret: string;
  rawBody: string;
  timestamp: string | undefined;
  signature: string | undefined;
  now?: number; // epoch seconds, injectable for tests
}): boolean {
  const { signingSecret, rawBody, timestamp, signature } = opts;
  if (!signingSecret || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;

  const expected = 'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
