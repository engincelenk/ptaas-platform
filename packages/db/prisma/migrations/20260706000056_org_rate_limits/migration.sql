-- M56: Per-org rate limits
CREATE TABLE IF NOT EXISTS org_rate_limits (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  requests_per_minute  INTEGER NOT NULL DEFAULT 100,
  requests_per_hour    INTEGER NOT NULL DEFAULT 3000,
  burst_size           INTEGER NOT NULL DEFAULT 20,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
