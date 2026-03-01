-- 🔔 자동 푸시 알림을 위한 Database Trigger 함수 생성

-- 1. pg_net 확장 활성화 (HTTP 요청을 위한 확장)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. 푸시 알림 전송을 위한 함수 생성
-- target_id에 해당하는 member에게 푸시 알림을 자동으로 전송
CREATE OR REPLACE FUNCTION notify_push_to_target()
RETURNS TRIGGER AS $$
DECLARE
  v_target_id TEXT;
  v_supabase_url TEXT;
  v_supabase_anon_key TEXT;
  v_payload JSONB;
  v_notification_type TEXT;
  v_title TEXT;
  v_body TEXT;
  v_url TEXT;
BEGIN
  -- target_id 추출 (NEW 레코드에서 target_id 또는 receiver_id 등을 확인)
  -- member_chats의 경우 receiver_id를 target_id로 사용
  -- partner_requests의 경우 partner_id를 member_id로 변환하여 target_id로 사용
  
  IF TG_TABLE_NAME = 'member_chats' THEN
    -- member_chats: receiver_id를 target_id로 사용
    v_target_id := NEW.receiver_id::TEXT;
    v_notification_type := 'message';
    v_title := '새로운 메시지';
    v_body := LEFT(NEW.message, 100);
    v_url := '/chat?partnerId=' || NEW.sender_id;
    
  ELSIF TG_TABLE_NAME = 'partner_requests' THEN
    -- partner_requests: partner_id를 member_id로 변환하여 target_id로 사용
    SELECT p.member_id::TEXT INTO v_target_id
    FROM partners p
    WHERE p.id = NEW.partner_id
    LIMIT 1;
    
    v_notification_type := 'request';
    v_title := '새로운 의뢰 요청';
    v_body := COALESCE(NEW.request_type, '의뢰') || ' ' || NEW.job_count::TEXT || '건';
    v_url := '/partner/dashboard?tab=requests';
    
  ELSE
    -- 다른 테이블의 경우 NEW 레코드에서 target_id 직접 추출
    v_target_id := COALESCE(
      NEW.target_id::TEXT,
      NEW.receiver_id::TEXT,
      NEW.target_member_id::TEXT
    );
    v_notification_type := 'system';
    v_title := '새로운 알림';
    v_body := '새로운 업데이트가 있습니다';
    v_url := '/';
  END IF;

  -- target_id가 없으면 알림 전송하지 않음
  IF v_target_id IS NULL OR v_target_id = '' THEN
    RETURN NEW;
  END IF;

  -- Supabase URL과 Anon Key 가져오기
  -- Supabase에서는 pg_net을 사용하므로 환경 변수 대신 직접 설정
  -- 실제 프로덕션에서는 Supabase Dashboard의 Database Settings에서 확인
  -- 또는 secrets에서 가져오기 (supabase_functions.secrets)
  v_supabase_url := current_setting('app.supabase_url', true);
  v_supabase_anon_key := current_setting('app.supabase_anon_key', true);

  -- 환경 변수가 없으면 기본값 사용 (실제 환경에서는 반드시 설정 필요)
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    -- Supabase 프로젝트 URL을 여기에 설정해야 함
    -- 또는 pg_config에서 가져오기
    RETURN NEW; -- URL이 없으면 알림 전송하지 않음
  END IF;
  IF v_supabase_anon_key IS NULL OR v_supabase_anon_key = '' THEN
    RETURN NEW; -- Anon Key가 없으면 알림 전송하지 않음
  END IF;

  -- 푸시 알림 페이로드 생성
  v_payload := jsonb_build_object(
    'target_id', v_target_id,
    'notification_type', v_notification_type,
    'title', v_title,
    'body', v_body,
    'url', v_url,
    'data', jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', COALESCE(NEW.id::TEXT, ''),
      'timestamp', EXTRACT(EPOCH FROM NOW())::TEXT
    )
  );

  -- Edge Function 호출 (비동기적으로 실행)
  -- pg_net.http_post를 사용하여 Edge Function에 HTTP 요청
  -- PERFORM를 사용하여 반환값을 무시하고 비동기적으로 실행
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/push-notification-auto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_supabase_anon_key,
      'apikey', v_supabase_anon_key
    ),
    body := v_payload::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 에러가 발생해도 트랜잭션을 롤백하지 않음 (로깅만)
    RAISE WARNING 'Push notification trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. member_chats 테이블에 Trigger 생성
DROP TRIGGER IF EXISTS trg_notify_push_on_message ON member_chats;
CREATE TRIGGER trg_notify_push_on_message
  AFTER INSERT ON member_chats
  FOR EACH ROW
  WHEN (NEW.is_read = false)
  EXECUTE FUNCTION notify_push_to_target();

-- 4. partner_requests 테이블에 Trigger 생성
DROP TRIGGER IF EXISTS trg_notify_push_on_request ON partner_requests;
CREATE TRIGGER trg_notify_push_on_request
  AFTER INSERT ON partner_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_push_to_target();

-- 5. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_target_id 
  ON web_push_subscriptions(target_id) 
  WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_member_id 
  ON web_push_subscriptions(member_id) 
  WHERE member_id IS NOT NULL;

