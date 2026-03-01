-- =============================================
-- 멤버 포인트 Audit 트리거 마이그레이션
-- 목적: 멤버 포인트 변동 내역을 실시간으로 추적/감사
-- =============================================

-- =============================================
-- STEP 0: audit 스키마 생성
-- =============================================

CREATE SCHEMA IF NOT EXISTS audit;

-- 스키마 코멘트
COMMENT ON SCHEMA audit IS '감사(audit) 및 로깅 전용 스키마';

-- =============================================
-- STEP 1: audit 스키마에 audit 테이블 생성
-- =============================================

CREATE TABLE IF NOT EXISTS audit.member_points_audit (
    id BIGSERIAL PRIMARY KEY,
    member_id UUID NOT NULL,
    log_id TEXT,
    change_point INTEGER NOT NULL,
    total_point INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- 제약 조건
    CONSTRAINT member_points_audit_operation_type_check 
        CHECK (operation_type IN ('earn', 'spend', 'withdraw', 'charge', 'refund'))
);

-- 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_member_points_audit_member_id 
    ON audit.member_points_audit(member_id);

CREATE INDEX IF NOT EXISTS idx_member_points_audit_created_at 
    ON audit.member_points_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_points_audit_log_id 
    ON audit.member_points_audit(log_id) 
    WHERE log_id IS NOT NULL;

-- 테이블 코멘트
COMMENT ON TABLE audit.member_points_audit IS '멤버 포인트 변동 감사(audit) 로그 테이블';
COMMENT ON COLUMN audit.member_points_audit.id IS '자동 증가 Primary Key';
COMMENT ON COLUMN audit.member_points_audit.member_id IS '멤버 UUID';
COMMENT ON COLUMN audit.member_points_audit.log_id IS '관련 포인트 로그 ID (중복 방지용)';
COMMENT ON COLUMN audit.member_points_audit.change_point IS '변경된 포인트 금액 (양수: 적립, 음수: 사용/차감)';
COMMENT ON COLUMN audit.member_points_audit.total_point IS '변경 후 멤버 보유 총 포인트';
COMMENT ON COLUMN audit.member_points_audit.operation_type IS '작업 유형 (earn/spend/withdraw/charge/refund)';
COMMENT ON COLUMN audit.member_points_audit.description IS '포인트 변동 설명';
COMMENT ON COLUMN audit.member_points_audit.created_at IS '발생 시간';

-- =============================================
-- STEP 2: 트리거 함수 생성
-- =============================================

CREATE OR REPLACE FUNCTION public.log_member_points_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_point INTEGER;
    v_change_point INTEGER;
BEGIN
    -- 현재 멤버의 총 포인트 조회
    SELECT COALESCE(total_points, 0) INTO v_total_point
    FROM public.members
    WHERE id = NEW.member_id;
    
    -- 변경 포인트 계산 (earn은 양수, spend/withdraw는 음수)
    v_change_point := CASE 
        WHEN NEW.type = 'earn' THEN NEW.amount
        WHEN NEW.type IN ('spend', 'withdraw') THEN -NEW.amount
        ELSE NEW.amount
    END;
    
    -- audit 테이블에 기록
    INSERT INTO audit.member_points_audit (
        member_id,
        log_id,
        change_point,
        total_point,
        operation_type,
        description,
        created_at
    ) VALUES (
        NEW.member_id,
        NEW.log_id,
        v_change_point,
        v_total_point,
        NEW.type,
        NEW.description,
        COALESCE(NEW.created_at, NOW())
    );
    
    RETURN NEW;
END;
$$;

-- 함수 코멘트
COMMENT ON FUNCTION public.log_member_points_audit() IS 
    'member_points_logs INSERT 시 audit.member_points_audit에 자동 기록하는 트리거 함수';

-- =============================================
-- STEP 3: 트리거 연결
-- =============================================

-- 기존 트리거가 있으면 삭제
DROP TRIGGER IF EXISTS trg_log_member_points_audit ON public.member_points_logs;

-- 새 트리거 생성 (AFTER INSERT로 refresh_member_total_points 이후 실행)
CREATE TRIGGER trg_log_member_points_audit
    AFTER INSERT ON public.member_points_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.log_member_points_audit();

-- 트리거 코멘트
COMMENT ON TRIGGER trg_log_member_points_audit ON public.member_points_logs IS 
    '포인트 로그 INSERT 시 자동으로 audit 테이블에 기록';

-- =============================================
-- STEP 4: 권한 설정
-- =============================================

-- audit 스키마 권한 설정
GRANT USAGE ON SCHEMA audit TO service_role;
GRANT USAGE ON SCHEMA audit TO authenticated;

-- postgres (슈퍼유저) 권한
ALTER TABLE audit.member_points_audit OWNER TO postgres;

-- service_role에 전체 권한 부여
GRANT ALL ON audit.member_points_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE audit.member_points_audit_id_seq TO service_role;

-- authenticated 사용자는 자신의 기록만 조회 가능하도록 RLS 설정
ALTER TABLE audit.member_points_audit ENABLE ROW LEVEL SECURITY;

-- RLS 정책: service_role은 모든 접근 가능
CREATE POLICY "service_role_full_access" ON audit.member_points_audit
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RLS 정책: 일반 사용자는 자신의 audit 로그만 조회 가능
CREATE POLICY "users_select_own_audit" ON audit.member_points_audit
    FOR SELECT
    TO authenticated
    USING (member_id = auth.uid());

-- authenticated에 SELECT 권한 부여
GRANT SELECT ON audit.member_points_audit TO authenticated;

-- 트리거 함수 권한
GRANT EXECUTE ON FUNCTION public.log_member_points_audit() TO service_role;

-- =============================================
-- STEP 5: 데이터 보호 (DELETE/UPDATE 차단)
-- =============================================

-- DELETE/UPDATE 방지 트리거 함수
CREATE OR REPLACE FUNCTION audit.prevent_modify()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit.member_points_audit 테이블의 데이터는 삭제할 수 없습니다. (Audit 로그 보호)';
    ELSIF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'audit.member_points_audit 테이블의 데이터는 수정할 수 없습니다. (Audit 로그 보호)';
    END IF;
    RETURN NULL;
END;
$$;

-- 함수 코멘트
COMMENT ON FUNCTION audit.prevent_modify() IS 
    'audit.member_points_audit 테이블의 DELETE/UPDATE를 차단하는 보호 함수';

-- 기존 트리거가 있으면 삭제
DROP TRIGGER IF EXISTS trg_prevent_delete ON audit.member_points_audit;
DROP TRIGGER IF EXISTS trg_prevent_update ON audit.member_points_audit;

-- DELETE 방지 트리거
CREATE TRIGGER trg_prevent_delete
    BEFORE DELETE ON audit.member_points_audit
    FOR EACH ROW
    EXECUTE FUNCTION audit.prevent_modify();

-- UPDATE 방지 트리거
CREATE TRIGGER trg_prevent_update
    BEFORE UPDATE ON audit.member_points_audit
    FOR EACH ROW
    EXECUTE FUNCTION audit.prevent_modify();

-- 트리거 코멘트
COMMENT ON TRIGGER trg_prevent_delete ON audit.member_points_audit IS 
    'Audit 로그 삭제 차단 - 모든 권한에서 DELETE 불가';
COMMENT ON TRIGGER trg_prevent_update ON audit.member_points_audit IS 
    'Audit 로그 수정 차단 - 모든 권한에서 UPDATE 불가';

-- =============================================
-- 완료 메시지
-- =============================================
DO $$
BEGIN
    RAISE NOTICE '✅ 멤버 포인트 Audit 트리거 마이그레이션 완료';
    RAISE NOTICE '   - audit 스키마 생성됨';
    RAISE NOTICE '   - audit.member_points_audit 테이블 생성됨';
    RAISE NOTICE '   - log_member_points_audit() 트리거 함수 생성됨';
    RAISE NOTICE '   - trg_log_member_points_audit 트리거 연결됨';
    RAISE NOTICE '   - RLS 정책 및 권한 설정 완료';
    RAISE NOTICE '   - DELETE/UPDATE 차단 트리거 설정됨 (데이터 보호)';
END $$;
