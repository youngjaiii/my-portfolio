-- ============================================
-- 방송 후원 랭킹 기준 변경 마이그레이션
-- ============================================
-- 목적: 
-- 1. 호스트에게만 후원한 내역만 집계
-- 2. 호스트별로 집계 (같은 호스트가 여러 방송을 열었을 때 모든 방송의 후원 합산)
-- 3. 1주일 단위로 자동 초기화 (매주 월요일 00:00)
-- 4. 동일 금액일 경우 먼저 후원한 사람 우선순위
-- ============================================

-- 기존 뷰 삭제
DROP VIEW IF EXISTS stream_donation_rankings;

-- 새로운 랭킹 뷰 생성 (1주일 단위, 호스트별 집계)
CREATE OR REPLACE VIEW stream_donation_rankings AS
WITH current_week_start AS (
    -- 현재 주의 시작일 (월요일 00:00:00)
    -- PostgreSQL의 DATE_TRUNC('week', ...)는 ISO 주 기준으로 월요일을 시작일로 함
    SELECT DATE_TRUNC('week', CURRENT_TIMESTAMP) AS week_start
)
SELECT
    sr.host_partner_id,  -- 호스트별 집계
    sd.donor_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    SUM(sd.amount) AS total_amount,
    COUNT(*) AS donation_count,
    MIN(sd.created_at) AS first_donation_at,  -- 동일 금액 시 우선순위용
    MAX(sd.created_at) AS last_donation_at,
    RANK() OVER (
        PARTITION BY sr.host_partner_id  -- 호스트별로 랭킹
        ORDER BY 
            SUM(sd.amount) DESC,  -- 금액 내림차순
            MIN(sd.created_at) ASC  -- 동일 금액일 경우 먼저 후원한 사람 우선
    ) AS rank
FROM stream_donations sd
JOIN members m ON m.id = sd.donor_id
JOIN stream_rooms sr ON sr.id = sd.room_id
WHERE 
    -- 호스트만 기준: recipient_partner_id가 방의 host_partner_id와 일치하는 경우만
    sd.recipient_partner_id = sr.host_partner_id
    -- 현재 주 내 후원만 집계
    AND sd.created_at >= (SELECT week_start FROM current_week_start)
    AND sd.created_at <= CURRENT_TIMESTAMP
GROUP BY sr.host_partner_id, sd.donor_id, m.name, m.profile_image;

COMMENT ON VIEW stream_donation_rankings IS 
'스트림 호스트별 후원 랭킹 (1주일 단위)
- 매주 월요일 00:00에 자동 초기화
- 호스트에게만 후원한 내역만 집계
- 같은 호스트가 여러 방송을 열었을 때 모든 방송의 후원 합산
- 동일 금액일 경우 먼저 후원한 사람이 우선순위';

-- 인덱스 최적화 (랭킹 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_stream_donations_ranking 
ON stream_donations(recipient_partner_id, created_at DESC)
WHERE recipient_partner_id IS NOT NULL;

COMMENT ON INDEX idx_stream_donations_ranking IS 
'후원 랭킹 조회 성능 최적화 인덱스 (recipient_partner_id, created_at)';

-- stream_rooms와의 조인 성능 향상을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_stream_rooms_host_partner_id 
ON stream_rooms(host_partner_id);

COMMENT ON INDEX idx_stream_rooms_host_partner_id IS 
'호스트별 랭킹 조회를 위한 인덱스';

-- ============================================
-- 검증 쿼리
-- ============================================

-- 1. 뷰가 정상적으로 생성되었는지 확인
-- SELECT * FROM stream_donation_rankings LIMIT 5;

-- 2. 현재 주 기간 확인
-- SELECT 
--     DATE_TRUNC('week', CURRENT_TIMESTAMP) AS current_week_start,
--     DATE_TRUNC('week', CURRENT_TIMESTAMP) + INTERVAL '7 days' AS next_week_start;

-- 3. 특정 호스트의 랭킹 확인
-- SELECT * 
-- FROM stream_donation_rankings 
-- WHERE host_partner_id = '<host_partner_id>' 
-- ORDER BY rank ASC 
-- LIMIT 10;

