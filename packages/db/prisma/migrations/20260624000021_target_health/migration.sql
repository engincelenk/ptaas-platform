CREATE TABLE "target_health_checks" (
    "id"               TEXT NOT NULL,
    "target_id"        TEXT NOT NULL,
    "status_code"      INTEGER,
    "response_time_ms" INTEGER,
    "is_up"            BOOLEAN NOT NULL,
    "error"            TEXT,
    "checked_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_health_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "target_health_checks_target_id_idx"   ON "target_health_checks"("target_id");
CREATE INDEX "target_health_checks_checked_at_idx"  ON "target_health_checks"("checked_at");

ALTER TABLE "target_health_checks" ADD CONSTRAINT "target_health_checks_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retention: keep only 7 days of health data (cleaned by retention job)
