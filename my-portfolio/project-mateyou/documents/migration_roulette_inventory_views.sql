-- =====================================================================
-- 룰렛 인벤토리 기능 마이그레이션
-- 작성일: 2025-12-25
-- 목적: 룰렛 당첨 내역을 조회할 수 있는 뷰 및 인덱스 생성
-- =====================================================================

-- =====================================================================
-- 0. 컬럼 존재 여부 확인 및 추가 (필요시)
-- =====================================================================

-- item_reward_type, item_reward_value 컬럼이 없으면 추가
DO $$
BEGIN
    -- item_reward_type 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' 
        AND column_name = 'item_reward_type'
    ) THEN
        ALTER TABLE donation_roulette_results 
        ADD COLUMN item_reward_type TEXT NOT NULL DEFAULT 'text';
        COMMENT ON COLUMN donation_roulette_results.item_reward_type IS '보상 타입 (text, points, usable, digital, custom)';
    END IF;
    
    -- item_reward_value 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' 
        AND column_name = 'item_reward_value'
    ) THEN
        ALTER TABLE donation_roulette_results 
        ADD COLUMN item_reward_value TEXT;
        COMMENT ON COLUMN donation_roulette_results.item_reward_value IS '보상 값 (예: "500", "1:1 응원")';
    END IF;
END;
$$;

-- =====================================================================
-- 1. 사용자 인벤토리 뷰 생성
-- =====================================================================

CREATE OR REPLACE VIEW user_roulette_inventory AS
SELECT 
    drr.id,
    drr.donation_id,
    drr.donor_id,
    drr.partner_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 파트너 정보
    p.partner_name,
    p.member_id AS partner_member_id,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보 (연결)
    sd.amount AS donation_amount,
    sd.message AS donation_message
FROM donation_roulette_results drr
JOIN partners p ON p.id = drr.partner_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
-- is_processed 조건 제거: 모든 당첨 내역 표시 (처리 상태는 별도 표시)
ORDER BY drr.created_at DESC;

COMMENT ON VIEW user_roulette_inventory IS '사용자 룰렛 당첨 인벤토리 뷰 (본인의 당첨 내역만 조회 가능)';

-- RLS 정책 설정
ALTER VIEW user_roulette_inventory SET (security_invoker = true);

-- 사용자는 본인의 데이터만 조회 가능
-- 참고: 뷰에 직접 RLS 정책을 설정할 수 없으므로, 
-- 프론트엔드에서 donor_id로 필터링하거나
-- RPC 함수를 통해 권한 제어 필요

-- =====================================================================
-- 2. 파트너 인벤토리 뷰 생성
-- =====================================================================

CREATE OR REPLACE VIEW partner_roulette_inventory AS
SELECT 
    drr.id,
    drr.donation_id,
    drr.partner_id,
    drr.donor_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 당첨자 정보
    m.id AS donor_member_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    m.member_code AS donor_member_code,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보 (연결)
    sd.amount AS donation_amount,
    sd.message AS donation_message
FROM donation_roulette_results drr
JOIN members m ON m.id = drr.donor_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
-- is_processed 조건 제거: 모든 당첨 내역 표시 (처리 상태는 별도 표시)
ORDER BY drr.created_at DESC;

COMMENT ON VIEW partner_roulette_inventory IS '파트너 룰렛 당첨 인벤토리 뷰 (본인의 룰렛으로 당첨된 사용자 목록)';

-- RLS 정책 설정
ALTER VIEW partner_roulette_inventory SET (security_invoker = true);

-- 파트너는 본인의 파트너 데이터만 조회 가능
-- 참고: 뷰에 직접 RLS 정책을 설정할 수 없으므로,
-- 프론트엔드에서 partner_id로 필터링하거나
-- RPC 함수를 통해 권한 제어 필요

-- =====================================================================
-- 3. 통계 뷰 생성 (선택사항)
-- =====================================================================

-- 아이템별 통계 뷰
CREATE OR REPLACE VIEW partner_roulette_item_stats AS
SELECT 
    partner_id,
    item_name,
    item_reward_type,
    COUNT(*) AS win_count,
    COUNT(DISTINCT donor_id) AS unique_winners,
    MIN(created_at) AS first_win_at,
    MAX(created_at) AS last_win_at
FROM donation_roulette_results
WHERE is_processed = true
GROUP BY partner_id, item_name, item_reward_type
ORDER BY win_count DESC;

COMMENT ON VIEW partner_roulette_item_stats IS '파트너별 룰렛 아이템 통계 (당첨 횟수, 고유 당첨자 수 등)';

-- 날짜별 통계 뷰
CREATE OR REPLACE VIEW partner_roulette_date_stats AS
SELECT 
    partner_id,
    DATE(created_at) AS win_date,
    COUNT(*) AS win_count,
    COUNT(DISTINCT donor_id) AS unique_winners
FROM donation_roulette_results
WHERE is_processed = true
GROUP BY partner_id, DATE(created_at)
ORDER BY win_date DESC;

COMMENT ON VIEW partner_roulette_date_stats IS '파트너별 룰렛 날짜별 통계 (일별 당첨 건수, 고유 당첨자 수 등)';

-- =====================================================================
-- 4. 인덱스 최적화
-- =====================================================================

-- 사용자 인벤토리 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_donor 
    ON donation_roulette_results(donor_id, created_at DESC)
    WHERE is_processed = true;

COMMENT ON INDEX idx_donation_roulette_results_donor IS '사용자 인벤토리 조회 최적화 인덱스';

-- 파트너 인벤토리 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_partner 
    ON donation_roulette_results(partner_id, created_at DESC)
    WHERE is_processed = true;

COMMENT ON INDEX idx_donation_roulette_results_partner IS '파트너 인벤토리 조회 최적화 인덱스';

-- 통계 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_stats 
    ON donation_roulette_results(partner_id, item_name, created_at)
    WHERE is_processed = true;

COMMENT ON INDEX idx_donation_roulette_results_stats IS '통계 조회 최적화 인덱스';

-- =====================================================================
-- 5. RPC 함수 생성 (선택사항)
-- =====================================================================

-- 당첨자 통계 조회 함수
CREATE OR REPLACE FUNCTION get_partner_roulette_donor_stats(
  p_partner_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  donor_id UUID,
  donor_name TEXT,
  donor_profile_image TEXT,
  total_wins BIGINT,
  total_donation_amount BIGINT,
  last_win_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    drr.donor_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    COUNT(*) AS total_wins,
    COALESCE(SUM(sd.amount), 0) AS total_donation_amount,
    MAX(drr.created_at) AS last_win_at
  FROM donation_roulette_results drr
  JOIN members m ON m.id = drr.donor_id
  LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
  WHERE drr.partner_id = p_partner_id
    AND drr.is_processed = true
  GROUP BY drr.donor_id, m.name, m.profile_image
  ORDER BY total_wins DESC, total_donation_amount DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_partner_roulette_donor_stats IS '파트너별 룰렛 당첨자 통계 조회 (당첨 횟수, 총 후원 금액 등)';

-- 권한 설정 (authenticated 사용자만 호출 가능)
GRANT EXECUTE ON FUNCTION get_partner_roulette_donor_stats(UUID, INTEGER) TO authenticated;

-- =====================================================================
-- 6. 검증 쿼리 (실행 후 확인용)
-- =====================================================================

-- 뷰 확인
-- SELECT * FROM user_roulette_inventory LIMIT 5;
-- SELECT * FROM partner_roulette_inventory LIMIT 5;
-- SELECT * FROM partner_roulette_item_stats LIMIT 5;
-- SELECT * FROM partner_roulette_date_stats LIMIT 5;

-- 인덱스 확인
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'donation_roulette_results' 
--   AND indexname LIKE 'idx_donation_roulette_results%';

-- 함수 확인
-- SELECT proname, pronargs 
-- FROM pg_proc 
-- WHERE proname = 'get_partner_roulette_donor_stats';

