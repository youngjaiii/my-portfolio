-- Add admin_notes and processed_at columns to partner_withdrawals table

ALTER TABLE public.partner_withdrawals
ADD COLUMN IF NOT EXISTS admin_notes text null,
ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone null;

