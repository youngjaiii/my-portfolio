-- Add tosspayments_last_seller_id column to store deleted seller ID for reference
ALTER TABLE public.partners
ADD COLUMN IF NOT EXISTS tosspayments_last_seller_id text;

COMMENT ON COLUMN public.partners.tosspayments_last_seller_id IS '마지막으로 삭제된 토스페이먼츠 셀러 ID (참조용)';

