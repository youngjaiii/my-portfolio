-- Function to process donation: transfer points from member to partner
-- This function handles:
-- 1. Deduct points from members.total_points
-- 2. Add points to partners.total_points
-- 3. Log member deduction in member_points_logs
-- 4. Log partner earning in partner_points_logs
CREATE OR REPLACE FUNCTION process_donation(
  p_member_id UUID,
  p_partner_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_log_id TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_member_new_total_points INTEGER;
  v_partner_new_total_points INTEGER;
  v_member_log_record RECORD;
  v_partner_log_record RECORD;
BEGIN
  -- Validate inputs
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- 1. Deduct points from member
  UPDATE members
  SET total_points = COALESCE(total_points, 0) - p_amount
  WHERE id = p_member_id
  RETURNING total_points INTO v_member_new_total_points;

  -- Check if member had enough points
  IF v_member_new_total_points < 0 THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  -- 2. Add points to partner
  UPDATE partners
  SET total_points = COALESCE(total_points, 0) + p_amount
  WHERE id = p_partner_id
  RETURNING total_points INTO v_partner_new_total_points;

  -- 3. Log member deduction in member_points_logs
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_member_id, 'spend', p_amount, p_description, COALESCE(p_log_id, ''))
  RETURNING * INTO v_member_log_record;

  -- 4. Log partner earning in partner_points_logs
  INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id)
  VALUES (p_partner_id, 'earn', p_amount, p_description, COALESCE(p_log_id, ''))
  RETURNING * INTO v_partner_log_record;

  -- Return result as JSON
  RETURN json_build_object(
    'member_log', row_to_json(v_member_log_record),
    'partner_log', row_to_json(v_partner_log_record),
    'member_new_total_points', v_member_new_total_points,
    'partner_new_total_points', v_partner_new_total_points
  );
END;
$$ LANGUAGE plpgsql;

