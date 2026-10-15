-- Add assignedToId and dueDate to findings
-- assigned_to_id and its FK already exist since 20260623000003_scans_findings, so a fresh
-- `prisma migrate deploy` failed here with 42701 (column already exists). Made idempotent.
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "assigned_to_id" TEXT;
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'findings_assigned_to_id_fkey') THEN
    ALTER TABLE "findings" ADD CONSTRAINT "findings_assigned_to_id_fkey"
      FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "findings_assigned_to_id_idx" ON "findings"("assigned_to_id");
CREATE INDEX IF NOT EXISTS "findings_due_date_idx" ON "findings"("due_date");

-- FindingComment
CREATE TABLE "finding_comments" (
    "id"         TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finding_comments_finding_id_idx" ON "finding_comments"("finding_id");

ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_finding_id_fkey"
    FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finding_comments" ADD CONSTRAINT "finding_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FindingActivity
CREATE TABLE "finding_activities" (
    "id"         TEXT NOT NULL,
    "type"       TEXT NOT NULL,  -- status_change | assignee_change | due_date_set | comment | retest_requested | retest_completed
    "payload"    JSONB NOT NULL DEFAULT '{}',
    "finding_id" TEXT NOT NULL,
    "user_id"    TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finding_activities_finding_id_idx" ON "finding_activities"("finding_id");

ALTER TABLE "finding_activities" ADD CONSTRAINT "finding_activities_finding_id_fkey"
    FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finding_activities" ADD CONSTRAINT "finding_activities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
