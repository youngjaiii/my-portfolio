-- ============================================
-- Migration: 티어 시스템 v2 - 시간별 스냅샷 + 시즌 리셋
-- 1) partner_tier_snapshot_hourly 테이블 생성
-- 2) partner_tier_current에 시즌 필드 추가
-- 3) fee_policy 수수료율 업데이트
-- ============================================

-- 1. 시간별 스냅샷 테이블
CREATE TABLE IF NOT EXISTS partner_tier_snapshot_hourly (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  snapshot_hour TIMESTAMPTZ NOT NULL,  -- 시간 단위 (ex: 2026-02-20 15:00:00+09)

  -- 5축 점수 (0~100)
  revenue_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  activity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  volume_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  content_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tier_snapshot_hourly_partner_hour
  ON partner_tier_snapshot_hourly(partner_id, snapshot_hour);

CREATE INDEX IF NOT EXISTS idx_tier_snapshot_hourly_hour
  ON partner_tier_snapshot_hourly(snapshot_hour DESC);

-- RLS
ALTER TABLE partner_tier_snapshot_hourly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on partner_tier_snapshot_hourly"
  ON partner_tier_snapshot_hourly
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. partner_tier_current에 시즌 필드 추가
ALTER TABLE partner_tier_current
  ADD COLUMN IF NOT EXISTS season_ym TEXT,                    -- '2026-02' 형태
  ADD COLUMN IF NOT EXISTS season_start_score NUMERIC(5,2);   -- 시즌 시작 점수

-- 3. fee_policy 수수료율 업데이트 (새 수수료 체계)
-- Bronze: 25%, Silver: 24.7%, Gold: 24%, Platinum: 23%, Diamond: 21.5%
UPDATE fee_policy SET take_rate_pct = 25.0, partner_share_pct = 75.0 WHERE tier_code = 'bronze';
UPDATE fee_policy SET take_rate_pct = 24.7, partner_share_pct = 75.3 WHERE tier_code = 'silver';
UPDATE fee_policy SET take_rate_pct = 24.0, partner_share_pct = 76.0 WHERE tier_code = 'gold';
UPDATE fee_policy SET take_rate_pct = 23.0, partner_share_pct = 77.0 WHERE tier_code = 'platinum';
UPDATE fee_policy SET take_rate_pct = 21.5, partner_share_pct = 78.5 WHERE tier_code = 'diamond';

-- 4. 오래된 시간별 스냅샷 정리 시 활용할 인덱스
CREATE INDEX IF NOT EXISTS idx_tier_snapshot_hourly_created
  ON partner_tier_snapshot_hourly(created_at);
