CREATE TABLE "scan_schedules" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "target_id"       TEXT NOT NULL,
  "scan_type"       TEXT NOT NULL DEFAULT 'QUICK',
  "cron_expr"       TEXT NOT NULL,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "policy_id"       TEXT,
  "last_run_at"     TIMESTAMP(3),
  "next_run_at"     TIMESTAMP(3),
  "created_by_id"   TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scan_schedules_organization_id_idx" ON "scan_schedules"("organization_id");
CREATE INDEX "scan_schedules_project_id_idx"      ON "scan_schedules"("project_id");
CREATE INDEX "scan_schedules_next_run_is_active_idx" ON "scan_schedules"("next_run_at", "is_active");

ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_target_id_fkey"
  FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
