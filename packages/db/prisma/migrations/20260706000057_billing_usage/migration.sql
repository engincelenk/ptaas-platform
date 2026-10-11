-- M57: Billing & Usage tracking
CREATE TABLE IF NOT EXISTS usage_snapshots (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  scan_count     INTEGER NOT NULL DEFAULT 0,
  finding_count  INTEGER NOT NULL DEFAULT 0,
  user_count     INTEGER NOT NULL DEFAULT 0,
  api_call_count BIGINT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_org_period ON usage_snapshots(org_id, period_start DESC);
