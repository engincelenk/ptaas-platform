-- Sprint 19 M17: CVE Enrichment fields on findings
ALTER TABLE "findings"
  ADD COLUMN IF NOT EXISTS "epss_score"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "epss_percentile"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "kev_listed"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priority_score"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "nvd_description"  TEXT,
  ADD COLUMN IF NOT EXISTS "enriched_at"      TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "findings_priority_score_idx" ON "findings"("priority_score");
CREATE INDEX IF NOT EXISTS "findings_kev_listed_idx" ON "findings"("kev_listed");
