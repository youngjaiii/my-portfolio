-- ============================================================
-- execute_donation_roulette 함수 업데이트 (3타입 시스템)
-- 작성일: 2026-02-01
-- 실제 DB 스키마에 맞춰 수정
-- partner_roulette_items는 wheel_id로만 연결됨 (partner_id 없음)
-- ============================================================

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

-- 새 함수 생성
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
    v_actual_wheel_id UUID;
    v_min_amount INTEGER;
    v_winning_item_id UUID;
    v_winning_item RECORD;
    v_all_items JSONB;
    v_final_rotation NUMERIC(10, 2);
    v_item_index INTEGER;
    v_item_count INTEGER;
    v_result_id UUID;
    v_reward_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. 룰렛 설정 조회
    SELECT * INTO v_settings
    FROM partner_roulette_settings
    WHERE partner_id = p_partner_id AND is_enabled = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_NOT_ENABLED');
    END IF;
    
    -- 2. wheel 결정
    IF p_wheel_id IS NOT NULL THEN
        SELECT * INTO v_wheel
        FROM partner_roulette_wheels
        WHERE id = p_wheel_id AND partner_id = p_partner_id AND is_active = true;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'WHEEL_NOT_FOUND');
        END IF;
        
        v_actual_wheel_id := p_wheel_id;
        v_min_amount := COALESCE(v_wheel.price, 3000);
    ELSE
        -- 기본 wheel 찾기
        SELECT * INTO v_wheel
        FROM partner_roulette_wheels
        WHERE partner_id = p_partner_id AND is_active = true
        ORDER BY sort_order
        LIMIT 1;
        
        IF FOUND THEN
            v_actual_wheel_id := v_wheel.id;
            v_min_amount := COALESCE(v_wheel.price, 3000);
        ELSE
            v_min_amount := 3000;
        END IF;
    END IF;
    
    -- 3. 최소 금액 확인
    IF p_donation_amount < v_min_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'AMOUNT_TOO_LOW', 
            'min_amount', v_min_amount
        );
    END IF;
    
    -- 4. 전체 아이템 조회 (wheel_id 기반, partner_id 없음!)
    IF v_actual_wheel_id IS NOT NULL THEN
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'name', name,
                    'color', color,
                    'weight', weight,
                    'reward_type', reward_type,
                    'reward_value', reward_value
                ) ORDER BY sort_order
            ),
            COUNT(*)
        INTO v_all_items, v_item_count
        FROM partner_roulette_items
        WHERE wheel_id = v_actual_wheel_id AND is_active = true;
    ELSE
        -- wheel이 없으면 partner의 모든 wheel에서 아이템 조회
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', pri.id,
                    'name', pri.name,
                    'color', pri.color,
                    'weight', pri.weight,
                    'reward_type', pri.reward_type,
                    'reward_value', pri.reward_value
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
    v_winning_item_id := calculate_roulette_result(p_partner_id, v_actual_wheel_id);
    
    IF v_winning_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_CALCULATION_FAILED');
    END IF;
    
    SELECT * INTO v_winning_item
    FROM partner_roulette_items
    WHERE id = v_winning_item_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WINNING_ITEM_NOT_FOUND');
    END IF;
    
    -- 6. 아이템 인덱스 계산
    IF v_actual_wheel_id IS NOT NULL THEN
        SELECT row_number INTO v_item_index
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS row_number
            FROM partner_roulette_items
            WHERE wheel_id = v_actual_wheel_id AND is_active = true
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
    
    -- 7. 최종 회전 각도 계산
    v_final_rotation := (3 + random() * 2) * 360 + (270 - (COALESCE(v_item_index, 0) * (360.0 / v_item_count) + (360.0 / v_item_count / 2)));
    
    -- 8. 결과 저장
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
        v_actual_wheel_id,
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
    
    -- 10. 보상 자동 처리 (3타입 시스템)
    IF v_winning_item.reward_type = 'usable' THEN
        BEGIN
            v_expires_at := NOW() + INTERVAL '30 days';
            
            INSERT INTO user_roulette_rewards (
                user_id,
                partner_id,
                roulette_result_id,
                reward_type,
                reward_name,
                reward_value,
                usable_type,
                initial_amount,
                remaining_amount,
                expires_at,
                status
            ) VALUES (
                p_donor_id,
                p_partner_id,
                v_result_id,
                'usable',
                v_winning_item.name,
                v_winning_item.reward_value,
                NULL,
                1,
                1,
                v_expires_at,
                'active'
            )
            RETURNING id INTO v_reward_id;
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create usable reward: %', SQLERRM;
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSIF v_winning_item.reward_type = 'digital' THEN
        BEGIN
            INSERT INTO user_roulette_rewards (
                user_id,
                partner_id,
                roulette_result_id,
                reward_type,
                reward_name,
                reward_value,
                digital_file_url,
                status
            ) VALUES (
                p_donor_id,
                p_partner_id,
                v_result_id,
                'digital',
                v_winning_item.name,
                v_winning_item.reward_value,
                v_winning_item.reward_value,
                'active'
            )
            RETURNING id INTO v_reward_id;
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create digital reward: %', SQLERRM;
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSE
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

-- 권한 설정
GRANT EXECUTE ON FUNCTION execute_donation_roulette(INTEGER, UUID, UUID, UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_donation_roulette(INTEGER, UUID, UUID, UUID, INTEGER, UUID) TO service_role;

COMMENT ON FUNCTION execute_donation_roulette IS '후원 룰렛 자동 실행 - 3타입 시스템 (text, usable, digital)';
