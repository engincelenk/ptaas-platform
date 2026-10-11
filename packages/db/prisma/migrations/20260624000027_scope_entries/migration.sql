-- CreateTable
CREATE TABLE "scope_entries" (
  "id"              TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "added_by_id"     TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "in_scope"        BOOLEAN NOT NULL DEFAULT true,
  "note"            TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scope_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scope_entries_project_id_idx"      ON "scope_entries"("project_id");
CREATE INDEX "scope_entries_organization_id_idx" ON "scope_entries"("organization_id");

ALTER TABLE "scope_entries" ADD CONSTRAINT "scope_entries_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scope_entries" ADD CONSTRAINT "scope_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scope_entries" ADD CONSTRAINT "scope_entries_added_by_id_fkey"
  FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
