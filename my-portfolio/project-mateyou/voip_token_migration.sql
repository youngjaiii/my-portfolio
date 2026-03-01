-- VoIP Token Migration
-- push_native_tokens 테이블에 voip_token 컬럼 추가
-- iOS PushKit VoIP 푸시를 위한 별도 토큰 저장

-- voip_token 컬럼 추가
ALTER TABLE push_native_tokens 
ADD COLUMN IF NOT EXISTS voip_token TEXT;

-- voip_token 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_push_native_tokens_voip_token 
ON push_native_tokens(user_id, platform, is_active) 
WHERE voip_token IS NOT NULL;

-- 코멘트 추가
COMMENT ON COLUMN push_native_tokens.voip_token IS 'iOS PushKit VoIP 토큰 (APNs VoIP 푸시용)';


