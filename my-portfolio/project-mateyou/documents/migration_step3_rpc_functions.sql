-- =============================================
-- STEP 3: STEP 2 완료 후 이 파일 실행하세요
-- RPC 함수 생성
-- =============================================

-- 반환 타입 정의
DROP TYPE IF EXISTS auto_confirm_result CASCADE;
CREATE TYPE auto_confirm_result AS (
  order_id UUID,
  status TEXT,
  message TEXT,
  store_points NUMERIC,
  collab_points NUMERIC
);

-- 자동 구매확정 RPC 함수
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
        -- 각 아이템별 포인트 로그 및 합계 계산
        FOR v_item IN 
          SELECT order_item_id, product_name, product_source, subtotal
          FROM store_order_items
          WHERE order_id = v_order.order_id
        LOOP
          v_log_id := 'store_auto_confirm_' || v_order.order_id || '_' || v_item.order_item_id || '_' || v_order.partner_id;
          
          IF v_item.product_source = 'collaboration' THEN
            v_collab_points := v_collab_points + COALESCE(v_item.subtotal, 0);
            
            -- 🔒 중복 방지: ON CONFLICT (partial unique index 사용)
            INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
            VALUES (
              v_order.partner_id,
              'earn',
              v_item.subtotal,
              '협업 상품 자동 구매확정: ' || v_item.product_name,
              v_log_id,
              'collaboration_store_points'
            )
            ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
          ELSE
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

-- 단일 주문 수동 구매확정 RPC (관리자용)
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
  
  -- 포인트 적립
  IF v_order.partner_id IS NOT NULL THEN
    FOR v_item IN 
      SELECT order_item_id, product_name, product_source, subtotal
      FROM store_order_items
      WHERE order_id = p_order_id
    LOOP
      v_log_id := 'store_confirm_' || p_order_id || '_' || v_item.order_item_id || '_' || v_order.partner_id;
      
      IF v_item.product_source = 'collaboration' THEN
        v_collab_points := v_collab_points + COALESCE(v_item.subtotal, 0);
        
        INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
        VALUES (v_order.partner_id, 'earn', v_item.subtotal, '협업 상품 구매확정: ' || v_item.product_name, v_log_id, 'collaboration_store_points')
        ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
      ELSE
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

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION rpc_store_auto_confirm(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_store_confirm_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_store_confirm_order(UUID) TO authenticated;
