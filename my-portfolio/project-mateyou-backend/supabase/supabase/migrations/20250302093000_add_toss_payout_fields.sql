-- Adds Toss Payments payout integration metadata to partners
alter table public.partners
  add column if not exists tosspayments_seller_id text,
  add column if not exists tosspayments_ref_seller_id text,
  add column if not exists tosspayments_status text,
  add column if not exists tosspayments_synced_at timestamptz,
  add column if not exists tosspayments_last_error text,
  add column if not exists legal_name text,
  add column if not exists legal_email text,
  add column if not exists legal_phone text,
  add column if not exists payout_bank_code text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_account_number text,
  add column if not exists payout_account_holder text,
  add column if not exists tosspayments_business_type text;

create unique index if not exists partners_tosspayments_ref_idx
  on public.partners (tosspayments_ref_seller_id)
  where tosspayments_ref_seller_id is not null;
