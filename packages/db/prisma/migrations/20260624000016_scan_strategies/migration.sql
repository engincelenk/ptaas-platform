-- Sprint 21 M19: Autonomous Scan Strategy
CREATE TABLE "scan_strategies" (
  "id"              TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "fingerprint"     JSONB,
  "plan"            JSONB NOT NULL DEFAULT '[]',
  "reasoning"       TEXT,
  "error_message"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"    TIMESTAMP(3),
  CONSTRAINT "scan_strategies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scan_strategies_project_id_idx" ON "scan_strategies"("project_id");
CREATE INDEX "scan_strategies_org_id_idx"     ON "scan_strategies"("organization_id");
