-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "TargetType" AS ENUM ('DOMAIN', 'SUBDOMAIN', 'IP', 'IP_RANGE', 'URL');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "VerificationMethod" AS ENUM ('DNS_TXT', 'HTTP_FILE', 'META_TAG');

-- CreateTable: projects
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable: targets
CREATE TABLE "targets" (
    "id" TEXT NOT NULL,
    "type" "TargetType" NOT NULL,
    "value" TEXT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_method" "VerificationMethod",
    "verification_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "targets" ADD CONSTRAINT "targets_verification_token_key" UNIQUE ("verification_token");
ALTER TABLE "targets" ADD CONSTRAINT "targets_project_id_value_key" UNIQUE ("project_id", "value");

-- Indexes
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");
CREATE INDEX "targets_organization_id_idx" ON "targets"("organization_id");
CREATE INDEX "targets_project_id_idx" ON "targets"("project_id");

-- Foreign Keys
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "targets" ADD CONSTRAINT "targets_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "targets" ADD CONSTRAINT "targets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "targets" ADD CONSTRAINT "targets_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE CASCADE;
