-- 매장 테이블에 schedule 컬럼 추가 (JSONB 타입)
-- 이미 존재하면 무시
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'timesheet_stores' 
        AND column_name = 'schedule'
    ) THEN
        ALTER TABLE timesheet_stores ADD COLUMN schedule JSONB DEFAULT NULL;
        COMMENT ON COLUMN timesheet_stores.schedule IS '매장별 근무시간 설정 (JSON 형식)';
    END IF;
END $$;

-- 기본 스케줄 설정 예시 (선택사항)
/*
UPDATE timesheet_stores 
SET schedule = '{
    "weekday_start_hour": 15,
    "weekday_start_minute": 0,
    "weekday_end_hour": 20,
    "weekday_end_minute": 30,
    "weekend_start_hour": 14,
    "weekend_start_minute": 30,
    "weekend_end_hour": 20,
    "weekend_end_minute": 30,
    "late_threshold_minutes": 5,
    "early_leave_threshold_minutes": 5,
    "overtime_threshold_minutes": 30,
    "undertime_threshold_minutes": 30
}'::jsonb
WHERE name LIKE '%메이드%';

UPDATE timesheet_stores 
SET schedule = '{
    "weekday_start_hour": 16,
    "weekday_start_minute": 0,
    "weekday_end_hour": 22,
    "weekday_end_minute": 0,
    "weekend_start_hour": 16,
    "weekend_start_minute": 0,
    "weekend_end_hour": 22,
    "weekend_end_minute": 0,
    "late_threshold_minutes": 5,
    "early_leave_threshold_minutes": 5,
    "overtime_threshold_minutes": 30,
    "undertime_threshold_minutes": 30
}'::jsonb
WHERE name NOT LIKE '%메이드%';
*/

