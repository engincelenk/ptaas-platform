-- Sprint 17 M15: API Keys
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "created_by_id"   TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "key_hash"        TEXT NOT NULL,
  "key_prefix"      TEXT NOT NULL,
  "scopes"          TEXT[] NOT NULL DEFAULT '{}',
  "expires_at"      TIMESTAMP(3),
  "last_used_at"    TIMESTAMP(3),
  "revoked_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys"("key_hash");
