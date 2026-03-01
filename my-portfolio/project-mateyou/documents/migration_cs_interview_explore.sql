-- CS·면접·탐색 기능 마이그레이션
-- 적용일: 2026-02-17
-- 이미 Supabase MCP를 통해 적용 완료

-- 1. members 테이블에 admin_role 컬럼 추가
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS admin_role integer DEFAULT 0;

-- 2. chat_rooms 테이블에 is_cs_room 컬럼 추가 + partner_id nullable (CS 방은 partner 없음)
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS is_cs_room boolean DEFAULT false;
ALTER TABLE public.chat_rooms ALTER COLUMN partner_id DROP NOT NULL;

-- 3. member_chats.receiver_id를 nullable로 변경 (CS 방에서 receiver_id=null = "CS 팀에게")
ALTER TABLE public.member_chats ALTER COLUMN receiver_id DROP NOT NULL;

-- 4. is_cs_room 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_rooms_is_cs_room ON public.chat_rooms (is_cs_room) WHERE is_cs_room = true;

-- 5. partners 테이블에 인터뷰/추천인 컬럼 추가
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS referrer_member_code text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_legal_name text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_phone text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_email text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS interview_contact_id text;

-- 6. explore_category에 section_type 추가
ALTER TABLE public.explore_category ADD COLUMN IF NOT EXISTS section_type text;

-- 7. 자동화 섹션 6종 + 인기 파트너 랭킹 seed
INSERT INTO public.explore_category (name, hashtag, is_pinned, sort_order, section_type) VALUES
  ('따끈따끈한 뉴비 크리에이터', '["NEW!"]', false, 2, 'new_partners'),
  ('지금 핫한 셀러', '["STORE"]', false, 3, 'store_sales'),
  ('바로 구경하러 올래요?', '["봐도봐도끝이없는","HUSTLER"]', false, 4, 'top_posts'),
  ('취향별 미션 수행!', '["퀘스트","미션"]', false, 5, 'top_quests'),
  ('이런 파트너 어때요?', '["빠르게","구독중인"]', false, 6, 'subscriber_growth'),
  ('지금 라이브 중', '["ONAIR"]', false, 7, 'live'),
  ('인기 파트너 랭킹', '["HOT"]', false, 8, 'ranking');
