// Drops and recreates the E2E database (ptaas_e2e). Usage: node scripts/e2e/reset-db.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { default: pg } = await import(pathToFileURL(path.join(root, 'node_modules', 'pg', 'esm', 'index.mjs')).href);
const client = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'ptaas', password: 'ptaas_pw', database: 'postgres' });
await client.connect();
await client.query('DROP DATABASE IF EXISTS "ptaas_e2e" WITH (FORCE)');
await client.query('CREATE DATABASE "ptaas_e2e"');
await client.end();
console.log('[reset-db] ptaas_e2e recreated');
