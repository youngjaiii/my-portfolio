-- members 테이블에 email 컬럼 추가
ALTER TABLE public.members 
ADD COLUMN IF NOT EXISTS email text;

-- email 컬럼에 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS members_email_idx ON public.members(email) WHERE email IS NOT NULL;

-- 기존 데이터 마이그레이션: auth.users와 매칭되는 members에 email 추가
-- auth.users의 email을 members.email로 복사
UPDATE public.members m
SET email = au.email
FROM auth.users au
WHERE m.id = au.id
  AND m.email IS NULL
  AND au.email IS NOT NULL;

-- Supabase Auth에 사용자가 생성될 때 members 테이블의 email을 자동으로 업데이트하는 함수
CREATE OR REPLACE FUNCTION public.sync_member_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- auth.users에 새 사용자가 생성되거나 email이 업데이트될 때
  -- members 테이블의 해당 레코드가 있으면 email을 업데이트
  UPDATE public.members
  SET email = NEW.email,
      updated_at = now()
  WHERE id = NEW.id
    AND (email IS NULL OR email != NEW.email);
  
  RETURN NEW;
END;
$$;

-- auth.users에 INSERT 또는 UPDATE가 발생할 때 트리거 실행
DROP TRIGGER IF EXISTS trg_sync_member_email_on_auth_insert ON auth.users;
CREATE TRIGGER trg_sync_member_email_on_auth_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_member_email();

DROP TRIGGER IF EXISTS trg_sync_member_email_on_auth_update ON auth.users;
CREATE TRIGGER trg_sync_member_email_on_auth_update
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_member_email();

-- members 테이블에 새 레코드가 생성될 때 auth.users의 email을 가져오는 함수
CREATE OR REPLACE FUNCTION public.sync_member_email_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auth_email text;
BEGIN
  -- auth.users에서 email 가져오기
  SELECT email INTO auth_email
  FROM auth.users
  WHERE id = NEW.id;
  
  -- email이 있으면 members.email에 설정
  IF auth_email IS NOT NULL THEN
    NEW.email := auth_email;
  END IF;
  
  RETURN NEW;
END;
$$;

-- members 테이블에 INSERT 전에 email을 설정하는 트리거
DROP TRIGGER IF EXISTS trg_sync_member_email_on_member_insert ON public.members;
CREATE TRIGGER trg_sync_member_email_on_member_insert
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_member_email_on_insert();

