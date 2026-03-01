-- timesheet_break_records 마이그레이션 스크립트
-- 기존 timesheet_attendance_records의 break_started_at/break_ended_at 데이터를 
-- timesheet_break_records 테이블로 이전합니다.
-- 
-- 실행 전 주의사항:
-- 1. 이 스크립트는 1회만 실행해야 합니다.
-- 2. 실행 전 백업을 권장합니다.
-- 3. 중복 실행 방지를 위해 NOT EXISTS 조건이 포함되어 있습니다.

-- 마이그레이션: 기존 휴게 데이터를 timesheet_break_records로 복사
-- (완료된 휴게 + 현재 진행중인 휴게 모두 포함)
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
  
  RAISE NOTICE '마이그레이션 완료:';
  RAISE NOTICE '- timesheet_break_records 총 레코드 수: %', total_migrated;
  RAISE NOTICE '- 완료된 휴게: %', completed_breaks;
  RAISE NOTICE '- 현재 진행중인 휴게: %', ongoing_breaks;
END $$;
