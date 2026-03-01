-- Add cancel_message column to store descriptive text when a request is cancelled
ALTER TABLE public.partner_requests
ADD COLUMN IF NOT EXISTS cancel_message text;

