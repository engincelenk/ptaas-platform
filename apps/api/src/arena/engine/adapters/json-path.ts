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

const FORBIDDEN_TEMPLATE_KEYS = new Set([
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  '__proto__',
  'constructor',
  'prototype',
]);
const MAX_TEMPLATE_BYTES = 4096;
const MAX_TEMPLATE_DEPTH = 6;

/** Returns a reason if a customer-supplied request template is not acceptable, else null. */
export function templateProblem(template: unknown): string | null {
  let json: string;
  try {
    json = JSON.stringify(template) ?? '';
  } catch {
    return 'template is not serializable';
  }
  if (Buffer.byteLength(json) > MAX_TEMPLATE_BYTES) return 'template too large';
  const walk = (v: unknown, depth: number): string | null => {
    if (depth > MAX_TEMPLATE_DEPTH) return 'template too deep';
    if (Array.isArray(v)) {
      for (const x of v) {
        const p = walk(x, depth + 1);
        if (p) return p;
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN_TEMPLATE_KEYS.has(k)) return `forbidden template key: ${k}`;
        const p = walk(x, depth + 1);
        if (p) return p;
      }
    }
    return null;
  };
  // JSON.parse creates own "__proto__" keys, which Object.entries sees.
  return walk(template, 1);
}
