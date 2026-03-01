-- ============================================
-- 추천인 보상 시스템 변경을 위한 마이그레이션
-- referral_bonus_logs 테이블에 withdrawal_id 컬럼 추가
-- ============================================

-- 1. withdrawal_id 컬럼 추가 (출금 기반 추천인 보너스 추적용)
ALTER TABLE public.referral_bonus_logs 
ADD COLUMN IF NOT EXISTS withdrawal_id uuid REFERENCES public.partner_withdrawals(id);

-- 2. 컬럼 설명 추가
COMMENT ON COLUMN public.referral_bonus_logs.withdrawal_id IS '출금 기반 추천인 보너스의 경우 출금 ID 참조. NULL이면 기존 파트너 승인 보너스(사용중단)';

-- 3. 인덱스 추가 (출금 ID로 조회 시 성능 향상)
CREATE INDEX IF NOT EXISTS idx_referral_bonus_logs_withdrawal_id 
ON public.referral_bonus_logs(withdrawal_id) 
WHERE withdrawal_id IS NOT NULL;
