-- Migration: Integration + WebhookDelivery models (Sprint 12 M10)

CREATE TYPE "IntegrationType" AS ENUM ('WEBHOOK', 'GITHUB', 'JIRA', 'SLACK');

CREATE TABLE "integrations" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "type"            "IntegrationType" NOT NULL,
  "name"            TEXT NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  -- AES-256-GCM encrypted JSON blob: {token?, webhookUrl?, repoOwner?, ...}
  "config_encrypted" TEXT NOT NULL,
  -- Which events trigger this integration: ['finding.created','scan.completed','scan.failed']
  "events"          TEXT[] NOT NULL DEFAULT ARRAY['finding.created','scan.completed'],
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integrations_org_idx" ON "integrations"("organization_id");
CREATE UNIQUE INDEX "integrations_org_type_name_idx" ON "integrations"("organization_id", "type", "name");

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_org_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- Delivery log (audit trail for webhook / integration calls)
CREATE TABLE "webhook_deliveries" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "integration_id"   TEXT NOT NULL,
  "event"            TEXT NOT NULL,
  "payload"          TEXT NOT NULL,          -- JSON, truncated to 64 KB
  "status"           TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SUCCESS | FAILED
  "response_code"    INTEGER,
  "response_body"    TEXT,
  "attempts"         INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at"  TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_deliveries_integration_idx" ON "webhook_deliveries"("integration_id");
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_integration_fk"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE;
