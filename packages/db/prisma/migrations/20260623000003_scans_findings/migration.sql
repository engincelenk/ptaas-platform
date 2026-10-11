-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ScanType" AS ENUM ('QUICK', 'FULL');
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
CREATE TYPE "FindingStatus" AS ENUM (
    'OPEN', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'CLOSED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'
);

-- CreateTable: scans
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "type" "ScanType" NOT NULL DEFAULT 'QUICK',
    "template_categories" TEXT[] NOT NULL DEFAULT ARRAY['cves','misconfigurations','exposures']::TEXT[],
    "exclude_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rate_limit" INTEGER NOT NULL DEFAULT 100,
    "credential_type" TEXT,
    "credential_value" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total_templates" INTEGER NOT NULL DEFAULT 0,
    "current_activity" TEXT,
    "bull_job_id" TEXT,
    "error_message" TEXT,
    "target_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: findings
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "template_id" TEXT,
    "template_name" TEXT,
    "matched_at" TEXT,
    "nuclei_output" JSONB,
    "http_request" TEXT,
    "http_response" TEXT,
    "cvss_score" DOUBLE PRECISION,
    "cvss_vector" TEXT,
    "cve_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cwe_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "owasp" TEXT,
    "ai_explanation" TEXT,
    "ai_remediation" TEXT,
    "ai_fp_score" DOUBLE PRECISION,
    "scan_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "scans_organization_id_idx" ON "scans"("organization_id");
CREATE INDEX "scans_project_id_idx" ON "scans"("project_id");
CREATE INDEX "scans_target_id_idx" ON "scans"("target_id");
CREATE INDEX "scans_status_idx" ON "scans"("status");

CREATE INDEX "findings_organization_id_idx" ON "findings"("organization_id");
CREATE INDEX "findings_project_id_idx" ON "findings"("project_id");
CREATE INDEX "findings_scan_id_idx" ON "findings"("scan_id");
CREATE INDEX "findings_severity_idx" ON "findings"("severity");
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- Foreign keys: scans
ALTER TABLE "scans" ADD CONSTRAINT "scans_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON UPDATE CASCADE;
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE;
ALTER TABLE "scans" ADD CONSTRAINT "scans_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON UPDATE CASCADE;
ALTER TABLE "scans" ADD CONSTRAINT "scans_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;

-- Foreign keys: findings
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_fkey"
    FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
