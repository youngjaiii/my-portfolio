-- ============================================================
-- Phase 5-B: 디지털 보상 컬렉션 시스템 마이그레이션
-- 작성일: 2026-02-02
-- 목적: 여러 디지털 보상을 하나의 컬렉션(앨범)으로 묶어 수집 가능하게 함
-- ============================================================

-- ============================================================
-- 1. 디지털 보상 컬렉션 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS roulette_digital_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  wheel_id UUID REFERENCES partner_roulette_wheels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                      -- 컬렉션 이름 (예: "여름 화보 컬렉션")
  description TEXT,                        -- 설명
  total_items INTEGER NOT NULL DEFAULT 1,  -- 총 아이템 수
  thumbnail_url TEXT,                      -- 컬렉션 썸네일
  completion_reward_type TEXT,             -- 완성 보상 타입 (text/usable/digital)
  completion_reward_value TEXT,            -- 완성 보상 값
  completion_reward_name TEXT,             -- 완성 보상 이름
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_roulette_collections_partner 
  ON roulette_digital_collections(partner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roulette_collections_wheel 
  ON roulette_digital_collections(wheel_id);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_roulette_collections_updated ON roulette_digital_collections;
CREATE TRIGGER trg_roulette_collections_updated
  BEFORE UPDATE ON roulette_digital_collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE roulette_digital_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roulette_collections_select" ON roulette_digital_collections;
DROP POLICY IF EXISTS "roulette_collections_insert" ON roulette_digital_collections;
DROP POLICY IF EXISTS "roulette_collections_update" ON roulette_digital_collections;
DROP POLICY IF EXISTS "roulette_collections_delete" ON roulette_digital_collections;

-- 모든 사용자가 조회 가능 (활성화된 컬렉션만)
CREATE POLICY "roulette_collections_select" ON roulette_digital_collections
FOR SELECT USING (is_active = true OR auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id));

-- 파트너만 CRUD 가능
CREATE POLICY "roulette_collections_insert" ON roulette_digital_collections
FOR INSERT WITH CHECK (
  auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "roulette_collections_update" ON roulette_digital_collections
FOR UPDATE USING (
  auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

CREATE POLICY "roulette_collections_delete" ON roulette_digital_collections
FOR DELETE USING (
  auth.uid() = (SELECT member_id FROM partners WHERE id = partner_id)
);

COMMENT ON TABLE roulette_digital_collections IS '디지털 보상 컬렉션 (사진 앨범)';

-- ============================================================
-- 2. 컬렉션 내 개별 아이템 연결 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS roulette_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES roulette_digital_collections(id) ON DELETE CASCADE,
  roulette_item_id UUID NOT NULL REFERENCES partner_roulette_items(id) ON DELETE CASCADE,
  item_order INTEGER DEFAULT 0,            -- 컬렉션 내 순서
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, roulette_item_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_collection_items_collection 
  ON roulette_collection_items(collection_id, item_order);
CREATE INDEX IF NOT EXISTS idx_collection_items_roulette_item 
  ON roulette_collection_items(roulette_item_id);

-- RLS
ALTER TABLE roulette_collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_items_select" ON roulette_collection_items;
DROP POLICY IF EXISTS "collection_items_insert" ON roulette_collection_items;
DROP POLICY IF EXISTS "collection_items_delete" ON roulette_collection_items;

-- 모든 사용자가 조회 가능
CREATE POLICY "collection_items_select" ON roulette_collection_items
FOR SELECT USING (true);

-- 파트너만 관리 가능
CREATE POLICY "collection_items_insert" ON roulette_collection_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM roulette_digital_collections c
    JOIN partners p ON c.partner_id = p.id
    WHERE c.id = collection_id AND p.member_id = auth.uid()
  )
);

CREATE POLICY "collection_items_delete" ON roulette_collection_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM roulette_digital_collections c
    JOIN partners p ON c.partner_id = p.id
    WHERE c.id = collection_id AND p.member_id = auth.uid()
  )
);

COMMENT ON TABLE roulette_collection_items IS '컬렉션 내 개별 아이템 (각 사진)';

-- ============================================================
-- 3. 유저별 컬렉션 진행 현황 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS user_collection_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES roulette_digital_collections(id) ON DELETE CASCADE,
  collected_items UUID[] DEFAULT '{}',     -- 수집한 아이템 ID 배열
  collected_count INTEGER DEFAULT 0,       -- 수집한 개수 (캐시)
  is_completed BOOLEAN DEFAULT false,      -- 완성 여부
  completed_at TIMESTAMPTZ,                -- 완성 시각
  completion_reward_claimed BOOLEAN DEFAULT false, -- 완성 보상 수령 여부
  completion_reward_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, collection_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_collection_progress_user 
  ON user_collection_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_collection_progress_collection 
  ON user_collection_progress(collection_id);
CREATE INDEX IF NOT EXISTS idx_user_collection_progress_completed 
  ON user_collection_progress(user_id, is_completed);

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_user_collection_progress_updated ON user_collection_progress;
CREATE TRIGGER trg_user_collection_progress_updated
  BEFORE UPDATE ON user_collection_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE user_collection_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_collection_progress_select" ON user_collection_progress;
DROP POLICY IF EXISTS "user_collection_progress_insert" ON user_collection_progress;
DROP POLICY IF EXISTS "user_collection_progress_update" ON user_collection_progress;

-- 본인 데이터만 조회 가능
CREATE POLICY "user_collection_progress_select" ON user_collection_progress
FOR SELECT USING (auth.uid() = user_id);

-- 시스템(service_role)만 INSERT/UPDATE 가능
CREATE POLICY "user_collection_progress_insert" ON user_collection_progress
FOR INSERT WITH CHECK (false);

CREATE POLICY "user_collection_progress_update" ON user_collection_progress
FOR UPDATE USING (false);

COMMENT ON TABLE user_collection_progress IS '유저별 컬렉션 진행 현황';

-- ============================================================
-- 4. partner_roulette_items에 컬렉션 ID 컬럼 추가
-- ============================================================

ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  collection_id UUID REFERENCES roulette_digital_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_roulette_items_collection 
  ON partner_roulette_items(collection_id);

COMMENT ON COLUMN partner_roulette_items.collection_id IS '소속 컬렉션 ID (디지털 보상용)';

-- ============================================================
-- 5. 컬렉션 진행률 업데이트 함수
-- ============================================================

DROP FUNCTION IF EXISTS update_collection_progress(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION update_collection_progress(
  p_user_id UUID,
  p_roulette_item_id UUID,
  p_roulette_result_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_collection_id UUID;
  v_collection RECORD;
  v_progress RECORD;
  v_total INTEGER;
  v_newly_completed BOOLEAN := false;
BEGIN
  -- 해당 아이템이 컬렉션에 속하는지 확인
  SELECT collection_id INTO v_collection_id
  FROM roulette_collection_items
  WHERE roulette_item_id = p_roulette_item_id;
  
  IF v_collection_id IS NULL THEN
    -- 아이템이 컬렉션에 속하지 않음
    RETURN jsonb_build_object('updated', false, 'reason', 'NOT_IN_COLLECTION');
  END IF;
  
  -- 컬렉션 정보 조회
  SELECT * INTO v_collection
  FROM roulette_digital_collections
  WHERE id = v_collection_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'COLLECTION_NOT_FOUND');
  END IF;
  
  -- 기존 진행 상황 조회
  SELECT * INTO v_progress
  FROM user_collection_progress
  WHERE user_id = p_user_id AND collection_id = v_collection_id;
  
  IF v_progress IS NULL THEN
    -- 새로 생성
    INSERT INTO user_collection_progress (
      user_id, collection_id, collected_items, collected_count
    ) VALUES (
      p_user_id, v_collection_id, ARRAY[p_roulette_item_id], 1
    );
  ELSE
    -- 이미 수집한 아이템인지 확인
    IF p_roulette_item_id = ANY(v_progress.collected_items) THEN
      RETURN jsonb_build_object('updated', false, 'reason', 'ALREADY_COLLECTED');
    END IF;
    
    -- 업데이트
    UPDATE user_collection_progress
    SET 
      collected_items = array_append(collected_items, p_roulette_item_id),
      collected_count = collected_count + 1
    WHERE id = v_progress.id;
  END IF;
  
  -- 완성 여부 확인
  SELECT COUNT(*) INTO v_total
  FROM roulette_collection_items
  WHERE collection_id = v_collection_id;
  
  SELECT * INTO v_progress
  FROM user_collection_progress
  WHERE user_id = p_user_id AND collection_id = v_collection_id;
  
  IF v_progress.collected_count >= v_total AND NOT v_progress.is_completed THEN
    UPDATE user_collection_progress
    SET is_completed = true, completed_at = now()
    WHERE id = v_progress.id;
    v_newly_completed := true;
  END IF;
  
  RETURN jsonb_build_object(
    'updated', true,
    'collection_id', v_collection_id,
    'collected_count', v_progress.collected_count,
    'total_items', v_total,
    'is_completed', v_progress.is_completed OR v_newly_completed,
    'newly_completed', v_newly_completed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_collection_progress IS '디지털 보상 당첨 시 컬렉션 진행률 업데이트';

-- ============================================================
-- 6. 컬렉션 완성 보상 수령 함수
-- ============================================================

DROP FUNCTION IF EXISTS claim_collection_reward(UUID, UUID);

CREATE OR REPLACE FUNCTION claim_collection_reward(
  p_user_id UUID,
  p_collection_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_progress RECORD;
  v_collection RECORD;
  v_reward_id UUID;
BEGIN
  -- 진행 상황 조회
  SELECT * INTO v_progress
  FROM user_collection_progress
  WHERE user_id = p_user_id AND collection_id = p_collection_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROGRESS_NOT_FOUND');
  END IF;
  
  IF NOT v_progress.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_COMPLETED');
  END IF;
  
  IF v_progress.completion_reward_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CLAIMED');
  END IF;
  
  -- 컬렉션 정보 조회
  SELECT * INTO v_collection
  FROM roulette_digital_collections
  WHERE id = p_collection_id;
  
  IF v_collection.completion_reward_type IS NULL THEN
    -- 완성 보상이 없는 경우
    UPDATE user_collection_progress
    SET completion_reward_claimed = true, completion_reward_claimed_at = now()
    WHERE id = v_progress.id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'NO_REWARD_SET',
      'collection_name', v_collection.name
    );
  END IF;
  
  -- 완성 보상 지급 (usable 타입인 경우 user_roulette_rewards에 추가)
  IF v_collection.completion_reward_type = 'usable' THEN
    INSERT INTO user_roulette_rewards (
      user_id,
      partner_id,
      reward_type,
      reward_name,
      reward_value,
      status,
      expires_at
    ) VALUES (
      p_user_id,
      v_collection.partner_id,
      'usable',
      COALESCE(v_collection.completion_reward_name, v_collection.name || ' 완성 보상'),
      v_collection.completion_reward_value,
      'active',
      NOW() + INTERVAL '30 days'
    )
    RETURNING id INTO v_reward_id;
  END IF;
  
  -- 수령 완료 표시
  UPDATE user_collection_progress
  SET completion_reward_claimed = true, completion_reward_claimed_at = now()
  WHERE id = v_progress.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'reward_id', v_reward_id,
    'reward_type', v_collection.completion_reward_type,
    'reward_name', COALESCE(v_collection.completion_reward_name, v_collection.name || ' 완성 보상'),
    'reward_value', v_collection.completion_reward_value,
    'collection_name', v_collection.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION claim_collection_reward IS '컬렉션 완성 보상 수령';

-- ============================================================
-- 7. 유저의 컬렉션 목록 조회 함수
-- ============================================================

DROP FUNCTION IF EXISTS get_user_collections(UUID, UUID);

CREATE OR REPLACE FUNCTION get_user_collections(
  p_user_id UUID,
  p_partner_id UUID DEFAULT NULL
) RETURNS TABLE (
  collection_id UUID,
  collection_name TEXT,
  collection_description TEXT,
  partner_id UUID,
  thumbnail_url TEXT,
  total_items INTEGER,
  collected_count INTEGER,
  is_completed BOOLEAN,
  completion_reward_claimed BOOLEAN,
  has_completion_reward BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS collection_id,
    c.name AS collection_name,
    c.description AS collection_description,
    c.partner_id,
    c.thumbnail_url,
    c.total_items,
    COALESCE(p.collected_count, 0) AS collected_count,
    COALESCE(p.is_completed, false) AS is_completed,
    COALESCE(p.completion_reward_claimed, false) AS completion_reward_claimed,
    (c.completion_reward_type IS NOT NULL) AS has_completion_reward
  FROM roulette_digital_collections c
  LEFT JOIN user_collection_progress p ON c.id = p.collection_id AND p.user_id = p_user_id
  WHERE c.is_active = true
    AND (p_partner_id IS NULL OR c.partner_id = p_partner_id)
    AND (p.collected_count > 0 OR p.collected_count IS NULL)
  ORDER BY 
    CASE WHEN p.is_completed AND NOT COALESCE(p.completion_reward_claimed, false) THEN 0 ELSE 1 END,
    p.collected_count DESC NULLS LAST,
    c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_user_collections IS '유저의 컬렉션 목록 및 진행 상황 조회';

-- ============================================================
-- 8. 권한 설정
-- ============================================================

GRANT EXECUTE ON FUNCTION update_collection_progress(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION claim_collection_reward(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_collections(UUID, UUID) TO authenticated;

-- ============================================================
-- 9. 롤백 스크립트 (필요 시)
-- ============================================================

/*
-- 롤백용
ALTER TABLE partner_roulette_items DROP COLUMN IF EXISTS collection_id;

DROP TABLE IF EXISTS user_collection_progress;
DROP TABLE IF EXISTS roulette_collection_items;
DROP TABLE IF EXISTS roulette_digital_collections;

DROP FUNCTION IF EXISTS update_collection_progress(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS claim_collection_reward(UUID, UUID);
DROP FUNCTION IF EXISTS get_user_collections(UUID, UUID);
*/
