-- =====================================================================
-- execute_donation_roulette 함수 수정: partner_id 제거
-- 작성일: 2025-12-30
-- 목적: partner_roulette_items에서 partner_id 컬럼이 없는 경우를 대비하여
--       wheel_id를 통해 조회하도록 수정
-- =====================================================================

-- =====================================================================
-- 1. calculate_roulette_result 함수 수정
-- =====================================================================
DROP FUNCTION IF EXISTS calculate_roulette_result(UUID);
DROP FUNCTION IF EXISTS calculate_roulette_result(UUID, UUID);

CREATE OR REPLACE FUNCTION calculate_roulette_result(
    p_partner_id UUID,
    p_wheel_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_total_weight INTEGER;
    v_random_value INTEGER;
    v_cumulative_weight INTEGER := 0;
    v_item RECORD;
    v_result_id UUID;
BEGIN
    -- wheel_id가 있으면 해당 wheel의 아이템만, 없으면 partner_roulette_wheels를 통해 조회
    IF p_wheel_id IS NOT NULL THEN
        SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
        FROM partner_roulette_items
        WHERE wheel_id = p_wheel_id AND is_active = true;
        
        IF v_total_weight = 0 THEN
            RETURN NULL;
        END IF;
        
        v_random_value := floor(random() * v_total_weight)::INTEGER;
        
        FOR v_item IN
            SELECT id, weight
            FROM partner_roulette_items
            WHERE wheel_id = p_wheel_id AND is_active = true
            ORDER BY sort_order
        LOOP
            v_cumulative_weight := v_cumulative_weight + v_item.weight;
            IF v_random_value < v_cumulative_weight THEN
                RETURN v_item.id;
            END IF;
        END LOOP;
        
        -- 마지막 아이템 반환
        SELECT id INTO v_result_id
        FROM partner_roulette_items
        WHERE wheel_id = p_wheel_id AND is_active = true
        ORDER BY sort_order DESC
        LIMIT 1;
    ELSE
        -- wheel_id가 없으면 partner_roulette_wheels를 통해 조회
        SELECT COALESCE(SUM(pri.weight), 0) INTO v_total_weight
        FROM partner_roulette_items pri
        INNER JOIN partner_roulette_wheels prw ON pri.wheel_id = prw.id
        WHERE prw.partner_id = p_partner_id 
          AND pri.is_active = true
          AND prw.is_active = true;
        
        IF v_total_weight = 0 THEN
            RETURN NULL;
        END IF;
        
        v_random_value := floor(random() * v_total_weight)::INTEGER;
        
        FOR v_item IN
            SELECT pri.id, pri.weight
            FROM partner_roulette_items pri
            INNER JOIN partner_roulette_wheels prw ON pri.wheel_id = prw.id
            WHERE prw.partner_id = p_partner_id 
              AND pri.is_active = true
              AND prw.is_active = true
            ORDER BY pri.sort_order
        LOOP
            v_cumulative_weight := v_cumulative_weight + v_item.weight;
            IF v_random_value < v_cumulative_weight THEN
                RETURN v_item.id;
            END IF;
        END LOOP;
        
        -- 마지막 아이템 반환
        SELECT pri.id INTO v_result_id
        FROM partner_roulette_items pri
        INNER JOIN partner_roulette_wheels prw ON pri.wheel_id = prw.id
        WHERE prw.partner_id = p_partner_id 
          AND pri.is_active = true
          AND prw.is_active = true
        ORDER BY pri.sort_order DESC
        LIMIT 1;
    END IF;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_roulette_result IS '가중치 기반 룰렛 결과 계산 (wheel_id 지원, partner_id 컬럼 없이도 동작)';

-- =====================================================================
-- 2. execute_donation_roulette 함수 수정
-- =====================================================================
-- 기존 함수 삭제
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid, proname, pg_get_function_identity_arguments(oid) as args
        FROM pg_proc 
        WHERE proname = 'execute_donation_roulette'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s(%s) CASCADE', r.proname, r.args);
    END LOOP;
END;
$$;

-- 수정된 execute_donation_roulette 함수
CREATE OR REPLACE FUNCTION execute_donation_roulette(
    p_donation_id INTEGER,
    p_room_id UUID,
    p_donor_id UUID,
    p_partner_id UUID,
    p_donation_amount INTEGER,
    p_wheel_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_settings RECORD;
    v_wheel RECORD;
    v_min_amount INTEGER;
    v_winning_item_id UUID;
    v_winning_item RECORD;
    v_all_items JSONB;
    v_final_rotation NUMERIC(10, 2);
    v_item_index INTEGER;
    v_item_count INTEGER;
    v_result_id UUID;
    v_reward_id UUID;
    v_usable_type TEXT;
    v_initial_amount NUMERIC(10, 2);
    v_expires_at TIMESTAMPTZ;
    v_partner_id_from_wheel UUID;
BEGIN
    -- 1. 룰렛 설정 조회
    SELECT * INTO v_settings
    FROM partner_roulette_settings
    WHERE partner_id = p_partner_id AND is_enabled = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_NOT_ENABLED');
    END IF;
    
    -- 2. 최소 금액 결정 및 wheel 조회
    IF p_wheel_id IS NOT NULL THEN
        -- wheel이 지정된 경우 해당 wheel의 price 사용
        SELECT * INTO v_wheel
        FROM partner_roulette_wheels
        WHERE id = p_wheel_id AND partner_id = p_partner_id AND is_active = true;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'WHEEL_NOT_FOUND');
        END IF;
        
        v_min_amount := v_wheel.price;
        v_partner_id_from_wheel := v_wheel.partner_id;
    ELSE
        -- wheel이 없으면 설정의 min_donation_amount 사용
        v_min_amount := COALESCE(v_settings.min_donation_amount, 3000);
        v_partner_id_from_wheel := p_partner_id;
    END IF;
    
    -- 3. 최소 금액 확인
    IF p_donation_amount < v_min_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'AMOUNT_TOO_LOW', 
            'min_amount', v_min_amount
        );
    END IF;
    
    -- 4. 전체 아이템 조회 (wheel_id를 통해 조회)
    IF p_wheel_id IS NOT NULL THEN
        -- wheel_id가 있으면 해당 wheel의 아이템만 조회
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'name', name,
                    'color', color,
                    'weight', weight,
                    'reward_type', reward_type,
                    'reward_value', reward_value,
                    'is_active', is_active
                ) ORDER BY sort_order
            ),
            COUNT(*)
        INTO v_all_items, v_item_count
        FROM partner_roulette_items
        WHERE wheel_id = p_wheel_id AND is_active = true;
    ELSE
        -- wheel_id가 없으면 partner_roulette_wheels를 통해 조회
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', pri.id,
                    'name', pri.name,
                    'color', pri.color,
                    'weight', pri.weight,
                    'reward_type', pri.reward_type,
                    'reward_value', pri.reward_value,
                    'is_active', pri.is_active
                ) ORDER BY pri.sort_order
            ),
            COUNT(*)
        INTO v_all_items, v_item_count
        FROM partner_roulette_items pri
        INNER JOIN partner_roulette_wheels prw ON pri.wheel_id = prw.id
        WHERE prw.partner_id = p_partner_id 
          AND pri.is_active = true
          AND prw.is_active = true;
    END IF;
    
    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_ROULETTE_ITEMS');
    END IF;
    
    -- 5. 당첨 아이템 결정
    v_winning_item_id := calculate_roulette_result(p_partner_id, p_wheel_id);
    
    IF v_winning_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_CALCULATION_FAILED');
    END IF;
    
    SELECT * INTO v_winning_item
    FROM partner_roulette_items
    WHERE id = v_winning_item_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WINNING_ITEM_NOT_FOUND');
    END IF;
    
    -- 6. 아이템 인덱스 계산 (wheel_id를 통해 조회)
    IF p_wheel_id IS NOT NULL THEN
        SELECT row_number INTO v_item_index
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS row_number
            FROM partner_roulette_items
            WHERE wheel_id = p_wheel_id AND is_active = true
        ) sub
        WHERE id = v_winning_item_id;
    ELSE
        SELECT row_number INTO v_item_index
        FROM (
            SELECT pri.id, ROW_NUMBER() OVER (ORDER BY pri.sort_order) - 1 AS row_number
            FROM partner_roulette_items pri
            INNER JOIN partner_roulette_wheels prw ON pri.wheel_id = prw.id
            WHERE prw.partner_id = p_partner_id 
              AND pri.is_active = true
              AND prw.is_active = true
        ) sub
        WHERE id = v_winning_item_id;
    END IF;
    
    -- 7. 최종 회전 각도 계산 (3~5회전)
    v_final_rotation := (3 + random() * 2) * 360 + (270 - (v_item_index * (360.0 / v_item_count) + (360.0 / v_item_count / 2)));
    
    -- 8. 결과 저장 (Realtime 전파)
    INSERT INTO donation_roulette_results (
        donation_id,
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
        final_rotation
    ) VALUES (
        p_donation_id,
        p_room_id,
        p_donor_id,
        p_partner_id,
        p_wheel_id,
        COALESCE(v_wheel.name, '기본 룰렛'),
        COALESCE(v_wheel.price, v_min_amount),
        v_winning_item_id,
        v_winning_item.name,
        v_winning_item.color,
        v_winning_item.reward_type,
        v_winning_item.reward_value,
        v_all_items,
        v_final_rotation
    )
    RETURNING id INTO v_result_id;
    
    -- 9. stream_donations 업데이트
    UPDATE stream_donations
    SET has_roulette = true, roulette_result_id = v_result_id
    WHERE id = p_donation_id;
    
    -- 10. 보상 자동 처리
    IF v_winning_item.reward_type = 'points' AND v_winning_item.reward_value IS NOT NULL THEN
        -- 포인트 지급
        DECLARE
            v_bonus_points INTEGER := v_winning_item.reward_value::INTEGER;
        BEGIN
            UPDATE members SET total_points = total_points + v_bonus_points WHERE id = p_donor_id;
            INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
            VALUES (p_donor_id, 'earn', v_bonus_points, '룰렛 당첨: ' || v_winning_item.name, 'roulette_' || v_result_id::text);
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSIF v_winning_item.reward_type = 'usable' AND v_winning_item.reward_value IS NOT NULL THEN
        -- 사용형 아이템 생성
        DECLARE
            v_parts TEXT[];
        BEGIN
            v_parts := string_to_array(v_winning_item.reward_value, ':');
            IF array_length(v_parts, 1) = 2 THEN
                v_usable_type := v_parts[1];
                v_initial_amount := v_parts[2]::NUMERIC(10, 2);
            ELSE
                -- 파싱 실패 시 기본값: 쿠폰으로 간주
                v_usable_type := 'coupon';
                v_initial_amount := 1;
            END IF;
            v_expires_at := NOW() + INTERVAL '30 days';
            
            v_reward_id := create_roulette_reward(
                v_result_id,
                p_donor_id,
                p_partner_id,
                v_winning_item.name,
                v_winning_item.reward_value,
                'usable',
                v_usable_type,
                v_initial_amount,
                v_expires_at
            );
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSIF v_winning_item.reward_type = 'coupon' AND v_winning_item.reward_value IS NOT NULL THEN
        -- 쿠폰 생성 (usable_type에 'coupon' 사용)
        BEGIN
            v_expires_at := NOW() + INTERVAL '30 days';
            
            v_reward_id := create_roulette_reward(
                v_result_id,
                p_donor_id,
                p_partner_id,
                v_winning_item.name,
                v_winning_item.reward_value,
                'usable',
                'coupon',  -- 쿠폰 타입 명시
                1,
                v_expires_at
            );
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSIF v_winning_item.reward_type = 'digital' AND v_winning_item.reward_value IS NOT NULL THEN
        -- 디지털 보상 생성
        DECLARE
            v_file_path TEXT := v_winning_item.reward_value;
            v_file_name TEXT;
        BEGIN
            v_file_name := substring(v_file_path from '[^/]+$');
            
            SELECT create_roulette_digital_reward(
                v_result_id,
                p_donor_id,
                p_partner_id,
                v_winning_item.name,
                v_winning_item.reward_value,
                NULL,
                v_file_name,
                NULL,
                NULL,
                v_file_path
            ) INTO v_reward_id;
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSE
        -- text, custom 타입은 처리 완료로 표시만
        UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'result_id', v_result_id,
        'wheel_name', COALESCE(v_wheel.name, '기본 룰렛'),
        'wheel_price', COALESCE(v_wheel.price, v_min_amount),
        'item_name', v_winning_item.name,
        'item_color', v_winning_item.color,
        'reward_type', v_winning_item.reward_type,
        'reward_value', v_winning_item.reward_value,
        'final_rotation', v_final_rotation
    );
    
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_ROULETTE');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'EXECUTION_FAILED', 'detail', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION execute_donation_roulette IS '후원 룰렛 자동 실행 RPC - wheel_id 지원, partner_id 컬럼 없이도 동작';

-- =====================================================================
-- 3. create_roulette_reward 함수 수정 (usable_type NULL 처리)
-- =====================================================================
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
  v_usable_type_final TEXT;
BEGIN
  -- usable_type이 NULL이면 기본값 제공 (쿠폰으로 간주)
  -- 실제 테이블에 usable_type이 NOT NULL 제약조건이 있을 수 있으므로
  v_usable_type_final := COALESCE(p_usable_type, 'coupon');
  
  -- 사용형 아이템/쿠폰 생성
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
    p_reward_type,  -- 'usable'
    p_reward_name,
    p_reward_value,
    v_usable_type_final,  -- NULL이면 'coupon'으로 설정
    p_initial_amount,
    p_initial_amount,  -- 초기값과 잔여값 동일
    p_expires_at
  )
  RETURNING id INTO v_reward_id;
  
  RETURN v_reward_id;
END;
$$;

COMMENT ON FUNCTION create_roulette_reward IS '룰렛 당첨 시 사용형 아이템 생성 (usable_type NULL 처리 포함)';

GRANT EXECUTE ON FUNCTION create_roulette_reward(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO authenticated;

