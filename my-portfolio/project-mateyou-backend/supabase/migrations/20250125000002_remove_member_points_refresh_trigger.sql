-- Remove trigger that automatically recalculates members.total_points from member_points_logs
-- Reason: Log-based recalculation causes incorrect point calculations
-- Manual updates to members.total_points are acceptable for request creation and cancellation

DROP TRIGGER IF EXISTS trg_member_points_refresh ON public.member_points_logs;

-- Also drop the function if it's no longer needed (optional, keeping it for now in case needed later)
-- DROP FUNCTION IF EXISTS public.refresh_member_total_points();

