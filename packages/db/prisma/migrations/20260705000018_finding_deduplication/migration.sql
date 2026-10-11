-- M38: AI Finding Deduplication
-- Adds self-referential duplicate_of_id to findings

ALTER TABLE findings ADD COLUMN IF NOT EXISTS duplicate_of_id TEXT;

ALTER TABLE findings
  ADD CONSTRAINT fk_findings_duplicate_of
  FOREIGN KEY (duplicate_of_id)
  REFERENCES findings(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_findings_duplicate_of ON findings(duplicate_of_id);
