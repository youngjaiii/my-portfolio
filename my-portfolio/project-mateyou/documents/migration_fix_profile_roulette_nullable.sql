-- ============================================================
-- 프로필 룰렛 nullable 컬럼 수정 + 누락 컬럼 추가
-- 작성일: 2026-02-02
-- 목적:
--   1. 프로필 룰렛은 stream_donations가 없으므로 donation_id, room_id를 nullable로 변경
--   2. partner_roulette_items에 digital_file_name 컬럼 추가
-- ============================================================

-- ============================================================
-- 0. partner_roulette_items 테이블에 디지털 파일 관련 컬럼 추가
-- ============================================================

ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_file_url TEXT;

ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_file_path TEXT;

ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_file_name TEXT;

ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_file_size BIGINT;

ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_file_type TEXT;

COMMENT ON COLUMN partner_roulette_items.digital_file_url IS '디지털 보상 파일 URL (공개 URL)';

COMMENT ON COLUMN partner_roulette_items.digital_file_path IS '디지털 보상 파일 Storage 경로';

COMMENT ON COLUMN partner_roulette_items.digital_file_name IS '디지털 보상 파일명 (다운로드 시 표시용)';

COMMENT ON COLUMN partner_roulette_items.digital_file_size IS '디지털 보상 파일 크기 (bytes)';

COMMENT ON COLUMN partner_roulette_items.digital_file_type IS '디지털 보상 파일 MIME 타입';

-- ============================================================
-- 0-2. user_roulette_rewards 테이블에 필요한 컬럼 추가
-- ============================================================

ALTER TABLE user_roulette_rewards
ADD COLUMN IF NOT EXISTS roulette_item_id UUID REFERENCES partner_roulette_items (id) ON DELETE SET NULL;

ALTER TABLE user_roulette_rewards
ADD COLUMN IF NOT EXISTS digital_file_url TEXT;

ALTER TABLE user_roulette_rewards
ADD COLUMN IF NOT EXISTS digital_file_name TEXT;

COMMENT ON COLUMN user_roulette_rewards.roulette_item_id IS '당첨된 룰렛 아이템 ID (디지털 보상 추적용)';

COMMENT ON COLUMN user_roulette_rewards.digital_file_url IS '디지털 보상 파일 URL (Supabase Storage)';

COMMENT ON COLUMN user_roulette_rewards.digital_file_name IS '디지털 보상 파일명 (다운로드 시 표시용)';

-- 1. donation_roulette_results 테이블의 NOT NULL 제약조건 제거
-- donation_id: 프로필 룰렛은 stream_donations가 아닌 profile_roulette_donations 사용
-- room_id: 프로필 룰렛은 방송이 없으므로 room_id가 없음

ALTER TABLE donation_roulette_results ALTER COLUMN donation_id
DROP NOT NULL;

ALTER TABLE donation_roulette_results ALTER COLUMN room_id
DROP NOT NULL;

-- 2. 컬럼 코멘트 업데이트
COMMENT ON COLUMN donation_roulette_results.donation_id IS '방송 후원 ID (프로필 룰렛은 NULL)';

COMMENT ON COLUMN donation_roulette_results.room_id IS '방송 룸 ID (프로필 룰렛은 NULL)';

-- 3. unique index 수정 (donation_id가 NULL일 수 있으므로)
-- 기존 unique index 삭제
DROP INDEX IF EXISTS idx_donation_roulette_results_donation_unique;

-- donation_id가 있는 경우에만 unique 적용 (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_donation_roulette_results_donation_unique ON donation_roulette_results (donation_id)
WHERE
    donation_id IS NOT NULL;

-- 4. source_type 컬럼이 없으면 추가 (migration_roulette_profile.sql에서 추가했어야 함)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE donation_roulette_results ADD COLUMN 
            source_type TEXT DEFAULT 'stream' CHECK (source_type IN ('stream', 'profile'));

COMMENT ON COLUMN donation_roulette_results.source_type IS '룰렛 출처: stream(방송에서), profile(프로필에서)';

END IF;

END;

$$;

-- 5. 검증: 컬럼 nullable 확인
SELECT
    column_name,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE
    table_name = 'donation_roulette_results'
    AND column_name IN (
        'donation_id',
        'room_id',
        'source_type'
    );

-- ============================================================
-- 6. execute_profile_roulette 함수 수정 (item_id 반환 추가)
-- ============================================================

CREATE OR REPLACE FUNCTION execute_profile_roulette(
  p_donor_id UUID,
  p_partner_id UUID,
  p_wheel_id UUID,
  p_donation_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_wheel RECORD;
  v_spin_status JSONB;
  v_roulette_result JSONB;
  v_winning_item_id UUID;
  v_winning_item RECORD;
  v_all_items JSONB;
  v_item_count INTEGER;
  v_item_index INTEGER;
  v_final_rotation NUMERIC(10, 2);
  v_result_id UUID;
  v_donation_id UUID;
  v_reward_id UUID;
  v_donor_points INTEGER;
BEGIN
  -- 1. 휠 유효성 검사
  SELECT * INTO v_wheel
  FROM partner_roulette_wheels
  WHERE id = p_wheel_id 
    AND partner_id = p_partner_id 
    AND wheel_type IN ('profile', 'both')
    AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PROFILE_WHEEL');
  END IF;
  
  -- 2. 금액 확인
  IF p_donation_amount < v_wheel.price THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'AMOUNT_TOO_LOW',
      'required_amount', v_wheel.price
    );
  END IF;
  
  -- 3. 유저 포인트 확인
  SELECT total_points INTO v_donor_points
  FROM members
  WHERE id = p_donor_id;
  
  IF v_donor_points < v_wheel.price THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'INSUFFICIENT_POINTS',
      'current_points', v_donor_points,
      'required_points', v_wheel.price
    );
  END IF;
  
  -- 4. 휠 스핀 가능 여부 확인
  SELECT can_spin_roulette_wheel(p_donor_id, p_wheel_id) INTO v_spin_status;
  
  IF NOT (v_spin_status->>'can_spin')::boolean THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', v_spin_status->>'reason',
      'available_items', (v_spin_status->>'available_items')::integer
    );
  END IF;
  
  -- 5. 포인트 차감
  UPDATE members 
  SET total_points = total_points - v_wheel.price 
  WHERE id = p_donor_id;
  
  -- 포인트 로그 기록
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (
    p_donor_id, 
    'spend', 
    v_wheel.price, 
    '프로필 룰렛: ' || v_wheel.name, 
    'profile_roulette_' || gen_random_uuid()::text
  );
  
  -- 파트너에게 포인트 지급 (수수료 제외 - 90%)
  UPDATE partners 
  SET total_points = total_points + (v_wheel.price * 0.9)::integer 
  WHERE id = p_partner_id;
  
  -- 6. 프로필 후원 기록 생성
  INSERT INTO profile_roulette_donations (
    donor_id, partner_id, wheel_id, amount, status
  ) VALUES (
    p_donor_id, p_partner_id, p_wheel_id, v_wheel.price, 'pending'
  )
  RETURNING id INTO v_donation_id;
  
  -- 7. 아이템 조회
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'color', color,
        'weight', weight,
        'reward_type', reward_type,
        'reward_value', reward_value,
        'is_blank', COALESCE(is_blank, false)
      ) ORDER BY sort_order
    ),
    COUNT(*)
  INTO v_all_items, v_item_count
  FROM partner_roulette_items
  WHERE wheel_id = p_wheel_id AND is_active = true;
  
  IF v_item_count = 0 THEN
    -- 롤백
    UPDATE members SET total_points = total_points + v_wheel.price WHERE id = p_donor_id;
    UPDATE partners SET total_points = total_points - (v_wheel.price * 0.9)::integer WHERE id = p_partner_id;
    UPDATE profile_roulette_donations SET status = 'failed' WHERE id = v_donation_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'NO_ROULETTE_ITEMS');
  END IF;
  
  -- 8. 당첨 아이템 결정 (수량 제한 고려)
  v_roulette_result := calculate_roulette_result_v2(p_donor_id, p_wheel_id);
  
  IF NOT COALESCE((v_roulette_result->>'success')::boolean, false) THEN
    -- 롤백
    UPDATE members SET total_points = total_points + v_wheel.price WHERE id = p_donor_id;
    UPDATE partners SET total_points = total_points - (v_wheel.price * 0.9)::integer WHERE id = p_partner_id;
    UPDATE profile_roulette_donations SET status = 'failed' WHERE id = v_donation_id;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', COALESCE(v_roulette_result->>'error', 'ROULETTE_CALCULATION_FAILED')
    );
  END IF;
  
  v_winning_item_id := (v_roulette_result->>'item_id')::uuid;
  
  SELECT * INTO v_winning_item
  FROM partner_roulette_items
  WHERE id = v_winning_item_id;
  
  -- 9. 아이템 인덱스 계산
  SELECT row_number INTO v_item_index
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS row_number
    FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true
  ) sub
  WHERE id = v_winning_item_id;
  
  -- 10. 최종 회전 각도 계산 (3~5회전)
  v_final_rotation := (3 + random() * 2) * 360 + (270 - (COALESCE(v_item_index, 0) * (360.0 / v_item_count) + (360.0 / v_item_count / 2)));
  
  -- 11. 결과 저장
  INSERT INTO donation_roulette_results (
    room_id,
    donor_id,
    partner_id,
    wheel_id,
    wheel_name,
    wheel_price,
    roulette_item_id,
    item_name,
    item_color,
    item_reward_type,
    item_reward_value,
    all_items,
    final_rotation,
    source_type
  ) VALUES (
    NULL,  -- room_id 없음 (프로필 룰렛)
    p_donor_id,
    p_partner_id,
    p_wheel_id,
    v_wheel.name,
    v_wheel.price,
    v_winning_item_id,
    v_winning_item.name,
    v_winning_item.color,
    v_winning_item.reward_type,
    v_winning_item.reward_value,
    v_all_items,
    v_final_rotation,
    'profile'
  )
  RETURNING id INTO v_result_id;
  
  -- 12. 프로필 후원 업데이트
  UPDATE profile_roulette_donations 
  SET 
    roulette_result_id = v_result_id,
    status = 'completed',
    completed_at = now()
  WHERE id = v_donation_id;
  
  -- 13. 당첨 횟수 증가 (수량 제한용)
  PERFORM increment_roulette_item_count(p_donor_id, v_winning_item_id);
  
  -- 14. 보상 처리
  IF v_winning_item.reward_type = 'usable' THEN
    INSERT INTO user_roulette_rewards (
      user_id, partner_id, roulette_result_id,
      reward_type, reward_name, reward_value,
      initial_amount, remaining_amount, expires_at, status
    ) VALUES (
      p_donor_id, p_partner_id, v_result_id,
      'usable', v_winning_item.name, v_winning_item.reward_value,
      1, 1, NOW() + INTERVAL '30 days', 'active'
    )
    RETURNING id INTO v_reward_id;
    
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    
  ELSIF v_winning_item.reward_type = 'digital' THEN
    INSERT INTO user_roulette_rewards (
      user_id, partner_id, roulette_result_id, roulette_item_id,
      reward_type, reward_name, reward_value, 
      digital_file_url, digital_file_name, digital_file_path,
      digital_file_size, digital_file_type,
      initial_amount, remaining_amount, status
    ) VALUES (
      p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
      'digital', v_winning_item.name, v_winning_item.reward_value,
      v_winning_item.digital_file_url,   -- Supabase Storage URL
      v_winning_item.digital_file_name,  -- 파일명
      v_winning_item.digital_file_path,  -- Storage 경로 (signed URL 생성용)
      v_winning_item.digital_file_size,  -- 파일 크기
      v_winning_item.digital_file_type,  -- MIME 타입
      1, 1, 'active'
    )
    RETURNING id INTO v_reward_id;
    
    -- 컬렉션 진행률 업데이트
    PERFORM update_collection_progress(p_donor_id, v_winning_item_id, v_result_id);
    
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    
  ELSE
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
  END IF;
  
  -- item_id 추가하여 반환 (프론트에서 당첨 아이템 식별용)
  RETURN jsonb_build_object(
    'success', true,
    'result_id', v_result_id,
    'donation_id', v_donation_id,
    'wheel_name', v_wheel.name,
    'wheel_price', v_wheel.price,
    'item_id', v_winning_item_id,  -- 당첨 아이템 ID 추가
    'item_name', v_winning_item.name,
    'item_color', v_winning_item.color,
    'reward_type', v_winning_item.reward_type,
    'reward_value', v_winning_item.reward_value,
    'is_blank', COALESCE(v_winning_item.is_blank, false),
    'final_rotation', v_final_rotation,
    'all_items', v_all_items
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- 에러 시 롤백 시도
    IF v_donation_id IS NOT NULL THEN
      UPDATE profile_roulette_donations SET status = 'failed' WHERE id = v_donation_id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'EXECUTION_FAILED', 
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION execute_profile_roulette IS '프로필 룰렛 실행 (방송 없이) - item_id 반환 포함';

GRANT EXECUTE ON FUNCTION execute_profile_roulette (UUID, UUID, UUID, INTEGER) TO authenticated;