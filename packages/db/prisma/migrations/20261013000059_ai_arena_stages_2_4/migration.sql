-- CreateEnum
CREATE TYPE "ArenaTargetKind" AS ENUM ('CHAT', 'RAG', 'AGENT', 'WIDGET');

-- CreateEnum
CREATE TYPE "ArenaEnvironment" AS ENUM ('STAGING', 'PRODUCTION');

-- AlterEnum
ALTER TYPE "ArenaAdapter" ADD VALUE 'WIDGET';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ArenaGoalCategory" ADD VALUE 'INDIRECT_INJECTION';
ALTER TYPE "ArenaGoalCategory" ADD VALUE 'EXCESSIVE_AGENCY';

-- AlterTable
ALTER TABLE "ai_targets" ADD COLUMN     "agent_config" JSONB,
ADD COLUMN     "environment" "ArenaEnvironment" NOT NULL DEFAULT 'PRODUCTION',
ADD COLUMN     "kind" "ArenaTargetKind" NOT NULL DEFAULT 'CHAT',
ADD COLUMN     "rag_config" JSONB,
ADD COLUMN     "rag_docs_placed_at" TIMESTAMP(3),
ADD COLUMN     "sandbox_attested_at" TIMESTAMP(3),
ADD COLUMN     "staging_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "widget_config" JSONB;

-- AlterTable
ALTER TABLE "arena_goals" ADD COLUMN     "kinds" "ArenaTargetKind"[] DEFAULT ARRAY['CHAT', 'RAG', 'AGENT', 'WIDGET']::"ArenaTargetKind"[];

-- AlterTable
ALTER TABLE "arena_runs" ADD COLUMN     "artifacts" JSONB;

