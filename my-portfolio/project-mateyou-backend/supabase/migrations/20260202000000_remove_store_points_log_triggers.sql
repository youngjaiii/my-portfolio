-- Remove store_points and collaboration_store_points log triggers
-- Logging will be handled in API code instead of triggers

-- Drop triggers
DROP TRIGGER IF EXISTS tr_log_store_points_change ON public.partners;
DROP TRIGGER IF EXISTS tr_log_collaboration_store_points_change ON public.partners;

-- Drop trigger functions
DROP FUNCTION IF EXISTS public.log_partner_store_points_change();
DROP FUNCTION IF EXISTS public.log_partner_collaboration_store_points_change();

-- Note: handle_partner_withdrawal trigger is kept for point deduction
-- Only log triggers are removed, logging is now handled in admin.route.ts
