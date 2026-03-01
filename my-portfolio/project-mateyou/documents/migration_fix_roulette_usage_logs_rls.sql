-- =====================================================================
-- roulette_reward_usage_logs RLS 정책 수정
-- 작성일: 2025-12-30
-- 목적: 파트너가 자신의 partner_id로 사용 요청을 조회할 수 있도록 RLS 정책 추가
-- =====================================================================

-- 기존 정책 확인 및 수정
DROP POLICY IF EXISTS "roulette_reward_usage_logs_select" ON roulette_reward_usage_logs;

-- 사용자는 본인의 요청만 조회 가능
CREATE POLICY "roulette_reward_usage_logs_select" ON roulette_reward_usage_logs
FOR SELECT USING (
  -- 사용자는 본인의 요청만 조회 가능
  auth.uid() = user_id
  OR
  -- 파트너는 본인의 partner_id로 조회 가능
  EXISTS (
    SELECT 1 FROM partners 
    WHERE id = roulette_reward_usage_logs.partner_id 
    AND member_id = auth.uid()
  )
);

COMMENT ON POLICY "roulette_reward_usage_logs_select" ON roulette_reward_usage_logs IS 
'사용자는 본인의 요청만, 파트너는 본인의 partner_id로 조회 가능';

