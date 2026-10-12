import { BadRequestException } from '@nestjs/common';
import { isForbiddenHeaderName } from '../arena.constants';

const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
const FORBIDDEN_TEMPLATE_KEYS = new Set(['tools', 'tool_choice', 'functions', 'function_call', '__proto__', 'constructor', 'prototype']);
export const MAPPING_MAX_BYTES = 4096;
export const MAPPING_MAX_DEPTH = 6;

/** Auth header name for the customer endpoint: plain token syntax, never a smuggling-prone header. */
export function assertHeaderName(name: string): void {
  if (!HEADER_NAME.test(name) || isForbiddenHeaderName(name)) {
    throw new BadRequestException('authHeaderName is not allowed');
  }
}

/** Request/response mapping templates: bounded size and depth, no tool/prototype keys on any level. */
export function assertMapping(value: unknown, field: string): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    throw new BadRequestException(`${field} is not valid JSON`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAPPING_MAX_BYTES) {
    throw new BadRequestException(`${field} exceeds ${MAPPING_MAX_BYTES} bytes`);
  }
  const walk = (node: unknown, depth: number): void => {
    if (depth > MAPPING_MAX_DEPTH) throw new BadRequestException(`${field} is nested too deeply`);
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
    } else if (node && typeof node === 'object') {
      for (const key of Object.getOwnPropertyNames(node)) {
        if (FORBIDDEN_TEMPLATE_KEYS.has(key.toLowerCase())) {
          throw new BadRequestException(`${field} contains the forbidden key "${key}"`);
        }
        walk((node as Record<string, unknown>)[key], depth + 1);
      }
    }
  };
  walk(value, 1);
}

