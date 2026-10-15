#!/usr/bin/env bash
# Startet die API lokal gegen die Embedded-Infra (node scripts/e2e/infra.mjs start).
# Liest Secrets aus der (gitignorierten) Root-.env und ueberschreibt nur DB/Redis.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
export DATABASE_URL="postgresql://ptaas:ptaas_pw@127.0.0.1:55432/ptaas_e2e?schema=public"
export REDIS_URL="redis://127.0.0.1:56379"
export NODE_ENV=development
cd apps/api
exec npm run dev
