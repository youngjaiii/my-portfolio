-- Add withdrawal_type column to partner_withdrawals table
-- Supports: total_points (default, existing), store_points, collaboration_store_points
ALTER TABLE "public"."partner_withdrawals"
ADD COLUMN IF NOT EXISTS "withdrawal_type" text NOT NULL DEFAULT 'total_points';

-- Add comment for documentation
COMMENT ON COLUMN "public"."partner_withdrawals"."withdrawal_type" IS '출금 유형: total_points(기본값), store_points, collaboration_store_points';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_type ON "public"."partner_withdrawals"("withdrawal_type");
