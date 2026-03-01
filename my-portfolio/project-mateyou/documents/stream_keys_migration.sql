-- ============================================
-- 스트림 키 관리 테이블
-- 파트너별 RTMP 방송 키 관리
-- 테이블 prefix: mt_live_
-- ============================================

-- 스트림 키 테이블
CREATE TABLE IF NOT EXISTS mt_live_stream_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  stream_key VARCHAR(64) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL, -- NULL이면 무기한
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  use_count INTEGER DEFAULT 0,

-- 보안 관련


ip_whitelist TEXT[] DEFAULT NULL, -- 허용 IP 목록 (NULL이면 모두 허용)
  max_concurrent INTEGER DEFAULT 1, -- 동시 스트림 수 제한
  
  CONSTRAINT mt_live_unique_active_key_per_partner UNIQUE (partner_id, is_active)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_mt_live_stream_keys_partner ON mt_live_stream_keys (partner_id);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_keys_key ON mt_live_stream_keys (stream_key);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_keys_active ON mt_live_stream_keys (is_active)
WHERE
    is_active = true;

-- stream_rooms 테이블에 stream_key 컬럼 추가 (방송별 키 매핑)
ALTER TABLE stream_rooms
ADD COLUMN IF NOT EXISTS stream_key VARCHAR(64) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS broadcast_type VARCHAR(20) DEFAULT 'webrtc' CHECK (
    broadcast_type IN ('webrtc', 'hls', 'hybrid')
);

-- 스트림 키 사용 로그
CREATE TABLE IF NOT EXISTS mt_live_stream_key_logs (
    id BIGSERIAL PRIMARY KEY,
    stream_key_id UUID NOT NULL REFERENCES mt_live_stream_keys (id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (
        event_type IN (
            'publish_start',
            'publish_stop',
            'auth_success',
            'auth_fail'
        )
    ),
    client_ip INET,
    user_agent TEXT,
    room_id UUID REFERENCES stream_rooms (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now (),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_key_logs_key ON mt_live_stream_key_logs (stream_key_id);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_key_logs_created ON mt_live_stream_key_logs (created_at);

-- RLS 정책
ALTER TABLE mt_live_stream_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE mt_live_stream_key_logs ENABLE ROW LEVEL SECURITY;

-- 스트림 키: 파트너 본인만 조회/수정 가능
CREATE POLICY "Partners can view own stream keys" ON mt_live_stream_keys FOR
SELECT USING (
        partner_id IN (
            SELECT id
            FROM partners
            WHERE
                member_id = auth.uid ()
        )
    );

CREATE POLICY "Partners can update own stream keys" ON mt_live_stream_keys FOR
UPDATE USING (
    partner_id IN (
        SELECT id
        FROM partners
        WHERE
            member_id = auth.uid ()
    )
);

-- 관리자는 모든 스트림 키 조회 가능
CREATE POLICY "Admins can view all stream keys" ON mt_live_stream_keys FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM members
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- 스트림 키 로그: 파트너 본인만 조회 가능
CREATE POLICY "Partners can view own stream key logs" ON mt_live_stream_key_logs FOR
SELECT USING (
        stream_key_id IN (
            SELECT sk.id
            FROM
                mt_live_stream_keys sk
                JOIN partners p ON sk.partner_id = p.id
            WHERE
                p.member_id = auth.uid ()
        )
    );

-- ============================================
-- 스트림 키 생성 함수
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_generate_stream_key(p_partner_id UUID)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key VARCHAR(64);
  v_partner_exists BOOLEAN;
BEGIN
  -- 파트너 존재 확인
  SELECT EXISTS(SELECT 1 FROM partners WHERE id = p_partner_id) INTO v_partner_exists;
  IF NOT v_partner_exists THEN
    RAISE EXCEPTION 'Partner not found: %', p_partner_id;
  END IF;
  
  -- 기존 활성 키 비활성화
  UPDATE mt_live_stream_keys 
  SET is_active = false 
  WHERE partner_id = p_partner_id AND is_active = true;
  
  -- 새 스트림 키 생성 (파트너ID 앞 8자 + 랜덤 문자열)
  v_key := SUBSTRING(p_partner_id::TEXT, 1, 8) || '_' || 
           encode(gen_random_bytes(24), 'base64');
  -- URL-safe하게 변환
  v_key := REPLACE(REPLACE(REPLACE(v_key, '+', '-'), '/', '_'), '=', '');
  
  -- 새 키 삽입
  INSERT INTO mt_live_stream_keys (partner_id, stream_key, is_active)
  VALUES (p_partner_id, v_key, true);
  
  RETURN v_key;
END;
$$;

-- ============================================
-- RTMP on_publish 인증 함수
-- Nginx RTMP 모듈에서 호출
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_verify_stream_key(p_stream_key VARCHAR, p_client_ip INET DEFAULT NULL)
RETURNS TABLE (
  is_valid BOOLEAN,
  partner_id UUID,
  room_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key_record RECORD;
  v_room_record RECORD;
BEGIN
  -- 스트림 키 조회
  SELECT sk.*, p.id as partner_uuid, p.member_id
  INTO v_key_record
  FROM mt_live_stream_keys sk
  JOIN partners p ON sk.partner_id = p.id
  WHERE sk.stream_key = p_stream_key 
    AND sk.is_active = true
    AND (sk.expires_at IS NULL OR sk.expires_at > now());
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, '유효하지 않은 스트림 키입니다'::TEXT;
    RETURN;
  END IF;
  
  -- IP 화이트리스트 확인
  IF v_key_record.ip_whitelist IS NOT NULL AND array_length(v_key_record.ip_whitelist, 1) > 0 THEN
    IF p_client_ip IS NULL OR NOT (p_client_ip::TEXT = ANY(v_key_record.ip_whitelist)) THEN
      -- 로그 기록
      INSERT INTO mt_live_stream_key_logs (stream_key_id, event_type, client_ip)
      VALUES (v_key_record.id, 'auth_fail', p_client_ip);
      
      RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, '허용되지 않은 IP입니다'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- 사용 기록 업데이트
  UPDATE mt_live_stream_keys 
  SET last_used_at = now(), use_count = use_count + 1
  WHERE id = v_key_record.id;
  
  -- 해당 파트너의 활성 방 찾기 (또는 새 방 생성 필요 여부)
  SELECT id INTO v_room_record
  FROM stream_rooms
  WHERE host_partner_id = v_key_record.partner_uuid
    AND status IN ('scheduled', 'live')
    AND (stream_key = p_stream_key OR stream_key IS NULL)
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- 성공 로그
  INSERT INTO mt_live_stream_key_logs (stream_key_id, event_type, client_ip, room_id)
  VALUES (v_key_record.id, 'auth_success', p_client_ip, v_room_record.id);
  
  RETURN QUERY SELECT true, v_key_record.partner_uuid, v_room_record.id, NULL::TEXT;
END;
$$;

-- ============================================
-- 방송 시작 시 스트림 키 연결
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_link_stream_key_to_room(p_room_id UUID, p_stream_key VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_key RECORD;
BEGIN
  -- 방 조회
  SELECT * INTO v_room FROM stream_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found: %', p_room_id;
  END IF;
  
  -- 스트림 키 유효성 확인
  SELECT * INTO v_key 
  FROM mt_live_stream_keys 
  WHERE stream_key = p_stream_key 
    AND partner_id = v_room.host_partner_id
    AND is_active = true;
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid stream key for this room';
  END IF;
  
  -- 방에 스트림 키 연결 및 HLS 모드 설정
  UPDATE stream_rooms 
  SET stream_key = p_stream_key,
      broadcast_type = 'hls',
      status = 'live'
  WHERE id = p_room_id;
  
  RETURN true;
END;
$$;

-- ============================================
-- 뷰: 활성 스트림 키 정보
-- ============================================
CREATE
OR REPLACE VIEW mt_live_active_stream_keys AS
SELECT sk.id, sk.partner_id, sk.stream_key, sk.created_at, sk.expires_at, sk.last_used_at, sk.use_count, p.partner_name, m.name as member_name
FROM
    mt_live_stream_keys sk
    JOIN partners p ON sk.partner_id = p.id
    JOIN members m ON p.member_id = m.id
WHERE
    sk.is_active = true;

-- ============================================
-- 방송 세션 테이블 (임시 토큰 기반 인증)
-- ============================================
CREATE TABLE IF NOT EXISTS mt_live_stream_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    stream_key_id UUID NOT NULL REFERENCES mt_live_stream_keys (id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
    session_token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now (),
    expires_at TIMESTAMPTZ NOT NULL, -- 기본 30분 후 만료
    used_at TIMESTAMPTZ DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    client_ip INET DEFAULT NULL,
    room_id UUID REFERENCES stream_rooms (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_sessions_token ON mt_live_stream_sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_mt_live_stream_sessions_expires ON mt_live_stream_sessions (expires_at)
WHERE
    is_active = true;

-- RLS 정책
ALTER TABLE mt_live_stream_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own sessions" ON mt_live_stream_sessions FOR
SELECT USING (
        partner_id IN (
            SELECT id
            FROM partners
            WHERE
                member_id = auth.uid ()
        )
    );

-- ============================================
-- 세션 토큰 생성 함수
-- 30분 유효한 임시 토큰 발급
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_create_stream_session(p_partner_id UUID)
RETURNS TABLE (
  session_token VARCHAR(64),
  rtmp_url TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stream_key RECORD;
  v_session_token VARCHAR(64);
  v_expires_at TIMESTAMPTZ;
  v_rtmp_server TEXT := 'rtmp://stream.mateyou.me:1935/live';
BEGIN
  -- 파트너의 활성 스트림 키 조회
  SELECT * INTO v_stream_key
  FROM mt_live_stream_keys
  WHERE partner_id = p_partner_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active stream key found for partner: %', p_partner_id;
  END IF;
  
  -- 기존 활성 세션 만료 처리
  UPDATE mt_live_stream_sessions
  SET is_active = false
  WHERE partner_id = p_partner_id AND is_active = true;
  
  -- 새 세션 토큰 생성 (URL-safe base64)
  v_session_token := encode(gen_random_bytes(32), 'base64');
  v_session_token := REPLACE(REPLACE(REPLACE(v_session_token, '+', '-'), '/', '_'), '=', '');
  
  -- 30분 후 만료
  v_expires_at := now() + INTERVAL '30 minutes';
  
  -- 세션 저장
  INSERT INTO mt_live_stream_sessions (stream_key_id, partner_id, session_token, expires_at)
  VALUES (v_stream_key.id, p_partner_id, v_session_token, v_expires_at);
  
  -- 결과 반환 (세션 토큰을 스트림 키 대신 사용)
  RETURN QUERY SELECT 
    v_session_token,
    v_rtmp_server || '/' || v_session_token,
    v_expires_at;
END;
$$;

-- ============================================
-- 세션 토큰 검증 함수 (RTMP 인증용)
-- 기존 스트림 키 검증과 함께 세션 토큰도 지원
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_verify_stream_token(p_token VARCHAR, p_client_ip INET DEFAULT NULL)
RETURNS TABLE (
  is_valid BOOLEAN,
  partner_id UUID,
  room_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_key_result RECORD;
BEGIN
  -- 1. 먼저 세션 토큰인지 확인
  SELECT ss.*, sk.stream_key, sk.partner_id as key_partner_id
  INTO v_session
  FROM mt_live_stream_sessions ss
  JOIN mt_live_stream_keys sk ON ss.stream_key_id = sk.id
  WHERE ss.session_token = p_token
    AND ss.is_active = true
    AND ss.expires_at > now();
  
  IF FOUND THEN
    -- 세션 토큰으로 인증 성공
    UPDATE mt_live_stream_sessions
    SET used_at = now(), client_ip = p_client_ip
    WHERE id = v_session.id;
    
    -- 로그 기록
    INSERT INTO mt_live_stream_key_logs (stream_key_id, event_type, client_ip)
    VALUES (v_session.stream_key_id, 'auth_success', p_client_ip);
    
    RETURN QUERY SELECT true, v_session.key_partner_id, v_session.room_id, NULL::TEXT;
    RETURN;
  END IF;
  
  -- 2. 세션 토큰이 아니면 기존 스트림 키로 검증 시도
  SELECT * INTO v_key_result
  FROM mt_live_verify_stream_key(p_token, p_client_ip);
  
  RETURN QUERY SELECT 
    v_key_result.is_valid,
    v_key_result.partner_id,
    v_key_result.room_id,
    v_key_result.error_message;
END;
$$;

-- ============================================
-- 만료된 세션 정리 (cron job용)
-- ============================================
CREATE OR REPLACE FUNCTION mt_live_cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE mt_live_stream_sessions
  SET is_active = false
  WHERE is_active = true AND expires_at < now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 권한 부여
GRANT SELECT ON mt_live_active_stream_keys TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_generate_stream_key TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_verify_stream_key TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_verify_stream_token TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_create_stream_session TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_link_stream_key_to_room TO authenticated;

GRANT EXECUTE ON FUNCTION mt_live_cleanup_expired_sessions TO authenticated;