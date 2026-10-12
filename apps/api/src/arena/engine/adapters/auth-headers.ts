import { isForbiddenHeaderName } from '../../arena.constants';
import { TargetUnsafeError } from '../run-control';

const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

export function assertSafeHeaderName(name: string): void {
  if (!HEADER_NAME.test(name) || isForbiddenHeaderName(name)) throw new TargetUnsafeError('Invalid header configuration');
}

export function assertSafeHeaderValue(value: string, max = 4096): void {
  if (value.length > max || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new TargetUnsafeError('Invalid header configuration');
  }
}

/** Auth header for customer endpoints (chat, RAG ingest/delete). Name and value are validated against header injection. */
export function buildAuthHeaders(
  authHeaderName: string | null | undefined,
  apiKey: string | undefined,
  defaultName: string,
  bearer: boolean,
): Record<string, string> {
  const name = (authHeaderName ?? defaultName).trim() || defaultName;
  assertSafeHeaderName(name);
  if (!apiKey) return {};
  assertSafeHeaderValue(apiKey);
  const useBearer = bearer && name.toLowerCase() === 'authorization' && !/^bearer\s/i.test(apiKey);
  return { [name]: useBearer ? `Bearer ${apiKey}` : apiKey };
}
