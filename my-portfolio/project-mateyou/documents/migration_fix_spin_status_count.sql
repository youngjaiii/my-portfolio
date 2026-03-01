-- ============================================================
-- 룰렛 스핀 상태 수량 계산 수정 (v2)
-- 작성일: 2026-02-02
-- 목적: available_items가 "아이템 종류 수"가 아닌 "실제 남은 수량 합계"를 반환
-- 포함: 비디지털 + 디지털(bundle/individual) 모든 타입 처리
-- ============================================================

-- 기존 함수 삭제
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'can_spin_roulette_wheel'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

-- 수정된 함수 생성
CREATE OR REPLACE FUNCTION can_spin_roulette_wheel(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_stock INTEGER := 0;      -- 전체 수량 (제한이 있는 것들의 합)
  v_available_stock INTEGER := 0;  -- 남은 수량 (실제로 뽑을 수 있는 수량)
  v_has_unlimited BOOLEAN := false;
  v_item RECORD;
  v_item_remaining INTEGER;
  v_item_total INTEGER;
  v_user_count INTEGER;
  v_can_win BOOLEAN;
  v_total_files INTEGER;
  v_won_files INTEGER;
  v_distribution_type TEXT;
BEGIN
  -- 각 아이템을 순회하면서 남은 수량 계산
  FOR v_item IN 
    SELECT 
      id,
      stock_limit_type,
      stock_limit,
      stock_used,
      is_blank,
      reward_type,
      digital_distribution_type
    FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id 
      AND is_active = true
      AND NOT COALESCE(is_blank, false)  -- 꽝 제외
  LOOP
    -- 이 아이템을 당첨받을 수 있는지 확인
    v_can_win := can_win_roulette_item(p_user_id, v_item.id);
    v_item_remaining := 0;
    v_item_total := 0;
    
    -- ★★★ 디지털 타입 처리 ★★★
    IF v_item.reward_type = 'digital' THEN
      v_distribution_type := COALESCE(v_item.digital_distribution_type, 'bundle');
      
      IF v_distribution_type = 'bundle' THEN
        -- 번들: 유저당 1회만 당첨 가능
        v_item_total := 1;
        
        SELECT COALESCE(win_count, 0) INTO v_user_count
        FROM user_roulette_item_counts
        WHERE user_id = p_user_id AND item_id = v_item.id;
        
        IF COALESCE(v_user_count, 0) < 1 THEN
          v_item_remaining := 1;
        ELSE
          v_item_remaining := 0;
        END IF;
        
      ELSE
        -- individual: 파일 수만큼 당첨 가능
        SELECT COUNT(*) INTO v_total_files
        FROM roulette_item_digital_files
        WHERE item_id = v_item.id;
        
        SELECT COUNT(*) INTO v_won_files
        FROM user_roulette_digital_file_wins
        WHERE user_id = p_user_id AND item_id = v_item.id;
        
        v_item_total := COALESCE(v_total_files, 0);
        v_item_remaining := GREATEST(0, v_item_total - COALESCE(v_won_files, 0));
      END IF;
      
      -- 디지털도 전역 수량 제한이 있을 수 있음
      IF v_item.stock_limit_type = 'global' AND v_item.stock_limit IS NOT NULL THEN
        v_item_remaining := LEAST(
          v_item_remaining, 
          GREATEST(0, v_item.stock_limit - COALESCE(v_item.stock_used, 0))
        );
      END IF;
      
      v_total_stock := v_total_stock + v_item_total;
      IF v_can_win THEN
        v_available_stock := v_available_stock + v_item_remaining;
      END IF;
      
    -- ★★★ 비디지털 타입 처리 ★★★
    ELSIF v_item.stock_limit_type IS NULL THEN
      -- 무제한 아이템
      v_has_unlimited := true;
      -- 무제한은 수량 계산에서 제외 (별도 표시)
      
    ELSIF v_item.stock_limit_type = 'global' THEN
      -- 전체 수량 제한
      v_item_total := COALESCE(v_item.stock_limit, 0);
      v_item_remaining := GREATEST(0, v_item_total - COALESCE(v_item.stock_used, 0));
      v_total_stock := v_total_stock + v_item_total;
      
      IF v_can_win THEN
        v_available_stock := v_available_stock + v_item_remaining;
      END IF;
      
    ELSIF v_item.stock_limit_type = 'per_user' THEN
      -- 유저별 수량 제한
      v_item_total := COALESCE(v_item.stock_limit, 0);
      
      SELECT COALESCE(win_count, 0) INTO v_user_count
      FROM user_roulette_item_counts
      WHERE user_id = p_user_id AND item_id = v_item.id;
      
      v_item_remaining := GREATEST(0, v_item_total - COALESCE(v_user_count, 0));
      v_total_stock := v_total_stock + v_item_total;
      
      IF v_can_win THEN
        v_available_stock := v_available_stock + v_item_remaining;
      END IF;
    END IF;
  END LOOP;
  
  v_result := jsonb_build_object(
    'can_spin', v_available_stock > 0 OR v_has_unlimited,
    'available_items', v_available_stock,  -- 실제 남은 수량 합계
    'total_items', v_total_stock,          -- 전체 수량 합계
    'has_unlimited', v_has_unlimited,
    'reason', CASE 
      WHEN v_available_stock = 0 AND NOT v_has_unlimited THEN 'ALL_EXHAUSTED'
      ELSE NULL
    END
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_spin_roulette_wheel IS '특정 유저가 특정 휠을 돌릴 수 있는지 확인 - 디지털/비디지털 모든 타입의 실제 남은 수량 합계 반환';

-- 권한 부여
GRANT EXECUTE ON FUNCTION can_spin_roulette_wheel (UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION can_spin_roulette_wheel (UUID, UUID) TO anon;

-- ============================================================
-- 유저별 휠 아이템 상세 상태 조회 함수
-- 각 아이템별로 유저 기준 남은 수량, 전체 수량, 품절 여부 반환
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'get_user_wheel_items_status'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_user_wheel_items_status(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_items JSONB := '[]'::JSONB;
  v_item RECORD;
  v_item_data JSONB;
  v_remaining INTEGER;
  v_total INTEGER;
  v_user_count INTEGER;
  v_total_files INTEGER;
  v_won_files INTEGER;
  v_distribution_type TEXT;
  v_can_win BOOLEAN;
BEGIN
  FOR v_item IN 
    SELECT 
      id,
      name,
      color,
      stock_limit_type,
      stock_limit,
      stock_used,
      is_blank,
      reward_type,
      digital_distribution_type
    FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id 
      AND is_active = true
    ORDER BY sort_order, created_at
  LOOP
    v_remaining := 0;
    v_total := 0;
    v_can_win := can_win_roulette_item(p_user_id, v_item.id);
    
    -- 꽝은 수량 표시 안함
    IF COALESCE(v_item.is_blank, false) THEN
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', true,
        'remaining', NULL,
        'total', NULL,
        'is_exhausted', false,
        'can_win', true,
        'type', 'blank'
      );
      
    -- ★ 디지털 타입 ★
    ELSIF v_item.reward_type = 'digital' THEN
      v_distribution_type := COALESCE(v_item.digital_distribution_type, 'bundle');
      
      IF v_distribution_type = 'bundle' THEN
        -- 번들: 유저당 1회
        v_total := 1;
        SELECT COALESCE(win_count, 0) INTO v_user_count
        FROM user_roulette_item_counts
        WHERE user_id = p_user_id AND item_id = v_item.id;
        
        v_remaining := CASE WHEN COALESCE(v_user_count, 0) < 1 THEN 1 ELSE 0 END;
      ELSE
        -- individual: 파일 수만큼
        SELECT COUNT(*) INTO v_total_files
        FROM roulette_item_digital_files
        WHERE item_id = v_item.id;
        
        SELECT COUNT(*) INTO v_won_files
        FROM user_roulette_digital_file_wins
        WHERE user_id = p_user_id AND item_id = v_item.id;
        
        v_total := COALESCE(v_total_files, 0);
        v_remaining := GREATEST(0, v_total - COALESCE(v_won_files, 0));
      END IF;
      
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', false,
        'remaining', v_remaining,
        'total', v_total,
        'is_exhausted', v_remaining <= 0,
        'can_win', v_can_win,
        'type', 'digital',
        'distribution_type', v_distribution_type
      );
      
    -- ★ 무제한 ★
    ELSIF v_item.stock_limit_type IS NULL THEN
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', false,
        'remaining', NULL,
        'total', NULL,
        'is_exhausted', false,
        'can_win', v_can_win,
        'type', 'unlimited'
      );
      
    -- ★ 전체 수량 제한 ★
    ELSIF v_item.stock_limit_type = 'global' THEN
      v_total := COALESCE(v_item.stock_limit, 0);
      v_remaining := GREATEST(0, v_total - COALESCE(v_item.stock_used, 0));
      
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', false,
        'remaining', v_remaining,
        'total', v_total,
        'is_exhausted', v_remaining <= 0,
        'can_win', v_can_win,
        'type', 'global'
      );
      
    -- ★ 유저별 수량 제한 ★
    ELSIF v_item.stock_limit_type = 'per_user' THEN
      v_total := COALESCE(v_item.stock_limit, 0);
      
      SELECT COALESCE(win_count, 0) INTO v_user_count
      FROM user_roulette_item_counts
      WHERE user_id = p_user_id AND item_id = v_item.id;
      
      v_remaining := GREATEST(0, v_total - COALESCE(v_user_count, 0));
      
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', false,
        'remaining', v_remaining,
        'total', v_total,
        'is_exhausted', v_remaining <= 0,
        'can_win', v_can_win,
        'type', 'per_user'
      );
    
    -- ★ 기타 (예외 처리) ★
    ELSE
      v_item_data := jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'color', v_item.color,
        'is_blank', false,
        'remaining', NULL,
        'total', NULL,
        'is_exhausted', false,
        'can_win', v_can_win,
        'type', 'unknown'
      );
    END IF;
    
    -- NULL 체크 후 배열에 추가
    IF v_item_data IS NOT NULL THEN
      v_items := v_items || v_item_data;
    END IF;
  END LOOP;
  
  RETURN v_items;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_wheel_items_status IS '유저 기준 휠의 모든 아이템 수량 상태 조회 (프로필 룰렛용)';

GRANT EXECUTE ON FUNCTION get_user_wheel_items_status (UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION get_user_wheel_items_status (UUID, UUID) TO anon;

-- ============================================================
-- partner_roulette_inventory 뷰 수정
-- 목적: 프로필 룰렛의 donation_amount가 NULL인 문제 해결
-- 해결: stream_donations → profile_roulette_donations → wheel_price 순서로 fallback
-- ============================================================

CREATE
OR REPLACE VIEW partner_roulette_inventory AS
SELECT
    drr.id,
    drr.donation_id,
    drr.partner_id,
    drr.donor_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 당첨자 정보
    m.id AS donor_member_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    m.member_code AS donor_member_code,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보: stream_donations → profile_roulette_donations → wheel_price 순서로 fallback
    COALESCE(
        sd.amount,
        prd.amount,
        drr.wheel_price
    ) AS donation_amount,
    COALESCE(sd.message, NULL) AS donation_message
FROM
    donation_roulette_results drr
    JOIN members m ON m.id = drr.donor_id
    LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
    LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
    LEFT JOIN profile_roulette_donations prd ON prd.roulette_result_id = drr.id
    LEFT JOIN partner_roulette_items pri ON pri.id = drr.roulette_item_id
WHERE
    COALESCE(pri.is_blank, false) = false -- 꽝 제외
ORDER BY drr.created_at DESC;

COMMENT ON VIEW partner_roulette_inventory IS '파트너 룰렛 당첨 인벤토리 뷰 - 방송/프로필 룰렛 모두 지원';

-- RLS 정책 설정
ALTER VIEW partner_roulette_inventory SET (security_invoker = true);

-- ============================================================
-- user_roulette_inventory 뷰도 동일하게 수정
-- ============================================================

CREATE
OR REPLACE VIEW user_roulette_inventory AS
SELECT
    drr.id,
    drr.donation_id,
    drr.donor_id,
    drr.partner_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 파트너 정보
    p.partner_name,
    p.member_id AS partner_member_id,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보: stream_donations → profile_roulette_donations → wheel_price 순서로 fallback
    COALESCE(
        sd.amount,
        prd.amount,
        drr.wheel_price
    ) AS donation_amount,
    COALESCE(sd.message, NULL) AS donation_message
FROM
    donation_roulette_results drr
    JOIN partners p ON p.id = drr.partner_id
    LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
    LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
    LEFT JOIN profile_roulette_donations prd ON prd.roulette_result_id = drr.id
    LEFT JOIN partner_roulette_items pri ON pri.id = drr.roulette_item_id
WHERE
    COALESCE(pri.is_blank, false) = false -- 꽝 제외
ORDER BY drr.created_at DESC;

COMMENT ON VIEW user_roulette_inventory IS '사용자 룰렛 당첨 인벤토리 뷰 - 방송/프로필 룰렛 모두 지원';

-- RLS 정책 설정
ALTER VIEW user_roulette_inventory SET (security_invoker = true);

-- ============================================================
-- execute_profile_roulette 함수 수정
-- 목적: partner_points_logs에 파트너 수익 로그 기록 추가
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
  v_partner_amount INTEGER;
  v_log_id TEXT;
  -- 디지털 다중 파일용 변수
  v_distribution_type TEXT;
  v_selected_file_id UUID;
  v_selected_file RECORD;
  v_all_digital_files RECORD;
  v_digital_preview JSONB := NULL;
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
  
  -- 로그 ID 생성 (중복 방지)
  v_log_id := 'profile_roulette_' || gen_random_uuid()::text;
  
  -- 5. 포인트 차감
  UPDATE members 
  SET total_points = total_points - v_wheel.price 
  WHERE id = p_donor_id;
  
  -- 포인트 로그 기록 (유저 차감)
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (
    p_donor_id, 
    'spend', 
    v_wheel.price, 
    '프로필 룰렛: ' || v_wheel.name, 
    v_log_id
  );
  
  -- 파트너 수익 금액 (수수료 없음, 100% 지급)
  v_partner_amount := v_wheel.price;
  
  -- 파트너에게 포인트 지급
  UPDATE partners 
  SET total_points = total_points + v_partner_amount 
  WHERE id = p_partner_id;
  
  -- ★★★ 파트너 포인트 로그 기록 (수익) ★★★
  INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id)
  VALUES (
    p_partner_id, 
    'earn', 
    v_partner_amount, 
    '프로필 룰렛 수익: ' || v_wheel.name, 
    v_log_id
  );
  
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
    UPDATE partners SET total_points = total_points - v_partner_amount WHERE id = p_partner_id;
    UPDATE profile_roulette_donations SET status = 'failed' WHERE id = v_donation_id;
    DELETE FROM member_points_logs WHERE log_id = v_log_id;
    DELETE FROM partner_points_logs WHERE log_id = v_log_id || '_partner';
    
    RETURN jsonb_build_object('success', false, 'error', 'NO_ROULETTE_ITEMS');
  END IF;
  
  -- 8. 당첨 아이템 결정 (수량 제한 고려)
  v_roulette_result := calculate_roulette_result_v2(p_donor_id, p_wheel_id);
  
  IF NOT COALESCE((v_roulette_result->>'success')::boolean, false) THEN
    -- 롤백
    UPDATE members SET total_points = total_points + v_wheel.price WHERE id = p_donor_id;
    UPDATE partners SET total_points = total_points - v_partner_amount WHERE id = p_partner_id;
    UPDATE profile_roulette_donations SET status = 'failed' WHERE id = v_donation_id;
    DELETE FROM member_points_logs WHERE log_id = v_log_id;
    DELETE FROM partner_points_logs WHERE log_id = v_log_id || '_partner';
    
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
    NULL,
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
    v_distribution_type := COALESCE(v_winning_item.digital_distribution_type, 'bundle');
    
    IF v_distribution_type = 'individual' THEN
      v_selected_file_id := select_random_unwon_digital_file(p_donor_id, v_winning_item_id);
      
      IF v_selected_file_id IS NOT NULL THEN
        SELECT * INTO v_selected_file
        FROM roulette_item_digital_files
        WHERE id = v_selected_file_id;
        
        v_digital_preview := jsonb_build_object(
          'file_url', v_selected_file.file_url,
          'file_name', v_selected_file.file_name,
          'file_type', v_selected_file.file_type
        );
        
        PERFORM record_digital_file_win(p_donor_id, v_winning_item_id, v_selected_file_id, v_result_id);
        
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
      SELECT * INTO v_selected_file
      FROM roulette_item_digital_files
      WHERE item_id = v_winning_item_id
      ORDER BY sort_order
      LIMIT 1;
      
      IF v_selected_file.id IS NOT NULL THEN
        v_digital_preview := jsonb_build_object(
          'file_url', v_selected_file.file_url,
          'file_name', v_selected_file.file_name,
          'file_type', v_selected_file.file_type
        );
        
        FOR v_all_digital_files IN 
          SELECT * FROM roulette_item_digital_files 
          WHERE item_id = v_winning_item_id
          ORDER BY sort_order
        LOOP
          PERFORM record_digital_file_win(p_donor_id, v_winning_item_id, v_all_digital_files.id, v_result_id);
        END LOOP;
        
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
    UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
  END IF;
  
  -- 15. 반환
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
    'digital_preview', v_digital_preview
  );
  
EXCEPTION
  WHEN OTHERS THEN
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

COMMENT ON FUNCTION execute_profile_roulette IS '프로필 룰렛 실행 - 디지털 다중 파일 지원 + 파트너 수익 로그 기록';

GRANT EXECUTE ON FUNCTION execute_profile_roulette (UUID, UUID, UUID, INTEGER) TO authenticated;