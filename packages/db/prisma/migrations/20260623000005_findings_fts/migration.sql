-- Full-Text Search index on findings
-- tsvector combines title + templateName + matchedAt + CVE/CWE IDs
ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(template_name, '') || ' ' ||
      coalesce(template_id, '') || ' ' ||
      coalesce(matched_at, '') || ' ' ||
      coalesce(array_to_string(cve_ids, ' '), '') || ' ' ||
      coalesce(array_to_string(cwe_ids, ' '), '') || ' ' ||
      coalesce(owasp, '') || ' ' ||
      coalesce(ai_explanation, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "findings_search_vector_idx"
  ON "findings" USING GIN ("search_vector");
