-- Add AI analysis fields to findings
ALTER TABLE "findings" ADD COLUMN "ai_risk_score" DOUBLE PRECISION;
ALTER TABLE "findings" ADD COLUMN "ai_business_impact" TEXT;
ALTER TABLE "findings" ADD COLUMN "ai_analyzed_at" TIMESTAMP(3);
