-- M55: Multi-Region support — store region preference on Organization
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS data_region TEXT NOT NULL DEFAULT 'eu-west-1';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_regions TEXT[] NOT NULL DEFAULT ARRAY['eu-west-1'];
