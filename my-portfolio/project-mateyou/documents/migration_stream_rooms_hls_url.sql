-- ============================================
-- stream_rooms 테이블에 hls_url 컬럼 추가
-- WebRTC Egress에서 생성된 HLS URL 저장용
-- ============================================

-- 1. hls_url 컬럼 추가
ALTER TABLE stream_rooms
ADD COLUMN IF NOT EXISTS hls_url TEXT DEFAULT NULL;

-- 2. 컬럼 설명 추가
COMMENT ON COLUMN stream_rooms.hls_url IS 'WebRTC Egress에서 생성된 HLS 스트림 URL';

-- 3. egress_id 컬럼 추가 (Egress 관리용)
ALTER TABLE stream_rooms
ADD COLUMN IF NOT EXISTS egress_id TEXT DEFAULT NULL;

COMMENT ON COLUMN stream_rooms.egress_id IS 'LiveKit Egress ID (WebRTC→HLS 변환 세션)';

-- 4. 인덱스 생성 (Egress ID 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_stream_rooms_egress_id
ON stream_rooms(egress_id);

-- 5. RLS 정책은 기존 stream_rooms 정책을 그대로 사용 (추가 필드이므로)

-- ============================================
-- 적용 확인 쿼리
-- ============================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'stream_rooms' 
-- AND column_name IN ('hls_url', 'egress_id');
