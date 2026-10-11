-- CreateTable: ThreatBrief
CREATE TABLE "threat_briefs" (
    "id"             TEXT NOT NULL,
    "org_id"         TEXT NOT NULL,
    "week_start"     DATE NOT NULL,
    "summary"        TEXT NOT NULL,
    "highlights"     JSONB NOT NULL DEFAULT '[]',
    "email_sent_at"  TIMESTAMP(3),
    "generated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threat_briefs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "threat_briefs_org_id_idx" ON "threat_briefs"("org_id");
CREATE UNIQUE INDEX "threat_briefs_org_id_week_start_key" ON "threat_briefs"("org_id", "week_start");

ALTER TABLE "threat_briefs" ADD CONSTRAINT "threat_briefs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
