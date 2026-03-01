-- 파트너 환영 메시지 기능 마이그레이션
-- 팔로우 시 자동 발송되는 환영 메시지 컬럼 추가

-- 1. partners 테이블에 welcome_message 컬럼 추가
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT NULL;

COMMENT ON COLUMN partners.welcome_message IS '팔로우 시 자동 발송되는 환영 메시지';

-- 확인
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'partners' AND column_name = 'welcome_message';
