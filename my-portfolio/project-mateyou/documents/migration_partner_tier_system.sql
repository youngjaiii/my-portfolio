-- ============================================
-- Migration: 파트너 티어 시스템
-- partner_tier_current, partner_tier_snapshot,
-- fee_policy, partner_policy_violations 테이블 생성
-- ============================================

-- 1. 티어 코드 ENUM
DO $$ BEGIN
  CREATE TYPE partner_tier_code AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. partner_tier_current (현재 티어)
CREATE TABLE IF NOT EXISTS partner_tier_current (
  partner_id UUID PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
  tier_code partner_tier_code NOT NULL DEFAULT 'bronze',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  tier_frozen BOOLEAN NOT NULL DEFAULT false,
  frozen_reason TEXT,
  frozen_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_tier_current_tier ON partner_tier_current(tier_code);
CREATE INDEX IF NOT EXISTS idx_partner_tier_current_frozen ON partner_tier_current(tier_frozen) WHERE tier_frozen = true;

-- 3. partner_tier_snapshot (주간 스냅샷)
CREATE TABLE IF NOT EXISTS partner_tier_snapshot (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- 5축 점수 (0~100)
  revenue_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  activity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  volume_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  content_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- 원시 지표값
  net_revenue_30d BIGINT NOT NULL DEFAULT 0,
  gross_revenue_30d BIGINT NOT NULL DEFAULT 0,
  refund_amount_30d BIGINT NOT NULL DEFAULT 0,
  refund_rate_30d NUMERIC(5,2) NOT NULL DEFAULT 0,
  valid_reports_30d INTEGER NOT NULL DEFAULT 0,
  major_violations_90d INTEGER NOT NULL DEFAULT 0,

  -- Volume 원시값
  paid_orders_count_30d INTEGER NOT NULL DEFAULT 0,
  fulfilled_orders_count_30d INTEGER NOT NULL DEFAULT 0,
  unique_buyers_30d INTEGER NOT NULL DEFAULT 0,

  -- Content 원시값
  active_products_30d INTEGER NOT NULL DEFAULT 0,
  new_listings_30d INTEGER NOT NULL DEFAULT 0,

  -- 산정 결과
  tier_eligible partner_tier_code NOT NULL DEFAULT 'bronze',
  hard_gate_fail JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_snapshot_partner_date ON partner_tier_snapshot(partner_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_tier_snapshot_date ON partner_tier_snapshot(snapshot_date DESC);

-- 4. fee_policy (티어별 수수료 마스터)
CREATE TABLE IF NOT EXISTS fee_policy (
  tier_code partner_tier_code PRIMARY KEY,
  take_rate_pct NUMERIC(4,1) NOT NULL,
  partner_share_pct NUMERIC(4,1) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ
);

INSERT INTO fee_policy (tier_code, take_rate_pct, partner_share_pct) VALUES
  ('bronze',   25.0, 75.0),
  ('silver',   24.0, 76.0),
  ('gold',     23.0, 77.0),
  ('platinum', 21.5, 78.5),
  ('diamond',  20.0, 80.0)
ON CONFLICT (tier_code) DO UPDATE SET
  take_rate_pct = EXCLUDED.take_rate_pct,
  partner_share_pct = EXCLUDED.partner_share_pct,
  effective_from = now();

-- 5. partner_policy_violations (정책위반 기록)
CREATE TABLE IF NOT EXISTS partner_policy_violations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major')),
  description TEXT,
  evidence_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_violations_partner ON partner_policy_violations(partner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_violations_severity ON partner_policy_violations(severity, occurred_at DESC);

-- 6. partner_tier_rebates (리베이트안, 선택)
CREATE TABLE IF NOT EXISTS partner_tier_rebates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL,
  tier_code partner_tier_code NOT NULL,
  base_take_rate_pct NUMERIC(4,1) NOT NULL DEFAULT 25.0,
  tier_take_rate_pct NUMERIC(4,1) NOT NULL,
  net_revenue BIGINT NOT NULL DEFAULT 0,
  rebate_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_rebates_partner_period ON partner_tier_rebates(partner_id, period_ym);

-- 7. store_orders에 applied_take_rate 컬럼 추가 (수수료 추적)
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS applied_take_rate NUMERIC(4,1);
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS applied_tier_code TEXT;

-- 8. post_reports에 outcome 컬럼 추가 (유효 신고 판별)
ALTER TABLE post_reports ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('valid', 'rejected', 'pending'));

-- 9. RLS 정책
ALTER TABLE partner_tier_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_tier_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_policy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_tier_rebates ENABLE ROW LEVEL SECURITY;

-- service_role full access
CREATE POLICY "Service role full access on partner_tier_current" ON partner_tier_current FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on partner_tier_snapshot" ON partner_tier_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on fee_policy" ON fee_policy FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on partner_policy_violations" ON partner_policy_violations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on partner_tier_rebates" ON partner_tier_rebates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 파트너 본인 조회
CREATE POLICY "Partners can view own tier" ON partner_tier_current FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM partners WHERE member_id = auth.uid()));

CREATE POLICY "Partners can view own snapshots" ON partner_tier_snapshot FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM partners WHERE member_id = auth.uid()));

CREATE POLICY "Anyone can read fee_policy" ON fee_policy FOR SELECT TO authenticated USING (true);

-- 관리자 전체 조회
CREATE POLICY "Admins can view all tiers" ON partner_tier_current FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can view all snapshots" ON partner_tier_snapshot FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can view all violations" ON partner_policy_violations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage violations" ON partner_policy_violations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'));

-- 10. 기존 파트너 초기화: 전원 Bronze
INSERT INTO partner_tier_current (partner_id, tier_code, effective_from)
SELECT id, 'bronze', now()
FROM partners
WHERE partner_status = 'approved'
ON CONFLICT (partner_id) DO NOTHING;
