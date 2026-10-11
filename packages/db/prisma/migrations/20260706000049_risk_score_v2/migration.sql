-- M49: AI Risk Scoring v2
ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_score_v2           DOUBLE PRECISION;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_score_v2_breakdown JSONB;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_score_v2_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_findings_risk_score_v2 ON findings(risk_score_v2 DESC) WHERE risk_score_v2 IS NOT NULL;
