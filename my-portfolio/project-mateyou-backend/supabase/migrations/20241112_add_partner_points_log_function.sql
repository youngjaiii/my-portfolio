-- Function to insert partner points log with proper enum handling
CREATE OR REPLACE FUNCTION insert_partner_points_log(
  p_partner_id UUID,
  p_type VARCHAR(10),
  p_amount INTEGER,
  p_description TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO partner_points_logs (partner_id, type, amount, description)
  VALUES (p_partner_id, p_type::points_log_type, p_amount, p_description);
END;
$$ LANGUAGE plpgsql;