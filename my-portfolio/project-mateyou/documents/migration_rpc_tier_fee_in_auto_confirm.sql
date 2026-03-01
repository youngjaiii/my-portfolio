-- ============================================
-- Migration: 자동 구매확정 RPC에 티어 수수료 반영
-- rpc_store_auto_confirm 내 개인상품 적립 시
-- partner_tier_current + fee_policy 조회하여 수수료 차감
-- ============================================

-- 변수 추가: v_take_rate, v_tier_code, v_net_amount
-- 개인상품 적립 로직에서 subtotal 대신 수수료 차감액 사용

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
  v_take_rate NUMERIC;
  v_tier_code TEXT;
  v_net_amount NUMERIC;
BEGIN
  v_threshold_date := v_now - (p_days_threshold || ' days')::INTERVAL;
  
  RAISE NOTICE '[rpc_store_auto_confirm] 실행 시작: %, 기준일: %', v_now, v_threshold_date;
  
  FOR v_order IN 
    SELECT DISTINCT o.order_id, o.order_number, o.partner_id, o.total_amount
    FROM store_orders o
    INNER JOIN store_order_items oi ON oi.order_id = o.order_id
    WHERE o.status = 'delivered'
      AND o.is_confirmed = false
      AND o.delivered_at <= v_threshold_date
      AND oi.product_type = 'delivery'
  LOOP
    BEGIN
      UPDATE store_orders
      SET 
        status = 'confirmed',
        is_confirmed = true,
        confirmed_at = v_now
      WHERE order_id = v_order.order_id
        AND is_confirmed = false
        AND status = 'delivered';
      
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      
      IF v_updated_count = 0 THEN
        v_total_skipped := v_total_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'order_id', v_order.order_id,
          'status', 'skipped',
          'message', '이미 처리된 주문'
        );
        CONTINUE;
      END IF;
      
      UPDATE store_order_items
      SET 
        status = 'confirmed',
        is_confirmed = true,
        confirmed_at = v_now
      WHERE order_id = v_order.order_id;
      
      v_store_points := 0;
      v_collab_points := 0;
      v_take_rate := 25.0;
      v_tier_code := 'bronze';
      
      IF v_order.partner_id IS NOT NULL THEN
        -- 파트너 티어 조회
        SELECT COALESCE(
          CASE WHEN ptc.tier_frozen THEN 'bronze' ELSE ptc.tier_code::TEXT END,
          'bronze'
        ) INTO v_tier_code
        FROM partner_tier_current ptc
        WHERE ptc.partner_id = v_order.partner_id;
        
        IF v_tier_code IS NULL THEN
          v_tier_code := 'bronze';
        END IF;
        
        -- 수수료율 조회
        SELECT COALESCE(fp.take_rate_pct, 25.0) INTO v_take_rate
        FROM fee_policy fp
        WHERE fp.tier_code::TEXT = v_tier_code;
        
        IF v_take_rate IS NULL THEN
          v_take_rate := 25.0;
        END IF;

        -- store_orders에 적용된 수수료 기록
        UPDATE store_orders
        SET applied_take_rate = v_take_rate,
            applied_tier_code = v_tier_code
        WHERE order_id = v_order.order_id;
        
        FOR v_item IN 
          SELECT oi.order_item_id, oi.product_id, oi.product_name, oi.product_source, oi.subtotal
          FROM store_order_items oi
          WHERE oi.order_id = v_order.order_id
        LOOP
          v_log_id := 'store_auto_confirm_' || v_order.order_id || '_' || v_item.order_item_id || '_' || v_order.partner_id;
          
          IF v_item.product_source = 'collaboration' THEN
            SELECT COALESCE(distribution_rate, 100) INTO v_distribution_rate
            FROM store_products
            WHERE product_id = v_item.product_id;
            
            IF v_distribution_rate IS NULL THEN
              v_distribution_rate := 100;
            END IF;
            
            v_item_amount := FLOOR(COALESCE(v_item.subtotal, 0) * v_distribution_rate / 100);
            v_collab_points := v_collab_points + v_item_amount;
            
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
            -- 개인상품: 티어 수수료 차감 후 적립
            v_net_amount := FLOOR(COALESCE(v_item.subtotal, 0) * (100 - v_take_rate) / 100);
            v_store_points := v_store_points + v_net_amount;
            
            INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id, point_type)
            VALUES (
              v_order.partner_id,
              'earn',
              v_net_amount,
              '스토어 자동 구매확정 (' || v_tier_code || ' 티어, 수수료 ' || v_take_rate || '%): ' || v_item.product_name,
              v_log_id,
              'store_points'
            )
            ON CONFLICT (log_id) WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0 DO NOTHING;
          END IF;
        END LOOP;
        
        UPDATE partners
        SET 
          store_points = COALESCE(store_points, 0) + v_store_points,
          collaboration_store_points = COALESCE(collaboration_store_points, 0) + v_collab_points
        WHERE id = v_order.partner_id;
        
        RAISE NOTICE '[rpc_store_auto_confirm] 주문 % 완료: tier=%, takeRate=%, store_points=%, collab_points=%', 
          v_order.order_id, v_tier_code, v_take_rate, v_store_points, v_collab_points;
      END IF;
      
      v_total_success := v_total_success + 1;
      v_results := v_results || jsonb_build_object(
        'order_id', v_order.order_id,
        'status', 'success',
        'message', format('자동 구매확정 완료 (tier: %s, takeRate: %s%%, store_points: %s, collab_points: %s)', v_tier_code, v_take_rate, v_store_points, v_collab_points),
        'store_points', v_store_points,
        'collab_points', v_collab_points
      );
      
    EXCEPTION WHEN OTHERS THEN
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
