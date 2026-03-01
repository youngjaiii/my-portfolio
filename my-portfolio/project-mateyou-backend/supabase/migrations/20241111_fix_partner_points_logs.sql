-- Fix complete_partner_request_transaction function to match actual table schema
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

  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (p_client_id, 'spend', p_total_points, v_client_description, p_request_id);

  -- 2. Add partner_points_logs for partner (earn) - removed related_review_id
  INSERT INTO partner_points_logs (partner_id, type, amount, description)
  VALUES (p_partner_id, 'earn', p_total_points, v_partner_description);

  -- 3. Update partner total_points
  UPDATE partners
  SET total_points = COALESCE(total_points, 0) + p_total_points
  WHERE id = p_partner_id;
END;
$$ LANGUAGE plpgsql;