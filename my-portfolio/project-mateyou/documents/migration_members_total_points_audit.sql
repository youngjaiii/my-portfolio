-- =============================================
-- members.total_points 2중 감사 시스템
-- 목적: total_points 변경 시 세션/연결/변경 정보를 상세 기록
-- =============================================

-- =============================================
-- STEP 0: 기존 리소스 삭제
-- =============================================

-- 기존 트리거 삭제
DROP TRIGGER IF EXISTS trg_audit_total_points_change ON public.members;
DROP TRIGGER IF EXISTS trg_prevent_total_points_changes_delete ON audit.members_total_points_changes;
DROP TRIGGER IF EXISTS trg_prevent_total_points_changes_update ON audit.members_total_points_changes;

-- 기존 테이블 삭제
DROP TABLE IF EXISTS audit.members_total_points_changes CASCADE;

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS audit.log_total_points_change() CASCADE;
DROP FUNCTION IF EXISTS audit.prevent_total_points_changes_modify() CASCADE;

-- =============================================
-- STEP 1: audit 스키마 확인
-- =============================================

CREATE SCHEMA IF NOT EXISTS audit;

-- =============================================
-- STEP 2: 새 audit 테이블 생성
-- =============================================

CREATE TABLE audit.members_total_points_changes (
    id BIGSERIAL PRIMARY KEY,
    -- 대상 멤버 정보
    member_id UUID NOT NULL,
    -- 포인트 변경 정보
    old_total_points INTEGER,
    new_total_points INTEGER,
    change_amount INTEGER,
    -- 변경된 컬럼 목록
    changed_columns TEXT[],
    -- 세션/역할 정보
    session_user_name TEXT,
    current_user_name TEXT,
    -- 연결 정보
    client_ip INET,
    client_port INTEGER,
    application_name TEXT,
    -- 트랜잭션 정보
    txid BIGINT,
    stmt_timestamp TIMESTAMPTZ,
    -- OLD/NEW 전체 row (JSONB)
    old_row JSONB,
    new_row JSONB,
    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 인덱스 생성
CREATE INDEX idx_mtp_changes_member_id 
    ON audit.members_total_points_changes(member_id);

CREATE INDEX idx_mtp_changes_created_at 
    ON audit.members_total_points_changes(created_at DESC);

CREATE INDEX idx_mtp_changes_txid 
    ON audit.members_total_points_changes(txid);

CREATE INDEX idx_mtp_changes_session_user 
    ON audit.members_total_points_changes(session_user_name);

-- 테이블 코멘트
COMMENT ON TABLE audit.members_total_points_changes IS 'members.total_points 변경 2중 감사 로그';
COMMENT ON COLUMN audit.members_total_points_changes.member_id IS '변경된 멤버 UUID';
COMMENT ON COLUMN audit.members_total_points_changes.old_total_points IS '변경 전 포인트';
COMMENT ON COLUMN audit.members_total_points_changes.new_total_points IS '변경 후 포인트';
COMMENT ON COLUMN audit.members_total_points_changes.change_amount IS '변경량 (new - old)';
COMMENT ON COLUMN audit.members_total_points_changes.changed_columns IS '변경된 컬럼 이름 배열';
COMMENT ON COLUMN audit.members_total_points_changes.session_user_name IS 'PostgreSQL session_user';
COMMENT ON COLUMN audit.members_total_points_changes.current_user_name IS 'PostgreSQL current_user';
COMMENT ON COLUMN audit.members_total_points_changes.client_ip IS '클라이언트 IP (inet_client_addr)';
COMMENT ON COLUMN audit.members_total_points_changes.client_port IS '클라이언트 포트 (inet_client_port)';
COMMENT ON COLUMN audit.members_total_points_changes.application_name IS '연결 애플리케이션 이름';
COMMENT ON COLUMN audit.members_total_points_changes.txid IS '트랜잭션 ID (txid_current)';
COMMENT ON COLUMN audit.members_total_points_changes.stmt_timestamp IS 'SQL 문 실행 시각 (statement_timestamp)';
COMMENT ON COLUMN audit.members_total_points_changes.old_row IS '변경 전 row 전체 (JSONB)';
COMMENT ON COLUMN audit.members_total_points_changes.new_row IS '변경 후 row 전체 (JSONB)';
COMMENT ON COLUMN audit.members_total_points_changes.created_at IS '로그 기록 시각';

-- =============================================
-- STEP 3: Row 트리거 함수 생성
-- =============================================

CREATE OR REPLACE FUNCTION audit.log_total_points_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_changed_columns TEXT[] := '{}';
    v_old_row JSONB;
    v_new_row JSONB;
    col_name TEXT;
    col_list TEXT[] := ARRAY[
        'total_points', 'name', 'role', 'profile_image',
        'favorite_game', 'game_info', 'greeting',
        'current_status', 'updated_at'
    ];
BEGIN
    -- total_points가 변경되지 않았으면 무시
    IF OLD.total_points IS NOT DISTINCT FROM NEW.total_points THEN
        RETURN NEW;
    END IF;

    -- OLD/NEW를 JSONB로 변환
    v_old_row := to_jsonb(OLD);
    v_new_row := to_jsonb(NEW);

    -- 변경된 컬럼 목록 자동 감지
    FOREACH col_name IN ARRAY col_list
    LOOP
        IF (v_old_row ->> col_name) IS DISTINCT FROM (v_new_row ->> col_name) THEN
            v_changed_columns := array_append(v_changed_columns, col_name);
        END IF;
    END LOOP;

    -- audit 테이블에 기록
    INSERT INTO audit.members_total_points_changes (
        member_id,
        old_total_points,
        new_total_points,
        change_amount,
        changed_columns,
        session_user_name,
        current_user_name,
        client_ip,
        client_port,
        application_name,
        txid,
        stmt_timestamp,
        old_row,
        new_row,
        created_at
    ) VALUES (
        NEW.id,
        OLD.total_points,
        NEW.total_points,
        COALESCE(NEW.total_points, 0) - COALESCE(OLD.total_points, 0),
        v_changed_columns,
        session_user,
        current_user,
        inet_client_addr(),
        inet_client_port(),
        current_setting('application_name', true),
        txid_current(),
        statement_timestamp(),
        v_old_row,
        v_new_row,
        NOW()
    );

    RETURN NEW;
END;
$$;

-- 함수 코멘트
COMMENT ON FUNCTION audit.log_total_points_change() IS 
    'members.total_points 변경 시 세션/연결/변경 정보를 상세 기록하는 Row 트리거 함수';

-- =============================================
-- STEP 4: 트리거 연결
-- =============================================

CREATE TRIGGER trg_audit_total_points_change
    AFTER UPDATE OF total_points ON public.members
    FOR EACH ROW
    EXECUTE FUNCTION audit.log_total_points_change();

COMMENT ON TRIGGER trg_audit_total_points_change ON public.members IS 
    'members.total_points 변경 시 2중 감사 로그 기록';

-- =============================================
-- STEP 5: pgAudit 확장 활성화
-- =============================================

-- pgAudit 확장 활성화 (Supabase 공식 지원)
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- ⚠️ pgAudit 로그 설정은 Supabase SQL Editor에서 실행 불가 (트랜잭션 제한)
-- 아래 두 줄을 psql 직접 연결 또는 별도 세션에서 실행하세요:
--   ALTER SYSTEM SET pgaudit.log = 'write';
--   SELECT pg_reload_conf();

-- =============================================
-- STEP 6: 권한 설정
-- =============================================

-- audit 스키마 권한
GRANT USAGE ON SCHEMA audit TO service_role;
GRANT USAGE ON SCHEMA audit TO authenticated;

-- 테이블 소유자
ALTER TABLE audit.members_total_points_changes OWNER TO postgres;

-- service_role 권한 (INSERT, SELECT만)
GRANT INSERT, SELECT ON audit.members_total_points_changes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE audit.members_total_points_changes_id_seq TO service_role;

-- RLS 설정
ALTER TABLE audit.members_total_points_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON audit.members_total_points_changes;
CREATE POLICY "service_role_full_access" ON audit.members_total_points_changes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "users_select_own_changes" ON audit.members_total_points_changes;
CREATE POLICY "users_select_own_changes" ON audit.members_total_points_changes
    FOR SELECT
    TO authenticated
    USING (member_id = auth.uid());

GRANT SELECT ON audit.members_total_points_changes TO authenticated;

-- 트리거 함수 권한
GRANT EXECUTE ON FUNCTION audit.log_total_points_change() TO service_role;

-- =============================================
-- 완료 메시지
-- =============================================
DO $$
BEGIN
    RAISE NOTICE '✅ members.total_points 2중 감사 시스템 마이그레이션 완료';
    RAISE NOTICE '   - 기존 트리거/테이블/함수 삭제됨';
    RAISE NOTICE '   - audit.members_total_points_changes 테이블 재생성됨';
    RAISE NOTICE '   - Row 트리거 (세션/연결/OLD/NEW 기록) 설정됨';
    RAISE NOTICE '   - pgAudit 확장 활성화됨';
    RAISE NOTICE '   - RLS 정책 및 권한 설정 완료';
END $$;
