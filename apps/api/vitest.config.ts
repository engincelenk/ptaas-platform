import { defineConfig, type Plugin } from 'vitest/config';
import ts from 'typescript';

/** The AI Arena end-to-end test needs real infrastructure (PostgreSQL, Redis) and only runs with ARENA_E2E=1. */
const arenaE2e = process.env.ARENA_E2E === '1';
const E2E_GLOB = 'src/**/*.e2e.spec.ts';

/**
 * esbuild (Vite's default TS transform) does not emit `design:paramtypes`, which NestJS needs for constructor
 * injection. For the E2E run (which boots real Nest modules) TypeScript itself transpiles the sources.
 */
function tsDecoratorMetadata(): Plugin {
  return {
    name: 'ptaas-ts-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.ts') || file.includes('node_modules')) return null;
      const out = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return { code: out.outputText, map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null };
    },
  };
}

export default defineConfig({
  plugins: arenaE2e ? [tsDecoratorMetadata()] : [],
  esbuild: arenaE2e ? false : undefined,
  test: {
    globals: true,
    environment: 'node',
    include: arenaE2e ? [E2E_GLOB] : ['src/**/*.spec.ts'],
    exclude: arenaE2e ? ['**/node_modules/**'] : ['**/node_modules/**', E2E_GLOB],
    ...(arenaE2e ? { testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false } : {}),
  },
});
