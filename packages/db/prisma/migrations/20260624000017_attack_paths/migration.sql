-- Sprint 22 M20: Attack Path Modelling
CREATE TABLE "attack_paths" (
  "id"              TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "nodes"           JSONB NOT NULL DEFAULT '[]',
  "edges"           JSONB NOT NULL DEFAULT '[]',
  "impact_score"    DOUBLE PRECISION,
  "likelihood"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attack_paths_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attack_paths_project_id_idx" ON "attack_paths"("project_id");
CREATE INDEX "attack_paths_org_id_idx"     ON "attack_paths"("organization_id");
