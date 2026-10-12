-- CreateEnum
CREATE TYPE "ArenaAdapter" AS ENUM ('OPENAI_COMPAT', 'ANTHROPIC', 'GENERIC_JSON');

-- CreateEnum
CREATE TYPE "ArenaRunStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'ABORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ArenaGoalCategory" AS ENUM ('PROMPT_INJECTION', 'SYSTEM_PROMPT_LEAK', 'SENSITIVE_DISCLOSURE', 'JAILBREAK', 'OUTPUT_HANDLING');

-- CreateEnum
CREATE TYPE "ArenaAttemptKind" AS ENUM ('RECON', 'ATTACK');

-- CreateEnum
CREATE TYPE "ArenaVerdict" AS ENUM ('BREACH', 'BLOCKED', 'UNCLEAR');

-- AlterEnum
ALTER TYPE "ScanType" ADD VALUE 'AI_ARENA';

-- CreateTable
CREATE TABLE "ai_targets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapter" "ArenaAdapter" NOT NULL,
    "request_mapping" JSONB,
    "response_mapping" JSONB,
    "auth_header_name" TEXT,
    "api_key_encrypted" TEXT,
    "known_prompt_fragments_encrypted" TEXT,
    "canary_placed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_roe" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_roe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_goals" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "category" "ArenaGoalCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owasp_ref" TEXT,
    "atlas_ref" TEXT,
    "base_severity" "Severity" NOT NULL,
    "seed_attacks" JSONB NOT NULL,
    "success_criteria" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ai_target_id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "status" "ArenaRunStatus" NOT NULL DEFAULT 'DRAFT',
    "goal_ids" TEXT[],
    "max_rounds" INTEGER NOT NULL DEFAULT 5,
    "max_requests" INTEGER NOT NULL DEFAULT 100,
    "max_tokens" INTEGER NOT NULL DEFAULT 200000,
    "requests_per_second" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "window_start" TIMESTAMP(3),
    "window_end" TIMESTAMP(3),
    "used_requests" INTEGER NOT NULL DEFAULT 0,
    "used_tokens" INTEGER NOT NULL DEFAULT 0,
    "roe_id" TEXT,
    "emergency_contact" TEXT,
    "approved_by_id" TEXT,
    "approved_by_name" TEXT,
    "approved_at" TIMESTAMP(3),
    "model_versions" JSONB,
    "retest_of_run_id" TEXT,
    "aborted_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arena_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_attempts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "kind" "ArenaAttemptKind" NOT NULL,
    "technique" TEXT NOT NULL,
    "attack_text" TEXT NOT NULL,
    "response_text" TEXT,
    "verdict" "ArenaVerdict",
    "confidence" DOUBLE PRECISION,
    "evidence" JSONB,
    "repro" JSONB,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "finding_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_recommendations" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "ArenaGoalCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_targets_target_id_key" ON "ai_targets"("target_id");

-- CreateIndex
CREATE INDEX "ai_targets_organization_id_idx" ON "ai_targets"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "arena_roe_version_key" ON "arena_roe"("version");

-- CreateIndex
CREATE UNIQUE INDEX "arena_goals_key_key" ON "arena_goals"("key");

-- CreateIndex
CREATE INDEX "arena_goals_category_idx" ON "arena_goals"("category");

-- CreateIndex
CREATE UNIQUE INDEX "arena_runs_scan_id_key" ON "arena_runs"("scan_id");

-- CreateIndex
CREATE INDEX "arena_runs_organization_id_idx" ON "arena_runs"("organization_id");

-- CreateIndex
CREATE INDEX "arena_runs_ai_target_id_idx" ON "arena_runs"("ai_target_id");

-- CreateIndex
CREATE INDEX "arena_runs_status_idx" ON "arena_runs"("status");

-- CreateIndex
CREATE INDEX "arena_attempts_run_id_round_idx" ON "arena_attempts"("run_id", "round");

-- CreateIndex
CREATE INDEX "arena_attempts_organization_id_idx" ON "arena_attempts"("organization_id");

-- CreateIndex
CREATE INDEX "arena_attempts_expires_at_idx" ON "arena_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "arena_recommendations_run_id_idx" ON "arena_recommendations"("run_id");

-- CreateIndex
CREATE INDEX "arena_recommendations_organization_id_idx" ON "arena_recommendations"("organization_id");

-- AddForeignKey
ALTER TABLE "ai_targets" ADD CONSTRAINT "ai_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_targets" ADD CONSTRAINT "ai_targets_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_targets" ADD CONSTRAINT "ai_targets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_ai_target_id_fkey" FOREIGN KEY ("ai_target_id") REFERENCES "ai_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_roe_id_fkey" FOREIGN KEY ("roe_id") REFERENCES "arena_roe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_runs" ADD CONSTRAINT "arena_runs_retest_of_run_id_fkey" FOREIGN KEY ("retest_of_run_id") REFERENCES "arena_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_attempts" ADD CONSTRAINT "arena_attempts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "arena_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_attempts" ADD CONSTRAINT "arena_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_attempts" ADD CONSTRAINT "arena_attempts_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "arena_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_attempts" ADD CONSTRAINT "arena_attempts_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_recommendations" ADD CONSTRAINT "arena_recommendations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "arena_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_recommendations" ADD CONSTRAINT "arena_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

