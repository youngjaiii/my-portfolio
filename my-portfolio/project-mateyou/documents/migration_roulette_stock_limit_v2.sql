-- ============================================================
-- Phase 5-A: 룰렛 수량 제한 시스템 마이그레이션 (v2)
-- 작성일: 2026-02-02
-- 목적: 전체 또는 유저별 수량 제한 (둘 중 하나만), 꽝 구분 기능
-- 변경: prevent_duplicate 제거, global/per_user 동시 사용 불가
-- ============================================================

-- ============================================================
-- 1. partner_roulette_items 테이블 확장
-- ============================================================

-- 수량 제한 타입: 'global'(전체) 또는 'per_user'(유저별) 중 하나만
ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS stock_limit_type TEXT DEFAULT NULL CHECK (
    stock_limit_type IN ('global', 'per_user')
);

-- 수량 제한 값 (stock_limit_type에 따라 의미가 달라짐)
ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS stock_limit INTEGER DEFAULT NULL;

-- 사용량 (당첨된 횟수 - global 타입일 때만 의미있음)
ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS stock_used INTEGER DEFAULT 0;

-- 꽝 여부 (소진 판정에서 제외)
ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS is_blank BOOLEAN DEFAULT false;

-- 컬럼 코멘트
COMMENT ON COLUMN partner_roulette_items.stock_limit_type IS '수량 제한 타입: global(전체) 또는 per_user(유저별), NULL이면 무제한';

COMMENT ON COLUMN partner_roulette_items.stock_limit IS '수량 제한 값 (stock_limit_type에 따라 전체 또는 유저별 제한)';

COMMENT ON COLUMN partner_roulette_items.stock_used IS '사용량 (당첨된 횟수)';

COMMENT ON COLUMN partner_roulette_items.is_blank IS '꽝 여부 (true면 소진 판정에서 제외)';

-- 기존 컬럼 정리 (이전 버전 호환)
-- global_stock_limit, per_user_limit, prevent_duplicate 등 기존 컬럼이 있으면 데이터 마이그레이션 후 삭제
DO $$
BEGIN
  -- 기존 global_stock_limit 데이터 마이그레이션
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'partner_roulette_items' AND column_name = 'global_stock_limit') THEN
    UPDATE partner_roulette_items
    SET stock_limit_type = 'global', stock_limit = global_stock_limit
    WHERE global_stock_limit IS NOT NULL AND stock_limit_type IS NULL;
  END IF;
  
  -- 기존 per_user_limit 데이터 마이그레이션 (global이 없는 경우만)
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'partner_roulette_items' AND column_name = 'per_user_limit') THEN
    UPDATE partner_roulette_items
    SET stock_limit_type = 'per_user', stock_limit = per_user_limit
    WHERE per_user_limit IS NOT NULL AND stock_limit_type IS NULL;
  END IF;
  
  -- 기존 global_stock_used → stock_used
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'partner_roulette_items' AND column_name = 'global_stock_used') THEN
    UPDATE partner_roulette_items
    SET stock_used = global_stock_used
    WHERE global_stock_used IS NOT NULL AND stock_used = 0;
  END IF;
END $$;

-- ============================================================
-- 2. 유저별 아이템 당첨 횟수 추적 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roulette_item_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES partner_roulette_items (id) ON DELETE CASCADE,
    win_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now (),
    updated_at TIMESTAMPTZ DEFAULT now (),
    UNIQUE (user_id, item_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_roulette_item_counts_user ON user_roulette_item_counts (user_id);

CREATE INDEX IF NOT EXISTS idx_user_roulette_item_counts_item ON user_roulette_item_counts (item_id);

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
CREATE POLICY "user_roulette_item_counts_select" ON user_roulette_item_counts FOR
SELECT USING (auth.uid () = user_id);

-- 시스템(service_role)만 INSERT/UPDATE 가능
CREATE POLICY "user_roulette_item_counts_insert" ON user_roulette_item_counts FOR INSERT
WITH
    CHECK (false);

CREATE POLICY "user_roulette_item_counts_update" ON user_roulette_item_counts FOR
UPDATE USING (false);

COMMENT ON TABLE user_roulette_item_counts IS '유저별 룰렛 아이템 당첨 횟수 추적';

-- ============================================================
-- 3. 당첨 가능 여부 판정 함수
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'can_win_roulette_item'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

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
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- 비활성 아이템
  IF NOT v_item.is_active THEN
    RETURN false;
  END IF;
  
  -- 수량 제한 없음 (무제한)
  IF v_item.stock_limit_type IS NULL THEN
    RETURN true;
  END IF;
  
  -- 전체 수량 제한 체크
  IF v_item.stock_limit_type = 'global' THEN
    IF v_item.stock_limit IS NOT NULL AND v_item.stock_used >= v_item.stock_limit THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;
  
  -- 유저별 수량 제한 체크
  IF v_item.stock_limit_type = 'per_user' THEN
    IF v_item.stock_limit IS NULL THEN
      RETURN true;
    END IF;
    
    SELECT COALESCE(win_count, 0) INTO v_user_count
    FROM user_roulette_item_counts
    WHERE user_id = p_user_id AND item_id = p_item_id;
    
    IF v_user_count >= v_item.stock_limit THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_win_roulette_item IS '특정 유저가 특정 아이템을 당첨받을 수 있는지 확인';

-- ============================================================
-- 4. 휠 스핀 가능 여부 판정 함수
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'can_spin_roulette_wheel'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION can_spin_roulette_wheel(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_items INTEGER;
  v_available_items INTEGER;
  v_has_unlimited BOOLEAN := false;
BEGIN
  -- 해당 휠의 활성 아이템 수 (꽝 제외) - 실제 상품 수
  SELECT COUNT(*) INTO v_total_items
  FROM partner_roulette_items
  WHERE wheel_id = p_wheel_id 
    AND is_active = true
    AND NOT COALESCE(is_blank, false);  -- 꽝 제외
  
  -- 당첨 가능한 아이템 수 (꽝이 아닌 것 중 수량 남은 것)
  SELECT 
    COUNT(*),
    bool_or(stock_limit_type IS NULL)  -- 무제한 아이템 존재 여부
  INTO v_available_items, v_has_unlimited
  FROM partner_roulette_items
  WHERE wheel_id = p_wheel_id 
    AND is_active = true
    AND can_win_roulette_item(p_user_id, id)
    AND NOT COALESCE(is_blank, false);  -- 꽝 제외
  
  v_result := jsonb_build_object(
    'can_spin', v_available_items > 0 OR COALESCE(v_has_unlimited, false),
    'available_items', v_available_items,
    'total_items', v_total_items,
    'has_unlimited', COALESCE(v_has_unlimited, false),
    'reason', CASE 
      WHEN v_available_items = 0 AND NOT COALESCE(v_has_unlimited, false) THEN 'ALL_EXHAUSTED'
      ELSE NULL
    END
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_spin_roulette_wheel IS '특정 유저가 특정 휠을 돌릴 수 있는지 확인 (모든 상품 소진 여부)';

-- ============================================================
-- 5. 당첨 횟수 증가 함수
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'increment_roulette_item_count'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION increment_roulette_item_count(
  p_user_id UUID,
  p_item_id UUID
) RETURNS void AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- 아이템 정보 조회
  SELECT * INTO v_item 
  FROM partner_roulette_items 
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- 전체 사용량 증가 (항상)
  UPDATE partner_roulette_items
  SET stock_used = stock_used + 1
  WHERE id = p_item_id;
  
  -- 유저별 수량 제한이면 유저별 카운트도 증가
  IF v_item.stock_limit_type = 'per_user' THEN
    INSERT INTO user_roulette_item_counts (user_id, item_id, win_count)
    VALUES (p_user_id, p_item_id, 1)
    ON CONFLICT (user_id, item_id) 
    DO UPDATE SET win_count = user_roulette_item_counts.win_count + 1, updated_at = now();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_roulette_item_count IS '룰렛 아이템 당첨 시 카운트 증가';

-- ============================================================
-- 6. 아이템 재고 상태 조회 함수 (파트너 대시보드용)
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'get_roulette_item_stock_status'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_roulette_item_stock_status(
  p_item_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_item 
  FROM partner_roulette_items 
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- 남은 수량 계산 (전체 제한일 때만)
  IF v_item.stock_limit_type = 'global' AND v_item.stock_limit IS NOT NULL THEN
    v_remaining := v_item.stock_limit - COALESCE(v_item.stock_used, 0);
    IF v_remaining < 0 THEN v_remaining := 0; END IF;
  ELSE
    v_remaining := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'stock_limit_type', v_item.stock_limit_type,
    'stock_limit', v_item.stock_limit,
    'stock_used', COALESCE(v_item.stock_used, 0),
    'stock_remaining', v_remaining,
    'is_blank', COALESCE(v_item.is_blank, false),
    'is_exhausted', CASE 
      WHEN v_item.stock_limit_type = 'global' AND v_item.stock_limit IS NOT NULL 
           AND COALESCE(v_item.stock_used, 0) >= v_item.stock_limit 
      THEN true 
      ELSE false 
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_roulette_item_stock_status IS '아이템 재고 상태 조회 (파트너 대시보드용)';

-- ============================================================
-- 7. 수량 제한을 고려한 룰렛 결과 계산 함수 (v2)
-- ============================================================

-- 기존 함수 삭제 (모든 오버로드 버전)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure::text AS func_sig
    FROM pg_proc
    WHERE proname = 'calculate_roulette_result_v2'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION calculate_roulette_result_v2(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_total_weight INTEGER := 0;
  v_random_weight INTEGER;
  v_cumulative_weight INTEGER := 0;
  v_selected_item_id UUID;
  v_selected_item_name TEXT;
  v_selected_item_color TEXT;
  v_selected_item_weight INTEGER;
  v_item_count INTEGER := 0;
BEGIN
  -- 1단계: 총 가중치와 아이템 수 계산
  SELECT COUNT(*), COALESCE(SUM(weight), 0)
  INTO v_item_count, v_total_weight
  FROM partner_roulette_items
  WHERE wheel_id = p_wheel_id 
    AND is_active = true
    AND can_win_roulette_item(p_user_id, id);
  
  -- 당첨 가능한 아이템이 없으면 에러 반환
  IF v_item_count = 0 OR v_total_weight = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AVAILABLE_ITEMS');
  END IF;
  
  -- 2단계: 가중치 기반 랜덤 선택
  v_random_weight := floor(random() * v_total_weight)::INTEGER;
  
  FOR v_item IN 
    SELECT id, name, color, weight
    FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id 
      AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order
  LOOP
    v_cumulative_weight := v_cumulative_weight + v_item.weight;
    IF v_random_weight < v_cumulative_weight THEN
      v_selected_item_id := v_item.id;
      v_selected_item_name := v_item.name;
      v_selected_item_color := v_item.color;
      v_selected_item_weight := v_item.weight;
      EXIT;
    END IF;
  END LOOP;
  
  -- 혹시 선택 안됐으면 마지막 아이템 선택
  IF v_selected_item_id IS NULL THEN
    SELECT id, name, color, weight
    INTO v_selected_item_id, v_selected_item_name, v_selected_item_color, v_selected_item_weight
    FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id 
      AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order DESC
    LIMIT 1;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_selected_item_id,
    'item_name', v_selected_item_name,
    'item_color', v_selected_item_color,
    'item_weight', v_selected_item_weight,
    'total_weight', v_total_weight,
    'available_count', v_item_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_roulette_result_v2 IS '수량 제한을 고려한 룰렛 결과 계산 (v2)';