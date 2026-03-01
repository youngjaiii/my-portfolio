-- =====================================================================
-- 근태 생성/삭제 액션 타입 추가 마이그레이션
-- attendance_create, attendance_delete 추가
-- =====================================================================
--
-- ⚠️ 실행 방법:
-- 1. Supabase Dashboard 접속: https://supabase.com/dashboard
-- 2. 프로젝트 선택
-- 3. 좌측 메뉴에서 "SQL Editor" 클릭
-- 4. "New query" 클릭
-- 5. 이 파일의 전체 내용을 복사하여 붙여넣기
-- 6. "Run" 버튼 클릭 (또는 Cmd/Ctrl + Enter)
--
-- 또는 Supabase CLI 사용:
-- supabase db execute -f documents/migration_add_attendance_create_delete_actions.sql
-- =====================================================================
--
-- 📋 변경 사항:
-- - attendance_create: 근태 기록 생성 시 사용
-- - attendance_delete: 근태 기록 삭제 시 사용
-- - attendance_modify: 근태 기록 수정 시에만 사용
--
-- ⚠️ 주의사항:
-- - 기존에 'attendance_modify'로 기록된 생성/삭제 로그는 그대로 유지됩니다
-- - 이 마이그레이션 실행 후부터는 생성/수정/삭제가 구분되어 기록됩니다
-- =====================================================================

-- 'attendance_create' 액션 추가 (근태 기록 생성)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'attendance_create' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'attendance_create';
    END IF;
END $$;

-- 'attendance_delete' 액션 추가 (근태 기록 삭제)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'attendance_delete' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'attendance_delete';
    END IF;
END $$;

-- =====================================================================
-- 마이그레이션 완료
-- =====================================================================
--
-- ✅ 변경 사항:
-- 1. attendance_create 액션 타입 추가
-- 2. attendance_delete 액션 타입 추가
--
-- 📝 참고:
-- - 기존에 'attendance_modify'로 기록된 로그는 그대로 유지됩니다
-- - 이 마이그레이션 실행 후부터는 생성/수정/삭제가 구분되어 기록됩니다
-- - 애플리케이션 코드도 함께 업데이트해야 합니다
-- =====================================================================