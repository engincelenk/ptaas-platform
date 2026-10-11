-- CreateTable
CREATE TABLE "risk_acceptances" (
  "id"              TEXT NOT NULL,
  "finding_id"      TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "approved_by_id"  TEXT NOT NULL,
  "decision"        TEXT NOT NULL,
  "justification"   TEXT NOT NULL,
  "expires_at"      TIMESTAMP(3),
  "reviewed_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "risk_acceptances_finding_id_key" ON "risk_acceptances"("finding_id");
CREATE INDEX "risk_acceptances_organization_id_idx" ON "risk_acceptances"("organization_id");
CREATE INDEX "risk_acceptances_expires_at_idx"      ON "risk_acceptances"("expires_at");

ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_finding_id_fkey"
  FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
