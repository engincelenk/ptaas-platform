-- Sprint 14 M12: Invitations for org member onboarding

CREATE TABLE "invitations" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "invited_by_id"   TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "role"            "Role" NOT NULL DEFAULT 'VIEWER',
  "token"           TEXT NOT NULL,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  "used_at"         TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
CREATE INDEX "invitations_org_idx"   ON "invitations"("organization_id");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_org_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_user_fk"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id");
