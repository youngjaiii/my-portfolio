-- =====================================================
-- Migration: share_rate 컬럼 추가
-- 협업 상품 파트너 간 수익 배분 비율
-- =====================================================

-- 1. store_collaboration_requests 테이블에 share_rate 컬럼 추가
-- share_rate: 파트너 간 수익 배분 비율 (0-100)
-- 동일 상품(product_id)의 모든 파트너 share_rate 합계는 100이어야 함
ALTER TABLE public.store_collaboration_requests 
ADD COLUMN IF NOT EXISTS share_rate INTEGER DEFAULT 100;

-- 2. 컬럼 주석 추가
COMMENT ON COLUMN public.store_collaboration_requests.share_rate IS '파트너 간 수익 배분 비율 (0-100). 동일 상품의 모든 파트너 share_rate 합계는 100이어야 함. 구매 확정 시 상품금액 × share_rate로 collaboration_store_points 적립';

-- 3. 기존 distribution_rate 컬럼 주석 업데이트 (명확화)
-- 참고: 협업 정산율은 partner_business_info.collaboration_distribution_rate 사용
COMMENT ON COLUMN public.store_collaboration_requests.distribution_rate IS '(레거시) 기존 배분율 필드. 실제 협업 정산율은 partner_business_info.collaboration_distribution_rate 사용';

-- 4. share_rate 값 범위 검증 (0-100)
ALTER TABLE public.store_collaboration_requests
ADD CONSTRAINT check_share_rate_range 
CHECK (share_rate >= 0 AND share_rate <= 100);

-- 5. 기존 데이터는 share_rate = 100 (기본값)으로 유지됨
-- 단일 파트너 협업의 경우 100%가 적절함
