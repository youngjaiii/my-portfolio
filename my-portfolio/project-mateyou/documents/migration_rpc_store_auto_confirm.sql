-- ============================================
-- 스토어 자동 구매확정 RPC 함수
-- 100% 트랜잭션 안전성 보장
-- ============================================

-- =============================================
-- ⚠️ 반드시 아래 순서대로 개별 실행하세요!
-- =============================================

-- [STEP 1] 먼저 이것만 실행
-- 기존 인덱스 삭제 (있으면)
DROP INDEX IF EXISTS partner_points_logs_log_id_unique;

-- [STEP 2] 그 다음 이것만 실행
-- 빈 문자열/공백만 있는 값을 NULL로 변환
UPDATE partner_points_logs 
SET log_id = NULL 
WHERE log_id IS NULL 
   OR log_id = '' 
   OR TRIM(log_id) = ''
   OR LENGTH(log_id) = 0;

-- [STEP 3] 그 다음 이것만 실행  
-- UNIQUE 인덱스 생성 (NULL, 빈문자열, 공백 제외)
CREATE UNIQUE INDEX partner_points_logs_log_id_unique 
ON partner_points_logs(log_id) 
WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0;

-- 2. 반환 타입 정의
DROP TYPE IF EXISTS auto_confirm_result CASCADE;
CREATE TYPE auto_confirm_result AS (
  order_id UUID,
  status TEXT,
  message TEXT,
  store_points NUMERIC,
  collab_points NUMERIC
);

-- 3. 자동 구매확정 RPC 함수
CREATE OR REPLACE FUNCTION rpc_store_auto_confirm(
  p_days_threshold INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_threshold_date TIMESTAMPTZ;
  v_total_success INTEGER := 0;
  v_total_failed INTEGER := 0;
  v_total_skipped INTEGER := 0;
  v_results JSONB := '[]'::JSONB;
  v_store_points NUMERIC;
  v_collab_points NUMERIC;
  v_log_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_updated_count INTEGER;
  v_distribution_rate INTEGER;
  v_item_amount NUMERIC;
BEGIN
  -- 기준 날짜 계산
  v_threshold_date := v_now - (p_days_threshold || ' days')::INTERVAL;
  
  RAISE NOTICE '[rpc_store_auto_confirm] 실행 시작: %, 기준일: %', v_now, v_threshold_date;
  
  -- 자동 구매확정 대상 주문 조회
  FOR v_order IN 
    SELECT DISTINCT o.order_id, o.order_number, o.partner_id, o.total_amount
    FROM store_orders o
    INNER JOIN store_order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'delivered'
      AND o.is_confirmed = false
      AND o.delivered_at <= v_threshold_date
      AND oi.product_type = 'delivery'
  LOOP
    -- 각 주문을 개별 SAVEPOINT로 처리 (한 주문 실패해도 다른 주문은 계속)
    BEGIN
      -- ========================================
      -- 🔒 1. 원자적 업데이트 (중복 실행 방어)
      -- ========================================
      UPDATE store_orders
      SET 
        status = 'confirmed',
        is_confirmed = true,
        confirmed_at = v_now
      WHERE order_id = v_order.order_id
        AND is_confirmed = false  -- 🔒 중복 실행 방어
        AND status = 'delivered';
      
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      
      -- 이미 처리됨 (중복 실행 방어)
      IF v_updated_count = 0 THEN
        v_total_skipped := v_total_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'order_id', v_order.order_id,
          'status', 'skipped',
          'message', '이미 처리된 주문 (중복 실행 방어)'
        );
        CONTINUE;
      END IF;
      
      -- ========================================
      -- 2. order_items 상태 업데이트
      -- ========================================
      UPDATE store_order_items
      SET 
        status = 'confirmed',
        is_confirmed = true,
        confirmed_at = v_now
      WHERE order_id = v_order.order_id;
      
      -- ========================================
      -- 3. 포인트 계산 및 적립
      -- ========================================
      v_store_points := 0;
      v_collab_points := 0;
      
      IF v_order.partner_id IS NOT NULL THEN
        -- 각 아이템별 포인트 로그 및 합계 계산 (배분율 적용)
        FOR v_item IN 
          SELECT oi.order_item_id, oi.product_id, oi.product_name, oi.product_source, oi.subtotal
          FROM store_order_items oi
          WHERE oi.order_id = v_order.order_id
        LOOP
          v_log_id := 'store_auto_confirm_' || v_order.order_id || '_' || v_item.order_item_id || '_' || v_order.partner_id;
          
          IF v_item.product_source = 'collaboration' THEN
            -- 협업 상품: 배분율 적용
            -- 1. 상품 테이블에서 배분율 우선 조회
            SELECT COALESCE(distribution_rate, 100) INTO v_distribution_rate
            FROM store_products
            WHERE product_id = v_item.product_id;
            
            -- 배분율이 없으면 기본값 100%
            IF v_distribution_rate IS NULL THEN
              v_distribution_rate := 100;
            END IF;
            
            -- 배분율 적용한 금액 계산
            v_item_amount := FLOOR(COALESCE(v_item.subtotal, 0) * v_distribution_rate / 100);
            v_collab_points := v_collab_points + v_item_amount;
            
            -- 🔒 중복 방지: ON CONFLICT (partial unique index 사용)
            INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
            VALUES (
              v_order.partner_id,
              'earn',
              v_item_amount,
              '협업 상품 자동 구매확정 (배분율 ' || v_distribution_rate || '%): ' || v_item.product_name,
              v_log_id,
              'collaboration_store_points'
            )
            ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
          ELSE
            -- 파트너 개인상품: 100% 적립
            v_store_points := v_store_points + COALESCE(v_item.subtotal, 0);
            
            INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
            VALUES (
              v_order.partner_id,
              'earn',
              v_item.subtotal,
              '스토어 상품 자동 구매확정: ' || v_item.product_name,
              v_log_id,
              'store_points'
            )
            ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
          END IF;
        END LOOP;
        
        -- 🔒 원자적 포인트 증가 (동시성 안전)
        UPDATE partners
        SET 
          store_points = COALESCE(store_points, 0) + v_store_points,
          collaboration_store_points = COALESCE(collaboration_store_points, 0) + v_collab_points
        WHERE id = v_order.partner_id;
        
        RAISE NOTICE '[rpc_store_auto_confirm] 주문 % 완료: store_points=%, collab_points=%', 
          v_order.order_id, v_store_points, v_collab_points;
      END IF;
      
      v_total_success := v_total_success + 1;
      v_results := v_results || jsonb_build_object(
        'order_id', v_order.order_id,
        'status', 'success',
        'message', format('자동 구매확정 완료 (store_points: %s, collab_points: %s)', v_store_points, v_collab_points),
        'store_points', v_store_points,
        'collab_points', v_collab_points
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- 개별 주문 처리 실패 시 해당 주문만 롤백
      v_total_failed := v_total_failed + 1;
      v_results := v_results || jsonb_build_object(
        'order_id', v_order.order_id,
        'status', 'failed',
        'message', SQLERRM
      );
      RAISE NOTICE '[rpc_store_auto_confirm] 주문 % 실패: %', v_order.order_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '[rpc_store_auto_confirm] 완료: 성공=%s, 실패=%s, 스킵=%s', 
    v_total_success, v_total_failed, v_total_skipped;
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'total', v_total_success + v_total_failed + v_total_skipped,
      'success', v_total_success,
      'failed', v_total_failed,
      'skipped', v_total_skipped,
      'details', v_results
    )
  );
END;
$$;

-- 4. 단일 주문 수동 구매확정 RPC (관리자용)
CREATE OR REPLACE FUNCTION rpc_store_confirm_order(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_store_points NUMERIC := 0;
  v_collab_points NUMERIC := 0;
  v_log_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_updated_count INTEGER;
  v_distribution_rate INTEGER;
  v_item_amount NUMERIC;
BEGIN
  -- 주문 조회
  SELECT order_id, order_number, partner_id, total_amount, status, is_confirmed
  INTO v_order
  FROM store_orders
  WHERE order_id = p_order_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '주문을 찾을 수 없습니다.');
  END IF;
  
  IF v_order.is_confirmed THEN
    RETURN jsonb_build_object('success', false, 'error', '이미 구매확정된 주문입니다.');
  END IF;
  
  IF v_order.status NOT IN ('delivered', 'shipped') THEN
    RETURN jsonb_build_object('success', false, 'error', '배송완료 또는 배송중 상태의 주문만 구매확정 가능합니다.');
  END IF;
  
  -- 🔒 원자적 업데이트
  UPDATE store_orders
  SET 
    status = 'confirmed',
    is_confirmed = true,
    confirmed_at = v_now
  WHERE order_id = p_order_id
    AND is_confirmed = false;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '주문 상태 업데이트 실패 (이미 처리됨)');
  END IF;
  
  -- order_items 상태 업데이트
  UPDATE store_order_items
  SET 
    status = 'confirmed',
    is_confirmed = true,
    confirmed_at = v_now
  WHERE order_id = p_order_id;
  
  -- 포인트 적립 (배분율 적용)
  IF v_order.partner_id IS NOT NULL THEN
    FOR v_item IN 
      SELECT oi.order_item_id, oi.product_id, oi.product_name, oi.product_source, oi.subtotal
      FROM store_order_items oi
      WHERE oi.order_id = p_order_id
    LOOP
      v_log_id := 'store_confirm_' || p_order_id || '_' || v_item.order_item_id || '_' || v_order.partner_id;
      
      IF v_item.product_source = 'collaboration' THEN
        -- 협업 상품: 배분율 적용
        SELECT COALESCE(distribution_rate, 100) INTO v_distribution_rate
        FROM store_products
        WHERE product_id = v_item.product_id;
        
        IF v_distribution_rate IS NULL THEN
          v_distribution_rate := 100;
        END IF;
        
        v_item_amount := FLOOR(COALESCE(v_item.subtotal, 0) * v_distribution_rate / 100);
        v_collab_points := v_collab_points + v_item_amount;
        
        INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
        VALUES (v_order.partner_id, 'earn', v_item_amount, '협업 상품 구매확정 (배분율 ' || v_distribution_rate || '%): ' || v_item.product_name, v_log_id, 'collaboration_store_points')
        ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
      ELSE
        -- 파트너 개인상품: 100% 적립
        v_store_points := v_store_points + COALESCE(v_item.subtotal, 0);
        
        INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
        VALUES (v_order.partner_id, 'earn', v_item.subtotal, '스토어 상품 구매확정: ' || v_item.product_name, v_log_id, 'store_points')
        ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
      END IF;
    END LOOP;
    
    UPDATE partners
    SET 
      store_points = COALESCE(store_points, 0) + v_store_points,
      collaboration_store_points = COALESCE(collaboration_store_points, 0) + v_collab_points
    WHERE id = v_order.partner_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'order_id', p_order_id,
      'store_points', v_store_points,
      'collab_points', v_collab_points,
      'message', format('구매확정 완료 (store_points: %s, collab_points: %s)', v_store_points, v_collab_points)
    )
  );
END;
$$;

-- 5. 함수 권한 설정
GRANT EXECUTE ON FUNCTION rpc_store_auto_confirm(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_store_confirm_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_store_confirm_order(UUID) TO authenticated;

-- 참고: 크론 스케줄 설정 (pg_cron 사용 시)
-- SELECT cron.schedule(
--   'store-auto-confirm-rpc',
--   '0 0 * * *',  -- 매일 자정 (UTC)
--   $$SELECT rpc_store_auto_confirm(3)$$
-- );
