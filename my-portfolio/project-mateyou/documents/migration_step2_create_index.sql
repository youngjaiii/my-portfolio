-- =============================================
-- STEP 2: STEP 1 완료 후 이 파일 실행하세요
-- =============================================

-- UNIQUE 인덱스 생성 (NULL, 빈문자열, 공백만 있는 값 제외)
CREATE UNIQUE INDEX partner_points_logs_log_id_unique 
ON partner_points_logs(log_id) 
WHERE log_id IS NOT NULL AND LENGTH(TRIM(log_id)) > 0;
