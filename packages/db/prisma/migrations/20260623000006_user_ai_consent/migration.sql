-- DSGVO: AI analysis consent flag on User
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ai_consent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_consent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Soft-delete index
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");
