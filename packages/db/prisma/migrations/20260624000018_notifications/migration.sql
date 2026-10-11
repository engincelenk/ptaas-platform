-- Sprint 24 M22: Notification Center
CREATE TABLE "notifications" (
  "id"         TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT,
  "link"       TEXT,
  "read_at"    TIMESTAMP(3),
  "user_id"    TEXT NOT NULL,
  "org_id"     TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_idx"         ON "notifications"("user_id");
CREATE INDEX "notifications_org_id_idx"          ON "notifications"("org_id");
CREATE INDEX "notifications_user_unread_idx"     ON "notifications"("user_id", "read_at") WHERE "read_at" IS NULL;
