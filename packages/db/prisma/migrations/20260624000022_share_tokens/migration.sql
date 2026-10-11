CREATE TABLE "share_tokens" (
    "id"            TEXT NOT NULL,
    "token"         TEXT NOT NULL,
    "project_id"    TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "password_hash" TEXT,
    "label"         TEXT,
    "expires_at"    TIMESTAMP(3) NOT NULL,
    "revoked_at"    TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "share_tokens_token_key" ON "share_tokens"("token");
CREATE INDEX "share_tokens_project_id_idx" ON "share_tokens"("project_id");

ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
