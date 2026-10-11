-- CreateTable
CREATE TABLE "engagements" (
  "id"              TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "start_date"      TIMESTAMP(3),
  "end_date"        TIMESTAMP(3),
  "testing_hours"   INTEGER,
  "roe_text"        TEXT,
  "scope_notes"     TEXT,
  "signed_off_by_id" TEXT,
  "signed_off_at"   TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "engagements_project_id_key" ON "engagements"("project_id");
CREATE INDEX "engagements_organization_id_idx" ON "engagements"("organization_id");

ALTER TABLE "engagements" ADD CONSTRAINT "engagements_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "engagements" ADD CONSTRAINT "engagements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "engagements" ADD CONSTRAINT "engagements_signed_off_by_id_fkey"
  FOREIGN KEY ("signed_off_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
