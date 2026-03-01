-- =====================================================
-- 상품별 스케줄 관리 기능 마이그레이션
-- store_partner_schedules 테이블에 product_id 컬럼 추가
-- =====================================================

-- 1. product_id 컬럼 추가 (NULL 허용으로 먼저 추가)
ALTER TABLE store_partner_schedules 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES store_products(product_id) ON DELETE CASCADE;

-- 2. 기존 스케줄 데이터 삭제 (product_id가 NULL인 레코드)
-- 주의: 기존 데이터가 삭제됩니다. 운영 환경에서는 백업 후 실행하세요.
DELETE FROM store_partner_schedules WHERE product_id IS NULL;

-- 3. product_id NOT NULL 제약 추가
ALTER TABLE store_partner_schedules 
ALTER COLUMN product_id SET NOT NULL;

-- 4. 인덱스 추가 (상품별 스케줄 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_store_schedules_product ON store_partner_schedules(product_id);

-- 5. 복합 인덱스 추가 (상품별 + 시간별 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_store_schedules_product_time ON store_partner_schedules(product_id, start_time);

-- 6. 기존 partner_id 인덱스는 유지 (파트너별 전체 스케줄 조회용)
-- CREATE INDEX IF NOT EXISTS idx_store_schedules_partner ON store_partner_schedules(partner_id);

-- =====================================================
-- 롤백 스크립트 (필요 시 사용)
-- =====================================================
/*
-- 1. NOT NULL 제약 제거
ALTER TABLE store_partner_schedules 
ALTER COLUMN product_id DROP NOT NULL;

-- 2. 인덱스 삭제
DROP INDEX IF EXISTS idx_store_schedules_product;
DROP INDEX IF EXISTS idx_store_schedules_product_time;

-- 3. 컬럼 삭제
ALTER TABLE store_partner_schedules 
DROP COLUMN IF EXISTS product_id;
*/
