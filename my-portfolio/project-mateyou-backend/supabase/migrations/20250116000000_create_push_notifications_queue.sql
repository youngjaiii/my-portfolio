-- 🔔 푸시 알림 큐 테이블 생성
CREATE TABLE IF NOT EXISTS push_notifications_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- member_id 또는 partner의 member_id
  target_member_id UUID, -- 대상 멤버 ID
  target_partner_id TEXT, -- 대상 파트너 ID (target_id)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  url TEXT,
  tag TEXT,
  notification_type TEXT DEFAULT 'system',
  data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_push_queue_status ON push_notifications_queue(status) WHERE status = 'pending';
CREATE INDEX idx_push_queue_scheduled ON push_notifications_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_push_queue_target_member ON push_notifications_queue(target_member_id) WHERE target_member_id IS NOT NULL;
CREATE INDEX idx_push_queue_target_partner ON push_notifications_queue(target_partner_id) WHERE target_partner_id IS NOT NULL;

-- 업데이트 트리거
CREATE OR REPLACE FUNCTION update_push_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_queue_updated_at
  BEFORE UPDATE ON push_notifications_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_push_queue_updated_at();

-- RLS 정책 (선택사항 - 서비스 레벨에서만 접근)
ALTER TABLE push_notifications_queue ENABLE ROW LEVEL SECURITY;

-- 서비스에서 모든 큐 항목에 접근 가능
CREATE POLICY "Service can manage push queue"
  ON push_notifications_queue
  FOR ALL
  USING (true);

