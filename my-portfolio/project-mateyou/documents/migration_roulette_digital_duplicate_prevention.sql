-- ============================================================
-- 룰렛 디지털 상품 중복 방지 리팩토링
-- 작성일: 2026-02-02
-- 목적: 디지털 상품은 기본적으로 중복 불가 (유저당 1회만 당첨)
-- ============================================================

-- ============================================================
-- 1. 기존 디지털 상품 데이터 마이그레이션
-- 디지털 상품은 자동으로 per_user + limit=1 설정
-- ============================================================

UPDATE partner_roulette_items
SET
    stock_limit_type = 'per_user',
    stock_limit = 1
WHERE
    reward_type = 'digital'
    AND (
        stock_limit_type IS NULL
        OR stock_limit IS NULL
        OR stock_limit > 1
    );

-- ============================================================
-- 2. can_win_roulette_item 함수 수정
-- 디지털 타입은 자동으로 중복 방지 (per_user 설정 여부와 무관)
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
  
  -- ★ 디지털 타입은 무조건 중복 방지 (유저당 1회만) ★
  -- 디지털 상품은 기본적으로 중복 불가 정책
  IF v_item.reward_type = 'digital' THEN
    SELECT COALESCE(win_count, 0) INTO v_user_count
    FROM user_roulette_item_counts
    WHERE user_id = p_user_id AND item_id = p_item_id;
    
    -- 이미 1번 이상 당첨된 경우 불가
    IF COALESCE(v_user_count, 0) >= 1 THEN
      RETURN false;
    END IF;
    
    -- 전체 수량 제한도 체크 (글로벌 제한이 있는 경우)
    IF v_item.stock_limit_type = 'global' AND v_item.stock_limit IS NOT NULL THEN
      IF COALESCE(v_item.stock_used, 0) >= v_item.stock_limit THEN
        RETURN false;
      END IF;
    END IF;
    
    RETURN true;
  END IF;
  
  -- 수량 제한 없음 (무제한) - 디지털이 아닌 경우만
  IF v_item.stock_limit_type IS NULL THEN
    RETURN true;
  END IF;
  
  -- 전체 수량 제한 체크
  IF v_item.stock_limit_type = 'global' THEN
    IF v_item.stock_limit IS NOT NULL AND COALESCE(v_item.stock_used, 0) >= v_item.stock_limit THEN
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
    
    IF COALESCE(v_user_count, 0) >= v_item.stock_limit THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_win_roulette_item IS '특정 유저가 특정 아이템을 당첨받을 수 있는지 확인 - 디지털 상품은 무조건 중복 방지';

-- 권한 설정
GRANT EXECUTE ON FUNCTION can_win_roulette_item (UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION can_win_roulette_item (UUID, UUID) TO service_role;

-- ============================================================
-- 3. 디지털 상품 저장 시 자동으로 per_user + 1 설정하는 트리거
-- 프론트에서 설정하더라도 백엔드에서 보장
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_digital_item_stock_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- 디지털 타입인 경우 자동으로 per_user + 1 설정
  IF NEW.reward_type = 'digital' THEN
    NEW.stock_limit_type := 'per_user';
    NEW.stock_limit := 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 트리거 삭제
DROP TRIGGER IF EXISTS trg_ensure_digital_item_stock_limit ON partner_roulette_items;

-- 트리거 생성 (INSERT/UPDATE 시)
CREATE TRIGGER trg_ensure_digital_item_stock_limit
  BEFORE INSERT OR UPDATE ON partner_roulette_items
  FOR EACH ROW
  EXECUTE FUNCTION ensure_digital_item_stock_limit();

COMMENT ON FUNCTION ensure_digital_item_stock_limit IS '디지털 상품은 자동으로 유저당 1회 제한 설정';

-- ============================================================
-- 4. 검증 쿼리
-- ============================================================

-- 디지털 상품 중 설정이 잘못된 것 확인
SELECT
    id,
    name,
    reward_type,
    stock_limit_type,
    stock_limit
FROM partner_roulette_items
WHERE
    reward_type = 'digital'
    AND (
        stock_limit_type != 'per_user'
        OR stock_limit != 1
        OR stock_limit IS NULL
    );

-- 디지털 상품 전체 현황
SELECT
    reward_type,
    stock_limit_type,
    stock_limit,
    COUNT(*) as count
FROM partner_roulette_items
WHERE
    is_active = true
GROUP BY
    reward_type,
    stock_limit_type,
    stock_limit
ORDER BY reward_type, stock_limit_type;