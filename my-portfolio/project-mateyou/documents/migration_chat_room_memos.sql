-- chat_room_memos: 채팅방 메모 (방당 사용자당 1개)
CREATE TABLE IF NOT EXISTS public.chat_room_memos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chat_room_id, user_id)
);

-- RLS 활성화
ALTER TABLE public.chat_room_memos ENABLE ROW LEVEL SECURITY;

-- 본인 메모만 접근 가능 (members.id = auth.uid() 동일)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_room_memos' AND policyname = 'Users can manage own memos'
  ) THEN
    CREATE POLICY "Users can manage own memos"
      ON public.chat_room_memos
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_room_memos_room_user
  ON public.chat_room_memos(chat_room_id, user_id);
