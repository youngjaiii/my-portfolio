-- =====================================================================
-- 룰렛판 RLS 정책 수정 마이그레이션
-- 작성일: 2026-02-02
-- 목적: partner_roulette_wheels 테이블의 RLS 정책을 member_id 기반으로 수정
-- 
-- 문제: 프론트엔드에서 user.id (member_id)를 partner_id로 사용하고 있음
-- 해결: RLS 정책을 member_id 기반으로 변경
-- =====================================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "partner_roulette_wheels_select" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_insert" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_update" ON partner_roulette_wheels;
DROP POLICY IF EXISTS "partner_roulette_wheels_delete" ON partner_roulette_wheels;

-- 새로운 정책: partner_id가 member_id(auth.uid())와 동일한 경우 허용
-- 즉, partner_id 컬럼에 member_id 값이 저장됨을 가정

-- SELECT: 누구나 조회 가능 (방송 시청자도 룰렛 정보 필요)
CREATE POLICY "partner_roulette_wheels_select" ON partner_roulette_wheels
FOR SELECT USING (true);

-- INSERT: 자신의 member_id로만 추가 가능
-- partner_id가 partners.id인 경우와 member_id인 경우 둘 다 지원
CREATE POLICY "partner_roulette_wheels_insert" ON partner_roulette_wheels
FOR INSERT WITH CHECK (
    -- partner_id가 member_id인 경우
    auth.uid() = partner_id
    OR
    -- partner_id가 partners.id인 경우 (기존 방식)
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- UPDATE: 자신의 룰렛판만 수정 가능
CREATE POLICY "partner_roulette_wheels_update" ON partner_roulette_wheels
FOR UPDATE USING (
    auth.uid() = partner_id
    OR
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- DELETE: 자신의 룰렛판만 삭제 가능
CREATE POLICY "partner_roulette_wheels_delete" ON partner_roulette_wheels
FOR DELETE USING (
    auth.uid() = partner_id
    OR
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- =====================================================================
-- partner_roulette_items 테이블도 같은 문제가 있을 수 있으므로 확인
-- =====================================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "partner_roulette_items_select" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_insert" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_update" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_delete" ON partner_roulette_items;

-- SELECT: 누구나 조회 가능
CREATE POLICY "partner_roulette_items_select" ON partner_roulette_items
FOR SELECT USING (true);

-- INSERT: 자신의 룰렛판에만 아이템 추가 가능
CREATE POLICY "partner_roulette_items_insert" ON partner_roulette_items
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM partner_roulette_wheels w
        WHERE w.id = wheel_id
        AND (
            auth.uid() = w.partner_id
            OR auth.uid() = (SELECT member_id FROM partners WHERE id = w.partner_id)
        )
    )
);

-- UPDATE: 자신의 룰렛판 아이템만 수정 가능
CREATE POLICY "partner_roulette_items_update" ON partner_roulette_items
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM partner_roulette_wheels w
        WHERE w.id = wheel_id
        AND (
            auth.uid() = w.partner_id
            OR auth.uid() = (SELECT member_id FROM partners WHERE id = w.partner_id)
        )
    )
);

-- DELETE: 자신의 룰렛판 아이템만 삭제 가능
CREATE POLICY "partner_roulette_items_delete" ON partner_roulette_items
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM partner_roulette_wheels w
        WHERE w.id = wheel_id
        AND (
            auth.uid() = w.partner_id
            OR auth.uid() = (SELECT member_id FROM partners WHERE id = w.partner_id)
        )
    )
);

-- =====================================================================
-- partner_roulette_settings 테이블 RLS도 동일하게 수정
-- =====================================================================

DROP POLICY IF EXISTS "partner_roulette_settings_select" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_insert" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_update" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_delete" ON partner_roulette_settings;

-- SELECT: 누구나 조회 가능
CREATE POLICY "partner_roulette_settings_select" ON partner_roulette_settings
FOR SELECT USING (true);

-- INSERT: 자신만 추가 가능
CREATE POLICY "partner_roulette_settings_insert" ON partner_roulette_settings
FOR INSERT WITH CHECK (
    auth.uid() = partner_id
    OR auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- UPDATE: 자신만 수정 가능
CREATE POLICY "partner_roulette_settings_update" ON partner_roulette_settings
FOR UPDATE USING (
    auth.uid() = partner_id
    OR auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

-- DELETE: 자신만 삭제 가능
CREATE POLICY "partner_roulette_settings_delete" ON partner_roulette_settings
FOR DELETE USING (
    auth.uid() = partner_id
    OR auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

COMMENT ON POLICY "partner_roulette_wheels_insert" ON partner_roulette_wheels 
IS 'partner_id가 member_id이거나 partners.id인 경우 모두 허용';
