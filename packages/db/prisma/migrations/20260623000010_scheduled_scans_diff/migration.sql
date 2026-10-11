-- Sprint 13 M11: Scheduled scans, diff-engine, trend analysis

-- Target: schedule fields
ALTER TABLE "targets"
  ADD COLUMN IF NOT EXISTS "schedule_enabled"   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "schedule_cron"      TEXT,
  ADD COLUMN IF NOT EXISTS "last_scheduled_at"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "targets_schedule_enabled_idx" ON "targets"("schedule_enabled");

-- Finding: diff status
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "diff_status" TEXT;  -- NEW | PERSISTING | RESOLVED

CREATE INDEX IF NOT EXISTS "findings_diff_status_idx" ON "findings"("diff_status");

-- Scan: reference to previous scan for diff
ALTER TABLE "scans"
  ADD COLUMN IF NOT EXISTS "previous_scan_id" TEXT;
