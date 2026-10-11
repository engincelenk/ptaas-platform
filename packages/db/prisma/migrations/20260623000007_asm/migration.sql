-- Attack Surface Management: discovered assets + scan tracking

CREATE TYPE "AssetType" AS ENUM ('SUBDOMAIN', 'IP', 'URL');
CREATE TYPE "AssetStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'OFFLINE', 'IGNORED');
CREATE TYPE "AsmScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "assets" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "root_domain"     TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "type"            "AssetType" NOT NULL DEFAULT 'SUBDOMAIN',
  "status"          "AssetStatus" NOT NULL DEFAULT 'SUGGESTED',

  -- HTTP fingerprint
  "http_status"     INTEGER,
  "http_title"      TEXT,
  "http_server"     TEXT,
  "technologies"    TEXT[] NOT NULL DEFAULT '{}',

  -- DNS
  "ip_addresses"    TEXT[] NOT NULL DEFAULT '{}',
  "dns_records"     JSONB,
  "dns_issues"      TEXT[] NOT NULL DEFAULT '{}',

  -- Link to Target (set when user accepts suggestion)
  "target_id"       TEXT UNIQUE,

  "discovered_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assets_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "assets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "assets_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "assets_project_id_value_key" ON "assets"("project_id", "value");
CREATE INDEX "assets_project_id_idx" ON "assets"("project_id");
CREATE INDEX "assets_status_idx" ON "assets"("status");

CREATE TABLE "asm_scans" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "root_domain"     TEXT NOT NULL,
  "status"          "AsmScanStatus" NOT NULL DEFAULT 'PENDING',
  "assets_found"    INTEGER NOT NULL DEFAULT 0,
  "bull_job_id"     TEXT,
  "started_at"      TIMESTAMP(3),
  "completed_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "asm_scans_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);

CREATE INDEX "asm_scans_project_id_idx" ON "asm_scans"("project_id");
