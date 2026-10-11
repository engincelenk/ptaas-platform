CREATE TABLE "sla_policies" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "critical_days"   INTEGER NOT NULL DEFAULT 7,
  "high_days"       INTEGER NOT NULL DEFAULT 30,
  "medium_days"     INTEGER NOT NULL DEFAULT 90,
  "low_days"        INTEGER NOT NULL DEFAULT 180,
  "info_days"       INTEGER NOT NULL DEFAULT 365,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sla_policies_organization_id_key" ON "sla_policies"("organization_id");
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
