-- Timesheet 시스템 데이터베이스 스키마
-- 모든 테이블은 timesheet_ 접두사를 사용합니다.

-- ============================================
-- 기존 객체 삭제 (재생성용)
-- ============================================

-- 주의: 이 섹션은 기존 데이터를 모두 삭제합니다.
-- 프로덕션 환경에서는 주의해서 사용하세요.

-- 테이블 삭제 (외래 키 제약조건 때문에 순서 중요)
DROP TABLE IF EXISTS "public"."timesheet_settlements" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_audit_logs" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_break_records" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_attendance_records" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_attendance_requests" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_store_managers" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_partner_roles" CASCADE;

DROP TABLE IF EXISTS "public"."timesheet_stores" CASCADE;

-- 함수 삭제
DROP FUNCTION IF EXISTS "public"."update_timesheet_updated_at" () CASCADE;

DROP FUNCTION IF EXISTS "public"."get_timesheet_current_status" (UUID) CASCADE;

DROP FUNCTION IF EXISTS "public"."has_pending_timesheet_request" (UUID) CASCADE;

DROP FUNCTION IF EXISTS "public"."get_timesheet_role" (UUID) CASCADE;

DROP FUNCTION IF EXISTS "public"."calculate_actual_work_minutes" (
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    INTEGER
) CASCADE;

DROP FUNCTION IF EXISTS "public"."update_break_minutes_on_break_end" () CASCADE;

DROP FUNCTION IF EXISTS "public"."calculate_break_duration" () CASCADE;

DROP FUNCTION IF EXISTS "public"."get_total_break_minutes" (UUID) CASCADE;

DROP FUNCTION IF EXISTS "public"."get_current_break" (UUID) CASCADE;

-- ENUM 타입 삭제
DROP TYPE IF EXISTS "public"."timesheet_audit_action" CASCADE;

DROP TYPE IF EXISTS "public"."timesheet_role_type" CASCADE;

DROP TYPE IF EXISTS "public"."timesheet_request_type" CASCADE;

DROP TYPE IF EXISTS "public"."timesheet_request_status" CASCADE;

DROP TYPE IF EXISTS "public"."timesheet_attendance_status" CASCADE;

-- ============================================
-- ENUM 타입 정의
-- ============================================

-- 근태 상태 타입
CREATE TYPE "public"."timesheet_attendance_status" AS ENUM (
    'OFF',
    'WORKING',
    'BREAK'
);

COMMENT ON TYPE "public"."timesheet_attendance_status" IS '근태 상태: OFF(미출근), WORKING(출근중), BREAK(휴게중)';

-- 요청 상태 타입
CREATE TYPE "public"."timesheet_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

COMMENT ON TYPE "public"."timesheet_request_status" IS '요청 처리 상태: pending(대기중), approved(승인됨), rejected(반려됨), cancelled(취소됨)';

-- 역할 타입
CREATE TYPE "public"."timesheet_role_type" AS ENUM (
    'partner_plus',
    'partner_manager'
);

COMMENT ON TYPE "public"."timesheet_role_type" IS 'Timesheet 시스템 내 역할: partner_plus(파트너+), partner_manager(파트너 매니저)';

-- 요청 타입 (근태 상태와 별도)
CREATE TYPE "public"."timesheet_request_type" AS ENUM (
    'WORKING',
    'BREAK',
    'BREAK_END',
    'OFF'
);

COMMENT ON TYPE "public"."timesheet_request_type" IS '근태 요청 타입: WORKING(출근), BREAK(휴게 시작), BREAK_END(휴게 해제), OFF(퇴근)';

-- 감사 로그 액션 타입
CREATE TYPE "public"."timesheet_audit_action" AS ENUM (
    -- 근태 관련
    'attendance_request',
    'attendance_approve',
    'attendance_reject',
    'attendance_cancel',
    'attendance_modify',
    -- 파트너+ 관련
    'partner_plus_add',
    'partner_plus_remove',
    -- 파트너 매니저 관련
    'partner_manager_assign',
    'partner_manager_unassign',
    -- 가게 관련
    'store_create',
    'store_update',
    'store_activate',
    'store_deactivate',
    -- 가게-매니저 관계
    'store_manager_add',
    'store_manager_remove'
);

COMMENT ON TYPE "public"."timesheet_audit_action" IS '감사 로그 액션 타입';

-- 'cancelled' 상태가 없으면 추가 (마이그레이션용)
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

-- 'attendance_cancel' 액션이 없으면 추가 (마이그레이션용)
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

-- ============================================
-- 테이블 생성
-- ============================================

-- 1. 가게 정보
CREATE TABLE IF NOT EXISTS "public"."timesheet_stores" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_stores_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "public"."timesheet_stores" IS '가게(매장) 정보';

COMMENT ON COLUMN "public"."timesheet_stores"."name" IS '가게 이름';

COMMENT ON COLUMN "public"."timesheet_stores"."address" IS '가게 주소';

COMMENT ON COLUMN "public"."timesheet_stores"."phone" IS '연락처';

COMMENT ON COLUMN "public"."timesheet_stores"."is_active" IS '활성화 여부';

-- 2. 파트너 역할 정보
CREATE TABLE IF NOT EXISTS "public"."timesheet_partner_roles" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "member_id" UUID NOT NULL,
    "role_type" "public"."timesheet_role_type" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_partner_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_partner_roles_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE,
    CONSTRAINT "unique_timesheet_partner_roles_member" UNIQUE ("member_id")
);

COMMENT ON TABLE "public"."timesheet_partner_roles" IS '파트너의 Timesheet 시스템 내 역할';

COMMENT ON COLUMN "public"."timesheet_partner_roles"."member_id" IS '회원 ID (members 테이블 참조)';

COMMENT ON COLUMN "public"."timesheet_partner_roles"."role_type" IS '역할 타입: partner_plus, partner_manager';

COMMENT ON COLUMN "public"."timesheet_partner_roles"."is_active" IS '활성화 여부';

-- 3. 가게-매니저 관계
CREATE TABLE IF NOT EXISTS "public"."timesheet_store_managers" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "store_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_store_managers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_store_managers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."timesheet_stores" ("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_store_managers_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE,
    CONSTRAINT "unique_timesheet_store_managers" UNIQUE ("store_id", "manager_id")
);

COMMENT ON TABLE "public"."timesheet_store_managers" IS '가게에 할당된 파트너 매니저';

COMMENT ON COLUMN "public"."timesheet_store_managers"."store_id" IS '가게 ID';

COMMENT ON COLUMN "public"."timesheet_store_managers"."manager_id" IS '매니저 ID (members 테이블 참조)';

COMMENT ON COLUMN "public"."timesheet_store_managers"."is_active" IS '활성화 여부';

-- 4. 근태 요청
CREATE TABLE IF NOT EXISTS "public"."timesheet_attendance_requests" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "partner_plus_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "request_type" "public"."timesheet_request_type" NOT NULL,
    "status" "public"."timesheet_request_status" NOT NULL DEFAULT 'pending',
    "requested_time" TIMESTAMPTZ NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "approved_time" TIMESTAMPTZ,
    "processed_at" TIMESTAMPTZ,
    "processed_by" UUID,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_attendance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_attendance_requests_partner_plus_id_fkey" FOREIGN KEY ("partner_plus_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_attendance_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."timesheet_stores" ("id") ON DELETE RESTRICT,
    CONSTRAINT "timesheet_attendance_requests_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."members" ("id") ON DELETE RESTRICT,
    CONSTRAINT "timesheet_attendance_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."members" ("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."timesheet_attendance_requests" IS '파트너+가 제출한 근태 요청';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."partner_plus_id" IS '파트너+ ID (members 테이블 참조)';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."store_id" IS '가게 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."manager_id" IS '담당 매니저 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."request_type" IS '요청 타입: WORKING(출근), BREAK(휴게 시작), BREAK_END(휴게 해제), OFF(퇴근)';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."status" IS '요청 상태: pending, approved, rejected, cancelled';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."requested_time" IS '파트너+가 입력한 실제 출근/퇴근/휴게 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."requested_at" IS '요청 제출 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."approved_time" IS '매니저가 승인한 시간 (수정된 경우, NULL이면 requested_time 사용)';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."processed_at" IS '처리 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."processed_by" IS '처리한 사람 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_requests"."rejection_reason" IS '반려 사유';

-- 5. 근태 기록
CREATE TABLE IF NOT EXISTS "public"."timesheet_attendance_records" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "partner_plus_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "request_id" UUID,
    "status" "public"."timesheet_attendance_status" NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "break_started_at" TIMESTAMPTZ,
    "break_ended_at" TIMESTAMPTZ,
    "total_break_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "modification_reason" TEXT,
    "modified_by" UUID,
    "modified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_attendance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_attendance_records_partner_plus_id_fkey" FOREIGN KEY ("partner_plus_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_attendance_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."timesheet_stores" ("id") ON DELETE RESTRICT,
    CONSTRAINT "timesheet_attendance_records_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."members" ("id") ON DELETE RESTRICT,
    CONSTRAINT "timesheet_attendance_records_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."timesheet_attendance_requests" ("id") ON DELETE SET NULL,
    CONSTRAINT "timesheet_attendance_records_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "public"."members" ("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."timesheet_attendance_records" IS '승인된 근태 요청을 기반으로 생성되는 실제 근태 기록';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."partner_plus_id" IS '파트너+ ID';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."store_id" IS '가게 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."manager_id" IS '담당 매니저 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."request_id" IS '요청 ID (참조)';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."status" IS '근태 상태';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."started_at" IS '시작 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."ended_at" IS '종료 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."break_started_at" IS '휴게 시작 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."break_ended_at" IS '휴게 종료 시간';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."total_break_minutes" IS '총 휴게 시간 (분 단위). 여러 번의 휴게가 누적됩니다.';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."is_modified" IS '수정 여부';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."modification_reason" IS '수정 사유';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."modified_by" IS '수정한 사람 ID';

COMMENT ON COLUMN "public"."timesheet_attendance_records"."modified_at" IS '수정 시간';

-- 6. 휴게 기록 (여러 번의 휴게를 개별적으로 저장)
CREATE TABLE IF NOT EXISTS "public"."timesheet_break_records" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "duration_minutes" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_break_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_break_records_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."timesheet_attendance_records" ("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."timesheet_break_records" IS '출근 기록에 연결된 휴게 기록. 여러 번의 휴게를 개별적으로 저장합니다.';

COMMENT ON COLUMN "public"."timesheet_break_records"."attendance_record_id" IS '출근 기록 ID';

COMMENT ON COLUMN "public"."timesheet_break_records"."started_at" IS '휴게 시작 시간';

COMMENT ON COLUMN "public"."timesheet_break_records"."ended_at" IS '휴게 종료 시간 (NULL이면 휴게 중)';

COMMENT ON COLUMN "public"."timesheet_break_records"."duration_minutes" IS '휴게 시간 (분 단위). ended_at이 설정될 때 자동 계산됩니다.';

COMMENT ON COLUMN "public"."timesheet_break_records"."is_deleted" IS '삭제 여부 (소프트 삭제)';

-- 8. 감사 로그
CREATE TABLE IF NOT EXISTS "public"."timesheet_audit_logs" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" "public"."timesheet_audit_action" NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."timesheet_audit_logs" IS '모든 중요한 행동을 기록하는 감사 로그';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."actor_id" IS '행위자 ID';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."actor_role" IS '행위자 역할';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."action" IS '행동 타입';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."target_type" IS '대상 타입 (예: attendance_request, store 등)';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."target_id" IS '대상 ID';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."reason" IS '사유';

COMMENT ON COLUMN "public"."timesheet_audit_logs"."metadata" IS '추가 메타데이터 (JSON)';

-- 9. 정산 데이터
CREATE TABLE IF NOT EXISTS "public"."timesheet_settlements" (
    "id" UUID DEFAULT gen_random_uuid () NOT NULL,
    "partner_plus_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "work_hours" DECIMAL(10, 2) NOT NULL,
    "hourly_rate" DECIMAL(10, 2),
    "total_amount" DECIMAL(10, 2),
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now (),
    CONSTRAINT "timesheet_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_settlements_partner_plus_id_fkey" FOREIGN KEY ("partner_plus_id") REFERENCES "public"."members" ("id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_settlements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."timesheet_stores" ("id") ON DELETE RESTRICT,
    CONSTRAINT "timesheet_settlements_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."timesheet_attendance_records" ("id") ON DELETE RESTRICT
);

COMMENT ON TABLE "public"."timesheet_settlements" IS '파트너+의 근태를 기반으로 한 정산 정보';

COMMENT ON COLUMN "public"."timesheet_settlements"."partner_plus_id" IS '파트너+ ID';

COMMENT ON COLUMN "public"."timesheet_settlements"."store_id" IS '가게 ID';

COMMENT ON COLUMN "public"."timesheet_settlements"."attendance_record_id" IS '근태 기록 ID';

COMMENT ON COLUMN "public"."timesheet_settlements"."work_date" IS '근무 일자';

COMMENT ON COLUMN "public"."timesheet_settlements"."work_hours" IS '근무 시간 (시간 단위)';

COMMENT ON COLUMN "public"."timesheet_settlements"."hourly_rate" IS '시급';

COMMENT ON COLUMN "public"."timesheet_settlements"."total_amount" IS '총 금액';

COMMENT ON COLUMN "public"."timesheet_settlements"."is_paid" IS '지급 여부';

COMMENT ON COLUMN "public"."timesheet_settlements"."paid_at" IS '지급 시간';

COMMENT ON COLUMN "public"."timesheet_settlements"."notes" IS '비고';

-- ============================================
-- 인덱스 생성
-- ============================================

-- timesheet_stores 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_stores_is_active" ON "public"."timesheet_stores" ("is_active");

-- timesheet_partner_roles 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_partner_roles_member_id" ON "public"."timesheet_partner_roles" ("member_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_partner_roles_role_type" ON "public"."timesheet_partner_roles" ("role_type");

CREATE INDEX IF NOT EXISTS "idx_timesheet_partner_roles_is_active" ON "public"."timesheet_partner_roles" ("is_active");

-- timesheet_store_managers 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_store_managers_store_id" ON "public"."timesheet_store_managers" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_store_managers_manager_id" ON "public"."timesheet_store_managers" ("manager_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_store_managers_is_active" ON "public"."timesheet_store_managers" ("is_active");

-- timesheet_attendance_requests 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_requests_partner_plus_id" ON "public"."timesheet_attendance_requests" ("partner_plus_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_requests_store_id" ON "public"."timesheet_attendance_requests" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_requests_manager_id" ON "public"."timesheet_attendance_requests" ("manager_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_requests_status" ON "public"."timesheet_attendance_requests" ("status");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_requests_requested_at" ON "public"."timesheet_attendance_requests" ("requested_at");

-- timesheet_attendance_records 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_partner_plus_id" ON "public"."timesheet_attendance_records" ("partner_plus_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_store_id" ON "public"."timesheet_attendance_records" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_manager_id" ON "public"."timesheet_attendance_records" ("manager_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_started_at" ON "public"."timesheet_attendance_records" ("started_at");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_status" ON "public"."timesheet_attendance_records" ("status");

CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_total_break" ON "public"."timesheet_attendance_records" ("total_break_minutes");

-- timesheet_break_records 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_break_records_attendance_record_id" ON "public"."timesheet_break_records" ("attendance_record_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_break_records_started_at" ON "public"."timesheet_break_records" ("started_at");

CREATE INDEX IF NOT EXISTS "idx_timesheet_break_records_is_deleted" ON "public"."timesheet_break_records" ("is_deleted");

-- timesheet_audit_logs 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_audit_logs_actor_id" ON "public"."timesheet_audit_logs" ("actor_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_audit_logs_action" ON "public"."timesheet_audit_logs" ("action");

CREATE INDEX IF NOT EXISTS "idx_timesheet_audit_logs_created_at" ON "public"."timesheet_audit_logs" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_timesheet_audit_logs_target" ON "public"."timesheet_audit_logs" ("target_type", "target_id");

-- timesheet_settlements 인덱스
CREATE INDEX IF NOT EXISTS "idx_timesheet_settlements_partner_plus_id" ON "public"."timesheet_settlements" ("partner_plus_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_settlements_store_id" ON "public"."timesheet_settlements" ("store_id");

CREATE INDEX IF NOT EXISTS "idx_timesheet_settlements_work_date" ON "public"."timesheet_settlements" ("work_date");

CREATE INDEX IF NOT EXISTS "idx_timesheet_settlements_is_paid" ON "public"."timesheet_settlements" ("is_paid");

-- ============================================
-- 트리거 함수: updated_at 자동 업데이트
-- ============================================

CREATE OR REPLACE FUNCTION "public"."update_timesheet_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 트리거 적용
CREATE TRIGGER "trigger_timesheet_stores_updated_at"
    BEFORE UPDATE ON "public"."timesheet_stores"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_partner_roles_updated_at"
    BEFORE UPDATE ON "public"."timesheet_partner_roles"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_store_managers_updated_at"
    BEFORE UPDATE ON "public"."timesheet_store_managers"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_attendance_requests_updated_at"
    BEFORE UPDATE ON "public"."timesheet_attendance_requests"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_attendance_records_updated_at"
    BEFORE UPDATE ON "public"."timesheet_attendance_records"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_settlements_updated_at"
    BEFORE UPDATE ON "public"."timesheet_settlements"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

CREATE TRIGGER "trigger_timesheet_break_records_updated_at"
    BEFORE UPDATE ON "public"."timesheet_break_records"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_timesheet_updated_at"();

-- ============================================
-- 유틸리티 함수
-- ============================================

-- 파트너+의 현재 근태 상태 조회 함수
CREATE OR REPLACE FUNCTION "public"."get_timesheet_current_status"(
    p_partner_plus_id UUID
)
RETURNS "public"."timesheet_attendance_status" AS $$
DECLARE
    v_status "public"."timesheet_attendance_status";
BEGIN
    SELECT status INTO v_status
    FROM "public"."timesheet_attendance_records"
    WHERE partner_plus_id = p_partner_plus_id
        AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
    
    RETURN COALESCE(v_status, 'OFF'::"public"."timesheet_attendance_status");
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION "public"."get_timesheet_current_status" IS '파트너+의 현재 근태 상태를 조회합니다. 기록이 없으면 OFF를 반환합니다.';

-- 승인 대기 중인 요청이 있는지 확인하는 함수
CREATE OR REPLACE FUNCTION "public"."has_pending_timesheet_request"(
    p_partner_plus_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM "public"."timesheet_attendance_requests"
    WHERE partner_plus_id = p_partner_plus_id
        AND status = 'pending';
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION "public"."has_pending_timesheet_request" IS '파트너+에게 승인 대기 중인 요청이 있는지 확인합니다.';

-- ============================================
-- 실 근무시간 계산 함수 (휴게 시간 제외)
-- ============================================

CREATE OR REPLACE FUNCTION "public"."calculate_actual_work_minutes"(
    p_started_at TIMESTAMPTZ,
    p_ended_at TIMESTAMPTZ,
    p_total_break_minutes INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_total_minutes INTEGER;
BEGIN
    IF p_ended_at IS NULL THEN
        -- 아직 퇴근 전이면 현재 시간까지 계산
        v_total_minutes := EXTRACT(EPOCH FROM (now() - p_started_at)) / 60;
    ELSE
        v_total_minutes := EXTRACT(EPOCH FROM (p_ended_at - p_started_at)) / 60;
    END IF;
    
    -- 휴게 시간 차감
    RETURN GREATEST(0, v_total_minutes - COALESCE(p_total_break_minutes, 0));
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION "public"."calculate_actual_work_minutes" IS '실 근무시간을 분 단위로 계산합니다. 휴게 시간을 차감한 순수 근무시간을 반환합니다.';

-- ============================================
-- 휴게 기록 관련 함수
-- ============================================

-- 휴게 종료 시 duration_minutes 자동 계산 트리거 함수
CREATE OR REPLACE FUNCTION "public"."calculate_break_duration"()
RETURNS TRIGGER AS $$
BEGIN
    -- ended_at이 설정될 때 duration_minutes 계산
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trigger_calculate_break_duration"
    BEFORE INSERT OR UPDATE ON "public"."timesheet_break_records"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."calculate_break_duration"();

-- 출근 기록의 총 휴게 시간 계산 함수
CREATE OR REPLACE FUNCTION "public"."get_total_break_minutes"(
    p_attendance_record_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN duration_minutes IS NOT NULL THEN duration_minutes
            WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
            ELSE 0
        END
    ), 0)::INTEGER INTO v_total
    FROM "public"."timesheet_break_records"
    WHERE attendance_record_id = p_attendance_record_id
      AND is_deleted = false;
    
    RETURN v_total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION "public"."get_total_break_minutes" IS '출근 기록의 총 휴게 시간을 분 단위로 계산합니다.';

-- 현재 진행 중인 휴게 조회 함수
CREATE OR REPLACE FUNCTION "public"."get_current_break"(
    p_attendance_record_id UUID
)
RETURNS "public"."timesheet_break_records" AS $$
DECLARE
    v_break "public"."timesheet_break_records";
BEGIN
    SELECT * INTO v_break
    FROM "public"."timesheet_break_records"
    WHERE attendance_record_id = p_attendance_record_id
      AND ended_at IS NULL
      AND is_deleted = false
    ORDER BY started_at DESC
    LIMIT 1;
    
    RETURN v_break;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION "public"."get_current_break" IS '현재 진행 중인 휴게를 조회합니다.';

-- ============================================
-- 휴게 종료 시 누적 시간 업데이트 트리거
-- ============================================

-- 휴게 종료 시 total_break_minutes를 자동으로 업데이트하는 함수
CREATE OR REPLACE FUNCTION "public"."update_break_minutes_on_break_end"()
RETURNS TRIGGER AS $$
DECLARE
    v_break_duration INTEGER;
BEGIN
    -- 휴게가 종료되었을 때 (BREAK -> WORKING 또는 BREAK -> OFF)
    -- break_ended_at이 새로 설정되고, break_started_at이 있는 경우
    IF NEW.break_ended_at IS NOT NULL 
       AND OLD.break_ended_at IS NULL 
       AND NEW.break_started_at IS NOT NULL THEN
        
        -- 이번 휴게 시간 계산 (분 단위)
        v_break_duration := EXTRACT(EPOCH FROM (NEW.break_ended_at - NEW.break_started_at)) / 60;
        
        -- 기존 휴게 시간에 누적
        NEW.total_break_minutes := COALESCE(OLD.total_break_minutes, 0) + v_break_duration;
        
        -- 다음 휴게를 위해 break_started_at, break_ended_at 초기화
        -- (새로운 휴게가 시작될 수 있도록)
        -- 주의: break_started_at과 break_ended_at은 "마지막 휴게" 정보를 유지
        -- 필요시 초기화하지 않고 유지할 수도 있음
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 휴게 시간 업데이트 트리거
CREATE TRIGGER "trigger_update_break_minutes"
    BEFORE UPDATE ON "public"."timesheet_attendance_records"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_break_minutes_on_break_end"();

-- ============================================
-- Row Level Security (RLS) 정책
-- ============================================

-- RLS 활성화
ALTER TABLE "public"."timesheet_stores" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_partner_roles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_store_managers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_attendance_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_attendance_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_break_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_audit_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timesheet_settlements" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper 함수: 사용자의 Timesheet 역할 확인
-- ============================================

CREATE OR REPLACE FUNCTION "public"."get_timesheet_role"(
    p_member_id UUID
)
RETURNS "public"."timesheet_role_type" AS $$
DECLARE
    v_role "public"."timesheet_role_type";
    v_member_role "public"."member_role";
BEGIN
    -- 먼저 members 테이블에서 role 확인
    SELECT role INTO v_member_role
    FROM "public"."members"
    WHERE id = p_member_id;
    
    -- admin은 모든 권한
    IF v_member_role = 'admin' THEN
        RETURN NULL; -- admin은 별도 처리
    END IF;
    
    -- 모든 사용자가 timesheet 역할을 가질 수 있음 (파트너 여부와 무관)
    SELECT role_type INTO v_role
    FROM "public"."timesheet_partner_roles"
    WHERE member_id = p_member_id
        AND is_active = true;
    
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION "public"."get_timesheet_role" IS '사용자의 Timesheet 시스템 내 역할을 반환합니다.';

-- 파트너+ 역할 확인 함수 (RLS 우회용)
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

-- 파트너 매니저 역할 확인 함수 (RLS 우회용)
CREATE OR REPLACE FUNCTION "public"."is_partner_manager"(
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
        AND role_type = 'partner_manager'
        AND is_active = true;
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION "public"."is_partner_manager" IS '사용자가 파트너 매니저 역할을 가지고 있는지 확인합니다. RLS를 우회하여 무한 재귀를 방지합니다.';

-- ============================================
-- RLS 정책: timesheet_stores
-- ============================================

-- 어드민: 모든 가게 조회/수정 가능
CREATE POLICY "timesheet_stores_admin_all" ON "public"."timesheet_stores" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너 매니저, 파트너M: 할당된 가게만 조회 가능
CREATE POLICY "timesheet_stores_manager_select" ON "public"."timesheet_stores" FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM "public"."timesheet_store_managers"
            WHERE
                store_id = timesheet_stores.id
                AND manager_id = auth.uid ()
                AND is_active = true
        )
        OR EXISTS (
            SELECT 1
            FROM "public"."members"
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- 파트너+: 모든 활성 가게 조회 가능 (출근요청 시 필요)
-- SECURITY DEFINER 함수를 사용하여 무한 재귀 방지
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

-- 파트너 매니저: 모든 가게 조회 가능 (통계 필터용)
CREATE POLICY "timesheet_stores_manager_all_select" ON "public"."timesheet_stores" FOR
SELECT USING (
        "public"."is_partner_manager" (auth.uid ())
    );

-- ============================================
-- RLS 정책: timesheet_partner_roles
-- ============================================

-- 어드민: 모든 역할 조회/수정 가능
CREATE POLICY "timesheet_partner_roles_admin_all" ON "public"."timesheet_partner_roles" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 본인: 자신의 역할 조회 가능
CREATE POLICY "timesheet_partner_roles_self_select" ON "public"."timesheet_partner_roles" FOR
SELECT USING (member_id = auth.uid ());

-- 파트너 매니저: 자신이 관리하는 파트너+ 역할 조회 가능
CREATE POLICY "timesheet_partner_roles_manager_select" ON "public"."timesheet_partner_roles" FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM "public"."timesheet_store_managers" tsm
                JOIN "public"."timesheet_attendance_requests" tar ON tar.store_id = tsm.store_id
            WHERE
                tsm.manager_id = auth.uid ()
                AND tar.partner_plus_id = timesheet_partner_roles.member_id
                AND tsm.is_active = true
        )
    );

-- 파트너 매니저: 모든 파트너+ 역할 조회/추가/삭제 가능 (admin처럼)
CREATE POLICY "timesheet_partner_roles_manager_all" ON "public"."timesheet_partner_roles" FOR ALL USING (
    "public"."is_partner_manager" (auth.uid ())
);

-- ============================================
-- RLS 정책: timesheet_store_managers
-- ============================================

-- 어드민: 모든 관계 조회/수정 가능
CREATE POLICY "timesheet_store_managers_admin_all" ON "public"."timesheet_store_managers" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 매니저: 자신이 할당된 가게 관계 조회 가능
CREATE POLICY "timesheet_store_managers_self_select" ON "public"."timesheet_store_managers" FOR
SELECT USING (manager_id = auth.uid ());

-- 파트너+: 가게에 할당된 매니저 조회 가능 (출근요청 시 필요)
-- SECURITY DEFINER 함수를 사용하여 무한 재귀 방지
CREATE POLICY "timesheet_store_managers_partner_plus_select" ON "public"."timesheet_store_managers" FOR
SELECT USING (
        is_active = true
        AND "public"."is_partner_plus" (auth.uid ())
    );

-- ============================================
-- RLS 정책: timesheet_attendance_requests
-- ============================================

-- 어드민: 모든 요청 조회/수정 가능
CREATE POLICY "timesheet_attendance_requests_admin_all" ON "public"."timesheet_attendance_requests" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너+: 자신의 요청 조회/생성 가능
CREATE POLICY "timesheet_attendance_requests_partner_plus" ON "public"."timesheet_attendance_requests" FOR ALL USING (partner_plus_id = auth.uid ())
WITH
    CHECK (partner_plus_id = auth.uid ());

-- 파트너 매니저: 담당 파트너+의 요청 조회/수정 가능
-- 자신이 직접 담당한 요청 또는 자신이 관리하는 가게에서 발생한 모든 요청을 볼 수 있음
CREATE POLICY "timesheet_attendance_requests_manager" ON "public"."timesheet_attendance_requests" FOR ALL USING (
    -- 자신이 직접 담당한 요청
    manager_id = auth.uid ()
    -- 또는 자신이 관리하는 가게에서 발생한 요청
    OR EXISTS (
        SELECT 1
        FROM "public"."timesheet_store_managers" tsm
        WHERE
            tsm.store_id = timesheet_attendance_requests.store_id
            AND tsm.manager_id = auth.uid ()
            AND tsm.is_active = true
    )
    -- 또는 어드민
    OR EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- ============================================
-- RLS 정책: timesheet_attendance_records
-- ============================================

-- 어드민: 모든 기록 조회/수정 가능
CREATE POLICY "timesheet_attendance_records_admin_all" ON "public"."timesheet_attendance_records" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너+: 자신의 기록 조회 가능
CREATE POLICY "timesheet_attendance_records_partner_plus_select" ON "public"."timesheet_attendance_records" FOR
SELECT USING (partner_plus_id = auth.uid ());

-- 파트너 매니저, 파트너M: 같은 가게의 매니저라면 해당 가게의 모든 출근 기록 조회/수정 가능
CREATE POLICY "timesheet_attendance_records_manager" ON "public"."timesheet_attendance_records" FOR ALL USING (
    -- 현재 사용자가 해당 출근 기록의 가게에 할당된 매니저인지 확인
    EXISTS (
        SELECT 1
        FROM "public"."timesheet_store_managers" tsm
        WHERE
            tsm.store_id = timesheet_attendance_records.store_id
            AND tsm.manager_id = auth.uid ()
            AND tsm.is_active = true
    )
    OR EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너 매니저: 모든 출근 기록 조회/수정 가능 (통계용)
CREATE POLICY "timesheet_attendance_records_manager_all" ON "public"."timesheet_attendance_records" FOR ALL USING (
    "public"."is_partner_manager" (auth.uid ())
);

-- ============================================
-- RLS 정책: timesheet_break_records
-- ============================================

-- 어드민: 모든 휴게 기록 조회/수정 가능
CREATE POLICY "timesheet_break_records_admin_all" ON "public"."timesheet_break_records" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너+: 자신의 출근 기록에 연결된 휴게 조회 가능
CREATE POLICY "timesheet_break_records_partner_plus_select" ON "public"."timesheet_break_records" FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM "public"."timesheet_attendance_records" tar
            WHERE
                tar.id = timesheet_break_records.attendance_record_id
                AND tar.partner_plus_id = auth.uid ()
        )
    );

-- 파트너 매니저: 관리하는 가게의 출근 기록에 연결된 휴게 조회/수정 가능
CREATE POLICY "timesheet_break_records_manager" ON "public"."timesheet_break_records" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."timesheet_attendance_records" tar
            JOIN "public"."timesheet_store_managers" tsm ON tsm.store_id = tar.store_id
        WHERE
            tar.id = timesheet_break_records.attendance_record_id
            AND tsm.manager_id = auth.uid ()
            AND tsm.is_active = true
    )
    OR EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM "public"."timesheet_attendance_records" tar
            JOIN "public"."timesheet_store_managers" tsm ON tsm.store_id = tar.store_id
        WHERE
            tar.id = attendance_record_id
            AND tsm.manager_id = auth.uid ()
            AND tsm.is_active = true
    )
    OR EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너 매니저: 모든 휴게 기록 조회/수정 가능 (통계용)
CREATE POLICY "timesheet_break_records_manager_all" ON "public"."timesheet_break_records" FOR ALL USING (
    "public"."is_partner_manager" (auth.uid ())
)
WITH CHECK (
    "public"."is_partner_manager" (auth.uid ())
);

-- ============================================
-- RLS 정책: timesheet_audit_logs
-- ============================================

-- 어드민: 모든 로그 조회 가능
CREATE POLICY "timesheet_audit_logs_admin_select" ON "public"."timesheet_audit_logs" FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM "public"."members"
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- 파트너 매니저: 자신이 관련된 로그 조회 가능
CREATE POLICY "timesheet_audit_logs_manager_select" ON "public"."timesheet_audit_logs" FOR
SELECT USING (
        actor_id = auth.uid ()
        OR EXISTS (
            SELECT 1
            FROM "public"."timesheet_store_managers" tsm
            WHERE
                tsm.manager_id = auth.uid ()
                AND tsm.is_active = true
        )
    );

-- 파트너+: 자신이 관련된 로그 조회 가능
CREATE POLICY "timesheet_audit_logs_partner_plus_select" ON "public"."timesheet_audit_logs" FOR
SELECT USING (actor_id = auth.uid ());

-- 모든 인증된 사용자: 로그 생성 가능 (서버 사이드에서만)
CREATE POLICY "timesheet_audit_logs_insert" ON "public"."timesheet_audit_logs" FOR INSERT
WITH
    CHECK (true);

-- ============================================
-- RLS 정책: timesheet_settlements
-- ============================================

-- 어드민: 모든 정산 조회/수정 가능
CREATE POLICY "timesheet_settlements_admin_all" ON "public"."timesheet_settlements" FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM "public"."members"
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 파트너 매니저: 담당 파트너+의 정산 조회 가능
CREATE POLICY "timesheet_settlements_manager_select" ON "public"."timesheet_settlements" FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM "public"."timesheet_attendance_records" tar
            WHERE
                tar.id = timesheet_settlements.attendance_record_id
                AND tar.manager_id = auth.uid ()
        )
        OR EXISTS (
            SELECT 1
            FROM "public"."members"
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- 파트너+: 정산 조회 불가 (요구사항에 따라)

-- ============================================
-- Realtime 활성화
-- ============================================
-- Supabase Realtime을 사용하려면 테이블을 supabase_realtime publication에 추가해야 합니다.

-- 1. Replica Identity 설정 (UPDATE/DELETE 이벤트 시 전체 행 데이터를 받기 위해 필요)
ALTER TABLE "public"."timesheet_attendance_requests" REPLICA IDENTITY FULL;

ALTER TABLE "public"."timesheet_attendance_records" REPLICA IDENTITY FULL;

ALTER TABLE "public"."timesheet_break_records" REPLICA IDENTITY FULL;

-- 2. supabase_realtime publication에 테이블 추가
DO $$
BEGIN
    -- timesheet_attendance_requests 테이블 추가
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'timesheet_attendance_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "public"."timesheet_attendance_requests";
        RAISE NOTICE 'timesheet_attendance_requests 테이블이 supabase_realtime publication에 추가되었습니다.';
    ELSE
        RAISE NOTICE 'timesheet_attendance_requests 테이블이 이미 supabase_realtime publication에 있습니다.';
    END IF;

    -- timesheet_attendance_records 테이블 추가
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'timesheet_attendance_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "public"."timesheet_attendance_records";
        RAISE NOTICE 'timesheet_attendance_records 테이블이 supabase_realtime publication에 추가되었습니다.';
    ELSE
        RAISE NOTICE 'timesheet_attendance_records 테이블이 이미 supabase_realtime publication에 있습니다.';
    END IF;

    -- timesheet_break_records 테이블 추가
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'timesheet_break_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "public"."timesheet_break_records";
        RAISE NOTICE 'timesheet_break_records 테이블이 supabase_realtime publication에 추가되었습니다.';
    ELSE
        RAISE NOTICE 'timesheet_break_records 테이블이 이미 supabase_realtime publication에 있습니다.';
    END IF;
END $$;

-- ============================================
-- 데이터 마이그레이션: 기존 휴게 데이터를 timesheet_break_records로 이전
-- ============================================
-- 
-- 주의: 이 스크립트는 기존 timesheet_attendance_records의 break_started_at/break_ended_at 
-- 데이터를 timesheet_break_records 테이블로 이전합니다.
-- - 완료된 휴게 (break_ended_at IS NOT NULL)
-- - 현재 진행중인 휴게 (break_ended_at IS NULL)
-- 모두 포함됩니다.
-- 
-- 중복 실행 방지를 위해 NOT EXISTS 조건이 포함되어 있습니다.

INSERT INTO timesheet_break_records (
  attendance_record_id,
  started_at,
  ended_at,
  duration_minutes,
  is_deleted,
  created_at,
  updated_at
)
SELECT 
  ar.id AS attendance_record_id,
  ar.break_started_at AS started_at,
  ar.break_ended_at AS ended_at,  -- 진행중인 휴게는 NULL
  CASE 
    WHEN ar.break_started_at IS NOT NULL AND ar.break_ended_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (ar.break_ended_at - ar.break_started_at)) / 60
    ELSE NULL  -- 진행중인 휴게는 duration도 NULL
  END AS duration_minutes,
  false AS is_deleted,
  COALESCE(ar.created_at, NOW()) AS created_at,
  NOW() AS updated_at
FROM timesheet_attendance_records ar
WHERE 
  -- break_started_at이 있는 모든 경우 (진행중 + 완료 모두)
  ar.break_started_at IS NOT NULL 
  -- 이미 이전된 데이터가 없는 경우만 실행 (중복 방지)
  AND NOT EXISTS (
    SELECT 1 
    FROM timesheet_break_records br 
    WHERE br.attendance_record_id = ar.id
  );

-- 마이그레이션 결과 확인
DO $$
DECLARE
  total_migrated INTEGER;
  completed_breaks INTEGER;
  ongoing_breaks INTEGER;
BEGIN
  -- 총 이전된 휴게 기록 수
  SELECT COUNT(*) INTO total_migrated FROM timesheet_break_records;
  
  -- 완료된 휴게 (ended_at이 있는)
  SELECT COUNT(*) INTO completed_breaks 
  FROM timesheet_break_records 
  WHERE ended_at IS NOT NULL;
  
  -- 진행중인 휴게 (ended_at이 NULL인)
  SELECT COUNT(*) INTO ongoing_breaks 
  FROM timesheet_break_records 
  WHERE ended_at IS NULL AND is_deleted = false;
  
  RAISE NOTICE '휴게 데이터 마이그레이션 완료:';
  RAISE NOTICE '- timesheet_break_records 총 레코드 수: %', total_migrated;
  RAISE NOTICE '- 완료된 휴게: %', completed_breaks;
  RAISE NOTICE '- 현재 진행중인 휴게: %', ongoing_breaks;
END $$;