-- =====================================================================
-- 룰렛판(Wheel) 테이블 생성 마이그레이션
-- 작성일: 2025-12-30
-- 목적: 파트너가 여러 개의 룰렛판을 만들 수 있도록 지원
-- =====================================================================

-- =====================================================================
-- 1. partner_roulette_wheels 테이블 생성
-- =====================================================================
CREATE TABLE IF NOT EXISTS partner_roulette_wheels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                           -- 룰렛판 이름 (예: "1000P 럭키 룰렛")
    price INTEGER NOT NULL DEFAULT 1000 CHECK (price >= 100),  -- 고정 금액 (최소 100P)
    description TEXT,                             -- 설명 (선택)
    is_active BOOLEAN DEFAULT true,               -- 활성화 여부
    sort_order INTEGER DEFAULT 0,                 -- 정렬 순서
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_wheels_partner 
    ON partner_roulette_wheels(partner_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_partner_roulette_wheels_active 
    ON partner_roulette_wheels(partner_id, is_active) 
    WHERE is_active = true;

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_partner_roulette_wheels_updated ON partner_roulette_wheels;
CREATE TRIGGER trg_partner_roulette_wheels_updated
    BEFORE UPDATE ON partner_roulette_wheels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE partner_roulette_wheels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_roulette_wheels_select" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_insert" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_update" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_delete" ON partner_roulette_wheels;

CREATE POLICY "partner_roulette_wheels_select" ON partner_roulette_wheels
FOR SELECT USING (true);

CREATE POLICY "partner_roulette_wheels_insert" ON partner_roulette_wheels
FOR INSERT WITH CHECK (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_wheels_update" ON partner_roulette_wheels
FOR UPDATE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_wheels_delete" ON partner_roulette_wheels
FOR DELETE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

COMMENT ON TABLE partner_roulette_wheels IS '파트너별 룰렛판 목록 (각 판마다 고정 금액)';
COMMENT ON COLUMN partner_roulette_wheels.price IS '룰렛판 고정 금액 (최소 100P)';

-- =====================================================================
-- 2. partner_roulette_items 테이블에 wheel_id 컬럼 추가
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_roulette_items' AND column_name = 'wheel_id'
    ) THEN
        ALTER TABLE partner_roulette_items 
        ADD COLUMN wheel_id UUID REFERENCES partner_roulette_wheels(id) ON DELETE CASCADE;
        
        COMMENT ON COLUMN partner_roulette_items.wheel_id IS '소속 룰렛판 ID (NULL이면 기본 룰렛)';
    END IF;
END;
$$;

-- wheel_id 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_items_wheel 
    ON partner_roulette_items(wheel_id);

-- =====================================================================
-- 3. donation_roulette_results 테이블에 wheel 관련 컬럼 추가
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' AND column_name = 'wheel_id'
    ) THEN
        ALTER TABLE donation_roulette_results 
        ADD COLUMN wheel_id UUID REFERENCES partner_roulette_wheels(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' AND column_name = 'wheel_name'
    ) THEN
        ALTER TABLE donation_roulette_results 
        ADD COLUMN wheel_name TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'donation_roulette_results' AND column_name = 'wheel_price'
    ) THEN
        ALTER TABLE donation_roulette_results 
        ADD COLUMN wheel_price INTEGER;
    END IF;
END;
$$;

-- =====================================================================
-- 4. 기존 partner_roulette_items에서 partner_id 제거 여부 결정
-- 
-- 참고: wheel_id가 없는 기존 아이템을 위해 partner_id는 유지
-- wheel_id가 NULL인 경우 partner_id로 조회 (하위 호환성)
-- =====================================================================

-- =====================================================================
-- 5. calculate_roulette_result 함수 업데이트 (wheel_id 지원)
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
    -- wheel_id가 있으면 해당 wheel의 아이템만, 없으면 partner_id로 조회
    SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
    FROM partner_roulette_items
    WHERE partner_id = p_partner_id 
      AND is_active = true
      AND (p_wheel_id IS NULL OR wheel_id = p_wheel_id);
    
    IF v_total_weight = 0 THEN
        RETURN NULL;
    END IF;
    
    v_random_value := floor(random() * v_total_weight)::INTEGER;
    
    FOR v_item IN
        SELECT id, weight
        FROM partner_roulette_items
        WHERE partner_id = p_partner_id 
          AND is_active = true
          AND (p_wheel_id IS NULL OR wheel_id = p_wheel_id)
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
    WHERE partner_id = p_partner_id 
      AND is_active = true
      AND (p_wheel_id IS NULL OR wheel_id = p_wheel_id)
    ORDER BY sort_order DESC
    LIMIT 1;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_roulette_result IS '가중치 기반 룰렛 결과 계산 (wheel_id 지원)';

-- =====================================================================
-- 6. execute_donation_roulette 함수 업데이트 (wheel_id 지원)
-- =====================================================================
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
BEGIN
    -- 1. 룰렛 설정 조회
    SELECT * INTO v_settings
    FROM partner_roulette_settings
    WHERE partner_id = p_partner_id AND is_enabled = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_NOT_ENABLED');
    END IF;
    
    -- 2. 최소 금액 결정
    IF p_wheel_id IS NOT NULL THEN
        -- wheel이 지정된 경우 해당 wheel의 price 사용
        SELECT * INTO v_wheel
        FROM partner_roulette_wheels
        WHERE id = p_wheel_id AND partner_id = p_partner_id AND is_active = true;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'WHEEL_NOT_FOUND');
        END IF;
        
        v_min_amount := v_wheel.price;
    ELSE
        -- wheel이 없으면 설정의 min_donation_amount 사용
        v_min_amount := COALESCE(v_settings.min_donation_amount, 3000);
    END IF;
    
    -- 3. 최소 금액 확인
    IF p_donation_amount < v_min_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'AMOUNT_TOO_LOW', 
            'min_amount', v_min_amount
        );
    END IF;
    
    -- 4. 전체 아이템 조회
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
    WHERE partner_id = p_partner_id 
      AND is_active = true
      AND (p_wheel_id IS NULL OR wheel_id = p_wheel_id);
    
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
    
    -- 6. 아이템 인덱스 계산
    SELECT row_number INTO v_item_index
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS row_number
        FROM partner_roulette_items
        WHERE partner_id = p_partner_id 
          AND is_active = true
          AND (p_wheel_id IS NULL OR wheel_id = p_wheel_id)
    ) sub
    WHERE id = v_winning_item_id;
    
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
                v_usable_type := NULL;
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
        -- 쿠폰 생성
        BEGIN
            v_reward_id := create_roulette_reward(
                v_result_id,
                p_donor_id,
                p_partner_id,
                v_winning_item.name,
                v_winning_item.reward_value,
                'usable',
                NULL,
                1,
                NULL
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

COMMENT ON FUNCTION execute_donation_roulette IS '후원 룰렛 자동 실행 RPC - wheel_id 지원, 보상 타입 처리';

