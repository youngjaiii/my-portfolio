-- ============================================================
-- 룰렛 디지털 보상 Storage 버킷 마이그레이션
-- 실행 전: Supabase 대시보드에서 실행 또는 supabase CLI 사용
-- ============================================================

-- 1. Storage 버킷 생성
-- NOTE: public = true로 설정해야 getPublicUrl()이 정상 작동함
INSERT INTO
    storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'roulette-rewards',
        'roulette-rewards',
        true, -- public 버킷 (URL로 직접 접근 가능)
        10485760, -- 10MB 제한
        ARRAY ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']
    )
ON CONFLICT (id) DO
UPDATE
SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];

-- 2. Storage RLS 정책 설정

-- 2.1 파트너 업로드 정책 (파트너만 자신의 폴더에 업로드 가능)
CREATE POLICY "Partners can upload roulette rewards"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'roulette-rewards' AND
  -- 경로 형식: partners/{partner_id}/{filename}
  (storage.foldername(name))[1] = 'partners' AND
  (storage.foldername(name))[2] = auth.uid()::text AND
  -- partners 테이블에 레코드가 있는지 확인 (파트너 여부)
  EXISTS (
    SELECT 1 FROM partners 
    WHERE member_id = auth.uid()
  )
);

-- 2.2 파트너 자신의 파일 읽기/삭제 정책
CREATE POLICY "Partners can manage own roulette rewards"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'roulette-rewards' AND
  (storage.foldername(name))[1] = 'partners' AND
  (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'roulette-rewards' AND
  (storage.foldername(name))[1] = 'partners' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- 2.3 당첨자 파일 읽기 정책 (자신이 당첨받은 디지털 보상만 읽기 가능)
CREATE POLICY "Users can read won digital rewards" ON storage.objects FOR
SELECT TO authenticated USING (
        bucket_id = 'roulette-rewards'
        AND EXISTS (
            SELECT 1
            FROM user_roulette_rewards
            WHERE
                user_id = auth.uid ()
                AND reward_type = 'digital'
                AND digital_file_path = name
        )
    );

-- ============================================================
-- 확인 쿼리
-- ============================================================

-- 버킷 확인
SELECT * FROM storage.buckets WHERE id = 'roulette-rewards';

-- 정책 확인
SELECT *
FROM pg_policies
WHERE
    tablename = 'objects'
    AND schemaname = 'storage';