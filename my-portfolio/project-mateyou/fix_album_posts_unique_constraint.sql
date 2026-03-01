-- album_posts 테이블의 unique 제약 수정
-- 기존: (user_id, post_id) - 같은 게시글을 여러 앨범에 저장 불가
-- 변경: (user_id, post_id, album_id) - 같은 게시글을 여러 앨범에 저장 가능

-- 1. 기존 unique 제약 찾기 및 삭제
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- album_posts_user_post_unique 제약 찾기
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'album_posts'::regclass
      AND contype = 'u'
      AND conname LIKE '%user_post%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE album_posts DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No existing user_post unique constraint found';
    END IF;
END $$;

-- 2. 새로운 unique 제약 추가 (user_id, post_id, album_id)
-- 이렇게 하면 같은 게시글을 여러 앨범에 저장할 수 있음
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'album_posts'::regclass
          AND contype = 'u'
          AND conname = 'album_posts_user_post_album_unique'
    ) THEN
        ALTER TABLE album_posts
        ADD CONSTRAINT album_posts_user_post_album_unique
        UNIQUE (user_id, post_id, album_id);
        
        RAISE NOTICE 'Added new unique constraint: album_posts_user_post_album_unique';
    ELSE
        RAISE NOTICE 'Constraint album_posts_user_post_album_unique already exists';
    END IF;
END $$;

