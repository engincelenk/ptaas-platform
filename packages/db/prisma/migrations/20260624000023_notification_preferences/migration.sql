CREATE TABLE "user_notification_preferences" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_notification_preferences_user_event_key"
    ON "user_notification_preferences"("user_id", "event_type");

CREATE INDEX "user_notification_preferences_user_id_idx"
    ON "user_notification_preferences"("user_id");

ALTER TABLE "user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
