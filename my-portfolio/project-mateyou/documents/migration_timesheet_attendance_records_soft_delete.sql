-- =====================================================================
-- 출근 기록 소프트 삭제 지원 마이그레이션
-- timesheet_attendance_records 테이블에 is_deleted 필드 추가
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
-- supabase db execute -f documents/migration_timesheet_attendance_records_soft_delete.sql
-- =====================================================================

-- 1. is_deleted 컬럼 추가
ALTER TABLE "public"."timesheet_attendance_records"
ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- 2. 인덱스 추가 (삭제되지 않은 기록 조회 성능 향상)
CREATE INDEX IF NOT EXISTS "idx_timesheet_attendance_records_is_deleted" ON "public"."timesheet_attendance_records" ("is_deleted");

-- 3. 기존 데이터는 모두 삭제되지 않은 상태로 설정 (이미 DEFAULT로 처리됨)
-- 추가 작업 불필요

-- 4. 코멘트 추가
COMMENT ON COLUMN "public"."timesheet_attendance_records"."is_deleted" IS '소프트 삭제 여부 (true: 삭제됨, false: 활성)';