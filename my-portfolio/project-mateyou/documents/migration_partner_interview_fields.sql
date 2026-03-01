-- 파트너 면접 시스템: partners 테이블 확장
-- 면접 SNS 타입, 약관 동의 시각, 성별/플랫폼 이력/주 콘텐츠

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_sns_type text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS terms_agreed_at timestamptz;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_gender text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_other_platforms text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_main_content text;

-- 추천인 포인트 지급 이력 테이블
CREATE TABLE IF NOT EXISTS public.referral_bonus_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_member_id uuid NOT NULL REFERENCES public.members(id),
  referred_partner_id uuid NOT NULL REFERENCES public.partners(id),
  points_before integer NOT NULL DEFAULT 0,
  points_after integer NOT NULL DEFAULT 0,
  bonus_amount integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_bonus_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'referral_bonus_logs' AND policyname = 'Admin full access on referral_bonus_logs'
  ) THEN
    CREATE POLICY "Admin full access on referral_bonus_logs"
      ON public.referral_bonus_logs FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.referral_bonus_logs IS '추천인 포인트 지급 이력 (파트너 승인 시)';
