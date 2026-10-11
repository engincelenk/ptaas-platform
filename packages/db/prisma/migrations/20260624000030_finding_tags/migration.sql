-- FindingTag
CREATE TABLE "finding_tags" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "color"           TEXT NOT NULL DEFAULT '#6366f1',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finding_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finding_tags_organization_id_name_key" ON "finding_tags"("organization_id", "name");
CREATE INDEX "finding_tags_organization_id_idx" ON "finding_tags"("organization_id");
ALTER TABLE "finding_tags" ADD CONSTRAINT "finding_tags_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FindingTagAssignment
CREATE TABLE "finding_tag_assignments" (
  "finding_id" TEXT NOT NULL,
  "tag_id"     TEXT NOT NULL,
  CONSTRAINT "finding_tag_assignments_pkey" PRIMARY KEY ("finding_id", "tag_id")
);
ALTER TABLE "finding_tag_assignments" ADD CONSTRAINT "finding_tag_assignments_finding_id_fkey"
  FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finding_tag_assignments" ADD CONSTRAINT "finding_tag_assignments_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "finding_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
