-- ============================================
-- 협업 상품 즉시 등록 마이그레이션
-- 기존 pending 상태 요청을 accepted로 변경하고 복제 상품 생성
-- ============================================

-- ⚠️ 주의: 이 마이그레이션은 기존 pending 상태의 협업 요청에 대해
-- 복제 상품을 생성하고 accepted 상태로 변경합니다.

-- [STEP 1] 기존 pending 상태 협업 요청 확인
-- 실행 전 확인용 쿼리
SELECT 
  cr.request_id,
  cr.product_id,
  cr.partner_id,
  cr.status,
  cr.distribution_rate,
  p.name as product_name,
  pt.partner_name
FROM store_collaboration_requests cr
JOIN store_products p ON p.product_id = cr.product_id
JOIN partners pt ON pt.id = cr.partner_id
WHERE cr.status = 'pending';

-- [STEP 2] pending 요청에 대한 복제 상품 생성 및 상태 변경
-- 이 작업은 RPC 함수로 처리하는 것이 안전합니다.

CREATE OR REPLACE FUNCTION migrate_pending_collaboration_requests()
RETURNS TABLE(
  request_id UUID,
  partner_id UUID,
  original_product_id UUID,
  cloned_product_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_product RECORD;
  v_cloned_id UUID;
BEGIN
  -- pending 상태의 협업 요청 순회
  FOR v_request IN 
    SELECT cr.request_id, cr.product_id, cr.partner_id, cr.distribution_rate
    FROM store_collaboration_requests cr
    WHERE cr.status = 'pending'
  LOOP
    -- 원본 상품 정보 조회
    SELECT * INTO v_product
    FROM store_products
    WHERE product_id = v_request.product_id;
    
    IF NOT FOUND THEN
      RAISE NOTICE '원본 상품을 찾을 수 없음: %', v_request.product_id;
      CONTINUE;
    END IF;
    
    -- 이미 복제 상품이 있는지 확인
    IF EXISTS (
      SELECT 1 FROM store_products 
      WHERE parent_product_id = v_request.product_id 
        AND partner_id = v_request.partner_id
    ) THEN
      -- 이미 복제 상품이 있으면 상태만 업데이트
      SELECT product_id INTO v_cloned_id
      FROM store_products 
      WHERE parent_product_id = v_request.product_id 
        AND partner_id = v_request.partner_id
      LIMIT 1;
      
      UPDATE store_collaboration_requests
      SET status = 'accepted', cloned_product_id = v_cloned_id, updated_at = NOW()
      WHERE store_collaboration_requests.request_id = v_request.request_id;
      
      request_id := v_request.request_id;
      partner_id := v_request.partner_id;
      original_product_id := v_request.product_id;
      cloned_product_id := v_cloned_id;
      status := 'already_existed';
      RETURN NEXT;
      CONTINUE;
    END IF;
    
    -- 복제 상품 생성
    INSERT INTO store_products (
      name, description, price, product_type, thumbnail_url, source,
      partner_id, parent_product_id, stock, shipping_fee_base, shipping_fee_remote,
      distribution_rate, is_active, purchase_count
    )
    VALUES (
      v_product.name, v_product.description, v_product.price, v_product.product_type,
      v_product.thumbnail_url, 'collaboration', v_request.partner_id, v_product.product_id,
      v_product.stock, v_product.shipping_fee_base, v_product.shipping_fee_remote,
      COALESCE(v_request.distribution_rate, 100), true, 0
    )
    RETURNING product_id INTO v_cloned_id;
    
    -- 상품 이미지 복제
    INSERT INTO store_product_images (product_id, image_url, display_order)
    SELECT v_cloned_id, image_url, display_order
    FROM store_product_images
    WHERE product_id = v_product.product_id;
    
    -- 디지털 자산 복제 (digital 상품인 경우)
    IF v_product.product_type = 'digital' THEN
      INSERT INTO store_digital_assets (product_id, file_url, file_name, display_order)
      SELECT v_cloned_id, file_url, file_name, display_order
      FROM store_digital_assets
      WHERE product_id = v_product.product_id;
    END IF;
    
    -- 협업 요청 상태 업데이트
    UPDATE store_collaboration_requests
    SET status = 'accepted', cloned_product_id = v_cloned_id, updated_at = NOW()
    WHERE store_collaboration_requests.request_id = v_request.request_id;
    
    request_id := v_request.request_id;
    partner_id := v_request.partner_id;
    original_product_id := v_request.product_id;
    cloned_product_id := v_cloned_id;
    status := 'migrated';
    RETURN NEXT;
    
    RAISE NOTICE '마이그레이션 완료: request=%, partner=%, cloned=%', 
      v_request.request_id, v_request.partner_id, v_cloned_id;
  END LOOP;
END;
$$;

-- [STEP 3] 마이그레이션 실행
-- SELECT * FROM migrate_pending_collaboration_requests();

-- [STEP 4] 마이그레이션 함수 삭제 (선택사항)
-- DROP FUNCTION IF EXISTS migrate_pending_collaboration_requests();

-- [STEP 5] 결과 확인
-- SELECT 
--   cr.request_id,
--   cr.status,
--   cr.cloned_product_id,
--   p.name as product_name,
--   pt.partner_name
-- FROM store_collaboration_requests cr
-- JOIN store_products p ON p.product_id = cr.product_id
-- JOIN partners pt ON pt.id = cr.partner_id
-- WHERE cr.status = 'accepted';
