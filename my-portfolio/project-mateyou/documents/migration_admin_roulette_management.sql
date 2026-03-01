-- 관리자 룰렛 아이템 관리 함수
-- 관리자가 user_roulette_rewards 아이템을 삭제/만료 처리할 수 있도록 함

-- 관리자 아이템 삭제 함수
CREATE OR REPLACE FUNCTION admin_delete_roulette_reward(p_reward_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 관리자 권한 확인 (role = 'admin')
  SELECT role INTO v_role
  FROM members
  WHERE id = auth.uid();
  
  IF v_role IS NULL OR v_role != 'admin' THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;
  
  -- 관련 usage logs 삭제
  DELETE FROM roulette_reward_usage_logs
  WHERE reward_id = p_reward_id;
  
  -- 아이템 삭제
  DELETE FROM user_roulette_rewards
  WHERE id = p_reward_id;
  
  RETURN TRUE;
END;
$$;

-- 관리자 아이템 만료 함수
CREATE OR REPLACE FUNCTION admin_expire_roulette_reward(p_reward_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 관리자 권한 확인 (role = 'admin')
  SELECT role INTO v_role
  FROM members
  WHERE id = auth.uid();
  
  IF v_role IS NULL OR v_role != 'admin' THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;
  
  -- 아이템 만료 처리
  UPDATE user_roulette_rewards
  SET 
    status = 'expired',
    expires_at = NOW()
  WHERE id = p_reward_id;
  
  RETURN TRUE;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION admin_delete_roulette_reward (UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION admin_expire_roulette_reward (UUID) TO authenticated;