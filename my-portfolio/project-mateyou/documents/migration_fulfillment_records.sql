-- =============================================
-- 협업 상품 이행완료 기록 테이블
-- 파트너가 구매자 요구사항 이행 후 관리자에게 알림 시 사용
-- =============================================

-- 이행완료 기록 테이블 생성
CREATE TABLE IF NOT EXISTS store_fulfillment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES store_orders(order_id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('on_site', 'delivery')),
  media_urls TEXT[] NOT NULL CHECK (array_length(media_urls, 1) >= 1),  -- 미디어 URL 배열 (최소 1개 필수)
  note TEXT,  -- 파트너 메모 (선택)
  notified_at TIMESTAMPTZ DEFAULT now(),  -- 관리자 알림 발송 시간
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON store_fulfillment_records(order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_partner ON store_fulfillment_records(partner_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_created ON store_fulfillment_records(created_at DESC);

-- RLS 활성화
ALTER TABLE store_fulfillment_records ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 파트너는 자신의 이행완료 기록만 조회/생성 가능
CREATE POLICY "Partners can view own fulfillment records"
  ON store_fulfillment_records
  FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM partners WHERE member_id = auth.uid()
    )
  );

CREATE POLICY "Partners can insert own fulfillment records"
  ON store_fulfillment_records
  FOR INSERT
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE member_id = auth.uid()
    )
  );

-- RLS 정책: 관리자는 모든 이행완료 기록 조회 가능
CREATE POLICY "Admins can view all fulfillment records"
  ON store_fulfillment_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_fulfillment_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fulfillment_records_updated_at ON store_fulfillment_records;
CREATE TRIGGER trigger_fulfillment_records_updated_at
  BEFORE UPDATE ON store_fulfillment_records
  FOR EACH ROW
  EXECUTE FUNCTION update_fulfillment_records_updated_at();

-- 코멘트 추가
COMMENT ON TABLE store_fulfillment_records IS '협업 상품 이행완료 기록 - 파트너가 구매자 요구사항 이행 후 관리자에게 알림';
COMMENT ON COLUMN store_fulfillment_records.media_urls IS '이행 증빙 미디어 URL 배열 (최소 1개 필수)';
COMMENT ON COLUMN store_fulfillment_records.note IS '파트너가 작성한 메모 (선택)';
COMMENT ON COLUMN store_fulfillment_records.notified_at IS '관리자에게 알림 발송된 시간';
