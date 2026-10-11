-- Sprint 16 M14: Custom Scan Policies
CREATE TABLE IF NOT EXISTS "scan_policies" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id"       TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "description"           TEXT,
  "nuclei_tags"           TEXT[] NOT NULL DEFAULT '{}',
  "nuclei_severities"     TEXT[] NOT NULL DEFAULT '{}',
  "excluded_templates"    TEXT[] NOT NULL DEFAULT '{}',
  "max_duration_seconds"  INTEGER NOT NULL DEFAULT 3600,
  "rate_limit"            INTEGER NOT NULL DEFAULT 150,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scan_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scan_policies"
  ADD CONSTRAINT "scan_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "scan_policies_organization_id_idx" ON "scan_policies"("organization_id");

ALTER TABLE "scans"
  ADD COLUMN IF NOT EXISTS "policy_id" TEXT;

ALTER TABLE "scans"
  ADD CONSTRAINT "scans_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "scan_policies"("id") ON DELETE SET NULL;
