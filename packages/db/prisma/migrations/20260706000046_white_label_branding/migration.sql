-- M46: White-Label PDF Branding
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_primary_color TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_company_name  TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_footer_text   TEXT;
