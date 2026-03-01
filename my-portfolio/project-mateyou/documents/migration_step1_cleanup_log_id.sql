-- =============================================
-- STEP 1: 먼저 이 파일만 실행하세요
-- =============================================

-- 1-1. 기존 인덱스 삭제 (있으면)
DROP INDEX IF EXISTS partner_points_logs_log_id_unique;

-- 1-2. 빈 문자열/공백만 있는 값을 NULL로 변환
UPDATE partner_points_logs 
SET log_id = NULL 
WHERE log_id IS NULL 
   OR log_id = '' 
   OR TRIM(log_id) = ''
   OR LENGTH(log_id) = 0;

-- 1-3. 변환 확인 (빈값이 없어야 함)
SELECT COUNT(*) as empty_count
FROM partner_points_logs 
WHERE log_id = '' OR TRIM(COALESCE(log_id, '')) = '';

-- 1-4. 중복 확인 (결과가 비어야 함)
SELECT log_id, LENGTH(log_id) as len, COUNT(*) as cnt 
FROM partner_points_logs 
WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0
GROUP BY log_id 
HAVING COUNT(*) > 1;
