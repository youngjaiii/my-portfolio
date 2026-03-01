-- ============================================
-- 방송 썸네일 Storage 버킷 설정
-- ============================================
-- 
-- 이 마이그레이션은 Supabase Dashboard에서 수동으로 버킷을 생성한 후
-- RLS 정책을 설정하는 SQL입니다.
--
-- 버킷 생성 방법:
-- 1. Supabase Dashboard → Storage 메뉴
-- 2. "New bucket" 클릭
-- 3. 버킷 이름: stream-thumbnails
-- 4. 공개 버킷: true (체크)
-- 5. 파일 크기 제한: 10MB
-- 6. 허용 파일 타입: image/jpeg, image/png, image/webp
-- 7. 생성 후 아래 RLS 정책 실행
--
-- ============================================

-- Storage 버킷 RLS 정책 설정
-- 참고: Storage RLS는 Edge Function에서 권한 검증을 수행하므로
-- 기본적인 정책만 설정합니다.

-- 기존 정책 삭제 (있으면)
DROP POLICY IF EXISTS "Anyone can view thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update thumbnails" ON storage.objects;

-- 읽기 정책: 모든 사용자 조회 가능 (공개 버킷)
CREATE POLICY "Anyone can view thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'stream-thumbnails');

-- 업로드 정책: 인증된 사용자만 업로드 가능
-- (실제 호스트 권한 검증은 Edge Function에서 수행)
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'stream-thumbnails');

-- 삭제 정책: 인증된 사용자만 삭제 가능
-- (실제 호스트 권한 검증은 Edge Function에서 수행)
CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'stream-thumbnails');

-- 업데이트 정책: 인증된 사용자만 업데이트 가능
CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'stream-thumbnails')
WITH CHECK (bucket_id = 'stream-thumbnails');

