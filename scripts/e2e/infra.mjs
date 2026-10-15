#!/usr/bin/env node
/**
 * Portable E2E infrastructure for the AI Arena: PostgreSQL 16 (embedded-postgres binaries) + Redis (.testenv).
 *   node scripts/e2e/infra.mjs start|stop|status
 * Everything lives under .testenv/ (gitignored). Processes are detached; PIDs are stored in .testenv/*.pid.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const testenv = path.join(root, '.testenv');
const pgDir = path.join(testenv, 'pg');
const pgPidFile = path.join(testenv, 'postgres.pid');
const redisPidFile = path.join(testenv, 'redis.pid');
const redisExe = path.join(testenv, 'redis', 'redis-server.exe');

export const PG = { port: 55432, user: 'ptaas', password: 'ptaas_pw', database: 'ptaas_e2e' };
export const REDIS_PORT = 56379;


function log(msg) { console.log(`[infra] ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(500, () => { s.destroy(); resolve(false); });
  });
}
async function waitPort(port, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await portOpen(port)) return; await sleep(250); }
  throw new Error(`${label} did not open port ${port} within ${ms}ms`);
}
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function readPid(file) {
  try { const n = Number(fs.readFileSync(file, 'utf8').trim()); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; }
}
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
  else { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

async function pgBinaries() {
  const dir = path.join(root, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
  return { initdb: path.join(dir, 'initdb.exe'), pg_ctl: path.join(dir, 'pg_ctl.exe'), postgres: path.join(dir, 'postgres.exe') };
}
function pathToUrl(p) { return pathToFileURL(p).href; }

async function startPostgres() {
  if (await portOpen(PG.port)) { log(`postgres already listening on ${PG.port}`); return; }
  const { initdb, postgres: postgresExe } = await pgBinaries();
  fs.mkdirSync(testenv, { recursive: true });
  if (!fs.existsSync(path.join(pgDir, 'PG_VERSION'))) {
    log('initdb ...');
    const pwFile = path.join(os.tmpdir(), `ptaas-pg-pw-${process.pid}`);
    fs.writeFileSync(pwFile, `${PG.password}\n`);
    try {
      const r = spawnSync(initdb, [`--pgdata=${pgDir}`, '--auth=password', `--username=${PG.user}`, `--pwfile=${pwFile}`, '--encoding=UTF8', '--locale=C'], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`initdb failed: ${r.stdout}\n${r.stderr}`);
    } finally { fs.rmSync(pwFile, { force: true }); }
  }
  log('starting postgres ...');
  // Spawn detached like redis (pg_ctl start children die with the caller's job object on Windows).
  const out = fs.openSync(path.join(testenv, 'postgres.log'), 'a');
  const child = spawn(postgresExe, ['-D', pgDir, '-p', String(PG.port), '-c', 'listen_addresses=127.0.0.1'], {
    detached: true, stdio: ['ignore', out, out], windowsHide: true,
  });
  child.unref();
  await waitPort(PG.port, 30_000, 'postgres');
  const pidLine = fs.readFileSync(path.join(pgDir, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0];
  fs.writeFileSync(pgPidFile, pidLine);
  const { default: pg } = await import(pathToUrl(path.join(root, 'node_modules', 'pg', 'esm', 'index.mjs')));
  const deadline = Date.now() + 30_000;
  for (;;) {
    const client = new pg.Client({ host: '127.0.0.1', port: PG.port, user: PG.user, password: PG.password, database: 'postgres' });
    client.on('error', () => undefined);
    try {
      await client.connect();
      const ex = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [PG.database]);
      if (ex.rowCount === 0) { await client.query(`CREATE DATABASE "${PG.database}"`); log(`database ${PG.database} created`); }
      await client.end();
      break;
    } catch (e) {
      await client.end().catch(() => undefined);
      if (Date.now() > deadline) throw e;
      await sleep(300);
    }
  }
  log(`postgres ready on 127.0.0.1:${PG.port}`);
}

async function startRedis() {
  if (await portOpen(REDIS_PORT)) { log(`redis already listening on ${REDIS_PORT}`); return; }
  if (!fs.existsSync(redisExe)) throw new Error(`missing ${redisExe}`);
  const out = fs.openSync(path.join(testenv, 'redis.log'), 'a');
  const child = spawn(redisExe, ['--port', String(REDIS_PORT), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], {
    detached: true, stdio: ['ignore', out, out], windowsHide: true, cwd: path.dirname(redisExe),
  });
  child.unref();
  fs.writeFileSync(redisPidFile, String(child.pid));
  await waitPort(REDIS_PORT, 15_000, 'redis');
  log(`redis ready on 127.0.0.1:${REDIS_PORT} (pid ${child.pid})`);
}

async function stopPostgres() {
  const { pg_ctl } = await pgBinaries();
  if (fs.existsSync(path.join(pgDir, 'postmaster.pid'))) {
    spawnSync(pg_ctl, ['stop', '-m', 'fast', '-w', '-t', '30', '-D', pgDir], { stdio: 'ignore' });
  }
  const pid = readPid(pgPidFile);
  if (pid && pidAlive(pid)) killTree(pid);
  fs.rmSync(pgPidFile, { force: true });
  log('postgres stopped');
}
function stopRedis() {
  const pid = readPid(redisPidFile);
  if (pid && pidAlive(pid)) killTree(pid);
  fs.rmSync(redisPidFile, { force: true });
  log('redis stopped');
}

async function status() {
  const p = await portOpen(PG.port); const r = await portOpen(REDIS_PORT);
  log(`postgres :${PG.port} ${p ? 'UP' : 'down'} | redis :${REDIS_PORT} ${r ? 'UP' : 'down'}`);
  return p && r;
}

const cmd = process.argv[2];
try {
  if (cmd === 'start') {
    try { await startPostgres(); await startRedis(); }
    catch (e) { console.error(`[infra] start failed: ${e.message}`); await stopRedis(); await stopPostgres(); process.exitCode = 1; }
    if (!process.exitCode) await status();
  } else if (cmd === 'stop') { stopRedis(); await stopPostgres(); await status(); }
  else if (cmd === 'status') { process.exitCode = (await status()) ? 0 : 1; }
  else { console.error('usage: infra.mjs start|stop|status'); process.exitCode = 2; }
} catch (e) { console.error(e); process.exitCode = 1; }
