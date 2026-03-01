-- 협업 상품 이행완료 기록 테이블
-- 파트너가 협업 상품의 이행을 완료했을 때 인증 사진과 메모를 저장

CREATE TABLE IF NOT EXISTS store_order_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES store_orders(order_id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id),
  product_type TEXT NOT NULL CHECK (product_type IN ('on_site', 'delivery')),
  media_urls TEXT[] NOT NULL,
  note TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_store_order_fulfillments_order_id ON store_order_fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_store_order_fulfillments_partner_id ON store_order_fulfillments(partner_id);
CREATE INDEX IF NOT EXISTS idx_store_order_fulfillments_created_at ON store_order_fulfillments(created_at DESC);

-- RLS 정책 (Row Level Security)
ALTER TABLE store_order_fulfillments ENABLE ROW LEVEL SECURITY;

-- 관리자: 모든 레코드 조회 가능
CREATE POLICY "Admins can view all fulfillments" ON store_order_fulfillments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members WHERE members.id = auth.uid() AND members.role = 'admin'
    )
  );

-- 파트너: 본인 레코드만 조회/생성 가능
CREATE POLICY "Partners can view own fulfillments" ON store_order_fulfillments
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT id FROM partners WHERE member_id = auth.uid()
    )
  );

CREATE POLICY "Partners can insert own fulfillments" ON store_order_fulfillments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE member_id = auth.uid()
    )
  );

-- 서비스 역할은 모든 작업 가능 (Edge Functions용)
CREATE POLICY "Service role has full access" ON store_order_fulfillments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
