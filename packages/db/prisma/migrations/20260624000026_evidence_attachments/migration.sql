-- CreateTable
CREATE TABLE "evidences" (
  "id"              TEXT NOT NULL,
  "finding_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "uploaded_by_id"  TEXT NOT NULL,
  "filename"        TEXT NOT NULL,
  "original_name"   TEXT NOT NULL,
  "mime_type"       TEXT NOT NULL,
  "size"            INTEGER NOT NULL,
  "storage_path"    TEXT NOT NULL,
  "caption"         TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidences_finding_id_idx" ON "evidences"("finding_id");
CREATE INDEX "evidences_organization_id_idx" ON "evidences"("organization_id");

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_finding_id_fkey"
  FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidences" ADD CONSTRAINT "evidences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidences" ADD CONSTRAINT "evidences_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
