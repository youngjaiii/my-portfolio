-- =============================================
-- 🚨 운영 서버용: 중복 log_id 안전 처리
-- 데이터 삭제 없음, 중복 log_id만 NULL로 변경
-- =============================================

-- [STEP 1] 빈 문자열 → NULL 변환 (444개)
UPDATE partner_points_logs 
SET log_id = NULL 
WHERE log_id = '' OR log_id = '''''' OR TRIM(log_id) = '';

-- [STEP 2] 중복 log_id 처리 - 가장 오래된 것만 유지, 나머지는 NULL로
-- (데이터는 보존, log_id만 NULL로 변경)
WITH duplicates AS (
  SELECT id, log_id,
    ROW_NUMBER() OVER (PARTITION BY log_id ORDER BY created_at ASC, id ASC) as rn
  FROM partner_points_logs
  WHERE log_id IS NOT NULL 
    AND log_id != ''
    AND TRIM(log_id) != ''
)
UPDATE partner_points_logs p
SET log_id = NULL
FROM duplicates d
WHERE p.id = d.id 
  AND d.rn > 1;  -- 첫 번째(가장 오래된 것) 제외하고 나머지만 NULL로

-- [STEP 3] 확인 - 중복 없어야 함
SELECT log_id, COUNT(*) 
FROM partner_points_logs 
WHERE log_id IS NOT NULL AND log_id != ''
GROUP BY log_id 
HAVING COUNT(*) > 1;

-- [STEP 4] 위 결과가 비어있으면 인덱스 생성
DROP INDEX IF EXISTS partner_points_logs_log_id_unique;

CREATE UNIQUE INDEX partner_points_logs_log_id_unique 
ON partner_points_logs(log_id) 
WHERE log_id IS NOT NULL AND log_id <> '';
