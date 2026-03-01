-- ============================================================
-- 룰렛 보상 사용 알림 시스템 마이그레이션
-- 작성일: 2026-02-01
-- 목적: 사용 요청/승인/거절 시 알림 발송
-- ============================================================

-- 1. request_roulette_reward_usage 함수 업데이트 (파트너에게 알림)
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
  v_user_name TEXT;
  v_partner_member_id UUID;
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
  
  -- 사용자 이름 조회
  SELECT name INTO v_user_name
  FROM members
  WHERE id = auth.uid();
  
  -- 파트너 member_id 조회
  SELECT member_id INTO v_partner_member_id
  FROM partners
  WHERE id = v_reward.partner_id;
  
  -- 파트너에게 알림 생성
  IF v_partner_member_id IS NOT NULL THEN
    INSERT INTO push_notifications_queue (
      user_id,
      target_member_id,
      title,
      body,
      notification_type,
      data,
      status,
      scheduled_at
    ) VALUES (
      auth.uid(),
      v_partner_member_id,
      '🎫 룰렛 보상 사용 요청',
      COALESCE(v_user_name, '사용자') || '님이 "' || v_reward.reward_name || '" 사용을 요청했습니다.',
      'roulette_usage_requested',
      jsonb_build_object(
        'usage_log_id', v_usage_log_id,
        'reward_id', p_reward_id,
        'reward_name', v_reward.reward_name,
        'user_id', auth.uid(),
        'user_name', v_user_name,
        'message', p_context->>'message',
        'url', '/dashboard/partner/roulette-requests'
      ),
      'pending',
      NOW()
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'usage_log_id', v_usage_log_id,
    'status', 'pending',
    'message', '사용 요청이 파트너에게 전달되었습니다'
  );
END;
$$;

COMMENT ON FUNCTION request_roulette_reward_usage IS '사용형 아이템 사용 요청 (파트너 승인 대기) + 알림';
GRANT EXECUTE ON FUNCTION request_roulette_reward_usage(UUID, TEXT, NUMERIC, UUID, JSONB) TO authenticated;

-- ============================================================
-- 2. approve_roulette_reward_usage 함수 업데이트 (유저에게 알림)
-- ============================================================

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
  v_partner_name TEXT;
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
  
  -- 파트너 이름 조회
  SELECT name INTO v_partner_name
  FROM members
  WHERE id = v_partner_member_id;
  
  -- 유저에게 알림 생성
  INSERT INTO push_notifications_queue (
    user_id,
    target_member_id,
    title,
    body,
    notification_type,
    data,
    status,
    scheduled_at
  ) VALUES (
    v_partner_member_id,
    v_usage_log.user_id,
    '✅ 룰렛 보상 사용 승인',
    COALESCE(v_partner_name, '파트너') || '님이 "' || v_reward.reward_name || '" 사용을 승인했습니다!',
    'roulette_usage_approved',
    jsonb_build_object(
      'usage_log_id', p_usage_log_id,
      'reward_id', v_reward.id,
      'reward_name', v_reward.reward_name,
      'partner_id', p_partner_id,
      'partner_name', v_partner_name,
      'url', '/mypage/inventory/roulette'
    ),
    'pending',
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_amount', v_usage_log.remaining_amount,
    'status', CASE WHEN v_usage_log.remaining_amount <= 0 THEN 'used' ELSE 'active' END,
    'message', '사용 요청을 승인했습니다'
  );
END;
$$;

COMMENT ON FUNCTION approve_roulette_reward_usage IS '파트너 승인 + 유저 알림';
GRANT EXECUTE ON FUNCTION approve_roulette_reward_usage(UUID, UUID) TO authenticated;

-- ============================================================
-- 3. reject_roulette_reward_usage 함수 업데이트 (유저에게 알림)
-- ============================================================

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
  v_partner_name TEXT;
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
  
  -- 보상 복구 (active 상태로)
  UPDATE user_roulette_rewards
  SET 
    status = 'active',
    usage_rejected_at = NOW(),
    usage_rejection_reason = p_reason,
    updated_at = NOW()
  WHERE id = v_reward.id;
  
  -- 사용 이력 업데이트 (거절 처리)
  UPDATE roulette_reward_usage_logs
  SET 
    status = 'rejected',
    rejection_reason = p_reason,
    rejected_at = NOW()
  WHERE id = p_usage_log_id;
  
  -- 파트너 이름 조회
  SELECT name INTO v_partner_name
  FROM members
  WHERE id = v_partner_member_id;
  
  -- 유저에게 알림 생성
  INSERT INTO push_notifications_queue (
    user_id,
    target_member_id,
    title,
    body,
    notification_type,
    data,
    status,
    scheduled_at
  ) VALUES (
    v_partner_member_id,
    v_usage_log.user_id,
    '❌ 룰렛 보상 사용 거절',
    COALESCE(v_partner_name, '파트너') || '님이 "' || v_reward.reward_name || '" 사용을 거절했습니다.' || 
    CASE WHEN p_reason IS NOT NULL THEN ' (사유: ' || p_reason || ')' ELSE '' END,
    'roulette_usage_rejected',
    jsonb_build_object(
      'usage_log_id', p_usage_log_id,
      'reward_id', v_reward.id,
      'reward_name', v_reward.reward_name,
      'partner_id', p_partner_id,
      'partner_name', v_partner_name,
      'reason', p_reason,
      'url', '/mypage/inventory/roulette'
    ),
    'pending',
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', '사용 요청을 거절했습니다'
  );
END;
$$;

COMMENT ON FUNCTION reject_roulette_reward_usage IS '파트너 거절 + 유저 알림';
GRANT EXECUTE ON FUNCTION reject_roulette_reward_usage(UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- 확인 쿼리
-- ============================================================
-- SELECT proname FROM pg_proc WHERE proname LIKE '%roulette_reward_usage%';
