-- =====================================================================
-- roulette_reward_usage_logs 테이블에 rejected_at 컬럼 추가
-- 거절 처리 시 reject_roulette_reward_usage 함수에서 사용
-- =====================================================================

ALTER TABLE roulette_reward_usage_logs 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

COMMENT ON COLUMN roulette_reward_usage_logs.rejected_at IS '거절 시점';
