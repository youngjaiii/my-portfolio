-- ============================================
-- 협업 상품 배분율 정책 변경 마이그레이션
-- 기본 배분율: 85% → 100%
-- ============================================

-- 1. store_products 테이블에 distribution_rate 컬럼 추가
-- 협업 상품 등록 시 상품별 배분율 저장용
ALTER TABLE store_products 
ADD COLUMN IF NOT EXISTS distribution_rate INTEGER DEFAULT 100;

-- 2. 기존 협업 상품에 기본값 100 적용
UPDATE store_products 
SET distribution_rate = 100 
WHERE source = 'collaboration' AND distribution_rate IS NULL;

-- 3. partner_business_info 기본값 변경 (기존 85 → 100)
UPDATE partner_business_info 
SET collaboration_distribution_rate = 100 
WHERE collaboration_distribution_rate = 85;

-- 4. 확인 쿼리
-- SELECT product_id, name, source, distribution_rate 
-- FROM store_products 
-- WHERE source = 'collaboration';

-- SELECT partner_id, collaboration_distribution_rate 
-- FROM partner_business_info;
