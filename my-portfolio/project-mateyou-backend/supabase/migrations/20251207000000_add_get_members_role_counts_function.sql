-- Function to get members role counts with optional search filter
-- Returns count for all, normal, partner, admin roles in a single query
-- This is more efficient than making 4 separate count queries
CREATE OR REPLACE FUNCTION get_members_role_counts(search_term TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF search_term IS NULL OR search_term = '' THEN
    -- No search: count all members by role
    SELECT json_build_object(
      'all', COUNT(*),
      'normal', COUNT(*) FILTER (WHERE role = 'normal'),
      'partner', COUNT(*) FILTER (WHERE role = 'partner'),
      'admin', COUNT(*) FILTER (WHERE role = 'admin')
    ) INTO result FROM members;
  ELSE
    -- With search: count only matching members by role
    SELECT json_build_object(
      'all', COUNT(*),
      'normal', COUNT(*) FILTER (WHERE role = 'normal'),
      'partner', COUNT(*) FILTER (WHERE role = 'partner'),
      'admin', COUNT(*) FILTER (WHERE role = 'admin')
    ) INTO result FROM members
    WHERE name ILIKE '%' || search_term || '%'
       OR member_code ILIKE '%' || search_term || '%';
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
