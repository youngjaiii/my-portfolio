-- =====================================================================
-- 룰렛 보상 타입 간소화 마이그레이션
-- 작성일: 2026-02-01
-- 목적: 5종(text, points, usable, digital, custom) → 3종(text, usable, digital)
-- =====================================================================

-- =====================================================================
-- 1. 데이터 마이그레이션 (기존 타입 변환)
-- =====================================================================

-- 1.1 partner_roulette_items 테이블 마이그레이션
-- points → text (포인트 값은 reward_value에 유지)
UPDATE partner_roulette_items
SET reward_type = 'text'
WHERE reward_type = 'points';

-- custom → usable
UPDATE partner_roulette_items
SET reward_type = 'usable'
WHERE reward_type = 'custom';

-- coupon → usable
UPDATE partner_roulette_items
SET reward_type = 'usable'
WHERE reward_type = 'coupon';

-- 1.2 user_roulette_rewards 테이블 마이그레이션
-- 이 테이블은 이미 'usable' | 'digital'만 사용하므로 변경 불필요
-- 확인용 쿼리:
-- SELECT DISTINCT reward_type FROM user_roulette_rewards;

-- 1.3 donation_roulette_results 테이블 마이그레이션 (item_reward_type)
UPDATE donation_roulette_results
SET item_reward_type = 'text'
WHERE item_reward_type = 'points';

UPDATE donation_roulette_results
SET item_reward_type = 'usable'
WHERE item_reward_type IN ('custom', 'coupon');

-- =====================================================================
-- 2. 제약조건 변경 (선택적 - 운영 환경에서는 신중히)
-- =====================================================================

-- 주의: 제약조건 변경은 기존 데이터 마이그레이션 완료 후 진행
-- 아래 쿼리는 참고용이며, 실행 전 백업 필수

/*
-- partner_roulette_items 테이블 제약조건 변경
ALTER TABLE partner_roulette_items
DROP CONSTRAINT IF EXISTS partner_roulette_items_reward_type_check;

ALTER TABLE partner_roulette_items
ADD CONSTRAINT partner_roulette_items_reward_type_check 
CHECK (reward_type IN ('text', 'usable', 'digital'));

-- user_roulette_rewards 테이블 제약조건 확인 (이미 usable/digital만 허용)
-- 변경 불필요

-- donation_roulette_results 테이블은 item_reward_type이 TEXT이므로 제약조건 없음
*/

-- =====================================================================
-- 3. 확인 쿼리
-- =====================================================================

-- 마이그레이션 결과 확인
SELECT 'partner_roulette_items' as table_name, reward_type, COUNT(*) as count
FROM partner_roulette_items
GROUP BY reward_type
ORDER BY reward_type;

SELECT 'donation_roulette_results' as table_name, item_reward_type, COUNT(*) as count
FROM donation_roulette_results
GROUP BY item_reward_type
ORDER BY item_reward_type;

-- =====================================================================
-- 롤백 스크립트 (필요시)
-- =====================================================================

/*
-- 롤백은 불가능 (원래 타입 정보 손실)
-- 백업에서 복원 필요

-- 백업 생성 (마이그레이션 전 실행)
CREATE TABLE partner_roulette_items_backup AS 
SELECT * FROM partner_roulette_items;

CREATE TABLE donation_roulette_results_backup AS 
SELECT * FROM donation_roulette_results;
*/

-- =====================================================================
-- 참고: 타입 변환 규칙
-- =====================================================================
-- 
-- | 기존 타입 | 새 타입  | 설명 |
-- |----------|---------|------|
-- | text     | text    | 유지 (꽝, 축하 메시지) |
-- | points   | text    | 포인트 → text + reward_value로 처리 |
-- | usable   | usable  | 유지 (사용형 아이템) |
-- | coupon   | usable  | 쿠폰 → usable로 통합 |
-- | digital  | digital | 유지 (디지털 보상) |
-- | custom   | usable  | 커스텀 → usable로 통합 |
--
