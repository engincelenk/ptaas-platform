import { ARENA_LIMITS } from '../../arena.constants';
import { getAtPath } from '../adapters/json-path';
import type { ObservedToolCall } from '../engine.types';

const MAX_NAME = 100;

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/**
 * Reads the tool calls a target reports in its reply. `path` is a safe JSON path (no code) that points to an array of
 * `{ name, arguments }` (or OpenAI-style `{ function: { name, arguments } }`). Arguments may be an object or a JSON string.
 * Result is capped (`maxToolCallsRecorded`) and argument strings are cut to `maxArgChars`.
 */
export function extractToolCalls(raw: unknown, path: string | undefined, maxArgChars = 4000): ObservedToolCall[] {
  if (!path || raw === undefined || raw === null) return [];
  const arr = getAtPath(raw, path);
  if (!Array.isArray(arr)) return [];
  const out: ObservedToolCall[] = [];
  for (const item of arr.slice(0, ARENA_LIMITS.maxToolCallsRecorded)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const fn = rec.function && typeof rec.function === 'object' ? (rec.function as Record<string, unknown>) : rec;
    const name = typeof fn.name === 'string' ? fn.name : typeof rec.name === 'string' ? rec.name : '';
    if (!name) continue;
    out.push({ name: name.slice(0, MAX_NAME), arguments: stringify(fn.arguments ?? rec.arguments ?? '').slice(0, maxArgChars) });
  }
  return out;
}
