-- Timesheet RLS 정책 수정
-- 파트너+가 출근요청 시 가게 및 매니저를 볼 수 있도록 수정
-- 무한 재귀 문제 해결: SECURITY DEFINER 함수 사용

-- ============================================
-- Helper 함수: 파트너+ 역할 확인 (RLS 우회)
-- ============================================

CREATE OR REPLACE FUNCTION "public"."is_partner_plus"(
    p_member_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM "public"."timesheet_partner_roles"
    WHERE
        member_id = p_member_id
        AND role_type = 'partner_plus'
        AND is_active = true;
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION "public"."is_partner_plus" IS '사용자가 파트너+ 역할을 가지고 있는지 확인합니다. RLS를 우회하여 무한 재귀를 방지합니다.';

-- ============================================
-- 기존 정책 삭제
-- ============================================

DROP POLICY IF EXISTS "timesheet_stores_partner_plus_select" ON "public"."timesheet_stores";

DROP POLICY IF EXISTS "timesheet_store_managers_partner_plus_select" ON "public"."timesheet_store_managers";

-- ============================================
-- RLS 정책: timesheet_stores
-- ============================================

-- 파트너+: 모든 활성 가게 조회 가능 (출근요청 시 필요)
CREATE POLICY "timesheet_stores_partner_plus_select" ON "public"."timesheet_stores" FOR
SELECT USING (
        -- 파트너+ 역할을 가진 사용자는 모든 활성 가게를 볼 수 있음
        (
            is_active = true
            AND "public"."is_partner_plus" (auth.uid ())
        )
        OR EXISTS (
            SELECT 1
            FROM "public"."members"
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- ============================================
-- RLS 정책: timesheet_store_managers
-- ============================================

-- 파트너+: 가게에 할당된 매니저 조회 가능 (출근요청 시 필요)
CREATE POLICY "timesheet_store_managers_partner_plus_select" ON "public"."timesheet_store_managers" FOR
SELECT USING (
        is_active = true
        AND "public"."is_partner_plus" (auth.uid ())
    );