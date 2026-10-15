#!/usr/bin/env node
// Runs the AI Arena E2E test against the infra from `npm run e2e:infra:start`. Usage (from apps/api): npm run test:e2e:arena
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = {
  ...process.env,
  ARENA_E2E: '1',
  DATABASE_URL: 'postgresql://ptaas:ptaas_pw@127.0.0.1:55432/ptaas_e2e',
  REDIS_URL: 'redis://127.0.0.1:56379',
  NODE_ENV: 'test',
};
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
// make sure all migrations are applied
spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { cwd: path.join(root, "packages", "db"), env, stdio: "inherit", shell: process.platform === "win32" });
const r = spawnSync(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
  cwd: path.join(root, 'apps', 'api'), env, stdio: 'inherit',
});
process.exit(r.status ?? 1);
