-- ============================================
-- HLS 세션 ID 컬럼 추가 마이그레이션
-- 
-- 목적: OBS/PRISM 방송 시 매번 새로운 세션 UUID를 생성하여
--       CDN 캐싱 문제를 방지합니다.
-- 
-- 기존: /hls/{stream_key}/index.m3u8 (스트림 키 고정 → 캐싱 문제)
-- 변경: /hls/{session_uuid}/index.m3u8 (매번 새로운 UUID)
-- ============================================

-- 1. stream_rooms 테이블에 hls_session_id 컬럼 추가
ALTER TABLE stream_rooms
ADD COLUMN IF NOT EXISTS hls_session_id UUID;

-- 인덱스 추가 (세션 ID로 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_stream_rooms_hls_session_id 
ON stream_rooms(hls_session_id) 
WHERE hls_session_id IS NOT NULL;

-- 복합 인덱스: 스트림 키 + 상태 (RTMP done 처리용)
CREATE INDEX IF NOT EXISTS idx_stream_rooms_stream_key_status
ON stream_rooms(stream_key, status)
WHERE stream_key IS NOT NULL;

COMMENT ON COLUMN stream_rooms.hls_session_id IS 
'HLS 스트리밍용 세션 UUID. 방송 시작 시마다 새로 생성되어 CDN 캐싱 문제 방지';

-- 2. 방송 시작 시 세션 ID 설정을 위한 함수 (선택적)
-- Edge Function에서 직접 처리하므로 필수는 아님
CREATE OR REPLACE FUNCTION generate_hls_session_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT gen_random_uuid();
$$;
