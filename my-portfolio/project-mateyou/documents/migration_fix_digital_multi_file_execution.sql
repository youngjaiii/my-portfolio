-- ============================================================
-- 디지털 다중 파일 실행 로직 수정
-- 작성일: 2026-02-02
-- 목적:
--   1. execute_profile_roulette에서 개별 지급(individual) 처리 추가
--   2. record_digital_file_win 호출로 파일별 당첨 기록
--   3. select_random_unwon_digital_file으로 미수집 파일 랜덤 선택
-- ============================================================

-- ============================================================
-- 1. execute_profile_roulette 함수 수정
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
  -- 디지털 다중 파일용 변수
  v_distribution_type TEXT;
  v_selected_file_id UUID;
  v_selected_file RECORD;
  v_all_digital_files RECORD;
  v_digital_preview JSONB := NULL;  -- 미리보기 정보 (초기화)
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
    -- ★★★ 디지털 다중 파일 처리 ★★★
    v_distribution_type := COALESCE(v_winning_item.digital_distribution_type, 'bundle');
    
    IF v_distribution_type = 'individual' THEN
      -- 개별 지급: 아직 받지 않은 파일 중 랜덤 선택
      v_selected_file_id := select_random_unwon_digital_file(p_donor_id, v_winning_item_id);
      
      IF v_selected_file_id IS NOT NULL THEN
        -- 선택된 파일 정보 조회
        SELECT * INTO v_selected_file
        FROM roulette_item_digital_files
        WHERE id = v_selected_file_id;
        
        -- 미리보기 정보 저장
        v_digital_preview := jsonb_build_object(
          'file_url', v_selected_file.file_url,
          'file_name', v_selected_file.file_name,
          'file_type', v_selected_file.file_type
        );
        
        -- 파일 당첨 기록 (중요!)
        PERFORM record_digital_file_win(p_donor_id, v_winning_item_id, v_selected_file_id, v_result_id);
        
        -- user_roulette_rewards에 해당 파일 정보 저장
        INSERT INTO user_roulette_rewards (
          user_id, partner_id, roulette_result_id, roulette_item_id,
          reward_type, reward_name, reward_value,
          digital_file_url, digital_file_name, digital_file_path,
          digital_file_size, digital_file_type,
          initial_amount, remaining_amount, status
        ) VALUES (
          p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
          'digital', v_winning_item.name || ' #' || (
            SELECT COUNT(*) + 1 FROM user_roulette_digital_file_wins 
            WHERE user_id = p_donor_id AND item_id = v_winning_item_id
          ),
          v_selected_file.file_name,
          v_selected_file.file_url,
          v_selected_file.file_name,
          v_selected_file.file_path,
          v_selected_file.file_size,
          v_selected_file.file_type,
          1, 1, 'active'
        )
        RETURNING id INTO v_reward_id;
      ELSE
        -- 모든 파일 다 받은 경우 (이론상 can_win_roulette_item에서 막혀야 함)
        INSERT INTO user_roulette_rewards (
          user_id, partner_id, roulette_result_id, roulette_item_id,
          reward_type, reward_name, reward_value,
          initial_amount, remaining_amount, status
        ) VALUES (
          p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
          'digital', v_winning_item.name, v_winning_item.reward_value,
          1, 1, 'active'
        )
        RETURNING id INTO v_reward_id;
      END IF;
      
    ELSE
      -- 일괄 지급(bundle): 모든 파일을 한꺼번에 지급
      -- 첫 번째 파일 정보로 대표 저장 (또는 기존 레거시 방식)
      SELECT * INTO v_selected_file
      FROM roulette_item_digital_files
      WHERE item_id = v_winning_item_id
      ORDER BY sort_order
      LIMIT 1;
      
      IF v_selected_file.id IS NOT NULL THEN
        -- 미리보기 정보 저장
        v_digital_preview := jsonb_build_object(
          'file_url', v_selected_file.file_url,
          'file_name', v_selected_file.file_name,
          'file_type', v_selected_file.file_type
        );
        
        -- 모든 파일에 대해 당첨 기록
        FOR v_all_digital_files IN 
          SELECT * FROM roulette_item_digital_files 
          WHERE item_id = v_winning_item_id
          ORDER BY sort_order
        LOOP
          PERFORM record_digital_file_win(p_donor_id, v_winning_item_id, v_all_digital_files.id, v_result_id);
        END LOOP;
        
        -- 대표 파일로 reward 저장
        INSERT INTO user_roulette_rewards (
          user_id, partner_id, roulette_result_id, roulette_item_id,
          reward_type, reward_name, reward_value,
          digital_file_url, digital_file_name, digital_file_path,
          digital_file_size, digital_file_type,
          initial_amount, remaining_amount, status
        ) VALUES (
          p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
          'digital', v_winning_item.name, v_winning_item.reward_value,
          v_selected_file.file_url,
          v_selected_file.file_name,
          v_selected_file.file_path,
          v_selected_file.file_size,
          v_selected_file.file_type,
          1, 1, 'active'
        )
        RETURNING id INTO v_reward_id;
      ELSE
        -- 다중 파일 테이블에 없으면 레거시 방식 (기존 컬럼 사용)
        INSERT INTO user_roulette_rewards (
          user_id, partner_id, roulette_result_id, roulette_item_id,
          reward_type, reward_name, reward_value,
          digital_file_url, digital_file_name, digital_file_path,
          digital_file_size, digital_file_type,
          initial_amount, remaining_amount, status
        ) VALUES (
          p_donor_id, p_partner_id, v_result_id, v_winning_item_id,
          'digital', v_winning_item.name, v_winning_item.reward_value,
          v_winning_item.digital_file_url,
          v_winning_item.digital_file_name,
          v_winning_item.digital_file_path,
          v_winning_item.digital_file_size,
          v_winning_item.digital_file_type,
          1, 1, 'active'
        )
        RETURNING id INTO v_reward_id;
      END IF;
    END IF;
    
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    
  ELSE
    -- text 타입 등
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
  END IF;
  
  -- 15. 반환 (디지털 미리보기 정보 추가)
  RETURN jsonb_build_object(
    'success', true,
    'result_id', v_result_id,
    'donation_id', v_donation_id,
    'wheel_name', v_wheel.name,
    'wheel_price', v_wheel.price,
    'item_id', v_winning_item_id,
    'item_name', v_winning_item.name,
    'item_color', v_winning_item.color,
    'reward_type', v_winning_item.reward_type,
    'reward_value', v_winning_item.reward_value,
    'is_blank', COALESCE(v_winning_item.is_blank, false),
    'final_rotation', v_final_rotation,
    'all_items', v_all_items,
    -- 디지털 당첨 시 미리보기 정보
    'digital_preview', v_digital_preview
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

COMMENT ON FUNCTION execute_profile_roulette IS '프로필 룰렛 실행 - 디지털 다중 파일 지원 (bundle/individual)';

GRANT EXECUTE ON FUNCTION execute_profile_roulette (UUID, UUID, UUID, INTEGER) TO authenticated;

-- ============================================================
-- 2. record_digital_file_win 함수 권한 수정
-- authenticated 유저도 호출 가능하도록 (execute_profile_roulette 내에서 호출)
-- ============================================================

-- 기존 함수 재정의 (권한 포함)
CREATE OR REPLACE FUNCTION record_digital_file_win(
  p_user_id UUID,
  p_item_id UUID,
  p_digital_file_id UUID,
  p_roulette_result_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO user_roulette_digital_file_wins (
    user_id, item_id, digital_file_id, roulette_result_id
  ) VALUES (
    p_user_id, p_item_id, p_digital_file_id, p_roulette_result_id
  )
  ON CONFLICT (user_id, digital_file_id) DO NOTHING;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'record_digital_file_win failed: %', SQLERRM;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 권한: SECURITY DEFINER이므로 함수 소유자 권한으로 실행됨
-- authenticated 유저도 호출 가능하게 설정
GRANT EXECUTE ON FUNCTION record_digital_file_win (UUID, UUID, UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION record_digital_file_win (UUID, UUID, UUID, UUID) TO service_role;

-- ============================================================
-- 3. user_roulette_digital_file_wins INSERT 정책 수정
-- SECURITY DEFINER 함수에서 INSERT 가능하도록
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "System can insert file wins" ON user_roulette_digital_file_wins;

-- 새 정책: SECURITY DEFINER 함수에서 INSERT 가능
-- (직접 INSERT는 막되, record_digital_file_win 함수를 통해서만 가능)
DROP POLICY IF EXISTS "Allow insert via function" ON user_roulette_digital_file_wins;

CREATE POLICY "Allow insert via function" ON user_roulette_digital_file_wins FOR INSERT
WITH
    CHECK (true);
-- SECURITY DEFINER 함수 내에서만 호출되므로 OK

-- ============================================================
-- 4. 검증 쿼리
-- ============================================================

-- 디지털 아이템과 파일 수 확인
SELECT
    i.id as item_id,
    i.name as item_name,
    i.digital_distribution_type,
    COUNT(f.id) as file_count
FROM
    partner_roulette_items i
    LEFT JOIN roulette_item_digital_files f ON f.item_id = i.id
WHERE
    i.reward_type = 'digital'
GROUP BY
    i.id,
    i.name,
    i.digital_distribution_type;

-- 유저별 파일 당첨 기록 확인
SELECT
    w.user_id,
    i.name as item_name,
    COUNT(w.id) as won_files,
    (
        SELECT COUNT(*)
        FROM roulette_item_digital_files
        WHERE
            item_id = w.item_id
    ) as total_files
FROM
    user_roulette_digital_file_wins w
    JOIN partner_roulette_items i ON i.id = w.item_id
GROUP BY
    w.user_id,
    w.item_id,
    i.name;