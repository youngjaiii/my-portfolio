-- =====================================================================
-- 방송(스트림) 기능 스키마 v2.5
-- 생성일: 2025-12-12
-- 수정일: 2025-12-25
-- DB: Supabase PostgreSQL
--
-- 변경 이력:
-- v2.5 (2025-12-25):
--   - 미션 후원 포인트 플로우 개선 (escrow 시스템)
--   - stream_donations에 escrow_amount 컬럼 추가
--   - process_donation 함수에 donation_type 파라미터 추가
--   - 미션 관련 RPC 함수 추가 (accept, refund, success, failure)
-- v2.4 (2025-12-25):
--   - 후원 룰렛 시스템 추가
--   - partner_roulette_settings 테이블 (파트너별 룰렛 설정)
--   - partner_roulette_items 테이블 (룰렛 아이템)
--   - donation_roulette_results 테이블 (룰렛 결과, Realtime)
--   - stream_donations에 has_roulette, roulette_result_id 컬럼 추가
--   - execute_donation_roulette() RPC 함수 (자동 룰렛 실행)
--   - get_partner_roulette_settings() RPC 함수 (설정 조회)
--   - upsert_partner_roulette_settings() RPC 함수 (설정 저장)
--   - calculate_roulette_result() 함수 (가중치 기반 결과 계산)
-- v2.3 (2025-12-23):
--   - stream_viewers에 last_heartbeat 컬럼 추가 (시청자 Heartbeat)
--   - idx_stream_viewers_heartbeat 인덱스 추가 (Cron 정리용)
--   - 시청자 자동 퇴장 처리를 위한 Cron 지원
-- v2.2 (2025-12-23):
--   - stream_status ENUM에 'rehearsal' 상태 추가 (방송 전 테스트용)
--   - update_donation_status() 함수 추가 (도네이션 상태 변경)
--   - process_donation() RPC 함수 추가 (원자적 후원 처리)
-- v2.1 (2025-12-12):
--   - 유저 플로우 기반 권한 체계 및 모드 추가
-- =====================================================================

-- =====================================================================
-- 스트림 테이블 초기화 (기존 데이터 삭제)
-- ⚠️ 주의: 이 섹션은 stream 관련 테이블만 삭제합니다
-- =====================================================================

-- 1. Realtime publication에서 테이블 제거 (존재하면)
DO $$ 
BEGIN
    -- 테이블이 publication에 있으면 제거
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_rooms') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_rooms;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_chats') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_chats;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_donations') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_donations;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_missions') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_missions;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_speaker_requests') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_speaker_requests;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_join_requests') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_join_requests;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_room_invites') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_room_invites;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_co_host_requests') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_co_host_requests;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_viewers') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE stream_viewers;
    END IF;
END $$;

-- 2. 의존성 순서대로 테이블 삭제 (CASCADE로 트리거/인덱스 자동 삭제)
DROP TABLE IF EXISTS stream_room_invites CASCADE;

DROP TABLE IF EXISTS stream_speaker_requests CASCADE;

DROP TABLE IF EXISTS stream_join_requests CASCADE;

DROP TABLE IF EXISTS stream_co_host_requests CASCADE;

DROP TABLE IF EXISTS stream_donations CASCADE;

DROP TABLE IF EXISTS stream_missions CASCADE;

DROP TABLE IF EXISTS stream_force_mutes CASCADE;

DROP TABLE IF EXISTS stream_chat_bans CASCADE;

DROP TABLE IF EXISTS stream_chats CASCADE;

DROP TABLE IF EXISTS stream_viewers CASCADE;

DROP TABLE IF EXISTS stream_hosts CASCADE;

DROP TABLE IF EXISTS stream_rooms CASCADE;

DROP TABLE IF EXISTS gift_items CASCADE;

DROP TABLE IF EXISTS stream_categories CASCADE;

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS update_stream_viewer_count ();

DROP FUNCTION IF EXISTS process_stream_donation ();

DROP FUNCTION IF EXISTS handle_co_host_approval ();

DROP FUNCTION IF EXISTS get_stream_ban_status ();

DROP FUNCTION IF EXISTS get_member_ban_history ();

DROP FUNCTION IF EXISTS get_member_messages_in_host_streams ();

DROP FUNCTION IF EXISTS update_donation_status ();

DROP FUNCTION IF EXISTS process_donation ();
DROP FUNCTION IF EXISTS process_mission_accept (INTEGER);
DROP FUNCTION IF EXISTS process_mission_refund (INTEGER, TEXT);
DROP FUNCTION IF EXISTS process_mission_success (INTEGER);
DROP FUNCTION IF EXISTS process_mission_failure (INTEGER);

-- ENUM 타입 삭제 및 재생성
DROP TYPE IF EXISTS stream_type CASCADE;

DROP TYPE IF EXISTS stream_access_type CASCADE;

DROP TYPE IF EXISTS stream_chat_mode CASCADE;

DROP TYPE IF EXISTS stream_status CASCADE;

DROP TYPE IF EXISTS host_role CASCADE;

DROP TYPE IF EXISTS stream_chat_type CASCADE;

DROP TYPE IF EXISTS stream_ban_type CASCADE;

DROP TYPE IF EXISTS gift_tier CASCADE;

DROP TYPE IF EXISTS stream_mission_status CASCADE;

DROP TYPE IF EXISTS stream_request_status CASCADE;

DROP TYPE IF EXISTS stream_video_mode CASCADE;

DROP TYPE IF EXISTS stream_invite_status CASCADE;

DROP TYPE IF EXISTS stream_ban_scope CASCADE;

-- =====================================================================
-- ENUM 타입
-- =====================================================================

-- 스트림 타입: 영상 / 음성
CREATE TYPE stream_type AS ENUM ('video', 'audio');

-- 접근 타입: 공개 / 비공개 / 구독자전용
CREATE TYPE stream_access_type AS ENUM ('public', 'private', 'subscriber');

-- 채팅 모드
CREATE TYPE stream_chat_mode AS ENUM ('all', 'subscriber', 'disabled');

-- 방송 상태 (rehearsal: 리허설/테스트 상태)
CREATE TYPE stream_status AS ENUM ('scheduled', 'rehearsal', 'live', 'ended');

-- 호스트/발언자 역할
CREATE TYPE host_role AS ENUM ('owner', 'co_host', 'guest');

-- 채팅 타입
CREATE TYPE stream_chat_type AS ENUM ('text', 'donation', 'system');

-- 제재 타입
CREATE TYPE stream_ban_type AS ENUM ('mute', 'kick', 'ban');

-- 차단 범위
CREATE TYPE stream_ban_scope AS ENUM ('room', 'global');

-- 선물 등급
CREATE TYPE gift_tier AS ENUM ('common', 'rare', 'epic', 'legendary');

-- 미션 상태
CREATE TYPE stream_mission_status AS ENUM ('pending', 'accepted', 'completed', 'rejected');

-- 요청 상태 (발언권 요청, 합방 요청 등)
CREATE TYPE stream_request_status AS ENUM ('pending', 'approved', 'rejected');

-- 영상 모드: 1:N (혼자) / 2:N (합방)
CREATE TYPE stream_video_mode AS ENUM ('1_n', '2_n');

-- 초대 상태
CREATE TYPE stream_invite_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- =====================================================================
-- 1. stream_categories (방송 카테고리)
-- =====================================================================

CREATE TABLE stream_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_stream_categories_active ON stream_categories (is_active, sort_order);

-- =====================================================================
-- 2. gift_items (선물 아이템)
-- =====================================================================

CREATE TABLE gift_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT NOT NULL,
    animation_url TEXT,
    price_points INTEGER NOT NULL CHECK (price_points > 0),
    tier gift_tier NOT NULL DEFAULT 'common',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_gift_items_active ON gift_items (is_active, tier, sort_order);

-- =====================================================================
-- 3. stream_rooms (방송 룸)
-- =====================================================================
--
-- 방 입장 규칙:
--   - 공개방: 누구나 입장 가능 (청취자로)
--   - 구독자전용: 구독자만 입장 가능 (청취자로)
--   - 비공개방: 비밀번호 입력 시 입장 가능 (청취자로)
--
-- 발언권:
--   - 입장 시 기본적으로 "청취자" (stream_viewers)
--   - 발언권 요청 → 호스트 승인 → "발언자" (stream_hosts)
-- =====================================================================

CREATE TABLE stream_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

-- 호스트 정보
host_partner_id UUID REFERENCES partners (id) ON DELETE CASCADE, -- 파트너 호스트 (영상방 필수)
host_member_id UUID REFERENCES members (id) ON DELETE CASCADE, -- 일반 유저 호스트 (음성방 비공개만)
co_host_partner_id UUID REFERENCES partners (id) ON DELETE SET NULL, -- 합방 파트너 (2:N 영상 모드)

-- 방 기본 정보
title TEXT NOT NULL,
description TEXT,
stream_type stream_type NOT NULL DEFAULT 'audio',
video_mode stream_video_mode DEFAULT '1_n', -- 영상방 전용: 1:N 또는 2:N
category_id UUID REFERENCES stream_categories (id) ON DELETE SET NULL,
tags TEXT [] DEFAULT '{}',
thumbnail_url TEXT,

-- 접근 제어
access_type stream_access_type NOT NULL DEFAULT 'public',
password TEXT, -- 비공개방 비밀번호 (4~50자)
chat_mode stream_chat_mode NOT NULL DEFAULT 'all',

-- 참가자 설정
max_participants INTEGER NOT NULL DEFAULT 10 CHECK (
    max_participants >= 1
    AND max_participants <= 10
),
viewer_count INTEGER NOT NULL DEFAULT 0, -- 현재 청취자 수
total_viewers INTEGER NOT NULL DEFAULT 0, -- 누적 청취자 수

-- 상태 관리
status stream_status NOT NULL DEFAULT 'scheduled',
scheduled_at TIMESTAMPTZ,
started_at TIMESTAMPTZ,
ended_at TIMESTAMPTZ,
ended_by UUID REFERENCES members (id),

-- 하트비트 (호스트 비정상 종료 감지용)
last_heartbeat TIMESTAMPTZ DEFAULT now (), -- 호스트의 마지막 하트비트 시간. 2분 이상 없으면 자동 종료 대상.

-- 관리자 제어
is_hidden BOOLEAN DEFAULT false,
hidden_reason TEXT,
hidden_by UUID REFERENCES members (id),
hidden_at TIMESTAMPTZ,

-- 메타데이터
created_at TIMESTAMPTZ DEFAULT now (),
updated_at TIMESTAMPTZ DEFAULT now (),

-- =========================================================
-- 제약조건
-- =========================================================

-- 1. 호스트는 파트너 또는 멤버 중 하나 필수
CONSTRAINT check_host_required CHECK (
    host_partner_id IS NOT NULL
    OR host_member_id IS NOT NULL
),

-- 2. 영상방은 파트너만 가능
CONSTRAINT check_video_partner_only CHECK (
    stream_type = 'audio'
    OR host_partner_id IS NOT NULL
),

-- 3. video_mode는 영상방에서만 유효
CONSTRAINT check_video_mode_validity CHECK (
    stream_type = 'video'
    OR video_mode IS NULL
),

-- 4. 2:N 모드일 때만 co_host_partner_id 설정 가능
CONSTRAINT check_co_host_validity CHECK (
    (
        video_mode = '2_n'
        AND co_host_partner_id IS NOT NULL
    )
    OR (
        video_mode != '2_n'
        AND co_host_partner_id IS NULL
    )
    OR video_mode IS NULL
),

-- 5. 비공개방은 비밀번호 필수 (4~50자)
CONSTRAINT check_private_password CHECK (
    access_type != 'private'
    OR (
        password IS NOT NULL
        AND LENGTH(password) >= 4
        AND LENGTH(password) <= 50
    )
),

-- 6. 일반 유저(파트너 아님)는 음성방 비공개만 생성 가능
CONSTRAINT check_user_room_type CHECK (
        host_partner_id IS NOT NULL 
        OR (
            host_partner_id IS NULL 
            AND stream_type = 'audio' 
            AND access_type = 'private'
        )
    )
);

CREATE INDEX idx_stream_rooms_host_partner ON stream_rooms (host_partner_id);

CREATE INDEX idx_stream_rooms_host_member ON stream_rooms (host_member_id);

CREATE INDEX idx_stream_rooms_co_host ON stream_rooms (co_host_partner_id);

CREATE INDEX idx_stream_rooms_status ON stream_rooms (status);

CREATE INDEX idx_stream_rooms_category ON stream_rooms (category_id);

CREATE INDEX idx_stream_rooms_started_at ON stream_rooms (started_at DESC);

CREATE INDEX idx_stream_rooms_live ON stream_rooms (status, started_at DESC)
WHERE
    status = 'live';

CREATE INDEX idx_stream_rooms_visible ON stream_rooms (status, is_hidden)
WHERE
    is_hidden = false;

CREATE INDEX idx_stream_rooms_type ON stream_rooms (stream_type, status);

CREATE INDEX idx_stream_rooms_heartbeat ON stream_rooms (last_heartbeat)
WHERE
    status = 'live';

-- =====================================================================
-- 4. stream_room_invites (비공개 방 초대)
-- 비공개방 호스트가 특정 유저를 초대할 때 사용 (비밀번호 없이 입장)
-- =====================================================================

CREATE TABLE stream_room_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    invited_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    status stream_invite_status NOT NULL DEFAULT 'pending',
    message TEXT,
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (now () + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT now (),
    UNIQUE (room_id, invited_member_id)
);

CREATE INDEX idx_stream_room_invites_room ON stream_room_invites (room_id);

CREATE INDEX idx_stream_room_invites_member ON stream_room_invites (invited_member_id);

CREATE INDEX idx_stream_room_invites_pending ON stream_room_invites (invited_member_id, status)
WHERE
    status = 'pending';

-- =====================================================================
-- 5. stream_hosts (발언자/호스트 참여 이력)
-- 마이크 권한이 있는 참여자 (owner, co_host, guest)
-- =====================================================================

CREATE TABLE stream_hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    partner_id UUID REFERENCES partners (id) ON DELETE CASCADE,
    member_id UUID REFERENCES members (id) ON DELETE CASCADE,
    role host_role NOT NULL DEFAULT 'guest', -- owner: 방장, co_host: 공동호스트, guest: 승인된 발언자
    joined_at TIMESTAMPTZ DEFAULT now (),
    left_at TIMESTAMPTZ,
    CONSTRAINT check_host_identity CHECK (
        partner_id IS NOT NULL
        OR member_id IS NOT NULL
    )
);

CREATE INDEX idx_stream_hosts_room ON stream_hosts (room_id);

CREATE INDEX idx_stream_hosts_partner ON stream_hosts (partner_id);

CREATE INDEX idx_stream_hosts_member ON stream_hosts (member_id);

-- 파트너 호스트 중복 방지 (left_at이 NULL인 활성 호스트만)
CREATE UNIQUE INDEX idx_stream_hosts_partner_unique ON stream_hosts (room_id, partner_id)
WHERE
    partner_id IS NOT NULL
    AND left_at IS NULL;

-- 멤버 호스트 중복 방지 (left_at이 NULL인 활성 호스트만)
CREATE UNIQUE INDEX idx_stream_hosts_member_unique ON stream_hosts (room_id, member_id)
WHERE
    member_id IS NOT NULL
    AND left_at IS NULL;

-- =====================================================================
-- 6. stream_viewers (청취자/시청자 참여 이력)
-- 방에 입장한 모든 유저 (마이크 권한 없음, 듣기/보기만)
-- =====================================================================

CREATE TABLE stream_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT now (),
    left_at TIMESTAMPTZ,
    watch_duration INTERVAL GENERATED ALWAYS AS (left_at - joined_at) STORED,
    -- 시청자 Heartbeat (v2.3 추가)
    last_heartbeat TIMESTAMPTZ DEFAULT now (), -- 마지막 Heartbeat 시간. 2분 이상 없으면 자동 퇴장 대상.
    UNIQUE (room_id, member_id)
);

CREATE INDEX idx_stream_viewers_room ON stream_viewers (room_id);

CREATE INDEX idx_stream_viewers_member ON stream_viewers (member_id);

-- 시청자 Heartbeat 인덱스 (Cron에서 오래된 시청자 조회용)
CREATE INDEX idx_stream_viewers_heartbeat ON stream_viewers (last_heartbeat)
WHERE left_at IS NULL;

COMMENT ON COLUMN stream_viewers.last_heartbeat IS '시청자의 마지막 Heartbeat 시간. 2분 이상 없으면 자동 퇴장 처리.';

-- =====================================================================
-- 7. stream_chats (방송 채팅)
-- =====================================================================

CREATE TABLE stream_chats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chat_type stream_chat_type NOT NULL DEFAULT 'text',
    is_pinned BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false,
    hidden_by UUID REFERENCES members (id) ON DELETE SET NULL,
    hidden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_stream_chats_room ON stream_chats (room_id, created_at DESC);

CREATE INDEX idx_stream_chats_sender ON stream_chats (sender_id);

CREATE INDEX idx_stream_chats_hidden ON stream_chats (room_id, is_hidden)
WHERE
    is_hidden = true;

COMMENT ON COLUMN stream_chats.is_hidden IS '채팅 숨김 여부 (true면 일반 시청자에게 안보임)';

COMMENT ON COLUMN stream_chats.hidden_by IS '숨김 처리한 호스트/관리자 member_id';

COMMENT ON COLUMN stream_chats.hidden_at IS '숨김 처리 시간';

-- =====================================================================
-- 8. stream_chat_bans (채팅 제재 - 확장)
--
-- 제재 종류:
--   - kick: 강퇴 (해당 방 영구 차단)
--   - ban: 차단 (시간/범위 지정 가능)
--   - mute: 뮤트 (채팅 금지)
--
-- 차단 범위 (scope):
--   - room: 특정 방에서만 차단
--   - global: 해당 호스트의 모든 방송에서 차단
-- =====================================================================

CREATE TABLE stream_chat_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID REFERENCES stream_rooms (id) ON DELETE CASCADE, -- nullable for global scope
    target_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    banned_by_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    ban_type stream_ban_type NOT NULL,
    scope stream_ban_scope NOT NULL DEFAULT 'room',
    -- 전역 차단 시 호스트 기준
    host_partner_id UUID REFERENCES partners (id) ON DELETE CASCADE,
    host_member_id UUID REFERENCES members (id) ON DELETE CASCADE,
    reason TEXT,
    expires_at TIMESTAMPTZ, -- null = 영구
    is_active BOOLEAN NOT NULL DEFAULT true,
    unban_at TIMESTAMPTZ,
    unban_by UUID REFERENCES members (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_stream_chat_bans_room ON stream_chat_bans (room_id);

CREATE INDEX idx_stream_chat_bans_target ON stream_chat_bans (target_member_id);

CREATE INDEX idx_stream_chat_bans_expires ON stream_chat_bans (
    room_id,
    target_member_id,
    expires_at
);

CREATE INDEX idx_stream_chat_bans_scope ON stream_chat_bans (scope);

CREATE INDEX idx_stream_chat_bans_host_partner ON stream_chat_bans (host_partner_id)
WHERE
    host_partner_id IS NOT NULL;

CREATE INDEX idx_stream_chat_bans_host_member ON stream_chat_bans (host_member_id)
WHERE
    host_member_id IS NOT NULL;

CREATE INDEX idx_stream_chat_bans_active ON stream_chat_bans (target_member_id, is_active)
WHERE
    is_active = true;

CREATE INDEX idx_stream_chat_bans_global ON stream_chat_bans (
    target_member_id,
    scope,
    is_active
)
WHERE
    scope = 'global'
    AND is_active = true;

-- =====================================================================
-- 8-1. stream_force_mutes (강제 뮤트 기록)
-- 발언자의 마이크를 호스트가 강제로 끄는 기능
-- unmuted_at이 NULL이면 아직 뮤트 상태 (유저가 해제 불가)
-- =====================================================================

CREATE TABLE stream_force_mutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    target_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    muted_by_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    reason TEXT,
    unmuted_at TIMESTAMPTZ DEFAULT NULL,
    unmuted_by_member_id UUID DEFAULT NULL REFERENCES members (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_stream_force_mutes_room ON stream_force_mutes (room_id);

CREATE INDEX idx_stream_force_mutes_target ON stream_force_mutes (target_member_id);

CREATE INDEX idx_stream_force_mutes_active ON stream_force_mutes (room_id, target_member_id)
WHERE
    unmuted_at IS NULL;

COMMENT ON COLUMN stream_force_mutes.unmuted_at IS '뮤트 해제 시간 (NULL이면 아직 뮤트 상태)';

COMMENT ON COLUMN stream_force_mutes.unmuted_by_member_id IS '뮤트를 해제한 호스트 member_id';

-- =====================================================================
-- 9. stream_missions (후원 미션) - 파트너 방 전용
-- =====================================================================

CREATE TABLE stream_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    target_partner_id UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    reward_points INTEGER NOT NULL CHECK (reward_points > 0),
    status stream_mission_status NOT NULL DEFAULT 'pending',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now ()
);

CREATE INDEX idx_stream_missions_room ON stream_missions (room_id);

CREATE INDEX idx_stream_missions_target ON stream_missions (target_partner_id);

CREATE INDEX idx_stream_missions_status ON stream_missions (status)
WHERE
    status IN ('pending', 'accepted');

-- =====================================================================
-- 10. stream_donations (후원/선물하기) - 포인트 직접 전송 방식
-- =====================================================================
-- 변경사항 (v2.3):
--   - gift_items 참조 제거 (포인트 직접 전송)
--   - 최소 후원 금액: 1,000P 이상
--   - heart_image: 선택한 하트 이미지
--   - log_id: member_points_logs와 연결되는 중복 방지 ID
--   - donation_type: 도네이션 타입 (basic/mission/video)
--   - status: 처리 상태 (pending/playing/completed/skipped)
--   - mission_text: 미션 도네이션 내용
--   - video_url/title/thumbnail: 영상 도네이션 정보
-- =====================================================================

CREATE TABLE stream_donations (
    id SERIAL PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    recipient_partner_id UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount >= 1000), -- 최소 1,000P
    heart_image TEXT, -- 하트 이미지 경로 (예: '/icon/heart.png')
    message TEXT, -- 후원 메시지 (선택)
    log_id TEXT, -- 중복 방지 ID (member_points_logs.log_id와 동일)
    -- 도네이션 타입 확장 (v2.3)
    donation_type TEXT NOT NULL DEFAULT 'basic' CHECK (
        donation_type IN ('basic', 'mission', 'video')
    ),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (
        status IN (
            'pending',
            'accepted', -- 미션 수락됨
            'rejected', -- 미션 거절됨 (환불)
            'playing',
            'completed',
            'success', -- 미션 성공
            'failed', -- 미션 실패
            'skipped'
        )
    ),
    mission_text TEXT, -- 미션 도네이션: 미션 내용
    video_url TEXT, -- 영상 도네이션: 유튜브 URL
    video_title TEXT, -- 영상 도네이션: 영상 제목
    video_thumbnail TEXT, -- 영상 도네이션: 썸네일 URL
    processed_at TIMESTAMPTZ, -- 처리 완료 시간
    processed_by UUID REFERENCES members (id) ON DELETE SET NULL, -- 처리한 호스트 ID
    -- 미션 후원 포인트 임시 보관 (escrow) (v2.5 추가)
    escrow_amount INTEGER DEFAULT 0, -- 임시 보관 중인 포인트 금액 (미션 수락 후 성공/실패까지 보관)
    created_at TIMESTAMPTZ DEFAULT now () NOT NULL
);

-- 인덱스
CREATE INDEX idx_stream_donations_room ON stream_donations (room_id, created_at DESC);

CREATE INDEX idx_stream_donations_donor ON stream_donations (donor_id);

CREATE INDEX idx_stream_donations_recipient ON stream_donations (recipient_partner_id);

-- log_id 중복 방지 (NULL 허용 부분 인덱스)
CREATE UNIQUE INDEX idx_stream_donations_log_id_unique ON stream_donations (log_id)
WHERE
    log_id IS NOT NULL;

-- 대기 중인 도네이션 조회 최적화
CREATE INDEX idx_stream_donations_pending ON stream_donations (room_id, status, created_at)
WHERE
    status = 'pending';

-- 타입별 도네이션 조회 최적화
CREATE INDEX idx_stream_donations_type ON stream_donations (
    room_id,
    donation_type,
    created_at DESC
);

-- escrow 조회 최적화 (미션 후원 포인트 보관 상태)
CREATE INDEX IF NOT EXISTS idx_stream_donations_escrow 
ON stream_donations (donation_type, status, escrow_amount)
WHERE donation_type = 'mission' AND escrow_amount > 0;

-- 컬럼 주석
COMMENT ON COLUMN stream_donations.donation_type IS '도네이션 타입: basic(일반), mission(미션), video(영상)';

COMMENT ON COLUMN stream_donations.status IS '처리 상태: pending(대기), accepted(수락), rejected(거절-환불), playing(재생중), completed(완료), success(성공), failed(실패), skipped(스킵)';

COMMENT ON COLUMN stream_donations.mission_text IS '미션 도네이션: 미션 내용';

COMMENT ON COLUMN stream_donations.video_url IS '영상 도네이션: 유튜브 URL';

COMMENT ON COLUMN stream_donations.video_title IS '영상 도네이션: 영상 제목';

COMMENT ON COLUMN stream_donations.video_thumbnail IS '영상 도네이션: 썸네일 URL';

COMMENT ON COLUMN stream_donations.processed_at IS '처리 완료 시간';

COMMENT ON COLUMN stream_donations.processed_by IS '처리한 호스트 ID';

COMMENT ON COLUMN stream_donations.escrow_amount IS '임시 보관 중인 포인트 금액 (미션 수락 후 성공/실패까지 보관)';

-- 방별 후원 랭킹 뷰 (Top 5 표시용)
CREATE
OR REPLACE VIEW stream_donation_rankings AS
SELECT
    sd.room_id,
    sd.donor_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    SUM(sd.amount) AS total_amount,
    COUNT(*) AS donation_count,
    MAX(sd.created_at) AS last_donation_at,
    RANK() OVER (
        PARTITION BY
            sd.room_id
        ORDER BY SUM(sd.amount) DESC
    ) AS rank
FROM
    stream_donations sd
    JOIN members m ON m.id = sd.donor_id
GROUP BY
    sd.room_id,
    sd.donor_id,
    m.name,
    m.profile_image;

COMMENT ON VIEW stream_donation_rankings IS '스트림 방별 후원 랭킹 (누적 금액 기준)';

-- 대기 중인 도네이션 조회 뷰
CREATE
OR REPLACE VIEW pending_donations AS
SELECT
    sd.*,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    p.partner_name AS recipient_name
FROM
    stream_donations sd
    JOIN members m ON m.id = sd.donor_id
    JOIN partners p ON p.id = sd.recipient_partner_id
WHERE
    sd.status = 'pending'
ORDER BY sd.created_at ASC;

COMMENT ON VIEW pending_donations IS '대기 중인 도네이션 목록 (선착순)';

-- 수락된 미션 조회용 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_stream_donations_accepted_missions ON stream_donations (
    room_id,
    donation_type,
    status,
    created_at
)
WHERE
    status = 'accepted'
    AND donation_type = 'mission';

-- 수락된 미션 조회 뷰
CREATE
OR REPLACE VIEW accepted_missions AS
SELECT
    sd.*,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    p.partner_name AS recipient_name
FROM
    stream_donations sd
    JOIN members m ON m.id = sd.donor_id
    JOIN partners p ON p.id = sd.recipient_partner_id
WHERE
    sd.status = 'accepted'
    AND sd.donation_type = 'mission'
ORDER BY sd.created_at ASC;

COMMENT ON VIEW accepted_missions IS '수락된 미션 목록 (진행 중인 미션)';

-- 도네이션 상태 업데이트 함수
CREATE OR REPLACE FUNCTION update_donation_status(
  p_donation_id INTEGER,
  p_status TEXT,
  p_processor_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- 유효한 상태인지 확인
  IF p_status NOT IN ('pending', 'accepted', 'rejected', 'playing', 'completed', 'success', 'failed', 'skipped') THEN
    RETURN FALSE;
  END IF;

  UPDATE stream_donations
  SET 
    status = p_status,
    processed_at = CASE WHEN p_status IN ('completed', 'skipped', 'success', 'failed', 'rejected') THEN NOW() ELSE processed_at END,
    processed_by = CASE WHEN p_status IN ('completed', 'skipped', 'success', 'failed', 'rejected') THEN p_processor_id ELSE processed_by END
  WHERE id = p_donation_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_donation_status IS '도네이션 상태 업데이트 함수 - 호스트가 도네이션 처리 시 사용';

-- =====================================================================
-- 11. stream_speaker_requests (음성방 발언권 요청)
--
-- 청취자(viewer)가 발언자(host)가 되기 위한 요청
-- - 방 입장은 자유: 공개/구독자전용/비공개(비밀번호)
-- - 발언권만 호스트 승인 필요
-- - ⚠️ 1회성 요청: 발언자가 나갔다 다시 들어오면 재요청 필요
--   (자리가 정해져 있어서 나갔다 오면 자리가 찼을 수 있음)
--
-- 플로우:
--   청취자 → 발언권 요청 버튼 → INSERT (pending)
--   호스트 → 승인 버튼 → UPDATE (approved) → stream_hosts INSERT
--   발언자 퇴장 → stream_hosts.left_at 설정 → 발언권 소멸
--   재입장 시 → 청취자로 시작, 다시 요청 필요
-- =====================================================================

CREATE TABLE stream_speaker_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    requester_member_id UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    status stream_request_status NOT NULL DEFAULT 'pending',
    message TEXT, -- 발언 요청 메시지 (예: "같이 얘기하고 싶어요!")
    reviewed_by UUID REFERENCES members (id) ON DELETE SET NULL, -- 승인/거절한 호스트
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now ()
    -- UNIQUE 제약조건 없음: 같은 사람이 나갔다 들어와서 다시 요청 가능
);

CREATE INDEX idx_stream_speaker_requests_room ON stream_speaker_requests (room_id, status);

CREATE INDEX idx_stream_speaker_requests_requester ON stream_speaker_requests (requester_member_id);

-- pending 상태인 요청은 한 사람당 하나만 (중복 요청 방지)
CREATE UNIQUE INDEX idx_stream_speaker_requests_pending_unique ON stream_speaker_requests (room_id, requester_member_id)
WHERE
    status = 'pending';

-- =====================================================================
-- 12. stream_co_host_requests (영상방 합방 요청)
-- 파트너 → 파트너 합방 요청 (2:N 모드)
-- =====================================================================

CREATE TABLE stream_co_host_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES stream_rooms (id) ON DELETE CASCADE,
    requester_partner_id UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE, -- 요청하는 호스트
    target_partner_id UUID NOT NULL REFERENCES partners (id) ON DELETE CASCADE, -- 합방 대상 파트너
    status stream_request_status NOT NULL DEFAULT 'pending',
    message TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now (),
    UNIQUE (room_id, target_partner_id)
);

CREATE INDEX idx_stream_co_host_requests_room ON stream_co_host_requests (room_id);

CREATE INDEX idx_stream_co_host_requests_target ON stream_co_host_requests (target_partner_id, status);

-- =====================================================================
-- 트리거 함수
-- =====================================================================

-- updated_at 자동 갱신 (기존 함수 사용)
CREATE OR REPLACE TRIGGER trg_stream_rooms_updated
    BEFORE UPDATE ON stream_rooms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 시청자 수 자동 업데이트
CREATE OR REPLACE FUNCTION update_stream_viewer_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE stream_rooms
        SET viewer_count = viewer_count + 1, total_viewers = total_viewers + 1
        WHERE id = NEW.room_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
        UPDATE stream_rooms
        SET viewer_count = GREATEST(viewer_count - 1, 0)
        WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_stream_viewer_count
    AFTER INSERT OR UPDATE ON stream_viewers
    FOR EACH ROW EXECUTE FUNCTION update_stream_viewer_count();

-- 후원 시 포인트 처리
-- ⚠️ 주의: 포인트 처리는 API (mateYouApi.members.donation)에서 처리합니다.
-- stream_donations 테이블은 방별 후원 기록만 저장하며, 포인트 이동은 별도로 처리됩니다.
-- 이렇게 분리된 이유:
--   1. process_donation RPC 함수에서 원자적 트랜잭션으로 안전하게 처리
--   2. 중복 방지 (log_id UNIQUE 제약)
--   3. 레이스 컨디션 방지 (FOR UPDATE 락)
--
-- 기존 트리거 함수는 사용하지 않으므로 삭제합니다.
-- (DROP FUNCTION은 파일 상단에서 이미 처리됨)

-- 합방 승인 시 co_host_partner_id 자동 설정
CREATE OR REPLACE FUNCTION handle_co_host_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        UPDATE stream_rooms
        SET co_host_partner_id = NEW.target_partner_id,
            video_mode = '2_n'
        WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_co_host_approval
    AFTER UPDATE ON stream_co_host_requests
    FOR EACH ROW EXECUTE FUNCTION handle_co_host_approval();

-- =====================================================================
-- RLS (Row Level Security)
-- =====================================================================

-- stream_categories
ALTER TABLE stream_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_categories_select" ON stream_categories FOR
SELECT USING (is_active = true);

-- gift_items
ALTER TABLE gift_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gift_items_select" ON gift_items FOR
SELECT USING (is_active = true);

-- stream_rooms
ALTER TABLE stream_rooms ENABLE ROW LEVEL SECURITY;

-- 조회: 숨김되지 않은 방송은 누구나 볼 수 있음 (입장 권한은 앱에서 체크)
CREATE POLICY "stream_rooms_select" ON stream_rooms FOR
SELECT USING (
        is_hidden = false
        OR auth.uid () = (
            SELECT member_id
            FROM partners
            WHERE
                id = host_partner_id
        )
        OR auth.uid () = host_member_id
    );

-- 관리자는 숨김 포함 모두 조회 가능
CREATE POLICY "stream_rooms_admin_select" ON stream_rooms FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM members
            WHERE
                id = auth.uid ()
                AND role = 'admin'
        )
    );

-- 생성: 파트너 또는 일반 유저
CREATE POLICY "stream_rooms_insert" ON stream_rooms FOR INSERT
WITH
    CHECK (
        -- 파트너가 생성하는 경우 (모든 타입 가능)
        (
            host_partner_id IS NOT NULL
            AND auth.uid () = (
                SELECT member_id
                FROM partners
                WHERE
                    id = host_partner_id
                    AND partner_status = 'approved'
            )
        )
        -- 또는 일반 유저가 음성 비공개방 생성
        OR (
            host_partner_id IS NULL
            AND host_member_id = auth.uid ()
            AND stream_type = 'audio'
            AND access_type = 'private'
        )
    );

-- 수정: 호스트 본인만
CREATE POLICY "stream_rooms_update" ON stream_rooms FOR
UPDATE USING (
    auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = host_partner_id
    )
    OR auth.uid () = host_member_id
);

-- 관리자 수정 (숨김 처리 등)
CREATE POLICY "stream_rooms_admin_update" ON stream_rooms FOR
UPDATE USING (
    EXISTS (
        SELECT 1
        FROM members
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- 삭제: 호스트 본인만
CREATE POLICY "stream_rooms_delete" ON stream_rooms FOR DELETE USING (
    auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = host_partner_id
    )
    OR auth.uid () = host_member_id
);

-- stream_room_invites
ALTER TABLE stream_room_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_room_invites_select" ON stream_room_invites FOR
SELECT USING (
        invited_member_id = auth.uid ()
        OR invited_by = auth.uid ()
    );

CREATE POLICY "stream_room_invites_insert" ON stream_room_invites FOR INSERT
WITH
    CHECK (
        invited_by = auth.uid ()
        AND EXISTS (
            SELECT 1
            FROM stream_rooms
            WHERE
                id = room_id
                AND (
                    host_member_id = auth.uid ()
                    OR auth.uid () = (
                        SELECT member_id
                        FROM partners
                        WHERE
                            id = host_partner_id
                    )
                )
        )
    );

CREATE POLICY "stream_room_invites_update" ON stream_room_invites FOR
UPDATE USING (
    invited_member_id = auth.uid ()
);

-- stream_hosts
ALTER TABLE stream_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_hosts_select" ON stream_hosts FOR
SELECT USING (true);

CREATE POLICY "stream_hosts_insert" ON stream_hosts FOR INSERT
WITH
    CHECK (
        -- 본인이 추가하는 경우 (파트너)
        auth.uid () = (
            SELECT member_id
            FROM partners
            WHERE
                id = partner_id
        )
        -- 또는 본인이 추가하는 경우 (일반 멤버)
        OR auth.uid () = member_id
        -- 또는 방장이 발언자를 추가하는 경우
        OR EXISTS (
            SELECT 1
            FROM stream_rooms
            WHERE
                id = room_id
                AND (
                    host_member_id = auth.uid ()
                    OR auth.uid () = (
                        SELECT member_id
                        FROM partners
                        WHERE
                            id = host_partner_id
                    )
                )
        )
    );

-- 셀프 나가기 + 호스트가 강퇴 가능
CREATE POLICY "stream_hosts_update" ON stream_hosts FOR
UPDATE USING (
    -- 본인이 나가는 경우 (일반 멤버)
    auth.uid () = member_id
    -- 본인이 나가는 경우 (파트너)
    OR auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = partner_id
    )
    -- 방장이 강퇴하는 경우
    OR EXISTS (
        SELECT 1
        FROM stream_rooms
        WHERE
            id = room_id
            AND (
                host_member_id = auth.uid ()
                OR auth.uid () = (
                    SELECT member_id
                    FROM partners
                    WHERE
                        id = host_partner_id
                )
            )
    )
);

-- 방장만 삭제 가능
CREATE POLICY "stream_hosts_delete" ON stream_hosts FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM stream_rooms
        WHERE
            id = room_id
            AND (
                host_member_id = auth.uid ()
                OR auth.uid () = (
                    SELECT member_id
                    FROM partners
                    WHERE
                        id = host_partner_id
                )
            )
    )
);

-- stream_viewers
ALTER TABLE stream_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_viewers_select" ON stream_viewers FOR
SELECT USING (true);

CREATE POLICY "stream_viewers_insert" ON stream_viewers FOR INSERT
WITH
    CHECK (auth.uid () = member_id);

CREATE POLICY "stream_viewers_update" ON stream_viewers FOR
UPDATE USING (auth.uid () = member_id);

-- stream_chats
ALTER TABLE stream_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_chats_select" ON stream_chats FOR
SELECT USING (true);

CREATE POLICY "stream_chats_insert" ON stream_chats FOR INSERT
WITH
    CHECK (auth.uid () = sender_id);

-- UPDATE 정책: 호스트 또는 관리자만 채팅 숨기기 가능
CREATE POLICY "stream_chats_update" ON stream_chats FOR
UPDATE USING (
    -- 해당 방의 호스트인 경우
    EXISTS (
        SELECT 1
        FROM stream_rooms sr
        WHERE
            sr.id = stream_chats.room_id
            AND (
                sr.host_member_id = auth.uid ()
                OR auth.uid () = (
                    SELECT member_id
                    FROM partners
                    WHERE
                        id = sr.host_partner_id
                )
            )
    )
    -- 또는 관리자인 경우
    OR EXISTS (
        SELECT 1
        FROM members
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);

-- stream_chat_bans (확장된 RLS 정책 - 전역 차단 지원)
ALTER TABLE stream_chat_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_chat_bans_select" ON stream_chat_bans FOR
SELECT USING (true);

-- 생성: 호스트만 (방 기준 또는 전역)
CREATE POLICY "stream_chat_bans_insert" ON stream_chat_bans FOR INSERT
WITH
    CHECK (
        banned_by_member_id = auth.uid ()
        AND (
            -- 방 기준 차단
            (
                room_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM stream_rooms
                    WHERE
                        id = room_id
                        AND (
                            host_member_id = auth.uid ()
                            OR auth.uid () = (
                                SELECT member_id
                                FROM partners
                                WHERE
                                    id = host_partner_id
                            )
                        )
                )
            )
            -- 전역 차단 (파트너 호스트)
            OR (
                scope = 'global'
                AND host_partner_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM partners
                    WHERE
                        id = host_partner_id
                        AND member_id = auth.uid ()
                )
            )
            -- 전역 차단 (일반 호스트)
            OR (
                scope = 'global'
                AND host_member_id = auth.uid ()
            )
        )
    );

-- 호스트가 밴/밴해제 관리
CREATE POLICY "stream_chat_bans_update" ON stream_chat_bans FOR
UPDATE USING (
    -- 밴을 건 본인
    banned_by_member_id = auth.uid ()
    -- 또는 방장
    OR (
        room_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM stream_rooms
            WHERE
                id = room_id
                AND (
                    host_member_id = auth.uid ()
                    OR auth.uid () = (
                        SELECT member_id
                        FROM partners
                        WHERE
                            id = host_partner_id
                    )
                )
        )
    )
    -- 또는 전역 차단의 호스트
    OR (
        host_partner_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM partners
            WHERE
                id = host_partner_id
                AND member_id = auth.uid ()
        )
    )
    OR host_member_id = auth.uid ()
);

CREATE POLICY "stream_chat_bans_delete" ON stream_chat_bans FOR DELETE USING (
    -- 밴을 건 본인
    banned_by_member_id = auth.uid ()
    -- 또는 방장
    OR (
        room_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM stream_rooms
            WHERE
                id = room_id
                AND (
                    host_member_id = auth.uid ()
                    OR auth.uid () = (
                        SELECT member_id
                        FROM partners
                        WHERE
                            id = host_partner_id
                    )
                )
        )
    )
    -- 또는 전역 차단의 호스트
    OR (
        host_partner_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM partners
            WHERE
                id = host_partner_id
                AND member_id = auth.uid ()
        )
    )
    OR host_member_id = auth.uid ()
);

-- stream_force_mutes RLS
ALTER TABLE stream_force_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_force_mutes_select" ON stream_force_mutes FOR
SELECT USING (true);

CREATE POLICY "stream_force_mutes_insert" ON stream_force_mutes FOR INSERT
WITH
    CHECK (
        muted_by_member_id = auth.uid ()
        AND EXISTS (
            SELECT 1
            FROM stream_rooms
            WHERE
                id = room_id
                AND (
                    host_member_id = auth.uid ()
                    OR auth.uid () = (
                        SELECT member_id
                        FROM partners
                        WHERE
                            id = host_partner_id
                    )
                )
        )
    );

-- stream_missions
ALTER TABLE stream_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_missions_select" ON stream_missions FOR
SELECT USING (true);

CREATE POLICY "stream_missions_insert" ON stream_missions FOR INSERT
WITH
    CHECK (auth.uid () = requester_id);

CREATE POLICY "stream_missions_update" ON stream_missions FOR
UPDATE USING (
    auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = target_partner_id
    )
);

-- stream_donations
ALTER TABLE stream_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_donations_select" ON stream_donations FOR
SELECT USING (true);

CREATE POLICY "stream_donations_insert" ON stream_donations FOR INSERT
WITH
    CHECK (auth.uid () = donor_id);

-- UPDATE: 수신자 파트너만 자신에게 온 도네이션 상태 변경 가능
-- - 호스트 파트너: 자신에게 온 미션만 관리 (다른 발언자의 미션 수정 불가)
-- - 발언자 파트너: 자신에게 온 미션만 수락/거절/성공/실패 처리 가능
CREATE POLICY "stream_donations_update" ON stream_donations FOR
UPDATE USING (
    -- 수신자 파트너인 경우 (자신에게 온 미션만)
    recipient_partner_id IS NOT NULL
    AND auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = recipient_partner_id
            AND partner_status = 'approved'
    )
);

-- stream_speaker_requests
ALTER TABLE stream_speaker_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_speaker_requests_select" ON stream_speaker_requests FOR
SELECT USING (true);

CREATE POLICY "stream_speaker_requests_insert" ON stream_speaker_requests FOR INSERT
WITH
    CHECK (
        auth.uid () = requester_member_id
    );

CREATE POLICY "stream_speaker_requests_update" ON stream_speaker_requests FOR
UPDATE USING (
    EXISTS (
        SELECT 1
        FROM stream_rooms
        WHERE
            id = room_id
            AND (
                host_member_id = auth.uid ()
                OR auth.uid () = (
                    SELECT member_id
                    FROM partners
                    WHERE
                        id = host_partner_id
                )
            )
    )
);

-- stream_co_host_requests
ALTER TABLE stream_co_host_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_co_host_requests_select" ON stream_co_host_requests FOR
SELECT USING (
        auth.uid () = (
            SELECT member_id
            FROM partners
            WHERE
                id = requester_partner_id
        )
        OR auth.uid () = (
            SELECT member_id
            FROM partners
            WHERE
                id = target_partner_id
        )
    );

CREATE POLICY "stream_co_host_requests_insert" ON stream_co_host_requests FOR INSERT
WITH
    CHECK (
        auth.uid () = (
            SELECT member_id
            FROM partners
            WHERE
                id = requester_partner_id
        )
    );

CREATE POLICY "stream_co_host_requests_update" ON stream_co_host_requests FOR
UPDATE USING (
    auth.uid () = (
        SELECT member_id
        FROM partners
        WHERE
            id = target_partner_id
    )
);

-- =====================================================================
-- Realtime 설정
-- =====================================================================

DO $$ 
BEGIN
    -- 테이블이 publication에 없으면 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stream_rooms') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE stream_rooms;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_chats'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_chats;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_donations'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_donations;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_missions'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_missions;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_speaker_requests'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_speaker_requests;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_room_invites'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_room_invites;

END IF;

IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_co_host_requests'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_co_host_requests;

END IF;

-- stream_hosts 테이블 Realtime 추가 (발언자 변경 실시간 감지용)
IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_hosts'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_hosts;

END IF;

-- stream_chat_bans 테이블 Realtime 추가 (차단 실시간 감지용)
IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_chat_bans'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_chat_bans;

END IF;

-- stream_force_mutes 테이블 Realtime 추가 (강제 뮤트 실시간 감지용)
IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_force_mutes'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_force_mutes;

END IF;

-- stream_viewers 테이블 Realtime 추가 (시청자 변경 실시간 감지용)
IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE
        pubname = 'supabase_realtime'
        AND tablename = 'stream_viewers'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE stream_viewers;

END IF;

END $$;

-- =====================================================================
-- 초기 데이터
-- =====================================================================

-- 카테고리
INSERT INTO
    stream_categories (name, slug, sort_order)
VALUES ('게임', 'game', 1),
    ('음악', 'music', 2),
    ('토크/수다', 'talk', 3),
    ('ASMR', 'asmr', 4),
    ('먹방', 'mukbang', 5),
    ('스포츠', 'sports', 6),
    ('교육', 'education', 7),
    ('기타', 'etc', 99)
ON CONFLICT (slug) DO NOTHING;

-- 선물 아이템
INSERT INTO
    gift_items (
        name,
        description,
        icon_url,
        price_points,
        tier,
        sort_order
    )
VALUES (
        '하트',
        '사랑을 담은 하트',
        '/gifts/heart.png',
        100,
        'common',
        1
    ),
    (
        '별',
        '반짝이는 별',
        '/gifts/star.png',
        500,
        'common',
        2
    ),
    (
        '꽃다발',
        '아름다운 꽃다발',
        '/gifts/bouquet.png',
        1000,
        'rare',
        3
    ),
    (
        '케이크',
        '축하 케이크',
        '/gifts/cake.png',
        3000,
        'rare',
        4
    ),
    (
        '왕관',
        '호스트에게 왕관을!',
        '/gifts/crown.png',
        10000,
        'epic',
        5
    ),
    (
        '로켓',
        '로켓 발사!',
        '/gifts/rocket.png',
        30000,
        'epic',
        6
    ),
    (
        '다이아몬드',
        '최고급 다이아몬드',
        '/gifts/diamond.png',
        50000,
        'legendary',
        7
    ),
    (
        '황금성',
        '황금으로 빛나는 성',
        '/gifts/castle.png',
        100000,
        'legendary',
        8
    )
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 모더레이션 함수
-- =====================================================================

-- 차단 상태 조회 함수 (현재 유효한 차단인지 확인)
CREATE OR REPLACE FUNCTION get_stream_ban_status(
    p_member_id UUID,
    p_room_id UUID DEFAULT NULL,
    p_host_partner_id UUID DEFAULT NULL,
    p_host_member_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_banned BOOLEAN,
    ban_type stream_ban_type,
    ban_scope stream_ban_scope,
    expires_at TIMESTAMPTZ,
    reason TEXT,
    banned_at TIMESTAMPTZ,
    banned_by UUID
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        true AS is_banned,
        scb.ban_type,
        scb.scope,
        scb.expires_at,
        scb.reason,
        scb.created_at AS banned_at,
        scb.banned_by_member_id AS banned_by
    FROM stream_chat_bans scb
    WHERE scb.target_member_id = p_member_id
      AND scb.is_active = true
      AND (scb.expires_at IS NULL OR scb.expires_at > now())
      AND (
          -- 특정 방 차단 체크
          (scb.scope = 'room' AND scb.room_id = p_room_id)
          -- 전역 차단 체크 (호스트 기준)
          OR (scb.scope = 'global' AND (
              (p_host_partner_id IS NOT NULL AND scb.host_partner_id = p_host_partner_id)
              OR (p_host_member_id IS NOT NULL AND scb.host_member_id = p_host_member_id)
          ))
          -- kick 타입은 항상 방 기준 영구 차단
          OR (scb.ban_type = 'kick' AND scb.room_id = p_room_id)
      )
    ORDER BY scb.created_at DESC
    LIMIT 1;
END;
$$;

-- 호스트 방송 메시지 조회 함수 (현재 호스트의 방송에서 특정 유저가 쓴 메시지)
CREATE OR REPLACE FUNCTION get_member_messages_in_host_streams(
    p_target_member_id UUID,
    p_host_partner_id UUID DEFAULT NULL,
    p_host_member_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    message_id BIGINT,
    room_id UUID,
    room_title TEXT,
    content TEXT,
    chat_type stream_chat_type,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sc.id AS message_id,
        sc.room_id,
        sr.title AS room_title,
        sc.content,
        sc.chat_type,
        sc.created_at
    FROM stream_chats sc
    JOIN stream_rooms sr ON sc.room_id = sr.id
    WHERE sc.sender_id = p_target_member_id
      AND sc.is_deleted = false
      AND (
          (p_host_partner_id IS NOT NULL AND sr.host_partner_id = p_host_partner_id)
          OR (p_host_member_id IS NOT NULL AND sr.host_member_id = p_host_member_id)
      )
    ORDER BY sc.created_at DESC
    LIMIT p_limit;
END;
$$;

-- 제재 내역 조회 함수 (특정 유저의 제재 내역)
CREATE OR REPLACE FUNCTION get_member_ban_history(
    p_target_member_id UUID,
    p_host_partner_id UUID DEFAULT NULL,
    p_host_member_id UUID DEFAULT NULL
)
RETURNS TABLE (
    ban_id UUID,
    room_id UUID,
    room_title TEXT,
    ban_type stream_ban_type,
    ban_scope stream_ban_scope,
    reason TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    banned_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        scb.id AS ban_id,
        scb.room_id,
        COALESCE(sr.title, '전체') AS room_title,
        scb.ban_type,
        scb.scope,
        scb.reason,
        scb.expires_at,
        scb.is_active,
        scb.created_at,
        m.name AS banned_by_name
    FROM stream_chat_bans scb
    LEFT JOIN stream_rooms sr ON scb.room_id = sr.id
    LEFT JOIN members m ON scb.banned_by_member_id = m.id
    WHERE scb.target_member_id = p_target_member_id
      AND (
          p_host_partner_id IS NULL OR scb.host_partner_id = p_host_partner_id
          OR p_host_member_id IS NULL OR scb.host_member_id = p_host_member_id
          OR (scb.room_id IS NOT NULL AND sr.host_partner_id = p_host_partner_id)
          OR (scb.room_id IS NOT NULL AND sr.host_member_id = p_host_member_id)
      )
    ORDER BY scb.created_at DESC;
END;
$$;

-- =====================================================================
-- 후원 처리 RPC 함수 (원자적 트랜잭션 + 중복 방지)
-- =====================================================================
-- ⚠️ 주의: member_points_logs와 partner_points_logs 테이블에
--         log_id 부분 UNIQUE 인덱스가 필요합니다.
--
-- 아래 인덱스가 없으면 별도로 생성해야 합니다:
-- CREATE UNIQUE INDEX idx_member_points_logs_log_id_unique
--   ON member_points_logs (log_id) WHERE log_id IS NOT NULL;
-- CREATE UNIQUE INDEX idx_partner_points_logs_log_id_unique
--   ON partner_points_logs (log_id) WHERE log_id IS NOT NULL;
-- =====================================================================
-- 변경사항 (v2.5):
--   - p_donation_type 파라미터 추가 (기본값: 'basic')
--   - 미션 타입일 때 escrow 처리 (파트너에게 즉시 지급하지 않음)
-- =====================================================================

CREATE OR REPLACE FUNCTION process_donation(
  p_donor_id UUID,
  p_partner_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_log_id TEXT,
  p_donation_type TEXT DEFAULT 'basic'
) RETURNS JSONB AS $$
DECLARE
  v_member_points INTEGER;
  v_partner_points INTEGER;
  v_new_member_points INTEGER;
  v_new_partner_points INTEGER;
  v_donor_name TEXT;
  v_is_mission BOOLEAN;
BEGIN
  -- donation_type 검증
  IF p_donation_type NOT IN ('basic', 'mission', 'video') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'INVALID_DONATION_TYPE',
      'error_message', '유효하지 않은 후원 타입입니다.'
    );
  END IF;

  v_is_mission := (p_donation_type = 'mission');

  -- 1. 최소 금액 검증 (1000P 이상)
  IF p_amount < 1000 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'MIN_AMOUNT_REQUIRED',
      'error_message', '최소 1,000P 이상 후원해야 합니다.'
    );
  END IF;

  -- 2. 중복 요청 체크 (log_id로 이미 처리된 요청인지 확인)
  IF p_log_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM member_points_logs WHERE log_id = p_log_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'DUPLICATE_REQUEST',
      'error_message', '이미 처리된 요청입니다.'
    );
  END IF;

  -- 3. 후원자 정보 조회 + 락 (레이스 컨디션 방지)
  SELECT total_points, name INTO v_member_points, v_donor_name
  FROM members 
  WHERE id = p_donor_id 
  FOR UPDATE;

  IF v_member_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'MEMBER_NOT_FOUND',
      'error_message', '사용자를 찾을 수 없습니다.'
    );
  END IF;

  -- 4. 포인트 부족 체크
  IF v_member_points < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'INSUFFICIENT_POINTS',
      'error_message', '포인트가 부족합니다.',
      'required', p_amount,
      'available', v_member_points
    );
  END IF;

  -- 5. 파트너 정보 조회 + 락 (미션이 아닐 때만 필요)
  IF NOT v_is_mission THEN
  SELECT total_points INTO v_partner_points
  FROM partners 
  WHERE id = p_partner_id 
  FOR UPDATE;

  IF v_partner_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'PARTNER_NOT_FOUND',
      'error_message', '파트너를 찾을 수 없습니다.'
    );
    END IF;
  END IF;

  -- 6. 포인트 계산
  v_new_member_points := v_member_points - p_amount;
  
  -- 미션 타입: 파트너에게 즉시 지급하지 않음 (escrow)
  -- 일반 타입: 파트너에게 즉시 지급
  IF v_is_mission THEN
    v_new_partner_points := COALESCE(v_partner_points, 0); -- 변경 없음
  ELSE
  v_new_partner_points := COALESCE(v_partner_points, 0) + p_amount;
  END IF;

  -- 7. 원자적 업데이트 - 후원자 포인트 차감
  UPDATE members 
  SET total_points = v_new_member_points,
      updated_at = now()
  WHERE id = p_donor_id;

  -- 8. 원자적 업데이트 - 파트너 포인트 (일반 후원만)
  IF NOT v_is_mission THEN
  UPDATE partners 
  SET total_points = v_new_partner_points,
      updated_at = now()
  WHERE id = p_partner_id;
  END IF;

  -- 9. 후원자 포인트 로그 추가 (member_points_logs)
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (
    p_donor_id, 
    'spend', 
    p_amount, 
    CASE 
      WHEN v_is_mission THEN COALESCE(p_description, '미션 신청 (대기중)')
      ELSE COALESCE(p_description, '파트너 후원')
    END,
    p_log_id
  );

  -- 10. 파트너 포인트 로그 추가 (일반 후원만)
  IF NOT v_is_mission THEN
  INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id)
  VALUES (
    p_partner_id, 
    'earn', 
    p_amount, 
    COALESCE(v_donor_name, '회원') || ' 후원',
    p_log_id
  );
  END IF;

  -- 11. 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'member_new_points', v_new_member_points,
    'partner_new_points', CASE WHEN v_is_mission THEN NULL ELSE v_new_partner_points END,
    'amount', p_amount,
    'log_id', p_log_id,
    'is_mission', v_is_mission
  );

EXCEPTION
  WHEN unique_violation THEN
    -- log_id 중복 (동시 요청)
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'DUPLICATE_REQUEST',
      'error_message', '이미 처리된 요청입니다.'
    );
  WHEN OTHERS THEN
    -- 기타 에러 (자동 롤백됨)
    RETURN jsonb_build_object(
      'success', false, 
      'error_code', 'TRANSACTION_FAILED',
      'error_message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수 소유자 설정
ALTER FUNCTION process_donation(UUID, UUID, INTEGER, TEXT, TEXT, TEXT) OWNER TO postgres;

-- 함수 주석
COMMENT ON FUNCTION process_donation IS '후원 처리 함수 - 일반 후원은 즉시 지급, 미션 후원은 escrow 보관';

-- =====================================================================
-- 미션 후원 포인트 플로우 RPC 함수들 (v2.5)
-- =====================================================================

-- 미션 수락 처리 함수
CREATE OR REPLACE FUNCTION process_mission_accept(
  p_donation_id INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_donation RECORD;
BEGIN
  -- 1. 도네이션 정보 조회
  SELECT 
    id, donation_type, status, amount, escrow_amount,
    donor_id, recipient_partner_id
  INTO v_donation
  FROM stream_donations
  WHERE id = p_donation_id
  FOR UPDATE;

  -- 2. 존재 여부 확인
  IF v_donation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DONATION_NOT_FOUND',
      'error_message', '도네이션을 찾을 수 없습니다.'
    );
  END IF;

  -- 3. 미션 타입 확인
  IF v_donation.donation_type != 'mission' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DONATION_TYPE',
      'error_message', '미션 도네이션이 아닙니다.'
    );
  END IF;

  -- 4. 상태 확인 (pending만 수락 가능)
  IF v_donation.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', '수락할 수 없는 상태입니다. (현재 상태: ' || v_donation.status || ')'
    );
  END IF;

  -- 5. escrow_amount 설정 (아직 설정되지 않은 경우)
  IF v_donation.escrow_amount = 0 THEN
    UPDATE stream_donations
    SET escrow_amount = v_donation.amount
    WHERE id = p_donation_id;
  END IF;

  -- 6. 상태 업데이트 (포인트 변경 없음)
  UPDATE stream_donations
  SET 
    status = 'accepted'
  WHERE id = p_donation_id;

  -- 7. 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'donation_id', p_donation_id,
    'status', 'accepted',
    'message', '미션이 수락되었습니다. 포인트는 보관 중입니다.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_FAILED',
      'error_message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_mission_accept IS '미션 수락 처리 - 포인트 변경 없음, escrow 보관 상태 유지';

-- 미션 거절 처리 함수 (전액 환불)
CREATE OR REPLACE FUNCTION process_mission_refund(
  p_donation_id INTEGER,
  p_reason TEXT DEFAULT '미션 거절'
) RETURNS JSONB AS $$
DECLARE
  v_donation RECORD;
  v_member_points INTEGER;
  v_new_member_points INTEGER;
  v_refund_amount INTEGER;
  v_refund_log_id TEXT;
BEGIN
  -- 1. 도네이션 정보 조회
  SELECT 
    id, donation_type, status, amount, escrow_amount,
    donor_id, recipient_partner_id
  INTO v_donation
  FROM stream_donations
  WHERE id = p_donation_id
  FOR UPDATE;

  -- 2. 존재 여부 확인
  IF v_donation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DONATION_NOT_FOUND',
      'error_message', '도네이션을 찾을 수 없습니다.'
    );
  END IF;

  -- 3. 미션 타입 확인
  IF v_donation.donation_type != 'mission' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DONATION_TYPE',
      'error_message', '미션 도네이션이 아닙니다.'
    );
  END IF;

  -- 4. 상태 확인 (pending만 거절 가능)
  IF v_donation.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', '거절할 수 없는 상태입니다. (현재 상태: ' || v_donation.status || ')'
    );
  END IF;

  -- 5. 환불 금액 결정 (escrow_amount 또는 amount)
  v_refund_amount := COALESCE(v_donation.escrow_amount, v_donation.amount);

  -- 6. 후원자 정보 조회 + 락
  SELECT total_points INTO v_member_points
  FROM members
  WHERE id = v_donation.donor_id
  FOR UPDATE;

  IF v_member_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_NOT_FOUND',
      'error_message', '사용자를 찾을 수 없습니다.'
    );
  END IF;

  -- 7. 환불 처리
  v_new_member_points := v_member_points + v_refund_amount;
  v_refund_log_id := 'refund_mission_' || p_donation_id || '_' || EXTRACT(EPOCH FROM now())::BIGINT;

  -- 8. 후원자 포인트 환불
  UPDATE members
  SET 
    total_points = v_new_member_points,
    updated_at = now()
  WHERE id = v_donation.donor_id;

  -- 9. 환불 로그 추가
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (
    v_donation.donor_id,
    'earn',
    v_refund_amount,
    '미션 거절 환불: ' || COALESCE(p_reason, '미션 거절'),
    v_refund_log_id
  );

  -- 10. 도네이션 상태 업데이트 (escrow 해제)
  UPDATE stream_donations
  SET 
    status = 'rejected',
    escrow_amount = 0,
    processed_at = now()
  WHERE id = p_donation_id;

  -- 11. 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'donation_id', p_donation_id,
    'status', 'rejected',
    'refund_amount', v_refund_amount,
    'member_new_points', v_new_member_points,
    'message', '미션이 거절되었고 포인트가 환불되었습니다.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_FAILED',
      'error_message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_mission_refund IS '미션 거절 처리 - 시청자에게 전액 환불, escrow 해제';

-- 미션 성공 처리 함수 (파트너/호스트에게 전액 지급)
CREATE OR REPLACE FUNCTION process_mission_success(
  p_donation_id INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_donation RECORD;
  v_partner_points INTEGER;
  v_new_partner_points INTEGER;
  v_payment_amount INTEGER;
  v_payment_log_id TEXT;
BEGIN
  -- 1. 도네이션 정보 조회
  SELECT 
    id, donation_type, status, amount, escrow_amount,
    donor_id, recipient_partner_id
  INTO v_donation
  FROM stream_donations
  WHERE id = p_donation_id
  FOR UPDATE;

  -- 2. 존재 여부 확인
  IF v_donation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DONATION_NOT_FOUND',
      'error_message', '도네이션을 찾을 수 없습니다.'
    );
  END IF;

  -- 3. 미션 타입 확인
  IF v_donation.donation_type != 'mission' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DONATION_TYPE',
      'error_message', '미션 도네이션이 아닙니다.'
    );
  END IF;

  -- 4. 상태 확인 (accepted만 성공 가능)
  IF v_donation.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', '성공 처리할 수 없는 상태입니다. (현재 상태: ' || v_donation.status || ')'
    );
  END IF;

  -- 5. 지급 금액 결정 (escrow_amount 또는 amount)
  v_payment_amount := COALESCE(v_donation.escrow_amount, v_donation.amount);

  -- 6. 파트너 정보 조회 + 락
  SELECT total_points INTO v_partner_points
  FROM partners
  WHERE id = v_donation.recipient_partner_id
  FOR UPDATE;

  IF v_partner_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PARTNER_NOT_FOUND',
      'error_message', '파트너를 찾을 수 없습니다.'
    );
  END IF;

  -- 7. 파트너 포인트 지급
  v_new_partner_points := COALESCE(v_partner_points, 0) + v_payment_amount;
  v_payment_log_id := 'mission_success_' || p_donation_id || '_' || EXTRACT(EPOCH FROM now())::BIGINT;

  UPDATE partners
  SET 
    total_points = v_new_partner_points,
    updated_at = now()
  WHERE id = v_donation.recipient_partner_id;

  -- 8. 파트너 포인트 로그 추가
  INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id)
  VALUES (
    v_donation.recipient_partner_id,
    'earn',
    v_payment_amount,
    '미션 성공 지급',
    v_payment_log_id
  );

  -- 9. 도네이션 상태 업데이트 (escrow 해제)
  UPDATE stream_donations
  SET 
    status = 'success',
    escrow_amount = 0,
    processed_at = now()
  WHERE id = p_donation_id;

  -- 10. 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'donation_id', p_donation_id,
    'status', 'success',
    'payment_amount', v_payment_amount,
    'partner_new_points', v_new_partner_points,
    'message', '미션이 성공했고 포인트가 지급되었습니다.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_FAILED',
      'error_message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_mission_success IS '미션 성공 처리 - 파트너/호스트에게 전액 지급, escrow 해제';

-- 미션 실패 처리 함수 (수수료 계산 및 분배)
CREATE OR REPLACE FUNCTION process_mission_failure(
  p_donation_id INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_donation RECORD;
  v_member_points INTEGER;
  v_partner_points INTEGER;
  v_new_member_points INTEGER;
  v_new_partner_points INTEGER;
  v_total_amount INTEGER;
  v_fee INTEGER;
  v_refund_amount INTEGER;
  v_refund_log_id TEXT;
  v_fee_log_id TEXT;
BEGIN
  -- 1. 도네이션 정보 조회
  SELECT 
    id, donation_type, status, amount, escrow_amount,
    donor_id, recipient_partner_id
  INTO v_donation
  FROM stream_donations
  WHERE id = p_donation_id
  FOR UPDATE;

  -- 2. 존재 여부 확인
  IF v_donation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DONATION_NOT_FOUND',
      'error_message', '도네이션을 찾을 수 없습니다.'
    );
  END IF;

  -- 3. 미션 타입 확인
  IF v_donation.donation_type != 'mission' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DONATION_TYPE',
      'error_message', '미션 도네이션이 아닙니다.'
    );
  END IF;

  -- 4. 상태 확인 (accepted만 실패 가능)
  IF v_donation.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', '실패 처리할 수 없는 상태입니다. (현재 상태: ' || v_donation.status || ')'
    );
  END IF;

  -- 5. 총 금액 결정 (escrow_amount 또는 amount)
  v_total_amount := COALESCE(v_donation.escrow_amount, v_donation.amount);

  -- 6. 수수료 계산 (10%, 최소 1000P)
  v_fee := GREATEST(CEIL(v_total_amount * 0.1)::INTEGER, 1000);
  v_refund_amount := v_total_amount - v_fee;

  -- 7. 후원자 정보 조회 + 락
  SELECT total_points INTO v_member_points
  FROM members
  WHERE id = v_donation.donor_id
  FOR UPDATE;

  IF v_member_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_NOT_FOUND',
      'error_message', '사용자를 찾을 수 없습니다.'
    );
  END IF;

  -- 8. 파트너 정보 조회 + 락
  SELECT total_points INTO v_partner_points
  FROM partners
  WHERE id = v_donation.recipient_partner_id
  FOR UPDATE;

  IF v_partner_points IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PARTNER_NOT_FOUND',
      'error_message', '파트너를 찾을 수 없습니다.'
    );
  END IF;

  -- 9. 포인트 계산
  v_new_member_points := v_member_points + v_refund_amount;
  v_new_partner_points := COALESCE(v_partner_points, 0) + v_fee;

  -- 10. 로그 ID 생성
  v_refund_log_id := 'mission_fail_refund_' || p_donation_id || '_' || EXTRACT(EPOCH FROM now())::BIGINT;
  v_fee_log_id := 'mission_fail_fee_' || p_donation_id || '_' || EXTRACT(EPOCH FROM now())::BIGINT;

  -- 11. 후원자 포인트 환불 (수수료 제외)
  UPDATE members
  SET 
    total_points = v_new_member_points,
    updated_at = now()
  WHERE id = v_donation.donor_id;

  -- 12. 파트너 포인트 지급 (수수료만)
  UPDATE partners
  SET 
    total_points = v_new_partner_points,
    updated_at = now()
  WHERE id = v_donation.recipient_partner_id;

  -- 13. 후원자 환불 로그 추가
  INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
  VALUES (
    v_donation.donor_id,
    'earn',
    v_refund_amount,
    '미션 실패 환불 (수수료 제외: ' || v_fee || 'P)',
    v_refund_log_id
  );

  -- 14. 파트너 수수료 로그 추가
  INSERT INTO partner_points_logs (partner_id, type, amount, description, log_id)
  VALUES (
    v_donation.recipient_partner_id,
    'earn',
    v_fee,
    '미션 실패 수수료 지급',
    v_fee_log_id
  );

  -- 15. 도네이션 상태 업데이트 (escrow 해제)
  UPDATE stream_donations
  SET 
    status = 'failed',
    escrow_amount = 0,
    processed_at = now()
  WHERE id = p_donation_id;

  -- 16. 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'donation_id', p_donation_id,
    'status', 'failed',
    'total_amount', v_total_amount,
    'fee', v_fee,
    'refund_amount', v_refund_amount,
    'member_new_points', v_new_member_points,
    'partner_new_points', v_new_partner_points,
    'message', '미션이 실패했습니다. 수수료(' || v_fee || 'P)를 제외한 금액이 환불되었습니다.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_FAILED',
      'error_message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_mission_failure IS '미션 실패 처리 - 시청자에게 수수료 제외 환불, 파트너에게 수수료 지급 (10%, 최소 1000P), escrow 해제';

-- =====================================================================
-- 후원 룰렛 시스템 (v2.4)
-- 추가일: 2025-12-25
--
-- 파트너가 설정한 룰렛을 후원 시 자동 실행
-- 큐 순서대로 모든 참가자에게 표시
-- =====================================================================

-- =====================================================================
-- 13. partner_roulette_settings (파트너별 룰렛 설정)
-- =====================================================================

CREATE TABLE IF NOT EXISTS partner_roulette_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT false,               -- 룰렛 활성화 여부
    min_donation_amount INTEGER DEFAULT 3000,       -- 룰렛 참여 최소 후원 금액 (기본 3000P)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(partner_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_settings_partner 
    ON partner_roulette_settings(partner_id);

CREATE INDEX IF NOT EXISTS idx_partner_roulette_settings_enabled 
    ON partner_roulette_settings(partner_id, is_enabled) 
    WHERE is_enabled = true;

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_partner_roulette_settings_updated ON partner_roulette_settings;
CREATE TRIGGER trg_partner_roulette_settings_updated
    BEFORE UPDATE ON partner_roulette_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE partner_roulette_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_roulette_settings_select" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_insert" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_update" ON partner_roulette_settings;
DROP POLICY IF EXISTS "partner_roulette_settings_delete" ON partner_roulette_settings;

CREATE POLICY "partner_roulette_settings_select" ON partner_roulette_settings
FOR SELECT USING (true);

CREATE POLICY "partner_roulette_settings_insert" ON partner_roulette_settings
FOR INSERT WITH CHECK (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_settings_update" ON partner_roulette_settings
FOR UPDATE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_settings_delete" ON partner_roulette_settings
FOR DELETE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

COMMENT ON TABLE partner_roulette_settings IS '파트너별 후원 룰렛 설정 (자동 실행)';

-- =====================================================================
-- 14. partner_roulette_items (룰렛 아이템)
-- =====================================================================

CREATE TABLE IF NOT EXISTS partner_roulette_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    color TEXT DEFAULT '#FF6B6B',
    weight INTEGER NOT NULL DEFAULT 10
        CHECK (weight >= 0 AND weight <= 100),
    reward_type TEXT NOT NULL DEFAULT 'text'
        CHECK (reward_type IN ('text', 'points', 'coupon', 'custom')),
    reward_value TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_items_partner 
    ON partner_roulette_items(partner_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_partner_roulette_items_active 
    ON partner_roulette_items(partner_id, is_active) 
    WHERE is_active = true;

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_partner_roulette_items_updated ON partner_roulette_items;
CREATE TRIGGER trg_partner_roulette_items_updated
    BEFORE UPDATE ON partner_roulette_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE partner_roulette_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_roulette_items_select" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_insert" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_update" ON partner_roulette_items;
DROP POLICY IF EXISTS "partner_roulette_items_delete" ON partner_roulette_items;

CREATE POLICY "partner_roulette_items_select" ON partner_roulette_items
FOR SELECT USING (true);

CREATE POLICY "partner_roulette_items_insert" ON partner_roulette_items
FOR INSERT WITH CHECK (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_items_update" ON partner_roulette_items
FOR UPDATE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "partner_roulette_items_delete" ON partner_roulette_items
FOR DELETE USING (
    auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

COMMENT ON TABLE partner_roulette_items IS '파트너별 룰렛 아이템 목록';
COMMENT ON COLUMN partner_roulette_items.weight IS '가중치 (확률, 0~100 정수, 전체 합계 100)';
COMMENT ON COLUMN partner_roulette_items.reward_type IS 'text(텍스트만), points(포인트), coupon(쿠폰), custom(커스텀)';

-- =====================================================================
-- 15. donation_roulette_results (룰렛 결과 기록)
-- =====================================================================

CREATE TABLE IF NOT EXISTS donation_roulette_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id INTEGER NOT NULL,
    room_id UUID NOT NULL REFERENCES stream_rooms(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    roulette_item_id UUID REFERENCES partner_roulette_items(id) ON DELETE SET NULL,
    -- 당첨 아이템 스냅샷
    item_name TEXT NOT NULL,
    item_color TEXT,
    item_reward_type TEXT NOT NULL,
    item_reward_value TEXT,
    -- 돌림판 렌더링용
    all_items JSONB NOT NULL,
    final_rotation NUMERIC(10, 2) NOT NULL,
    -- 보상 처리
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_room 
    ON donation_roulette_results(room_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_donation_roulette_results_donation_unique 
    ON donation_roulette_results(donation_id);

-- RLS
ALTER TABLE donation_roulette_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "donation_roulette_results_select" ON donation_roulette_results;
DROP POLICY IF EXISTS "donation_roulette_results_insert" ON donation_roulette_results;

CREATE POLICY "donation_roulette_results_select" ON donation_roulette_results
FOR SELECT USING (true);

CREATE POLICY "donation_roulette_results_insert" ON donation_roulette_results
FOR INSERT WITH CHECK (auth.uid() = donor_id);

COMMENT ON TABLE donation_roulette_results IS '후원 룰렛 결과 (Realtime으로 모든 클라이언트에 전파)';
COMMENT ON COLUMN donation_roulette_results.all_items IS '전체 룰렛 아이템 목록 (돌림판 렌더링용 JSONB)';
COMMENT ON COLUMN donation_roulette_results.final_rotation IS '최종 회전 각도 (모든 클라이언트 동기화용)';

-- stream_donations에 룰렛 컬럼 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stream_donations' AND column_name = 'has_roulette'
    ) THEN
        ALTER TABLE stream_donations ADD COLUMN has_roulette BOOLEAN DEFAULT false;
        COMMENT ON COLUMN stream_donations.has_roulette IS '룰렛 실행 여부';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stream_donations' AND column_name = 'roulette_result_id'
    ) THEN
        ALTER TABLE stream_donations ADD COLUMN roulette_result_id UUID;
        COMMENT ON COLUMN stream_donations.roulette_result_id IS '룰렛 결과 ID (참조용)';
    END IF;
END;
$$;

-- Realtime 활성화
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'donation_roulette_results'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE donation_roulette_results;
    END IF;
END;
$$;

-- =====================================================================
-- 룰렛 RPC 함수
-- =====================================================================

-- 가중치 기반 룰렛 결과 계산
CREATE OR REPLACE FUNCTION calculate_roulette_result(
    p_partner_id UUID
) RETURNS UUID AS $$
DECLARE
    v_total_weight INTEGER;
    v_random_value INTEGER;
    v_cumulative_weight INTEGER := 0;
    v_item RECORD;
    v_result_id UUID;
BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO v_total_weight
    FROM partner_roulette_items
    WHERE partner_id = p_partner_id AND is_active = true;
    
    IF v_total_weight = 0 THEN
        RETURN NULL;
    END IF;
    
    v_random_value := floor(random() * v_total_weight)::INTEGER;
    
    FOR v_item IN
        SELECT id, weight
        FROM partner_roulette_items
        WHERE partner_id = p_partner_id AND is_active = true
        ORDER BY sort_order
    LOOP
        v_cumulative_weight := v_cumulative_weight + v_item.weight;
        IF v_random_value < v_cumulative_weight THEN
            RETURN v_item.id;
        END IF;
    END LOOP;
    
    SELECT id INTO v_result_id
    FROM partner_roulette_items
    WHERE partner_id = p_partner_id AND is_active = true
    ORDER BY sort_order DESC
    LIMIT 1;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_roulette_result IS '가중치 기반 룰렛 결과 계산 (랜덤 아이템 ID 반환)';

-- 룰렛 자동 실행 RPC
CREATE OR REPLACE FUNCTION execute_donation_roulette(
    p_donation_id INTEGER,
    p_room_id UUID,
    p_donor_id UUID,
    p_partner_id UUID,
    p_donation_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_settings RECORD;
    v_winning_item_id UUID;
    v_winning_item RECORD;
    v_all_items JSONB;
    v_final_rotation NUMERIC(10, 2);
    v_item_index INTEGER;
    v_item_count INTEGER;
    v_result_id UUID;
BEGIN
    -- 1. 룰렛 설정 조회
    SELECT * INTO v_settings
    FROM partner_roulette_settings
    WHERE partner_id = p_partner_id AND is_enabled = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROULETTE_NOT_ENABLED');
    END IF;
    
    -- 2. 최소 금액 확인
    IF p_donation_amount < v_settings.min_donation_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'AMOUNT_TOO_LOW', 
            'min_amount', v_settings.min_donation_amount
        );
    END IF;
    
    -- 3. 전체 아이템 조회
    SELECT 
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'name', name,
                'color', color,
                'weight', weight,
                'reward_type', reward_type,
                'reward_value', reward_value
            ) ORDER BY sort_order
        ),
        COUNT(*)
    INTO v_all_items, v_item_count
    FROM partner_roulette_items
    WHERE partner_id = p_partner_id AND is_active = true;
    
    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_ROULETTE_ITEMS');
    END IF;
    
    -- 4. 당첨 아이템 결정
    v_winning_item_id := calculate_roulette_result(p_partner_id);
    
    SELECT * INTO v_winning_item
    FROM partner_roulette_items
    WHERE id = v_winning_item_id;
    
    -- 5. 아이템 인덱스 계산
    SELECT row_number INTO v_item_index
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS row_number
        FROM partner_roulette_items
        WHERE partner_id = p_partner_id AND is_active = true
    ) sub
    WHERE id = v_winning_item_id;
    
    -- 6. 최종 회전 각도 계산 (3~5회전)
    v_final_rotation := (3 + random() * 2) * 360 + (270 - (v_item_index * (360.0 / v_item_count) + (360.0 / v_item_count / 2)));
    
    -- 7. 결과 저장 (Realtime 전파)
    INSERT INTO donation_roulette_results (
        donation_id,
        room_id,
        donor_id,
        partner_id,
        roulette_item_id,
        item_name,
        item_color,
        item_reward_type,
        item_reward_value,
        all_items,
        final_rotation
    ) VALUES (
        p_donation_id,
        p_room_id,
        p_donor_id,
        p_partner_id,
        v_winning_item_id,
        v_winning_item.name,
        v_winning_item.color,
        v_winning_item.reward_type,
        v_winning_item.reward_value,
        v_all_items,
        v_final_rotation
    )
    RETURNING id INTO v_result_id;
    
    -- 8. stream_donations 업데이트
    UPDATE stream_donations
    SET has_roulette = true, roulette_result_id = v_result_id
    WHERE id = p_donation_id;
    
    -- 9. 보상 자동 처리 (포인트 지급)
    IF v_winning_item.reward_type = 'points' AND v_winning_item.reward_value IS NOT NULL THEN
        DECLARE
            v_bonus_points INTEGER := v_winning_item.reward_value::INTEGER;
        BEGIN
            UPDATE members SET total_points = total_points + v_bonus_points WHERE id = p_donor_id;
            INSERT INTO member_points_logs (member_id, type, amount, description, log_id)
            VALUES (p_donor_id, 'earn', v_bonus_points, '룰렛 당첨: ' || v_winning_item.name, 'roulette_' || v_result_id::text);
            
            UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
        END;
    ELSE
        UPDATE donation_roulette_results SET is_processed = true WHERE id = v_result_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'result_id', v_result_id,
        'item_name', v_winning_item.name,
        'item_color', v_winning_item.color,
        'reward_type', v_winning_item.reward_type,
        'reward_value', v_winning_item.reward_value,
        'final_rotation', v_final_rotation
    );
    
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_ROULETTE');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'EXECUTION_FAILED', 'detail', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION execute_donation_roulette IS '후원 룰렛 자동 실행 RPC - 후원 후 호출, 결과는 Realtime으로 전파';

-- 파트너 룰렛 설정 조회 RPC
CREATE OR REPLACE FUNCTION get_partner_roulette_settings(
    p_partner_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_settings RECORD;
    v_items JSONB;
    v_total_weight INTEGER;
BEGIN
    SELECT * INTO v_settings
    FROM partner_roulette_settings
    WHERE partner_id = p_partner_id;
    
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'name', name,
                'description', description,
                'color', color,
                'weight', weight,
                'reward_type', reward_type,
                'reward_value', reward_value,
                'sort_order', sort_order,
                'is_active', is_active
            ) ORDER BY sort_order
        ), '[]'::jsonb),
        COALESCE(SUM(CASE WHEN is_active THEN weight ELSE 0 END), 0)
    INTO v_items, v_total_weight
    FROM partner_roulette_items
    WHERE partner_id = p_partner_id;
    
    RETURN jsonb_build_object(
        'is_enabled', COALESCE(v_settings.is_enabled, false),
        'min_donation_amount', COALESCE(v_settings.min_donation_amount, 3000),
        'items', v_items,
        'total_weight', v_total_weight,
        'is_valid', v_total_weight = 100
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_partner_roulette_settings IS '파트너 룰렛 설정 조회 RPC (아이템 목록 포함)';

-- 파트너 룰렛 설정 저장 RPC
CREATE OR REPLACE FUNCTION upsert_partner_roulette_settings(
    p_partner_id UUID,
    p_is_enabled BOOLEAN DEFAULT NULL,
    p_min_donation_amount INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_result RECORD;
BEGIN
    INSERT INTO partner_roulette_settings (partner_id, is_enabled, min_donation_amount)
    VALUES (
        p_partner_id, 
        COALESCE(p_is_enabled, false), 
        COALESCE(p_min_donation_amount, 3000)
    )
    ON CONFLICT (partner_id) DO UPDATE SET
        is_enabled = COALESCE(p_is_enabled, partner_roulette_settings.is_enabled),
        min_donation_amount = COALESCE(p_min_donation_amount, partner_roulette_settings.min_donation_amount),
        updated_at = now()
    RETURNING * INTO v_result;
    
    RETURN jsonb_build_object(
        'success', true,
        'id', v_result.id,
        'is_enabled', v_result.is_enabled,
        'min_donation_amount', v_result.min_donation_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION upsert_partner_roulette_settings IS '파트너 룰렛 설정 저장/업데이트 RPC';

-- 가중치 검증 뷰
CREATE OR REPLACE VIEW partner_roulette_weight_summary AS
SELECT 
    partner_id,
    COUNT(*) AS item_count,
    SUM(weight) AS total_weight,
    SUM(weight) = 100 AS is_valid
FROM partner_roulette_items
WHERE is_active = true
GROUP BY partner_id;

COMMENT ON VIEW partner_roulette_weight_summary IS '파트너별 룰렛 가중치 합계 (100% 검증용)';