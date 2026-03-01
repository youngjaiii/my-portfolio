-- ============================================
-- 감사 로그 액션 타입 추가 마이그레이션
-- 새로운 액션: store_activate, store_manager_add, store_manager_remove
-- ============================================

-- 'store_activate' 액션 추가 (가게 활성화)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'store_activate' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'store_activate';
    END IF;
END $$;

-- 'store_manager_add' 액션 추가 (가게에 매니저 추가)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'store_manager_add' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'store_manager_add';
    END IF;
END $$;

-- 'store_manager_remove' 액션 추가 (가게에서 매니저 제거)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'store_manager_remove' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'store_manager_remove';
    END IF;
END $$;

-- 확인용 쿼리 (실행 후 확인)
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action');