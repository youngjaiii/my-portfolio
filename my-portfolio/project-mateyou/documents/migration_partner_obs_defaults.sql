-- OBS 방송 기본 설정을 위한 파트너 테이블 컬럼 추가
-- 파트너가 OBS로 방송 시작 시 자동으로 적용되는 설정

-- 기본 방송 제목 (NULL이면 "{닉네임}님의 방송" 사용)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_stream_title TEXT;

-- 기본 카테고리 ID
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_category_id UUID REFERENCES stream_categories(id) ON DELETE SET NULL;

-- 기본 공개 설정 (public/private/subscriber)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_access_type TEXT DEFAULT 'public' CHECK (default_access_type IN ('public', 'private', 'subscriber'));

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_partners_default_category_id ON partners(default_category_id);

-- 코멘트 추가
COMMENT ON COLUMN partners.default_stream_title IS 'OBS 방송 시 사용할 기본 제목';
COMMENT ON COLUMN partners.default_category_id IS 'OBS 방송 시 사용할 기본 카테고리';
COMMENT ON COLUMN partners.default_access_type IS 'OBS 방송 시 사용할 기본 공개 설정';
