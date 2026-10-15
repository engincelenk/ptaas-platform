const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** API host only (no /api/v1 prefix). */
export const API_ORIGIN = API_BASE;

/** Builds a full API URL: `<host>/api/v1<path>` (path must start with `/`). */
export function apiUrl(path: string): string {
  return `${API_ORIGIN}/api/v1${path}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  bearerToken?: string,
): Promise<T> {
  const token = bearerToken ?? (typeof window !== 'undefined'
    ? localStorage.getItem('ptaas_access_token')
    : null);

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    credentials: 'include',  // sends httpOnly refresh cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await res.json()) as T & { message?: string; statusCode?: number };

  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ?? `Request failed with status ${res.status}`,
    );
  }

  return data;
}

export const apiClient = {
  get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body?: unknown, token?: string) => request<T>('POST', path, body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => request<T>('PATCH', path, body, token),
  put: <T>(path: string, body?: unknown, token?: string) => request<T>('PUT', path, body, token),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, undefined, token),
};
