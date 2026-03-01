-- explore_category에서 section_type별 중복 행 제거 (동일 section_type 중 id가 큰 것 삭제)
DELETE FROM explore_category a
USING explore_category b
WHERE a.section_type IS NOT NULL
  AND a.section_type = b.section_type
  AND a.id > b.id;
