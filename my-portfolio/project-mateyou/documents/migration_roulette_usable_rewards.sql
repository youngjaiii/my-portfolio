-- =====================================================================
-- 룰렛 사용형 아이템 기능 마이그레이션
-- 작성일: 2025-12-25
-- 목적: 사용형 아이템(전화권, 채팅권 등) 보관 및 사용 이력 추적
-- =====================================================================

-- =====================================================================
-- 1. 사용형 아이템 보관 테이블 생성
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_roulette_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    roulette_result_id UUID NOT NULL REFERENCES donation_roulette_results(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    -- 보상 정보
    reward_type TEXT NOT NULL CHECK (reward_type IN ('usable', 'digital')),
    reward_name TEXT NOT NULL,  -- "전화 10분권", "1:1 통화권", "특별 사진" 등
    reward_value TEXT,  -- 원본 값 (예: "10", "20", 또는 파일 URL)
    -- 사용형 아이템 정보 (usable 타입일 때만)
    usable_type TEXT,  -- 'call_minutes', 'chat_count', 'video_minutes', 'message_count' 등 (쿠폰은 NULL)
    initial_amount NUMERIC(10, 2),  -- 초기 수량/시간 (1회성 쿠폰은 1, 사용형 아이템은 > 1)
    remaining_amount NUMERIC(10, 2),  -- 잔여 수량/시간 (사용하면 감소, 쿠폰은 1)
    -- 디지털 보상 정보 (digital 타입일 때만)
    digital_file_url TEXT,  -- 파일 URL (Storage 경로 또는 공개 URL)
    digital_file_name TEXT,  -- 원본 파일명
    digital_file_size BIGINT,  -- 파일 크기 (bytes)
    digital_file_type TEXT,  -- 파일 타입 (MIME type, 예: 'image/jpeg', 'video/mp4')
    digital_file_path TEXT,  -- Storage 내부 경로
    -- 상태 관리
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'used', 'expired', 'rejected')),
    expires_at TIMESTAMPTZ,  -- 만료일 (NULL이면 무제한)
    -- 파트너 승인 관련
    usage_requested_at TIMESTAMPTZ,  -- 사용 요청 시점
    usage_approved_at TIMESTAMPTZ,  -- 파트너 승인 시점
    usage_rejected_at TIMESTAMPTZ,  -- 파트너 거절 시점
    usage_rejection_reason TEXT,  -- 거절 사유
    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    used_at TIMESTAMPTZ  -- 완전히 사용된 시점 (remaining_amount = 0)
);

COMMENT ON TABLE user_roulette_rewards IS '사용자가 보유한 룰렛 보상 (사용형 아이템/쿠폰, 디지털 보상)';
COMMENT ON COLUMN user_roulette_rewards.reward_type IS 'usable(사용형-파트너 승인 필요, 잔여 수량 추적), digital(디지털 보상-파일)';
COMMENT ON COLUMN user_roulette_rewards.usable_type IS 'call_minutes(전화 분), chat_count(채팅 횟수), video_minutes(영상 통화 분), message_count(메시지 횟수)';
COMMENT ON COLUMN user_roulette_rewards.initial_amount IS '초기 수량/시간 (1회성 쿠폰은 1, 사용형 아이템은 > 1)';
COMMENT ON COLUMN user_roulette_rewards.remaining_amount IS '잔여 수량/시간 (사용하면 감소)';
COMMENT ON COLUMN user_roulette_rewards.status IS 'active(사용 가능), pending(사용 요청 대기), used(사용 완료), expired(만료), rejected(거절)';
COMMENT ON COLUMN user_roulette_rewards.digital_file_url IS '디지털 보상 파일 URL - digital 타입일 때만';
COMMENT ON COLUMN user_roulette_rewards.digital_file_name IS '원본 파일명 - digital 타입일 때만';
COMMENT ON COLUMN user_roulette_rewards.digital_file_size IS '파일 크기 (bytes) - digital 타입일 때만';
COMMENT ON COLUMN user_roulette_rewards.digital_file_type IS '파일 타입 (MIME type) - digital 타입일 때만';
COMMENT ON COLUMN user_roulette_rewards.digital_file_path IS 'Storage 내부 경로 - digital 타입일 때만';
COMMENT ON COLUMN user_roulette_rewards.status IS 'active(사용 가능), used(사용 완료-쿠폰/사용형), expired(만료)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_user 
    ON user_roulette_rewards(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_partner 
    ON user_roulette_rewards(partner_id, status);

CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_active 
    ON user_roulette_rewards(user_id, status, expires_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_result 
    ON user_roulette_rewards(roulette_result_id);

-- RLS 정책
ALTER TABLE user_roulette_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roulette_rewards_select" ON user_roulette_rewards;
DROP POLICY IF EXISTS "user_roulette_rewards_insert" ON user_roulette_rewards;
DROP POLICY IF EXISTS "user_roulette_rewards_update" ON user_roulette_rewards;

CREATE POLICY "user_roulette_rewards_select" ON user_roulette_rewards
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_roulette_rewards_insert" ON user_roulette_rewards
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_roulette_rewards_update" ON user_roulette_rewards
FOR UPDATE USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_user_roulette_rewards_updated ON user_roulette_rewards;
CREATE TRIGGER trg_user_roulette_rewards_updated
    BEFORE UPDATE ON user_roulette_rewards
    FOR EACH ROW 
    EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 2. 사용 이력 테이블 생성
-- =====================================================================

CREATE TABLE IF NOT EXISTS roulette_reward_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id UUID NOT NULL REFERENCES user_roulette_rewards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    -- 사용 정보
    usage_type TEXT NOT NULL,  -- 'call', 'chat', 'video', 'message' 등
    amount_used NUMERIC(10, 2) NOT NULL,  -- 사용할 수량/시간
    remaining_amount NUMERIC(10, 2) NOT NULL,  -- 사용 후 잔여 수량/시간
    -- 파트너 승인 정보
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES members(id),  -- 승인한 파트너의 member_id
    approved_at TIMESTAMPTZ,  -- 승인 시점
    rejection_reason TEXT,  -- 거절 사유
    -- 컨텍스트
    room_id UUID REFERENCES stream_rooms(id),
    context JSONB,  -- 추가 컨텍스트 정보
    -- 메타데이터
    requested_at TIMESTAMPTZ DEFAULT now(),  -- 요청 시점
    used_at TIMESTAMPTZ  -- 실제 사용 시점 (승인 후)
);

COMMENT ON TABLE roulette_reward_usage_logs IS '룰렛 사용형 아이템/쿠폰 사용 요청 및 승인 이력';
COMMENT ON COLUMN roulette_reward_usage_logs.usage_type IS 'call(전화), chat(채팅), video(영상 통화), message(메시지)';
COMMENT ON COLUMN roulette_reward_usage_logs.amount_used IS '사용할 수량/시간';
COMMENT ON COLUMN roulette_reward_usage_logs.remaining_amount IS '사용 후 잔여 수량/시간';
COMMENT ON COLUMN roulette_reward_usage_logs.status IS 'pending(승인 대기), approved(승인됨), rejected(거절됨)';
COMMENT ON COLUMN roulette_reward_usage_logs.approved_by IS '승인한 파트너의 member_id';
COMMENT ON COLUMN roulette_reward_usage_logs.context IS '추가 컨텍스트 정보 (JSONB)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_reward 
    ON roulette_reward_usage_logs(reward_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_user 
    ON roulette_reward_usage_logs(user_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_partner 
    ON roulette_reward_usage_logs(partner_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_room 
    ON roulette_reward_usage_logs(room_id, used_at DESC);

-- RLS 정책
ALTER TABLE roulette_reward_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roulette_reward_usage_logs_select" ON roulette_reward_usage_logs;
DROP POLICY IF EXISTS "roulette_reward_usage_logs_insert" ON roulette_reward_usage_logs;

CREATE POLICY "roulette_reward_usage_logs_select" ON roulette_reward_usage_logs
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "roulette_reward_usage_logs_insert" ON roulette_reward_usage_logs
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 3. 사용형 아이템 인벤토리 뷰 생성
-- =====================================================================

CREATE OR REPLACE VIEW user_roulette_rewards_inventory AS
SELECT 
    urr.id,
    urr.user_id,
    urr.roulette_result_id,
    urr.partner_id,
    urr.reward_type,
    urr.reward_name,
    urr.reward_value,
    urr.usable_type,
    urr.initial_amount,
    urr.remaining_amount,
    urr.status,
    urr.expires_at,
    urr.created_at AS won_at,
    urr.used_at,
    -- 파트너 정보
    p.partner_name,
    -- 룰렛 결과 정보
    drr.item_name,
    drr.item_color,
    drr.room_id,
    sr.title AS room_title,
    -- 만료 여부 계산
    CASE 
        WHEN urr.expires_at IS NOT NULL AND urr.expires_at < NOW() THEN true
        ELSE false
    END AS is_expired,
    -- 사용 가능 여부
    CASE 
        WHEN urr.status = 'used' THEN false
        WHEN urr.status = 'expired' THEN false
        WHEN urr.status = 'rejected' THEN false
        WHEN urr.expires_at IS NOT NULL AND urr.expires_at < NOW() THEN false
        WHEN urr.reward_type = 'usable' AND urr.remaining_amount <= 0 THEN false
        WHEN urr.reward_type = 'digital' THEN true  -- 디지털 보상은 항상 다운로드 가능
        ELSE true
    END AS is_usable,
    -- 파트너 승인 관련
    urr.usage_requested_at,
    urr.usage_approved_at,
    urr.usage_rejected_at,
    urr.usage_rejection_reason,
    -- 디지털 보상 정보
    urr.digital_file_url,
    urr.digital_file_name,
    urr.digital_file_size,
    urr.digital_file_type,
    urr.digital_file_path
FROM user_roulette_rewards urr
JOIN partners p ON p.id = urr.partner_id
JOIN donation_roulette_results drr ON drr.id = urr.roulette_result_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
ORDER BY urr.created_at DESC;

COMMENT ON VIEW user_roulette_rewards_inventory IS '사용자 보유 룰렛 사용형 아이템 인벤토리 뷰';

-- =====================================================================
-- 4. 다운로드 이력 테이블 생성 (선택사항)
-- =====================================================================

CREATE TABLE IF NOT EXISTS roulette_reward_download_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id UUID NOT NULL REFERENCES user_roulette_rewards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    downloaded_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE roulette_reward_download_logs IS '디지털 보상 다운로드 이력 (선택사항)';

CREATE INDEX IF NOT EXISTS idx_roulette_reward_download_logs_reward 
    ON roulette_reward_download_logs(reward_id, downloaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_roulette_reward_download_logs_user 
    ON roulette_reward_download_logs(user_id, downloaded_at DESC);

-- RLS 정책
ALTER TABLE roulette_reward_download_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roulette_reward_download_logs_select" ON roulette_reward_download_logs;
DROP POLICY IF EXISTS "roulette_reward_download_logs_insert" ON roulette_reward_download_logs;

CREATE POLICY "roulette_reward_download_logs_select" ON roulette_reward_download_logs
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "roulette_reward_download_logs_insert" ON roulette_reward_download_logs
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 5. RPC 함수: 사용형 아이템 생성
-- =====================================================================

-- 기존 함수 제거 (다른 시그니처가 있을 수 있음)
DROP FUNCTION IF EXISTS create_roulette_reward(UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS create_roulette_reward(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION create_roulette_reward(
  p_roulette_result_id UUID,
  p_user_id UUID,
  p_partner_id UUID,
  p_reward_name TEXT,
  p_reward_value TEXT,
  p_reward_type TEXT DEFAULT 'usable',  -- 'usable' 또는 'coupon'
  p_usable_type TEXT DEFAULT NULL,
  p_initial_amount NUMERIC(10, 2) DEFAULT 1,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward_id UUID;
BEGIN
  -- 사용형 아이템/쿠폰 생성
  -- 쿠폰: reward_type = 'coupon', initial_amount = 1, usable_type = NULL
  -- 사용형: reward_type = 'usable', initial_amount > 1, usable_type = 타입
  INSERT INTO user_roulette_rewards (
    user_id,
    roulette_result_id,
    partner_id,
    reward_type,
    reward_name,
    reward_value,
    usable_type,
    initial_amount,
    remaining_amount,
    expires_at
  ) VALUES (
    p_user_id,
    p_roulette_result_id,
    p_partner_id,
    p_reward_type,  -- 'usable' 또는 'coupon'
    p_reward_name,
    p_reward_value,
    p_usable_type,  -- 쿠폰은 NULL
    p_initial_amount,
    p_initial_amount,  -- 초기값과 잔여값 동일
    p_expires_at
  )
  RETURNING id INTO v_reward_id;
  
  RETURN v_reward_id;
END;
$$;

COMMENT ON FUNCTION create_roulette_reward IS '룰렛 당첨 시 사용형 아이템 생성';

-- GRANT 문은 함수의 실제 시그니처와 일치해야 합니다 (9개 파라미터)
GRANT EXECUTE ON FUNCTION create_roulette_reward(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO authenticated;

-- =====================================================================
-- 6. RPC 함수: 사용 요청
-- =====================================================================

CREATE OR REPLACE FUNCTION request_roulette_reward_usage(
  p_reward_id UUID,
  p_usage_type TEXT,
  p_amount NUMERIC(10, 2),
  p_room_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward user_roulette_rewards%ROWTYPE;
  v_remaining NUMERIC(10, 2);
  v_usage_log_id UUID;
BEGIN
  -- 보상 조회 및 검증
  SELECT * INTO v_reward
  FROM user_roulette_rewards
  WHERE id = p_reward_id
    AND user_id = auth.uid()
    AND reward_type = 'usable'
    AND status = 'active'
    AND remaining_amount >= p_amount;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_NOT_FOUND_OR_INSUFFICIENT',
      'message', '보상을 찾을 수 없거나 잔여 수량이 부족합니다'
    );
  END IF;
  
  -- 만료 확인
  IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < NOW() THEN
    UPDATE user_roulette_rewards
    SET status = 'expired'
    WHERE id = p_reward_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_EXPIRED',
      'message', '만료된 보상입니다'
    );
  END IF;
  
  -- 잔여 수량 계산
  v_remaining := v_reward.remaining_amount - p_amount;
  
  -- 보상 상태를 'pending'으로 변경
  UPDATE user_roulette_rewards
  SET 
    status = 'pending',
    usage_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = p_reward_id;
  
  -- 사용 요청 이력 기록
  INSERT INTO roulette_reward_usage_logs (
    reward_id,
    user_id,
    partner_id,
    usage_type,
    amount_used,
    remaining_amount,
    status,
    room_id,
    context
  ) VALUES (
    p_reward_id,
    v_reward.user_id,
    v_reward.partner_id,
    p_usage_type,
    p_amount,
    v_remaining,
    'pending',
    p_room_id,
    p_context
  )
  RETURNING id INTO v_usage_log_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'usage_log_id', v_usage_log_id,
    'status', 'pending',
    'message', '사용 요청이 파트너에게 전달되었습니다'
  );
END;
$$;

COMMENT ON FUNCTION request_roulette_reward_usage IS '사용형 아이템/쿠폰 사용 요청 (파트너 승인 대기)';

GRANT EXECUTE ON FUNCTION request_roulette_reward_usage(UUID, TEXT, NUMERIC, UUID, JSONB) TO authenticated;

-- =====================================================================
-- 7. RPC 함수: 디지털 보상 생성
-- =====================================================================

CREATE OR REPLACE FUNCTION create_roulette_digital_reward(
  p_roulette_result_id UUID,
  p_user_id UUID,
  p_partner_id UUID,
  p_reward_name TEXT,
  p_reward_value TEXT,
  p_file_url TEXT,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_file_type TEXT,
  p_file_path TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward_id UUID;
BEGIN
  -- 디지털 보상 생성
  INSERT INTO user_roulette_rewards (
    user_id,
    roulette_result_id,
    partner_id,
    reward_type,
    reward_name,
    reward_value,
    usable_type,  -- NULL
    initial_amount,  -- NULL
    remaining_amount,  -- NULL
    digital_file_url,
    digital_file_name,
    digital_file_size,
    digital_file_type,
    digital_file_path,
    expires_at  -- NULL (디지털 보상은 만료 없음)
  ) VALUES (
    p_user_id,
    p_roulette_result_id,
    p_partner_id,
    'digital',
    p_reward_name,
    p_reward_value,
    NULL,
    NULL,
    NULL,
    p_file_url,
    p_file_name,
    p_file_size,
    p_file_type,
    p_file_path,
    NULL
  )
  RETURNING id INTO v_reward_id;
  
  RETURN v_reward_id;
END;
$$;

COMMENT ON FUNCTION create_roulette_digital_reward IS '룰렛 당첨 시 디지털 보상 생성';

GRANT EXECUTE ON FUNCTION create_roulette_digital_reward(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT) TO authenticated;

-- =====================================================================
-- 8. RPC 함수: 파트너 승인
-- =====================================================================

CREATE OR REPLACE FUNCTION approve_roulette_reward_usage(
  p_usage_log_id UUID,
  p_partner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usage_log roulette_reward_usage_logs%ROWTYPE;
  v_reward user_roulette_rewards%ROWTYPE;
  v_partner_member_id UUID;
BEGIN
  -- 파트너 권한 확인
  SELECT member_id INTO v_partner_member_id
  FROM partners
  WHERE id = p_partner_id;
  
  IF v_partner_member_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', '파트너만 승인할 수 있습니다'
    );
  END IF;
  
  -- 사용 요청 조회
  SELECT * INTO v_usage_log
  FROM roulette_reward_usage_logs
  WHERE id = p_usage_log_id
    AND partner_id = p_partner_id
    AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USAGE_LOG_NOT_FOUND',
      'message', '사용 요청을 찾을 수 없거나 이미 처리되었습니다'
    );
  END IF;
  
  -- 보상 조회
  SELECT * INTO v_reward
  FROM user_roulette_rewards
  WHERE id = v_usage_log.reward_id
    AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_NOT_FOUND',
      'message', '보상을 찾을 수 없습니다'
    );
  END IF;
  
  -- 보상 업데이트 (사용 처리)
  UPDATE user_roulette_rewards
  SET 
    remaining_amount = v_usage_log.remaining_amount,
    status = CASE 
      WHEN v_usage_log.remaining_amount <= 0 THEN 'used'
      ELSE 'active'
    END,
    usage_approved_at = NOW(),
    used_at = CASE 
      WHEN v_usage_log.remaining_amount <= 0 THEN NOW()
      ELSE used_at
    END,
    updated_at = NOW()
  WHERE id = v_reward.id;
  
  -- 사용 이력 업데이트 (승인 처리)
  UPDATE roulette_reward_usage_logs
  SET 
    status = 'approved',
    approved_by = v_partner_member_id,
    approved_at = NOW(),
    used_at = NOW()
  WHERE id = p_usage_log_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_amount', v_usage_log.remaining_amount,
    'status', CASE WHEN v_usage_log.remaining_amount <= 0 THEN 'used' ELSE 'active' END,
    'message', '사용 요청을 승인했습니다'
  );
END;
$$;

COMMENT ON FUNCTION approve_roulette_reward_usage IS '파트너가 사용형 아이템/쿠폰 사용 요청 승인';

GRANT EXECUTE ON FUNCTION approve_roulette_reward_usage(UUID, UUID) TO authenticated;

-- =====================================================================
-- 9. RPC 함수: 파트너 거절
-- =====================================================================

CREATE OR REPLACE FUNCTION reject_roulette_reward_usage(
  p_usage_log_id UUID,
  p_partner_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usage_log roulette_reward_usage_logs%ROWTYPE;
  v_reward user_roulette_rewards%ROWTYPE;
  v_partner_member_id UUID;
BEGIN
  -- 파트너 권한 확인
  SELECT member_id INTO v_partner_member_id
  FROM partners
  WHERE id = p_partner_id;
  
  IF v_partner_member_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', '파트너만 거절할 수 있습니다'
    );
  END IF;
  
  -- 사용 요청 조회
  SELECT * INTO v_usage_log
  FROM roulette_reward_usage_logs
  WHERE id = p_usage_log_id
    AND partner_id = p_partner_id
    AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USAGE_LOG_NOT_FOUND',
      'message', '사용 요청을 찾을 수 없거나 이미 처리되었습니다'
    );
  END IF;
  
  -- 보상 조회
  SELECT * INTO v_reward
  FROM user_roulette_rewards
  WHERE id = v_usage_log.reward_id
    AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_NOT_FOUND',
      'message', '보상을 찾을 수 없습니다'
    );
  END IF;
  
  -- 보상 상태를 'active'로 복원 (거절했으므로 사용하지 않음)
  UPDATE user_roulette_rewards
  SET 
    status = 'active',
    usage_rejected_at = NOW(),
    usage_rejection_reason = p_reason,
    usage_requested_at = NULL,  -- 요청 초기화
    updated_at = NOW()
  WHERE id = v_reward.id;
  
  -- 사용 이력 업데이트 (거절 처리)
  UPDATE roulette_reward_usage_logs
  SET 
    status = 'rejected',
    rejection_reason = p_reason
  WHERE id = p_usage_log_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', '사용 요청을 거절했습니다'
  );
END;
$$;

COMMENT ON FUNCTION reject_roulette_reward_usage IS '파트너가 사용형 아이템/쿠폰 사용 요청 거절';

GRANT EXECUTE ON FUNCTION reject_roulette_reward_usage(UUID, UUID, TEXT) TO authenticated;

-- =====================================================================
-- 10. RPC 함수: 사용형 아이템 사용 (기존 함수 - 호환성 유지용, 사용 안 함)
-- =====================================================================
-- 참고: 이 함수는 더 이상 사용하지 않음. request_roulette_reward_usage 사용 권장

CREATE OR REPLACE FUNCTION use_roulette_reward(
  p_reward_id UUID,
  p_usage_type TEXT,
  p_amount NUMERIC(10, 2),
  p_room_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward user_roulette_rewards%ROWTYPE;
  v_remaining NUMERIC(10, 2);
BEGIN
  -- 보상 조회 및 검증
  SELECT * INTO v_reward
  FROM user_roulette_rewards
  WHERE id = p_reward_id
    AND user_id = auth.uid()
    AND reward_type = 'usable'
    AND status = 'active'
    AND remaining_amount >= p_amount;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_NOT_FOUND_OR_INSUFFICIENT',
      'message', '보상을 찾을 수 없거나 잔여 수량이 부족합니다'
    );
  END IF;
  
  -- 만료 확인
  IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < NOW() THEN
    UPDATE user_roulette_rewards
    SET status = 'expired'
    WHERE id = p_reward_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_EXPIRED',
      'message', '만료된 보상입니다'
    );
  END IF;
  
  -- 잔여 수량 계산
  v_remaining := v_reward.remaining_amount - p_amount;
  
  -- 보상 업데이트
  UPDATE user_roulette_rewards
  SET 
    remaining_amount = v_remaining,
    status = CASE 
      WHEN v_remaining <= 0 THEN 'used'
      ELSE 'active'
    END,
    used_at = CASE 
      WHEN v_remaining <= 0 THEN NOW()
      ELSE used_at
    END,
    updated_at = NOW()
  WHERE id = p_reward_id;
  
  -- 사용 이력 기록
  INSERT INTO roulette_reward_usage_logs (
    reward_id,
    user_id,
    partner_id,
    usage_type,
    amount_used,
    remaining_amount,
    room_id,
    context
  ) VALUES (
    p_reward_id,
    v_reward.user_id,
    v_reward.partner_id,
    p_usage_type,
    p_amount,
    v_remaining,
    p_room_id,
    p_context
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_amount', v_remaining,
    'status', CASE WHEN v_remaining <= 0 THEN 'used' ELSE 'active' END,
    'message', '보상을 사용했습니다'
  );
END;
$$;

COMMENT ON FUNCTION use_roulette_reward IS '룰렛 사용형 아이템 사용 처리';

GRANT EXECUTE ON FUNCTION use_roulette_reward(UUID, TEXT, NUMERIC, UUID, JSONB) TO authenticated;

-- =====================================================================
-- 11. 만료된 보상 자동 업데이트 함수 (스케줄러용)
-- =====================================================================

CREATE OR REPLACE FUNCTION update_expired_roulette_rewards()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- 만료된 보상 상태 업데이트
  UPDATE user_roulette_rewards
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION update_expired_roulette_rewards IS '만료된 룰렛 보상 상태 자동 업데이트 (스케줄러용)';

-- =====================================================================
-- 12. 검증 쿼리 (실행 후 확인용)
-- =====================================================================

-- 테이블 확인
-- SELECT * FROM user_roulette_rewards LIMIT 5;
-- SELECT * FROM roulette_reward_usage_logs LIMIT 5;

-- 뷰 확인
-- SELECT * FROM user_roulette_rewards_inventory LIMIT 5;

-- 인덱스 확인
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('user_roulette_rewards', 'roulette_reward_usage_logs');

-- 함수 확인
-- SELECT proname, pronargs 
-- FROM pg_proc 
-- WHERE proname IN (
--   'create_roulette_reward', 
--   'create_roulette_digital_reward',
--   'request_roulette_reward_usage',
--   'approve_roulette_reward_usage',
--   'reject_roulette_reward_usage',
--   'use_roulette_reward',  -- 호환성 유지용
--   'update_expired_roulette_rewards'
-- );

