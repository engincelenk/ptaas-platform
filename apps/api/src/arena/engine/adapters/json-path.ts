const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** Parses `a.b[0].c` into ['a','b',0,'c']. Returns null for invalid/unsafe paths. */
export function parsePath(path: string): Array<string | number> | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return null;
  const out: Array<string | number> = [];
  const re = /([^.[\]]+)|\[(\d{1,4})\]/g;
  let consumed = 0;
  for (const m of path.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx !== consumed && !(path[consumed] === '.' && idx === consumed + 1)) return null;
    consumed = idx + m[0].length;
    if (m[1] !== undefined) {
      if (FORBIDDEN.has(m[1])) return null;
      out.push(m[1]);
    } else {
      out.push(Number(m[2]));
    }
  }
  return out.length > 0 && consumed === path.length ? out : null;
}

export function getAtPath(root: unknown, path: string): unknown {
  const parts = parsePath(path);
  if (!parts) return undefined;
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (typeof p === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[p];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

/** Sets a value inside a (cloned) JSON object, creating containers along the way. Returns false if the path is unsafe. */
export function setAtPath(root: Record<string, unknown>, path: string, value: unknown): boolean {
  const parts = parsePath(path);
  if (!parts) return false;
  let cur = root as Record<string | number, unknown>;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (i === parts.length - 1) {
      cur[key] = value;
      return true;
    }
    const next = parts[i + 1];
    const existing = cur[key];
    if (existing === null || typeof existing !== 'object') {
      cur[key] = typeof next === 'number' ? [] : {};
    }
    cur = cur[key] as Record<string | number, unknown>;
  }
  return true;
}
