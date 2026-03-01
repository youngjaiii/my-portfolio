-- partner_points_logs.log_id에 UNIQUE 인덱스 추가
-- 중복 포인트 적립 방지를 위한 필수 마이그레이션

-- 1. 기존 중복 데이터 확인 (실행 전 체크)
-- SELECT log_id, COUNT(*) as cnt 
-- FROM partner_points_logs 
-- WHERE log_id IS NOT NULL AND log_id != ''
-- GROUP BY log_id 
-- HAVING COUNT(*) > 1;

-- 2. 빈 문자열('')을 NULL로 변환 (중복 방지)
UPDATE partner_points_logs 
SET log_id = NULL 
WHERE log_id = '';

-- 3. 중복이 있다면 먼저 정리 필요 (예: 최신 것만 유지)
-- DELETE FROM partner_points_logs a
-- USING partner_points_logs b
-- WHERE a.id < b.id 
--   AND a.log_id = b.log_id 
--   AND a.log_id IS NOT NULL;

-- 4. UNIQUE 인덱스 생성 (NULL과 빈 문자열 제외)
CREATE UNIQUE INDEX IF NOT EXISTS partner_points_logs_log_id_unique 
ON partner_points_logs(log_id) 
WHERE log_id IS NOT NULL AND log_id != '';

-- 참고: log_id가 NULL이거나 빈 문자열인 경우는 허용 (과거 데이터 호환)
-- WHERE 조건으로 NULL/빈문자열 값은 중복 체크에서 제외
