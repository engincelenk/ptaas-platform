-- Full-Text Search index on findings
-- tsvector combines title + templateName + matchedAt + CVE/CWE IDs
-- array_to_string(anyarray, text) is only STABLE in PostgreSQL, so it is rejected in a generated column
-- (ERROR 42P17 "generation expression is not immutable"). For text[] the result is deterministic, so a
-- thin IMMUTABLE SQL wrapper is safe.
CREATE OR REPLACE FUNCTION ptaas_immutable_array_to_string(arr text[], sep text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string(arr, sep) $$;

ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(template_name, '') || ' ' ||
      coalesce(template_id, '') || ' ' ||
      coalesce(matched_at, '') || ' ' ||
      coalesce(ptaas_immutable_array_to_string(cve_ids, ' '), '') || ' ' ||
      coalesce(ptaas_immutable_array_to_string(cwe_ids, ' '), '') || ' ' ||
      coalesce(owasp, '') || ' ' ||
      coalesce(ai_explanation, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "findings_search_vector_idx"
  ON "findings" USING GIN ("search_vector");
