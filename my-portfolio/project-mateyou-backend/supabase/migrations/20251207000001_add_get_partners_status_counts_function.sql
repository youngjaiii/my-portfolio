-- Function to get partners status counts with optional search filter
-- Returns count for all, pending, approved, rejected statuses in a single query
-- This is more efficient than making 4 separate count queries
CREATE OR REPLACE FUNCTION get_partners_status_counts(search_term TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF search_term IS NULL OR search_term = '' THEN
    -- No search: count all partners by status
    SELECT json_build_object(
      'all', COUNT(*),
      'pending', COUNT(*) FILTER (WHERE partner_status = 'pending'),
      'approved', COUNT(*) FILTER (WHERE partner_status = 'approved'),
      'rejected', COUNT(*) FILTER (WHERE partner_status = 'rejected')
    ) INTO result FROM partners;
  ELSE
    -- With search: need to join with members table for member fields
    SELECT json_build_object(
      'all', COUNT(*),
      'pending', COUNT(*) FILTER (WHERE p.partner_status = 'pending'),
      'approved', COUNT(*) FILTER (WHERE p.partner_status = 'approved'),
      'rejected', COUNT(*) FILTER (WHERE p.partner_status = 'rejected')
    ) INTO result
    FROM partners p
    LEFT JOIN members m ON p.member_id = m.id
    WHERE p.partner_name ILIKE '%' || search_term || '%'
       OR p.legal_name ILIKE '%' || search_term || '%'
       OR m.name ILIKE '%' || search_term || '%'
       OR m.member_code ILIKE '%' || search_term || '%'
       OR m.email ILIKE '%' || search_term || '%';
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
