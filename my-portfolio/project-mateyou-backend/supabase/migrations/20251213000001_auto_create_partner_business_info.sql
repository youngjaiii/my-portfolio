-- Auto-create partner_business_info when a new partner is created
-- This ensures every partner always has a corresponding business info record

CREATE OR REPLACE FUNCTION create_partner_business_info()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO partner_business_info (partner_id)
  VALUES (NEW.id)
  ON CONFLICT (partner_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trg_create_partner_business_info ON partners;

-- Create trigger
CREATE TRIGGER trg_create_partner_business_info
AFTER INSERT ON partners
FOR EACH ROW
EXECUTE FUNCTION create_partner_business_info();

-- Backfill: Create partner_business_info for existing partners that don't have one
INSERT INTO partner_business_info (partner_id)
SELECT p.id
FROM partners p
LEFT JOIN partner_business_info pbi ON p.id = pbi.partner_id
WHERE pbi.partner_id IS NULL
ON CONFLICT (partner_id) DO NOTHING;
