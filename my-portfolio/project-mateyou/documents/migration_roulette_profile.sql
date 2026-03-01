-- ============================================================
-- Phase 5-C: 비방송용 룰렛 (프로필 룰렛) 마이그레이션
-- 작성일: 2026-02-02
-- 목적: 방송 없이도 파트너 페이지에서 룰렛을 돌릴 수 있게 함
-- ============================================================

-- ============================================================
-- 1. partner_roulette_wheels 테이블 확장
-- ============================================================

-- 휠 용도 타입 (방송용/프로필용)
ALTER TABLE partner_roulette_wheels ADD COLUMN IF NOT EXISTS 
  wheel_type TEXT DEFAULT 'stream' CHECK (wheel_type IN ('stream', 'profile', 'both'));

-- 대표 룰렛 여부 (프로필에 표시)
ALTER TABLE partner_roulette_wheels ADD COLUMN IF NOT EXISTS 
  is_featured BOOLEAN DEFAULT false;

-- 컬럼 코멘트
COMMENT ON COLUMN partner_roulette_wheels.wheel_type IS '휠 용도: stream(방송용), profile(프로필용), both(둘 다)';
COMMENT ON COLUMN partner_roulette_wheels.is_featured IS '대표 룰렛 여부 (파트너 페이지에 표시)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_wheels_type 
  ON partner_roulette_wheels(partner_id, wheel_type, is_active);
CREATE INDEX IF NOT EXISTS idx_partner_roulette_wheels_featured 
  ON partner_roulette_wheels(partner_id, is_featured) WHERE is_featured = true;

-- 기존 데이터 업데이트: wheel_type이 NULL인 경우 'stream'으로 설정
UPDATE partner_roulette_wheels 
SET wheel_type = 'stream' 
WHERE wheel_type IS NULL;

-- ============================================================
-- 2. donation_roulette_results 테이블 확장
-- ============================================================

-- 룰렛 출처 (방송/프로필)
ALTER TABLE donation_roulette_results ADD COLUMN IF NOT EXISTS 
  source_type TEXT DEFAULT 'stream' CHECK (source_type IN ('stream', 'profile'));

COMMENT ON COLUMN donation_roulette_results.source_type IS '룰렛 출처: stream(방송에서), profile(프로필에서)';

-- ============================================================
-- 3. 프로필 룰렛 후원 테이블 (방송 없이 후원)
-- ============================================================

CREATE TABLE IF NOT EXISTS profile_roulette_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  wheel_id UUID NOT NULL REFERENCES partner_roulette_wheels(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  roulette_result_id UUID REFERENCES donation_roulette_results(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_profile_roulette_donations_donor 
  ON profile_roulette_donations(donor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_roulette_donations_partner 
  ON profile_roulette_donations(partner_id, created_at DESC);

-- RLS
ALTER TABLE profile_roulette_donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_roulette_donations_select" ON profile_roulette_donations;
DROP POLICY IF EXISTS "profile_roulette_donations_insert" ON profile_roulette_donations;

-- 본인 후원 내역만 조회 가능 (파트너도 자신의 룰렛 후원 조회 가능)
CREATE POLICY "profile_roulette_donations_select" ON profile_roulette_donations
FOR SELECT USING (
  auth.uid() = donor_id OR 
  auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- 인증된 유저만 INSERT 가능
CREATE POLICY "profile_roulette_donations_insert" ON profile_roulette_donations
FOR INSERT WITH CHECK (auth.uid() = donor_id);

COMMENT ON TABLE profile_roulette_donations IS '프로필 룰렛 후원 기록 (방송 없이)';

-- ============================================================
-- 4. 프로필 룰렛 실행 함수
-- ============================================================

DROP FUNCTION IF EXISTS execute_profile_roulette(UUID, UUID, UUID, INTEGER);

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
    room_id,  -- 프로필 룰렛은 room_id가 없음
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
    NULL,  -- room_id 없음
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
      reward_type, reward_name, reward_value, digital_file_url, status
    ) VALUES (
      p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
      'digital', v_winning_item.name, v_winning_item.reward_value,
      v_winning_item.reward_value, 'active'
    )
    RETURNING id INTO v_reward_id;
    
    -- 컬렉션 진행률 업데이트
    PERFORM update_collection_progress(p_donor_id, v_winning_item_id, v_result_id);
    
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    
  ELSE
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'result_id', v_result_id,
    'donation_id', v_donation_id,
    'wheel_name', v_wheel.name,
    'wheel_price', v_wheel.price,
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

COMMENT ON FUNCTION execute_profile_roulette IS '프로필 룰렛 실행 (방송 없이)';

-- ============================================================
-- 5. 파트너의 프로필 룰렛 조회 함수
-- ============================================================

DROP FUNCTION IF EXISTS get_partner_profile_wheels(UUID);

CREATE OR REPLACE FUNCTION get_partner_profile_wheels(
  p_partner_id UUID
) RETURNS TABLE (
  wheel_id UUID,
  wheel_name TEXT,
  wheel_description TEXT,
  wheel_price INTEGER,
  wheel_type TEXT,
  is_featured BOOLEAN,
  is_active BOOLEAN,
  item_count BIGINT,
  items JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id AS wheel_id,
    w.name AS wheel_name,
    w.description AS wheel_description,
    w.price AS wheel_price,
    w.wheel_type,
    w.is_featured,
    w.is_active,
    COUNT(i.id) AS item_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'color', i.color,
          'reward_type', i.reward_type,
          'is_blank', COALESCE(i.is_blank, false)
        ) ORDER BY i.sort_order
      ) FILTER (WHERE i.id IS NOT NULL),
      '[]'::jsonb
    ) AS items
  FROM partner_roulette_wheels w
  LEFT JOIN partner_roulette_items i ON w.id = i.wheel_id AND i.is_active = true
  WHERE w.partner_id = p_partner_id
    AND w.wheel_type IN ('profile', 'both')
    AND w.is_active = true
  GROUP BY w.id
  ORDER BY w.is_featured DESC, w.sort_order;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_partner_profile_wheels IS '파트너의 프로필 룰렛 목록 조회';

-- ============================================================
-- 6. 권한 설정
-- ============================================================

GRANT EXECUTE ON FUNCTION execute_profile_roulette(UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_profile_wheels(UUID) TO authenticated;

-- ============================================================
-- 7. 롤백 스크립트 (필요 시)
-- ============================================================

/*
-- 롤백용
ALTER TABLE partner_roulette_wheels DROP COLUMN IF EXISTS wheel_type;
ALTER TABLE partner_roulette_wheels DROP COLUMN IF EXISTS is_featured;
ALTER TABLE donation_roulette_results DROP COLUMN IF EXISTS source_type;

DROP TABLE IF EXISTS profile_roulette_donations;

DROP FUNCTION IF EXISTS execute_profile_roulette(UUID, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS get_partner_profile_wheels(UUID);
*/
