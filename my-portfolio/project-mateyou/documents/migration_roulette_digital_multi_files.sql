-- ============================================================
-- 룰렛 디지털 상품 다중 파일 지원 마이그레이션
-- 작성일: 2026-02-02
-- 목적:
--   1. 1개 디지털 상품에 여러 파일 업로드 가능
--   2. 지급 방식 선택: 일괄(bundle) / 개별(individual)
--   3. 개별 지급 시 파일별 당첨 추적
-- ============================================================

-- ============================================================
-- 1. partner_roulette_items 테이블에 지급 방식 컬럼 추가
-- ============================================================

-- 디지털 상품 지급 방식
-- bundle: 당첨 시 모든 파일 한꺼번에 지급 (1회 당첨으로 끝)
-- individual: 파일 하나씩 랜덤 지급 (모든 파일 받을 때까지 여러 번 당첨 가능)
ALTER TABLE partner_roulette_items
ADD COLUMN IF NOT EXISTS digital_distribution_type TEXT DEFAULT 'bundle' CHECK (
    digital_distribution_type IN ('bundle', 'individual')
);

COMMENT ON COLUMN partner_roulette_items.digital_distribution_type IS '디지털 지급 방식: bundle(일괄 지급), individual(개별 지급)';

-- ============================================================
-- 2. 디지털 파일 테이블 생성 (1:N 관계)
-- ============================================================

CREATE TABLE IF NOT EXISTS roulette_item_digital_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

-- 소속 룰렛 아이템
item_id UUID NOT NULL REFERENCES partner_roulette_items (id) ON DELETE CASCADE,

-- 파일 정보
file_url TEXT NOT NULL,
file_path TEXT NOT NULL,
file_name TEXT NOT NULL,
file_size BIGINT,
file_type TEXT,

-- 정렬 순서
sort_order INTEGER DEFAULT 0,

-- 메타
created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_roulette_digital_files_item ON roulette_item_digital_files (item_id);

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS trg_roulette_digital_files_updated ON roulette_item_digital_files;

CREATE TRIGGER trg_roulette_digital_files_updated
  BEFORE UPDATE ON roulette_item_digital_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS 활성화 (정책은 모든 테이블 생성 후 추가)
ALTER TABLE roulette_item_digital_files ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE roulette_item_digital_files IS '룰렛 디지털 상품의 파일 목록 (1:N)';

-- ============================================================
-- 3. 유저별 디지털 파일 당첨 기록 테이블
-- (개별 지급 시 어떤 파일을 받았는지 추적)
-- ============================================================


CREATE TABLE IF NOT EXISTS user_roulette_digital_file_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES partner_roulette_items(id) ON DELETE CASCADE,
  digital_file_id UUID NOT NULL REFERENCES roulette_item_digital_files(id) ON DELETE CASCADE,

-- 당첨 결과 참조
roulette_result_id UUID REFERENCES donation_roulette_results (id) ON DELETE SET NULL,

-- 메타
won_at TIMESTAMPTZ DEFAULT now (),

-- 같은 유저가 같은 파일 중복 당첨 방지
UNIQUE(user_id, digital_file_id) );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_digital_file_wins_user ON user_roulette_digital_file_wins (user_id);

CREATE INDEX IF NOT EXISTS idx_user_digital_file_wins_item ON user_roulette_digital_file_wins (item_id);

CREATE INDEX IF NOT EXISTS idx_user_digital_file_wins_file ON user_roulette_digital_file_wins (digital_file_id);

-- RLS
ALTER TABLE user_roulette_digital_file_wins ENABLE ROW LEVEL SECURITY;

-- 본인 당첨 기록만 조회 가능
DROP POLICY IF EXISTS "Users can view own file wins" ON user_roulette_digital_file_wins;

CREATE POLICY "Users can view own file wins" ON user_roulette_digital_file_wins FOR
SELECT USING (auth.uid () = user_id);

-- 시스템만 INSERT 가능
DROP POLICY IF EXISTS "System can insert file wins" ON user_roulette_digital_file_wins;

CREATE POLICY "System can insert file wins" ON user_roulette_digital_file_wins FOR INSERT
WITH
    CHECK (false);

COMMENT ON TABLE user_roulette_digital_file_wins IS '유저별 디지털 파일 당첨 기록 (개별 지급 추적용)';

-- ============================================================
-- 3-B. roulette_item_digital_files RLS 정책 (user_roulette_digital_file_wins 생성 후)
-- ============================================================

-- 파트너는 자신의 아이템 파일만 관리 가능
DROP POLICY IF EXISTS "Partners can manage own digital files" ON roulette_item_digital_files;

CREATE POLICY "Partners can manage own digital files" ON roulette_item_digital_files FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM
            partner_roulette_items i
            JOIN partner_roulette_wheels w ON i.wheel_id = w.id
            JOIN partners p ON w.partner_id = p.id
        WHERE
            i.id = roulette_item_digital_files.item_id
            AND p.member_id = auth.uid ()
    )
);

-- 당첨자는 자신이 받은 파일만 조회 가능
DROP POLICY IF EXISTS "Users can view won digital files" ON roulette_item_digital_files;

CREATE POLICY "Users can view won digital files" ON roulette_item_digital_files FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM
                user_roulette_digital_file_wins w
            WHERE
                w.digital_file_id = roulette_item_digital_files.id
                AND w.user_id = auth.uid ()
        )
    );

-- ============================================================
-- 4. 기존 단일 파일 데이터 마이그레이션
-- 기존 digital_file_* 컬럼 데이터를 새 테이블로 이동
-- ============================================================

INSERT INTO
    roulette_item_digital_files (
        item_id,
        file_url,
        file_path,
        file_name,
        file_size,
        file_type,
        sort_order
    )
SELECT
    id,
    digital_file_url,
    digital_file_path,
    COALESCE(
        digital_file_name,
        reward_value,
        'file'
    ),
    digital_file_size,
    digital_file_type,
    0
FROM partner_roulette_items
WHERE
    reward_type = 'digital'
    AND digital_file_path IS NOT NULL
    AND NOT EXISTS (
        -- 이미 마이그레이션된 경우 스킵
        SELECT 1
        FROM roulette_item_digital_files f
        WHERE
            f.item_id = partner_roulette_items.id
    );

-- ============================================================
-- 5. can_win_roulette_item 함수 수정
-- 디지털 상품의 지급 방식에 따라 당첨 가능 여부 판정
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS func_sig FROM pg_proc WHERE proname = 'can_win_roulette_item'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION can_win_roulette_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_item RECORD;
  v_user_item_count INTEGER;
  v_total_files INTEGER;
  v_won_files INTEGER;
BEGIN
  -- 아이템 정보 조회
  SELECT * INTO v_item 
  FROM partner_roulette_items 
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- 비활성 아이템
  IF NOT v_item.is_active THEN
    RETURN false;
  END IF;
  
  -- ★ 디지털 타입 처리 ★
  IF v_item.reward_type = 'digital' THEN
    
    -- 일괄 지급(bundle): 상품 단위로 1회만 당첨
    IF COALESCE(v_item.digital_distribution_type, 'bundle') = 'bundle' THEN
      SELECT COALESCE(win_count, 0) INTO v_user_item_count
      FROM user_roulette_item_counts
      WHERE user_id = p_user_id AND item_id = p_item_id;
      
      IF COALESCE(v_user_item_count, 0) >= 1 THEN
        RETURN false;
      END IF;
      
    -- 개별 지급(individual): 모든 파일 받을 때까지 당첨 가능
    ELSE
      -- 총 파일 수
      SELECT COUNT(*) INTO v_total_files
      FROM roulette_item_digital_files
      WHERE item_id = p_item_id;
      
      -- 이미 받은 파일 수
      SELECT COUNT(*) INTO v_won_files
      FROM user_roulette_digital_file_wins
      WHERE user_id = p_user_id AND item_id = p_item_id;
      
      -- 모든 파일 다 받았으면 불가
      IF v_total_files > 0 AND v_won_files >= v_total_files THEN
        RETURN false;
      END IF;
    END IF;
    
    -- 전역 수량 제한 체크 (있는 경우)
    IF v_item.stock_limit_type = 'global' AND v_item.stock_limit IS NOT NULL THEN
      IF COALESCE(v_item.stock_used, 0) >= v_item.stock_limit THEN
        RETURN false;
      END IF;
    END IF;
    
    RETURN true;
  END IF;
  
  -- 비디지털 타입: 기존 로직
  IF v_item.stock_limit_type IS NULL THEN
    RETURN true;
  END IF;
  
  IF v_item.stock_limit_type = 'global' THEN
    IF v_item.stock_limit IS NOT NULL AND COALESCE(v_item.stock_used, 0) >= v_item.stock_limit THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;
  
  IF v_item.stock_limit_type = 'per_user' THEN
    IF v_item.stock_limit IS NULL THEN
      RETURN true;
    END IF;
    
    SELECT COALESCE(win_count, 0) INTO v_user_item_count
    FROM user_roulette_item_counts
    WHERE user_id = p_user_id AND item_id = p_item_id;
    
    IF COALESCE(v_user_item_count, 0) >= v_item.stock_limit THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_win_roulette_item IS '유저가 아이템 당첨 가능한지 확인 - 디지털 상품은 지급 방식에 따라 판정';

GRANT EXECUTE ON FUNCTION can_win_roulette_item (UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION can_win_roulette_item (UUID, UUID) TO service_role;

-- ============================================================
-- 6. 디지털 파일 당첨 처리 함수 (개별 지급용)
-- ============================================================

CREATE OR REPLACE FUNCTION select_random_unwon_digital_file(
  p_user_id UUID,
  p_item_id UUID
) RETURNS UUID AS $$
DECLARE
  v_file_id UUID;
BEGIN
  -- 아직 받지 않은 파일 중 랜덤 선택
  SELECT f.id INTO v_file_id
  FROM roulette_item_digital_files f
  WHERE f.item_id = p_item_id
    AND NOT EXISTS (
      SELECT 1 FROM user_roulette_digital_file_wins w
      WHERE w.digital_file_id = f.id AND w.user_id = p_user_id
    )
  ORDER BY random()
  LIMIT 1;
  
  RETURN v_file_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION select_random_unwon_digital_file IS '유저가 아직 받지 않은 디지털 파일 중 랜덤 선택 (개별 지급용)';

GRANT EXECUTE ON FUNCTION select_random_unwon_digital_file (UUID, UUID) TO service_role;

-- ============================================================
-- 7. 디지털 파일 당첨 기록 함수
-- ============================================================

CREATE OR REPLACE FUNCTION record_digital_file_win(
  p_user_id UUID,
  p_item_id UUID,
  p_digital_file_id UUID,
  p_roulette_result_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO user_roulette_digital_file_wins (
    user_id, item_id, digital_file_id, roulette_result_id
  ) VALUES (
    p_user_id, p_item_id, p_digital_file_id, p_roulette_result_id
  )
  ON CONFLICT (user_id, digital_file_id) DO NOTHING;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_digital_file_win IS '디지털 파일 당첨 기록';

GRANT EXECUTE ON FUNCTION record_digital_file_win (UUID, UUID, UUID, UUID) TO service_role;

-- ============================================================
-- 8. 유저의 디지털 상품 진행률 조회 함수
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_digital_item_progress(
  p_user_id UUID,
  p_item_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_total_files INTEGER;
  v_won_files INTEGER;
  v_won_file_ids UUID[];
BEGIN
  SELECT * INTO v_item
  FROM partner_roulette_items
  WHERE id = p_item_id AND reward_type = 'digital';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ITEM_NOT_FOUND');
  END IF;
  
  -- 총 파일 수
  SELECT COUNT(*) INTO v_total_files
  FROM roulette_item_digital_files
  WHERE item_id = p_item_id;
  
  -- 획득한 파일 수와 ID 목록
  SELECT COUNT(*), array_agg(digital_file_id) 
  INTO v_won_files, v_won_file_ids
  FROM user_roulette_digital_file_wins
  WHERE user_id = p_user_id AND item_id = p_item_id;
  
  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'item_name', v_item.name,
    'distribution_type', COALESCE(v_item.digital_distribution_type, 'bundle'),
    'total_files', v_total_files,
    'won_files', COALESCE(v_won_files, 0),
    'won_file_ids', COALESCE(v_won_file_ids, ARRAY[]::UUID[]),
    'is_complete', (v_total_files > 0 AND COALESCE(v_won_files, 0) >= v_total_files),
    'progress_percent', CASE 
      WHEN v_total_files = 0 THEN 0
      ELSE ROUND((COALESCE(v_won_files, 0)::numeric / v_total_files) * 100)
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_digital_item_progress IS '유저의 디지털 상품 수집 진행률';

GRANT EXECUTE ON FUNCTION get_user_digital_item_progress (UUID, UUID) TO authenticated;

-- ============================================================
-- 9. Storage RLS 정책 업데이트
-- 다중 파일 테이블 기반으로 접근 권한 변경
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Users can read won digital rewards" ON storage.objects;

-- 새 정책: 다중 파일 테이블 기반
CREATE POLICY "Users can read won digital rewards" ON storage.objects FOR
SELECT TO authenticated USING (
        bucket_id = 'roulette-rewards'
        AND (
            -- 다중 파일 테이블에서 확인
            EXISTS (
                SELECT 1
                FROM
                    roulette_item_digital_files f
                    JOIN user_roulette_digital_file_wins w ON w.digital_file_id = f.id
                WHERE
                    w.user_id = auth.uid ()
                    AND f.file_path = name
            )
            OR
            -- 레거시: 기존 user_roulette_rewards 테이블 (bundle 지급)
            EXISTS (
                SELECT 1
                FROM user_roulette_rewards
                WHERE
                    user_id = auth.uid ()
                    AND reward_type = 'digital'
                    AND digital_file_path = name
            )
        )
    );

-- ============================================================
-- 10. 권한 설정
-- ============================================================

GRANT
SELECT, INSERT,
UPDATE, DELETE ON roulette_item_digital_files TO authenticated;

GRANT SELECT ON user_roulette_digital_file_wins TO authenticated;

GRANT INSERT ON user_roulette_digital_file_wins TO service_role;

-- ============================================================
-- 검증 쿼리
-- ============================================================

-- 마이그레이션된 파일 확인
SELECT
    i.id as item_id,
    i.name as item_name,
    i.digital_distribution_type,
    COUNT(f.id) as file_count
FROM
    partner_roulette_items i
    LEFT JOIN roulette_item_digital_files f ON f.item_id = i.id
WHERE
    i.reward_type = 'digital'
GROUP BY
    i.id,
    i.name,
    i.digital_distribution_type;