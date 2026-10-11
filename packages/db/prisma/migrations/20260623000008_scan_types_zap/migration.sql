-- M9: New scan types for ZAP integration + OpenAPI spec storage

ALTER TYPE "ScanType" ADD VALUE IF NOT EXISTS 'WEB_CRAWL';
ALTER TYPE "ScanType" ADD VALUE IF NOT EXISTS 'API_SCAN';

-- OpenAPI/Swagger spec URL or inline YAML/JSON for API_SCAN
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "open_api_spec" TEXT;

-- Crawl depth for WEB_CRAWL (default 5)
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "crawl_depth" INTEGER NOT NULL DEFAULT 5;
