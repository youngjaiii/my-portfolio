-- Timesheet 요청 상태에 'cancelled' 추가 및 'attendance_cancel' 액션 추가
-- 파트너+가 요청을 취소할 수 있도록 함

-- ============================================
-- ENUM 타입 수정: 'cancelled' 상태 추가
-- ============================================

-- 기존 ENUM에 'cancelled' 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'cancelled' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_request_status')
    ) THEN
        ALTER TYPE "public"."timesheet_request_status" ADD VALUE 'cancelled';
    END IF;
END $$;

-- ============================================
-- ENUM 타입 수정: 'attendance_cancel' 액션 추가
-- ============================================

-- 기존 ENUM에 'attendance_cancel' 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'attendance_cancel' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_audit_action')
    ) THEN
        ALTER TYPE "public"."timesheet_audit_action" ADD VALUE 'attendance_cancel';
    END IF;
END $$;

