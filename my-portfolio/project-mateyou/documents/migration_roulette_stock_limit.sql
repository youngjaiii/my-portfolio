-- ============================================================
-- Phase 5-A: 룰렛 수량 제한 시스템 마이그레이션
-- 작성일: 2026-02-02
-- 목적: 전체/유저별 수량 제한, 중복 방지, 꽝 구분 기능 추가
-- ============================================================

-- ============================================================
-- 1. partner_roulette_items 테이블 확장
-- ============================================================

-- 전체 수량 제한 (NULL = 무제한)
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  global_stock_limit INTEGER DEFAULT NULL;

-- 전체 사용량 (당첨된 횟수)
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  global_stock_used INTEGER DEFAULT 0;

-- 유저별 수량 제한 (NULL = 무제한)
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  per_user_limit INTEGER DEFAULT NULL;

-- 꽝 여부 (소진 판정에서 제외)
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  is_blank BOOLEAN DEFAULT false;

-- 중복 당첨 방지 (디지털 보상용 - 같은 사진 1번만 당첨)
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  prevent_duplicate BOOLEAN DEFAULT false;

-- 컬럼 코멘트
COMMENT ON COLUMN partner_roulette_items.global_stock_limit IS '전체 수량 제한 (NULL = 무제한, 예: 10이면 모든 유저 합산 10개까지)';
COMMENT ON COLUMN partner_roulette_items.global_stock_used IS '전체 사용량 (당첨된 횟수)';
COMMENT ON COLUMN partner_roulette_items.per_user_limit IS '유저별 수량 제한 (NULL = 무제한, 예: 3이면 각 유저당 3개까지)';
COMMENT ON COLUMN partner_roulette_items.is_blank IS '꽝 여부 (true면 소진 판정에서 제외)';
COMMENT ON COLUMN partner_roulette_items.prevent_duplicate IS '중복 당첨 방지 (true면 같은 유저가 다시 당첨 안됨)';

-- ============================================================
-- 2. 유저별 아이템 당첨 횟수 추적 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roulette_item_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES partner_roulette_items(id) ON DELETE CASCADE,
  win_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_roulette_item_counts_user 
  ON user_roulette_item_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roulette_item_counts_item 
  ON user_roulette_item_counts(item_id);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_user_roulette_item_counts_updated ON user_roulette_item_counts;
CREATE TRIGGER trg_user_roulette_item_counts_updated
  BEFORE UPDATE ON user_roulette_item_counts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE user_roulette_item_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roulette_item_counts_select" ON user_roulette_item_counts;
DROP POLICY IF EXISTS "user_roulette_item_counts_insert" ON user_roulette_item_counts;
DROP POLICY IF EXISTS "user_roulette_item_counts_update" ON user_roulette_item_counts;

-- 본인 데이터만 조회 가능
CREATE POLICY "user_roulette_item_counts_select" ON user_roulette_item_counts
FOR SELECT USING (auth.uid() = user_id);

-- 시스템(service_role)만 INSERT/UPDATE 가능
CREATE POLICY "user_roulette_item_counts_insert" ON user_roulette_item_counts
FOR INSERT WITH CHECK (false);

CREATE POLICY "user_roulette_item_counts_update" ON user_roulette_item_counts
FOR UPDATE USING (false);

COMMENT ON TABLE user_roulette_item_counts IS '유저별 룰렛 아이템 당첨 횟수 추적';

-- ============================================================
-- 3. 당첨 가능 여부 판정 함수
-- ============================================================

DROP FUNCTION IF EXISTS can_win_roulette_item(UUID, UUID);

CREATE OR REPLACE FUNCTION can_win_roulette_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_item RECORD;
  v_user_count INTEGER;
BEGIN
  -- 아이템 정보 조회
  SELECT * INTO v_item 
  FROM partner_roulette_items 
  WHERE id = p_item_id AND is_active = true;
  
  IF NOT FOUND THEN 
    RETURN false; 
  END IF;
  
  -- 1. 전체 수량 소진 체크
  IF v_item.global_stock_limit IS NOT NULL 
     AND v_item.global_stock_used >= v_item.global_stock_limit THEN
    RETURN false;
  END IF;
  
  -- 2. 유저별 수량 체크
  IF v_item.per_user_limit IS NOT NULL THEN
    SELECT COALESCE(win_count, 0) INTO v_user_count
    FROM user_roulette_item_counts
    WHERE user_id = p_user_id AND item_id = p_item_id;
    
    IF COALESCE(v_user_count, 0) >= v_item.per_user_limit THEN
      RETURN false;
    END IF;
  END IF;
  
  -- 3. 중복 방지 체크 (한 번 당첨되면 다시 안됨)
  IF v_item.prevent_duplicate THEN
    IF EXISTS (
      SELECT 1 FROM user_roulette_item_counts
      WHERE user_id = p_user_id AND item_id = p_item_id AND win_count > 0
    ) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_win_roulette_item IS '특정 유저가 특정 아이템을 당첨받을 수 있는지 확인';

-- ============================================================
-- 4. 룰렛 휠 스핀 가능 여부 확인 함수
-- ============================================================

DROP FUNCTION IF EXISTS can_spin_roulette_wheel(UUID, UUID);

CREATE OR REPLACE FUNCTION can_spin_roulette_wheel(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_available_count INTEGER := 0;
  v_has_unlimited BOOLEAN := false;
  v_total_items INTEGER := 0;
  v_item RECORD;
BEGIN
  -- 휠의 모든 활성 아이템 순회 (꽝 제외)
  FOR v_item IN
    SELECT * FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id 
      AND is_active = true 
      AND is_blank = false
  LOOP
    v_total_items := v_total_items + 1;
    
    IF can_win_roulette_item(p_user_id, v_item.id) THEN
      v_available_count := v_available_count + 1;
      
      -- 무제한 아이템 체크 (제한 없는 아이템)
      IF v_item.global_stock_limit IS NULL 
         AND v_item.per_user_limit IS NULL 
         AND NOT COALESCE(v_item.prevent_duplicate, false) THEN
        v_has_unlimited := true;
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'can_spin', v_available_count > 0 OR v_has_unlimited,
    'available_items', v_available_count,
    'total_items', v_total_items,
    'has_unlimited', v_has_unlimited,
    'reason', CASE 
      WHEN v_available_count = 0 AND NOT v_has_unlimited THEN 'ALL_EXHAUSTED'
      ELSE NULL
    END
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_spin_roulette_wheel IS '특정 유저가 특정 휠을 돌릴 수 있는지 확인 (꽝 제외 당첨 가능 아이템 존재 여부)';

-- ============================================================
-- 5. 가용 아이템 기반 룰렛 결과 계산 함수 (V2)
-- ============================================================

DROP FUNCTION IF EXISTS calculate_roulette_result_v2(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION calculate_roulette_result_v2(
  p_partner_id UUID,
  p_wheel_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_total_weight INTEGER := 0;
  v_random_value INTEGER;
  v_cumulative_weight INTEGER := 0;
  v_item RECORD;
  v_result_id UUID := NULL;
BEGIN
  -- 당첨 가능한 아이템만 가중치 합산
  FOR v_item IN
    SELECT id, weight FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order
  LOOP
    v_total_weight := v_total_weight + v_item.weight;
  END LOOP;
  
  IF v_total_weight = 0 THEN 
    RETURN NULL; 
  END IF;
  
  v_random_value := floor(random() * v_total_weight)::INTEGER;
  
  FOR v_item IN
    SELECT id, weight FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order
  LOOP
    v_cumulative_weight := v_cumulative_weight + v_item.weight;
    IF v_random_value < v_cumulative_weight THEN
      RETURN v_item.id;
    END IF;
  END LOOP;
  
  -- 마지막 아이템 반환 (fallback)
  SELECT id INTO v_result_id
  FROM partner_roulette_items
  WHERE wheel_id = p_wheel_id AND is_active = true
    AND can_win_roulette_item(p_user_id, id)
  ORDER BY sort_order DESC
  LIMIT 1;
  
  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_roulette_result_v2 IS '유저별 가용 아이템만 고려한 가중치 기반 룰렛 결과 계산';

-- ============================================================
-- 6. 당첨 횟수 증가 함수
-- ============================================================

DROP FUNCTION IF EXISTS increment_roulette_item_count(UUID, UUID);

CREATE OR REPLACE FUNCTION increment_roulette_item_count(
  p_user_id UUID,
  p_item_id UUID
) RETURNS VOID AS $$
BEGIN
  -- 유저별 당첨 횟수 증가
  INSERT INTO user_roulette_item_counts (user_id, item_id, win_count)
  VALUES (p_user_id, p_item_id, 1)
  ON CONFLICT (user_id, item_id) DO UPDATE
  SET win_count = user_roulette_item_counts.win_count + 1,
      updated_at = now();
  
  -- 전체 사용량 증가
  UPDATE partner_roulette_items
  SET global_stock_used = COALESCE(global_stock_used, 0) + 1
  WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_roulette_item_count IS '룰렛 아이템 당첨 시 횟수 증가';

-- ============================================================
-- 7. 아이템 상태 조회 함수 (파트너용)
-- ============================================================

DROP FUNCTION IF EXISTS get_roulette_item_stock_status(UUID);

CREATE OR REPLACE FUNCTION get_roulette_item_stock_status(
  p_item_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_unique_winners INTEGER;
BEGIN
  SELECT * INTO v_item
  FROM partner_roulette_items
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ITEM_NOT_FOUND');
  END IF;
  
  -- 고유 당첨자 수
  SELECT COUNT(DISTINCT user_id) INTO v_unique_winners
  FROM user_roulette_item_counts
  WHERE item_id = p_item_id AND win_count > 0;
  
  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'global_stock_limit', v_item.global_stock_limit,
    'global_stock_used', COALESCE(v_item.global_stock_used, 0),
    'global_stock_remaining', CASE 
      WHEN v_item.global_stock_limit IS NULL THEN NULL
      ELSE GREATEST(0, v_item.global_stock_limit - COALESCE(v_item.global_stock_used, 0))
    END,
    'per_user_limit', v_item.per_user_limit,
    'is_blank', v_item.is_blank,
    'prevent_duplicate', v_item.prevent_duplicate,
    'unique_winners', v_unique_winners,
    'is_exhausted', (
      v_item.global_stock_limit IS NOT NULL 
      AND COALESCE(v_item.global_stock_used, 0) >= v_item.global_stock_limit
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_roulette_item_stock_status IS '룰렛 아이템의 수량 상태 조회 (파트너 대시보드용)';

-- ============================================================
-- 8. 권한 설정
-- ============================================================

GRANT EXECUTE ON FUNCTION can_win_roulette_item(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_spin_roulette_wheel(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_roulette_result_v2(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_roulette_result_v2(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_roulette_item_count(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_roulette_item_stock_status(UUID) TO authenticated;

-- ============================================================
-- 9. 롤백 스크립트 (필요 시)
-- ============================================================

/*
-- 롤백용
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS global_stock_limit;
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS global_stock_used;
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS per_user_limit;
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS is_blank;
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS prevent_duplicate;

DROP TABLE IF EXISTS user_roulette_item_counts;

DROP FUNCTION IF EXISTS can_win_roulette_item(UUID, UUID);
DROP FUNCTION IF EXISTS can_spin_roulette_wheel(UUID, UUID);
DROP FUNCTION IF EXISTS calculate_roulette_result_v2(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS increment_roulette_item_count(UUID, UUID);
DROP FUNCTION IF EXISTS get_roulette_item_stock_status(UUID);
*/
