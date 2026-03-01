-- ============================================
-- 방송 사용자 썸네일 저장 테이블
-- ============================================
-- 
-- 사용자별로 마지막으로 사용한 방송 썸네일을 저장합니다.
-- 방송 생성 시 자동으로 이전 썸네일을 불러와 편의성을 높입니다.
--
-- ============================================

-- 테이블 생성
CREATE TABLE IF NOT EXISTS stream_user_thumbnails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  thumbnail_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 사용자당 하나의 레코드만 유지
  CONSTRAINT unique_member_thumbnail UNIQUE (member_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_stream_user_thumbnails_member_id 
ON stream_user_thumbnails(member_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_stream_user_thumbnails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stream_user_thumbnails_updated_at ON stream_user_thumbnails;
CREATE TRIGGER trigger_update_stream_user_thumbnails_updated_at
  BEFORE UPDATE ON stream_user_thumbnails
  FOR EACH ROW
  EXECUTE FUNCTION update_stream_user_thumbnails_updated_at();

-- RLS 정책
ALTER TABLE stream_user_thumbnails ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Users can view own thumbnail" ON stream_user_thumbnails;
DROP POLICY IF EXISTS "Users can insert own thumbnail" ON stream_user_thumbnails;
DROP POLICY IF EXISTS "Users can update own thumbnail" ON stream_user_thumbnails;
DROP POLICY IF EXISTS "Users can delete own thumbnail" ON stream_user_thumbnails;

-- 자신의 썸네일만 조회 가능
CREATE POLICY "Users can view own thumbnail"
ON stream_user_thumbnails FOR SELECT
TO authenticated
USING (member_id = auth.uid());

-- 자신의 썸네일만 삽입 가능
CREATE POLICY "Users can insert own thumbnail"
ON stream_user_thumbnails FOR INSERT
TO authenticated
WITH CHECK (member_id = auth.uid());

-- 자신의 썸네일만 수정 가능
CREATE POLICY "Users can update own thumbnail"
ON stream_user_thumbnails FOR UPDATE
TO authenticated
USING (member_id = auth.uid())
WITH CHECK (member_id = auth.uid());

-- 자신의 썸네일만 삭제 가능
CREATE POLICY "Users can delete own thumbnail"
ON stream_user_thumbnails FOR DELETE
TO authenticated
USING (member_id = auth.uid());

-- 코멘트
COMMENT ON TABLE stream_user_thumbnails IS '사용자별 마지막 방송 썸네일 저장';
COMMENT ON COLUMN stream_user_thumbnails.member_id IS '사용자 ID';
COMMENT ON COLUMN stream_user_thumbnails.thumbnail_url IS '썸네일 이미지 URL';

