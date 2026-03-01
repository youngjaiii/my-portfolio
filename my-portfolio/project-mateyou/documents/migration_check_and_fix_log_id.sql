-- =============================================
-- 먼저 이 쿼리들을 하나씩 실행해서 상태 확인
-- =============================================

-- 1. 현재 빈 문자열이 몇 개 있는지 확인
SELECT COUNT(*) as empty_string_count
FROM partner_points_logs 
WHERE log_id = '';

-- 2. 기존 인덱스 확인 (있으면 삭제해야 함)
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'partner_points_logs' 
  AND indexname LIKE '%log_id%';

-- =============================================
-- 위 결과 확인 후 아래 순서대로 실행
-- =============================================

-- [A] 인덱스 삭제 (에러 무시)
DROP INDEX IF EXISTS partner_points_logs_log_id_unique;

-- [B] 빈 문자열을 NULL로 강제 변환 (다시 실행)
UPDATE partner_points_logs 
SET log_id = NULL 
WHERE log_id = '';

-- [C] 변환 확인 (0이어야 함)
SELECT COUNT(*) as still_empty
FROM partner_points_logs 
WHERE log_id = '';

-- [D] 중복 log_id 확인 (비어야 함)
SELECT log_id, COUNT(*) 
FROM partner_points_logs 
WHERE log_id IS NOT NULL AND log_id != ''
GROUP BY log_id 
HAVING COUNT(*) > 1
LIMIT 10;

-- =============================================
-- 위 [C]가 0이고 [D]가 비어있으면 아래 실행
-- =============================================

-- [E] 인덱스 생성 (가장 단순한 조건)
CREATE UNIQUE INDEX partner_points_logs_log_id_unique 
ON partner_points_logs(log_id) 
WHERE log_id IS NOT NULL AND log_id <> '';
