-- =====================================================================
-- 룰렛 보상 타입 확장 마이그레이션
-- 작성일: 2025-12-30
-- 목적: partner_roulette_items 테이블에 reward_type, reward_value 컬럼 추가
--       및 CHECK 제약조건 설정
-- =====================================================================

-- reward_type 컬럼 추가 (없는 경우에만)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_roulette_items' 
        AND column_name = 'reward_type'
    ) THEN
        ALTER TABLE partner_roulette_items 
        ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'text';
        COMMENT ON COLUMN partner_roulette_items.reward_type IS 
        '보상 타입: text(텍스트만), usable(사용형 아이템), coupon(1회성 쿠폰), digital(디지털 보상), custom(커스텀)';
    END IF;
END;
$$;

-- reward_value 컬럼 추가 (없는 경우에만)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'partner_roulette_items' 
        AND column_name = 'reward_value'
    ) THEN
        ALTER TABLE partner_roulette_items 
        ADD COLUMN reward_value TEXT;
        COMMENT ON COLUMN partner_roulette_items.reward_value IS 
        '보상 값: 
- usable: "타입:수량" 형식 (예: "call_minutes:10", "photo_card:1")
- coupon: 자유 텍스트 (예: "포토카드 1장", "사진 1장")
- digital: 파일 경로 또는 URL (예: "roulette-rewards/photo.jpg")
- custom: 자유 텍스트';
    END IF;
END;
$$;

-- 기존 CHECK 제약조건 제거 (있는 경우)
ALTER TABLE partner_roulette_items 
DROP CONSTRAINT IF EXISTS partner_roulette_items_reward_type_check;

-- 새로운 CHECK 제약조건 추가 (points 제외)
ALTER TABLE partner_roulette_items 
ADD CONSTRAINT partner_roulette_items_reward_type_check 
CHECK (reward_type IN ('text', 'usable', 'coupon', 'digital', 'custom'));

-- 기존 코멘트 업데이트
COMMENT ON COLUMN partner_roulette_items.reward_type IS 
'보상 타입: text(텍스트만), usable(사용형 아이템), coupon(1회성 쿠폰), digital(디지털 보상), custom(커스텀)';

