-- ============================================
-- Migration: partner_tier_leaderboard 뷰 - 시간별 최신 점수 반영
-- partner_tier_snapshot_hourly의 최신 점수를 우선 사용하고,
-- 없으면 partner_tier_snapshot fallback, 둘 다 없으면 0
-- ============================================

-- 기존 뷰 삭제 (컬럼 타입 변경 시 DROP 필수)
DROP VIEW IF EXISTS partner_tier_leaderboard;

CREATE VIEW partner_tier_leaderboard AS
SELECT 
  ptc.partner_id,
  ptc.tier_code,
  ptc.tier_frozen,
  COALESCE(hourly.total_score, pts.total_score, 0::numeric(5,2)) AS total_score,
  COALESCE(hourly.snapshot_hour::date::text, pts.snapshot_date::text) AS snapshot_date,
  p.member_id,
  m.name AS member_name,
  m.profile_image AS member_profile_image,
  m.member_code
FROM partner_tier_current ptc
JOIN partners p ON p.id = ptc.partner_id
JOIN members m ON m.id = p.member_id
LEFT JOIN LATERAL (
  SELECT h.total_score, h.snapshot_hour
  FROM partner_tier_snapshot_hourly h
  WHERE h.partner_id = ptc.partner_id
  ORDER BY h.snapshot_hour DESC
  LIMIT 1
) hourly ON true
LEFT JOIN LATERAL (
  SELECT s.total_score, s.snapshot_date
  FROM partner_tier_snapshot s
  WHERE s.partner_id = ptc.partner_id
  ORDER BY s.snapshot_date DESC
  LIMIT 1
) pts ON true
WHERE (m.admin_role IS NULL OR m.admin_role < 2);
