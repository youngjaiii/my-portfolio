-- Extend handle_partner_withdrawal trigger to handle store_points and collaboration_store_points
-- This maintains backward compatibility with total_points while adding support for new point types

-- Drop the existing function to replace it
DROP FUNCTION IF EXISTS public.handle_partner_withdrawal() CASCADE;

-- Create the new extended function
CREATE OR REPLACE FUNCTION public.handle_partner_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- Check withdrawal_type and deduct from appropriate points column
    IF COALESCE(NEW.withdrawal_type, 'total_points') = 'store_points' THEN
      -- Deduct from store_points
      UPDATE public.partners
      SET store_points = GREATEST(COALESCE(store_points, 0) - NEW.requested_amount, 0),
          updated_at = now()
      WHERE id = NEW.partner_id;
    ELSIF NEW.withdrawal_type = 'collaboration_store_points' THEN
      -- Deduct from collaboration_store_points
      UPDATE public.partners
      SET collaboration_store_points = GREATEST(COALESCE(collaboration_store_points, 0) - NEW.requested_amount, 0),
          updated_at = now()
      WHERE id = NEW.partner_id;
    ELSE
      -- Default: deduct from total_points (existing behavior)
      UPDATE public.partners
      SET total_points = GREATEST(COALESCE(total_points, 0) - NEW.requested_amount, 0),
          updated_at = now()
      WHERE id = NEW.partner_id;
    END IF;
    
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate the trigger on partner_withdrawals
DROP TRIGGER IF EXISTS tr_partner_withdrawal ON public.partner_withdrawals;

CREATE TRIGGER tr_partner_withdrawal
  BEFORE UPDATE ON public.partner_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_partner_withdrawal();

-- Add comment for clarity
COMMENT ON FUNCTION public.handle_partner_withdrawal() IS 
'Trigger function to deduct points when withdrawal is approved. 
Handles total_points (default), store_points, and collaboration_store_points based on withdrawal_type column.';

-- =====================================================
-- Add log triggers for store_points and collaboration_store_points changes
-- Similar to existing log_partner_total_points_change trigger
-- =====================================================

-- Trigger function to log store_points changes
CREATE OR REPLACE FUNCTION public.log_partner_store_points_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE diff int;
BEGIN
  IF NEW.store_points IS DISTINCT FROM OLD.store_points THEN
    diff := COALESCE(NEW.store_points, 0) - COALESCE(OLD.store_points, 0);
    INSERT INTO public.partner_points_logs (partner_id, type, amount, description, log_id)
    VALUES (
      NEW.id,
      CASE WHEN diff >= 0 THEN 'earn' ELSE 'spend' END,
      ABS(diff),
      CASE WHEN diff >= 0 THEN 'store_points 적립' ELSE 'store_points 출금 승인' END,
      'store_' || gen_random_uuid()::text
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger function to log collaboration_store_points changes
CREATE OR REPLACE FUNCTION public.log_partner_collaboration_store_points_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE diff int;
BEGIN
  IF NEW.collaboration_store_points IS DISTINCT FROM OLD.collaboration_store_points THEN
    diff := COALESCE(NEW.collaboration_store_points, 0) - COALESCE(OLD.collaboration_store_points, 0);
    INSERT INTO public.partner_points_logs (partner_id, type, amount, description, log_id)
    VALUES (
      NEW.id,
      CASE WHEN diff >= 0 THEN 'earn' ELSE 'spend' END,
      ABS(diff),
      CASE WHEN diff >= 0 THEN 'collaboration_store_points 적립' ELSE 'collaboration_store_points 출금 승인' END,
      'collab_' || gen_random_uuid()::text
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger for store_points changes on partners table
DROP TRIGGER IF EXISTS tr_log_store_points_change ON public.partners;

CREATE TRIGGER tr_log_store_points_change
  AFTER UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.log_partner_store_points_change();

-- Create trigger for collaboration_store_points changes on partners table
DROP TRIGGER IF EXISTS tr_log_collaboration_store_points_change ON public.partners;

CREATE TRIGGER tr_log_collaboration_store_points_change
  AFTER UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.log_partner_collaboration_store_points_change();

-- Add comments
COMMENT ON FUNCTION public.log_partner_store_points_change() IS 
'Trigger function to automatically log store_points changes in partner_points_logs table.';

COMMENT ON FUNCTION public.log_partner_collaboration_store_points_change() IS 
'Trigger function to automatically log collaboration_store_points changes in partner_points_logs table.';
