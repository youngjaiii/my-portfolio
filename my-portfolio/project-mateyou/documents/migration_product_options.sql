-- ============================================
-- 상품 옵션 테이블 마이그레이션
-- ============================================

-- 1. store_product_options (옵션 그룹) 테이블 생성
CREATE TABLE IF NOT EXISTS store_product_options (
  option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES store_products(product_id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- 예: "사이즈", "요청사항"
  option_type TEXT NOT NULL DEFAULT 'select',  -- 'select': 선택형, 'text': 자유입력
  is_required BOOLEAN DEFAULT true,      -- select는 보통 필수, text는 선택
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_option_type CHECK (option_type IN ('select', 'text'))
);

-- 2. store_product_option_values (선택형 옵션의 값) 테이블 생성
CREATE TABLE IF NOT EXISTS store_product_option_values (
  value_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID NOT NULL REFERENCES store_product_options(option_id) ON DELETE CASCADE,
  value TEXT NOT NULL,                   -- 예: "M", "L"
  price_adjustment INTEGER DEFAULT 0,    -- 추가 가격 (0이면 가격 변동 없음)
  stock INTEGER,                         -- NULL이면 상품 재고 공유, 값 있으면 개별 재고
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_product_options_product ON store_product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_product_options_display ON store_product_options(product_id, display_order);
CREATE INDEX IF NOT EXISTS idx_option_values_option ON store_product_option_values(option_id);
CREATE INDEX IF NOT EXISTS idx_option_values_display ON store_product_option_values(option_id, display_order);

-- 4. store_order_items에 selected_options 컬럼 추가
ALTER TABLE store_order_items 
ADD COLUMN IF NOT EXISTS selected_options JSONB;

-- 5. store_cart_items에 selected_options 컬럼 추가 (장바구니 옵션 저장)
ALTER TABLE store_cart_items 
ADD COLUMN IF NOT EXISTS selected_options JSONB;

-- 5. RLS 정책 설정
ALTER TABLE store_product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_option_values ENABLE ROW LEVEL SECURITY;

-- store_product_options RLS
DROP POLICY IF EXISTS "store_product_options_select" ON store_product_options;
CREATE POLICY "store_product_options_select" ON store_product_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "store_product_options_insert" ON store_product_options;
CREATE POLICY "store_product_options_insert" ON store_product_options
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "store_product_options_update" ON store_product_options;
CREATE POLICY "store_product_options_update" ON store_product_options
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "store_product_options_delete" ON store_product_options;
CREATE POLICY "store_product_options_delete" ON store_product_options
  FOR DELETE USING (true);

-- store_product_option_values RLS
DROP POLICY IF EXISTS "store_product_option_values_select" ON store_product_option_values;
CREATE POLICY "store_product_option_values_select" ON store_product_option_values
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "store_product_option_values_insert" ON store_product_option_values;
CREATE POLICY "store_product_option_values_insert" ON store_product_option_values
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "store_product_option_values_update" ON store_product_option_values;
CREATE POLICY "store_product_option_values_update" ON store_product_option_values
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "store_product_option_values_delete" ON store_product_option_values;
CREATE POLICY "store_product_option_values_delete" ON store_product_option_values
  FOR DELETE USING (true);

-- 6. 코멘트 추가
COMMENT ON TABLE store_product_options IS '상품 옵션 그룹 (사이즈, 요청사항 등)';
COMMENT ON COLUMN store_product_options.option_type IS 'select: 선택형 (가격 조정 가능), text: 자유입력 (가격 적용 없음)';
COMMENT ON COLUMN store_product_options.is_required IS 'true: 필수 선택, false: 선택 사항';

COMMENT ON TABLE store_product_option_values IS '선택형 옵션의 값 (S, M, L 등)';
COMMENT ON COLUMN store_product_option_values.price_adjustment IS '추가 가격 (0이면 변동 없음)';
COMMENT ON COLUMN store_product_option_values.stock IS 'NULL이면 상품 재고 공유, 값 있으면 개별 재고 관리';

COMMENT ON COLUMN store_order_items.selected_options IS '구매자가 선택한 옵션 정보 (JSONB)';
