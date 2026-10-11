-- Sprint 20 M18: Retest Workflow
ALTER TYPE "ScanType" ADD VALUE IF NOT EXISTS 'RETEST';

ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "retest_scan_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "retest_status"          TEXT,
  ADD COLUMN IF NOT EXISTS "retest_requested_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retest_completed_at"    TIMESTAMP(3);

ALTER TABLE "scans"
  ADD COLUMN IF NOT EXISTS "retest_finding_ids"     TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "findings_retest_status_idx" ON "findings"("retest_status");
