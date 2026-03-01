-- Fix update_member_points_with_log function to accept TEXT log_id instead of UUID
-- member_points_logs.log_id is TEXT type, not UUID

-- First, drop the old UUID version if it exists
DROP FUNCTION IF EXISTS update_member_points_with_log(UUID, VARCHAR, INTEGER, TEXT, UUID);

-- Create the new TEXT version
CREATE OR REPLACE FUNCTION update_member_points_with_log(
  p_member_id UUID,
  p_type VARCHAR(10),
  p_amount INTEGER,
  p_description TEXT,
  p_log_id TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_new_total_points INTEGER;
  v_points_change INTEGER;
  v_log_record RECORD;
BEGIN
  -- Calculate points change based on type
  v_points_change := CASE
    WHEN p_type = 'earn' THEN p_amount
    ELSE -p_amount
  END;

  -- Insert points log
  -- log_id is TEXT type, use empty string if null (since log_id is NOT NULL)
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_member_id, p_type, p_amount, p_description, COALESCE(p_log_id, ''))
  RETURNING * INTO v_log_record;

  -- Update member total_points
  UPDATE members
  SET total_points = COALESCE(total_points, 0) + v_points_change
  WHERE id = p_member_id
  RETURNING total_points INTO v_new_total_points;

  -- Return result as JSON
  RETURN json_build_object(
    'log', row_to_json(v_log_record),
    'new_total_points', v_new_total_points
  );
END;
$$ LANGUAGE plpgsql;

-- Also fix complete_partner_request_transaction to cast UUID to TEXT for log_id
CREATE OR REPLACE FUNCTION complete_partner_request_transaction(
  p_client_id UUID,
  p_partner_id UUID,
  p_total_points INTEGER,
  p_job_name TEXT,
  p_job_count INTEGER,
  p_request_id UUID
) RETURNS VOID AS $$
DECLARE
  v_client_description TEXT;
  v_partner_description TEXT;
BEGIN
  -- Create descriptions
  v_client_description := p_job_name || ' ' || p_job_count || '회 의뢰 완료';
  v_partner_description := p_job_name || ' ' || p_job_count || '회 완료';

  -- 1. Add member_points_logs for client (spend) and update member total_points
  UPDATE members
  SET total_points = COALESCE(total_points, 0) - p_total_points
  WHERE id = p_client_id;

  -- Cast UUID to TEXT for log_id (member_points_logs.log_id is TEXT type)
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_client_id, 'spend', p_total_points, v_client_description, p_request_id::TEXT);

  -- 2. Add partner_points_logs for partner (earn) - removed related_review_id
  INSERT INTO partner_points_logs (partner_id, type, amount, description)
  VALUES (p_partner_id, 'earn', p_total_points, v_partner_description);

  -- 3. Update partner total_points
  UPDATE partners
  SET total_points = COALESCE(total_points, 0) + p_total_points
  WHERE id = p_partner_id;
END;
$$ LANGUAGE plpgsql;

