-- M43: Jira Two-Way Sync
-- Adds jira_issue_key to findings for status sync

ALTER TABLE findings ADD COLUMN IF NOT EXISTS jira_issue_key TEXT;

CREATE INDEX IF NOT EXISTS idx_findings_jira_issue_key ON findings(jira_issue_key) WHERE jira_issue_key IS NOT NULL;
