# 룰렛 시스템 개편 개발 계획서

> 작성일: 2026-02-01  
> 최종 수정: 2026-02-02  
> 상태: Phase 1~4, 6 완료, Phase 5 대기 (고도화 설계 완료)

## 개요

현재 룰렛 시스템을 개선하여 더 간결하고 사용하기 쉬운 구조로 리팩토링합니다.

### 목표
- 보상 타입 간소화 (5종 → 3종) ✅
- 사용형 아이템 UX 개선 ✅
- 디지털 보상 파일 업로드 지원 ✅
- 실시간 알림 시스템 추가 ✅
- **[Phase 5 고도화]** 수량 제한 시스템 (전체/유저별)
- **[Phase 5 고도화]** 디지털 보상 컬렉션 (사진 앨범 수집)
- **[Phase 5 고도화]** 비방송용 프로필 룰렛 (가챠 페이지)

---

## Phase 1: 보상 타입 간소화 ✅ (프론트엔드 완료)

> **상태**: 프론트엔드 완료 (2026-02-01)  
> **남은 작업**: DB 마이그레이션 스크립트 실행 필요

### 현재 상태
```
reward_type: 'text' | 'points' | 'usable' | 'digital' | 'custom'
```

### 목표 상태
```
reward_type: 'text' | 'usable' | 'digital'
```

### 변경 사항

| 기존 타입 | 변경 | 설명 |
|----------|------|------|
| text | 유지 | 텍스트만 표시 (꽝, 축하 메시지 등) |
| points | **제거** | text로 통합 또는 usable로 대체 |
| usable | 유지 | 사용형 아이템 (파트너 승인 필요) |
| digital | 유지 | 디지털 보상 (사진/파일, 바로 지급) |
| custom | **제거** | usable로 통합 |

### 작업 목록

#### 1.1 데이터베이스 마이그레이션
- [x] 마이그레이션 스크립트 작성 (`documents/migration_roulette_type_simplify.sql`)
- [ ] `roulette_items` 테이블 `reward_type` 컬럼 제약조건 변경 (Supabase 실행 필요)
- [ ] 기존 `points`, `custom` 타입 데이터 마이그레이션 (Supabase 실행 필요)
  - `points` → `text` (포인트 지급은 별도 로직으로 처리)
  - `custom`, `coupon` → `usable`
- [ ] `user_roulette_rewards` 테이블 동일 적용 (Supabase 실행 필요)

#### 1.2 타입 정의 수정 ✅
- [x] `src/components/features/inventory/roulette/types.ts`
- [x] `src/components/features/stream/roulette/types.ts`
- [x] `LegacyRouletteRewardType` 추가 (하위 호환성)

#### 1.3 UI 컴포넌트 수정 ✅
- [x] `RouletteItemEditor.tsx` - 타입 선택 UI (버튼 3개로 변경)
- [x] `RouletteInventoryCard.tsx` - 레거시 타입 호환 + 아이콘/라벨
- [x] `dev/roulette.tsx` - 테스트 데이터 수정

#### 1.4 비즈니스 로직 수정 ✅
- [x] `normalizeRewardType()` 함수 추가 (레거시 호환)
- [x] `isPointsReward()` 함수 추가 (포인트 표시 로직)

### 예상 영향도
- 룰렛 설정 페이지 ✅
- 룰렛 결과 처리 로직 (레거시 호환 처리)
- 인벤토리 표시 로직 ✅
- 기존 데이터 호환성 ✅

### 수정된 파일
- `src/components/features/inventory/roulette/types.ts`
- `src/components/features/stream/roulette/types.ts`
- `src/components/features/stream/roulette/RouletteItemEditor.tsx`
- `src/components/features/inventory/roulette/RouletteInventoryCard.tsx`
- `src/routes/dev/roulette.tsx`
- `documents/migration_roulette_type_simplify.sql` (신규)

---

## Phase 2: 사용형 아이템 개선 ✅ (완료)

> **상태**: 완료 (2026-02-01)

### 현재 상태
- 사용 요청 시 메시지 입력 불가 (또는 제한적)
- `usable_type`이 고정된 카테고리만 지원

### 목표 상태
- 사용 요청 시 **자유 텍스트 입력** 가능
- 파트너가 요청 내용 확인 후 수락/거절

### 작업 목록

#### 2.1 사용 요청 UI 개선 ✅
- [x] `src/components/features/inventory/roulette/UseRewardModal.tsx` (신규)
  - 2단계 플로우: 확인 → 메시지 입력
  - 텍스트 입력 필드 (200자 제한)
  - 미리보기 기능
  - 입력 내용이 `context.message`에 저장됨

#### 2.2 데이터베이스 확인 ✅
- [x] `roulette_reward_usage_logs.context` 필드 활용 (이미 JSONB)
  ```sql
  context: { message: "안녕하세요! 10분 통화 부탁드려요" }
  ```

#### 2.3 파트너 카드에 메시지 표시 ✅
- [x] `PartnerRewardUsageRequestCard.tsx` - 이미 구현됨
  - `request.context?.message` 표시 중

#### 2.4 usable_type 유연화 ✅
- [x] Phase 1에서 reward_type을 usable로 통합
- [x] reward_value로 자유롭게 보상 정의 가능

### 수정된 파일
- `src/components/features/inventory/roulette/UseRewardModal.tsx` (신규)
- `src/routes/mypage/inventory/roulette.tsx`

### 예상 영향도
- 유저 인벤토리 페이지 ✅
- 사용 요청 플로우 ✅
- (파트너 측은 이미 개선 완료) ✅

---

## Phase 3: 디지털 보상 개선 ✅ (완료)

> **상태**: 완료 (2026-02-01)

### 현재 상태
- 디지털 보상 = URL 링크만 입력
- 파일 직접 업로드 불가

### 목표 상태
- 파트너가 **사진/파일 직접 업로드**
- 유저가 **컬렉션에서 모아보기** 가능
- 바로 지급 (승인 불필요)

### 작업 목록

#### 3.1 Storage 버킷 설정 ✅
- [x] Supabase Storage에 `roulette-rewards` 버킷 생성 (마이그레이션 스크립트)
- [x] RLS 정책 설정
  - 파트너: 업로드 가능
  - 유저: 본인 보상만 읽기 가능

#### 3.2 파트너 룰렛 아이템 설정 UI ✅
- [x] 디지털 보상 타입 선택 시 파일 업로드 UI
- [x] 드래그앤드롭 스타일 업로드 버튼
- [x] 이미지 미리보기
- [x] 업로드 진행률 표시
- [x] 파일 크기/형식 제한 (10MB, jpg/png/gif/webp/mp4)

#### 3.3 데이터베이스 활용 ✅
- [x] `user_roulette_rewards` 테이블의 기존 필드 활용
  ```sql
  digital_file_url TEXT,      -- Storage URL
  digital_file_name TEXT,     -- 원본 파일명
  digital_file_size BIGINT,   -- 파일 크기
  digital_file_type TEXT,     -- MIME type
  digital_file_path TEXT      -- Storage 경로
  ```

#### 3.4 유저 컬렉션 페이지 ✅
- [x] `src/routes/mypage/inventory/digital-collection.tsx` (신규)
- [x] 그리드 형태로 디지털 보상 표시
- [x] 전체/사진/영상 필터
- [x] 클릭 시 라이트박스 전체화면 보기
- [x] 좌우 네비게이션
- [x] 다운로드 옵션
- [x] 인벤토리 페이지에 컬렉션 배너 추가

#### 3.5 룰렛 결과 처리
- [ ] `execute_roulette` 함수에서 디지털 보상 자동 지급 (기존 로직 활용)
- [ ] 파일 복사 또는 접근 권한 부여 (Storage RLS로 처리)

### 수정된 파일
- `documents/migration_roulette_digital_storage.sql` (신규) - Storage 버킷 마이그레이션
- `src/hooks/useRouletteDigitalUpload.ts` (신규) - 파일 업로드 훅
- `src/components/features/stream/roulette/RouletteItemEditor.tsx` - 파일 업로드 UI
- `src/routes/mypage/inventory/digital-collection.tsx` (신규) - 디지털 컬렉션 페이지
- `src/routes/mypage/inventory/roulette.tsx` - 컬렉션 배너 추가

### 예상 영향도
- 파트너 룰렛 설정 페이지 ✅
- 룰렛 실행 로직 (기존 로직 활용)
- 유저 인벤토리/컬렉션 페이지 ✅

---

## Phase 4: 알림 시스템 ✅ (완료)

> **상태**: 완료 (2026-02-01)

### 현재 상태
- 사용 요청/수락/거절 시 알림 없음
- 대시보드에서 직접 확인해야 함

### 목표 상태
- **사용 요청 시** → 파트너에게 푸시 알림
- **수락/거절 시** → 유저에게 푸시 알림

### 작업 목록

#### 4.1 알림 타입 정의 ✅
- [x] 알림 타입 추가
  ```
  roulette_usage_requested  - 사용 요청 (→ 파트너)
  roulette_usage_approved   - 수락됨 (→ 유저)
  roulette_usage_rejected   - 거절됨 (→ 유저)
  ```

#### 4.2 알림 발송 로직 ✅
- [x] `request_roulette_reward_usage` RPC 함수 수정
  - 파트너에게 `push_notifications_queue` INSERT
- [x] `approve_roulette_reward_usage` RPC 함수 수정
  - 유저에게 알림 생성
- [x] `reject_roulette_reward_usage` RPC 함수 수정
  - 유저에게 알림 생성 (거절 사유 포함)

#### 4.3 푸시 알림 연동 ✅
- [x] 기존 `push-native` Edge Function 활용
- [x] `push_notifications_queue` 테이블에 INSERT하면 자동 발송

#### 4.4 인앱 알림 표시 ✅
- [x] 알림 목록에 새 타입별 아이콘 표시
- [x] 클릭 시 해당 페이지로 이동
  - 파트너: `/dashboard/partner/roulette-requests`
  - 유저: `/mypage/inventory/roulette`

### 수정된 파일
- `documents/migration_roulette_notifications.sql` (신규) - RPC 함수 알림 추가
- `src/routes/notifications.tsx` - 알림 아이콘 및 클릭 핸들러
  - 파트너: `/dashboard/partner/roulette-requests`
  - 유저: `/inventory/roulette`

### 예상 영향도
- 알림 시스템 전반
- RPC 함수들
- 푸시 알림 Edge Function

---

## Phase 5: 룰렛 고도화 (수량 제한 + 컬렉션 + 비방송용)

> **상태**: 프론트엔드 완료 (2026-02-02)  
> **남은 작업**: DB 마이그레이션 스크립트 실행 필요

### 개요

룰렛 시스템을 전면 고도화하여 다양한 수량 제한, 컬렉션 시스템, 비방송용 룰렛을 지원합니다.

---

### Part A: 수량 제한 시스템

#### 현재 상태
- 모든 룰렛 아이템이 무제한 당첨 가능
- 디지털 보상도 중복 당첨됨
- 희귀템/한정판 개념 없음

#### 목표 상태
- **전체 수량 제한**: 모든 유저 합산 N개까지만 당첨 (예: 전체 10개 한정)
- **유저별 수량 제한**: 각 유저당 N개까지만 당첨 (예: 인당 4개 제한)
- **디지털 보상 중복 방지**: 같은 디지털 보상은 1번만 당첨
- **소진 시 확률 재계산**: 소진된 아이템은 가중치에서 제외

#### 작업 목록

##### A.1 데이터베이스 스키마 확장

```sql
-- partner_roulette_items 테이블 확장
ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  global_stock_limit INTEGER DEFAULT NULL;  -- 전체 수량 제한 (NULL = 무제한)

ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  global_stock_used INTEGER DEFAULT 0;  -- 전체 사용량

ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  per_user_limit INTEGER DEFAULT NULL;  -- 유저별 수량 제한 (NULL = 무제한)

ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  is_blank BOOLEAN DEFAULT false;  -- 꽝 여부 (소진 판정에서 제외)

ALTER TABLE partner_roulette_items ADD COLUMN IF NOT EXISTS 
  prevent_duplicate BOOLEAN DEFAULT false;  -- 중복 당첨 방지 (디지털 보상용)

-- 유저별 당첨 횟수 추적 테이블
CREATE TABLE IF NOT EXISTS user_roulette_item_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES partner_roulette_items(id) ON DELETE CASCADE,
  win_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);
```

##### A.2 룰렛 아이템 타입 확장

```typescript
interface RouletteItem {
  // ... 기존 필드
  
  // 수량 제한
  global_stock_limit?: number | null   // 전체 수량 제한 (null = 무제한)
  global_stock_used?: number           // 전체 사용량
  per_user_limit?: number | null       // 유저별 수량 제한 (null = 무제한)
  
  // 특수 플래그
  is_blank?: boolean                   // 꽝 여부
  prevent_duplicate?: boolean          // 중복 방지 (디지털 보상)
}
```

##### A.3 당첨 가능 여부 판정 함수

```sql
-- 특정 유저가 특정 아이템을 당첨받을 수 있는지 확인
CREATE OR REPLACE FUNCTION can_win_roulette_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_item RECORD;
  v_user_count INTEGER;
BEGIN
  SELECT * INTO v_item FROM partner_roulette_items WHERE id = p_item_id;
  
  IF NOT FOUND THEN RETURN false; END IF;
  
  -- 1. 전체 수량 소진 체크
  IF v_item.global_stock_limit IS NOT NULL 
     AND v_item.global_stock_used >= v_item.global_stock_limit THEN
    RETURN false;
  END IF;
  
  -- 2. 유저별 수량 체크
  IF v_item.per_user_limit IS NOT NULL THEN
    SELECT COALESCE(win_count, 0) INTO v_user_count
    FROM user_roulette_item_counts
    WHERE user_id = p_user_id AND item_id = p_item_id;
    
    IF v_user_count >= v_item.per_user_limit THEN
      RETURN false;
    END IF;
  END IF;
  
  -- 3. 중복 방지 체크 (디지털 보상)
  IF v_item.prevent_duplicate THEN
    IF EXISTS (
      SELECT 1 FROM user_roulette_item_counts
      WHERE user_id = p_user_id AND item_id = p_item_id AND win_count > 0
    ) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;
```

##### A.4 calculate_roulette_result 함수 업데이트

```sql
-- 유저별 가용 아이템만 고려하여 결과 계산
CREATE OR REPLACE FUNCTION calculate_roulette_result_v2(
  p_partner_id UUID,
  p_wheel_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_total_weight INTEGER := 0;
  v_random_value INTEGER;
  v_cumulative_weight INTEGER := 0;
  v_item RECORD;
BEGIN
  -- 당첨 가능한 아이템만 가중치 합산
  FOR v_item IN
    SELECT id, weight FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order
  LOOP
    v_total_weight := v_total_weight + v_item.weight;
  END LOOP;
  
  IF v_total_weight = 0 THEN RETURN NULL; END IF;
  
  v_random_value := floor(random() * v_total_weight)::INTEGER;
  
  FOR v_item IN
    SELECT id, weight FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true
      AND can_win_roulette_item(p_user_id, id)
    ORDER BY sort_order
  LOOP
    v_cumulative_weight := v_cumulative_weight + v_item.weight;
    IF v_random_value < v_cumulative_weight THEN
      RETURN v_item.id;
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

##### A.5 룰렛 휠 상태 확인 함수

```sql
-- 특정 유저가 특정 휠을 돌릴 수 있는지 확인
-- 꽝(is_blank)을 제외하고 당첨 가능한 아이템이 있어야 함
CREATE OR REPLACE FUNCTION can_spin_roulette_wheel(
  p_user_id UUID,
  p_wheel_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_available_count INTEGER := 0;
  v_has_unlimited BOOLEAN := false;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT * FROM partner_roulette_items
    WHERE wheel_id = p_wheel_id AND is_active = true AND is_blank = false
  LOOP
    IF can_win_roulette_item(p_user_id, v_item.id) THEN
      v_available_count := v_available_count + 1;
      
      -- 무제한 아이템 체크
      IF v_item.global_stock_limit IS NULL 
         AND v_item.per_user_limit IS NULL 
         AND NOT v_item.prevent_duplicate THEN
        v_has_unlimited := true;
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'can_spin', v_available_count > 0 OR v_has_unlimited,
    'available_items', v_available_count,
    'has_unlimited', v_has_unlimited,
    'reason', CASE 
      WHEN v_available_count = 0 AND NOT v_has_unlimited THEN 'ALL_EXHAUSTED'
      ELSE NULL
    END
  );
END;
$$ LANGUAGE plpgsql;
```

##### A.6 파트너 설정 UI 확장
- [ ] 아이템 편집 시 수량 제한 설정 UI
  - 전체 수량 제한 입력 (무제한 체크박스)
  - 유저별 수량 제한 입력 (무제한 체크박스)
  - 꽝 여부 체크박스
  - 중복 방지 체크박스 (디지털 보상 선택 시 자동 활성화)
- [ ] 수량 소진 현황 표시 (예: 3/10 사용됨)

##### A.7 유저 UI 표시
- [ ] 룰렛 휠 선택 시 "모든 상품 소진됨" 상태 표시
- [ ] 각 아이템별 "소진됨" 표시

---

### Part B: 디지털 보상 컬렉션 시스템

#### 현재 상태
- 디지털 보상 = 단일 파일 (사진/영상 1개)
- 같은 디지털 보상 중복 당첨 가능

#### 목표 상태
- **컬렉션형 디지털 보상**: 여러 장의 사진을 하나의 컬렉션으로 묶음
- **수집 진행률**: "3/10장 수집" 형태로 표시
- **완성 시 특전**: 모든 장을 모으면 추가 보상 또는 뱃지
- **중복 당첨 방지**: 같은 사진은 다시 당첨되지 않음

#### 작업 목록

##### B.1 컬렉션 테이블 생성

```sql
-- 디지털 보상 컬렉션 (사진 앨범)
CREATE TABLE IF NOT EXISTS roulette_digital_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  wheel_id UUID REFERENCES partner_roulette_wheels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                    -- 컬렉션 이름 (예: "여름 화보 컬렉션")
  description TEXT,                      -- 설명
  total_items INTEGER NOT NULL DEFAULT 1, -- 총 아이템 수
  thumbnail_url TEXT,                    -- 컬렉션 썸네일
  completion_reward_type TEXT,           -- 완성 보상 타입 (text/usable/digital)
  completion_reward_value TEXT,          -- 완성 보상 값
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 컬렉션 내 개별 아이템 (각 사진)
CREATE TABLE IF NOT EXISTS roulette_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES roulette_digital_collections(id) ON DELETE CASCADE,
  roulette_item_id UUID NOT NULL REFERENCES partner_roulette_items(id) ON DELETE CASCADE,
  item_order INTEGER DEFAULT 0,          -- 컬렉션 내 순서
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, roulette_item_id)
);

-- 유저별 컬렉션 진행 현황
CREATE TABLE IF NOT EXISTS user_collection_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES roulette_digital_collections(id) ON DELETE CASCADE,
  collected_items UUID[] DEFAULT '{}',   -- 수집한 아이템 ID 배열
  is_completed BOOLEAN DEFAULT false,    -- 완성 여부
  completed_at TIMESTAMPTZ,              -- 완성 시각
  completion_reward_claimed BOOLEAN DEFAULT false, -- 완성 보상 수령 여부
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, collection_id)
);
```

##### B.2 컬렉션 아이템 자동 처리

```sql
-- 디지털 보상 당첨 시 컬렉션 진행률 업데이트
CREATE OR REPLACE FUNCTION update_collection_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_id UUID;
  v_collection RECORD;
  v_progress RECORD;
  v_total INTEGER;
BEGIN
  -- 해당 아이템이 컬렉션에 속하는지 확인
  SELECT collection_id INTO v_collection_id
  FROM roulette_collection_items
  WHERE roulette_item_id = NEW.roulette_item_id;
  
  IF v_collection_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- 컬렉션 정보 조회
  SELECT * INTO v_collection
  FROM roulette_digital_collections
  WHERE id = v_collection_id;
  
  -- 유저 진행 상황 업데이트 또는 생성
  INSERT INTO user_collection_progress (user_id, collection_id, collected_items)
  VALUES (NEW.user_id, v_collection_id, ARRAY[NEW.roulette_item_id])
  ON CONFLICT (user_id, collection_id) DO UPDATE
  SET collected_items = array_append(
    user_collection_progress.collected_items, 
    NEW.roulette_item_id
  ),
  updated_at = now();
  
  -- 완성 여부 확인
  SELECT * INTO v_progress
  FROM user_collection_progress
  WHERE user_id = NEW.user_id AND collection_id = v_collection_id;
  
  SELECT COUNT(*) INTO v_total
  FROM roulette_collection_items
  WHERE collection_id = v_collection_id;
  
  IF array_length(v_progress.collected_items, 1) >= v_total THEN
    UPDATE user_collection_progress
    SET is_completed = true, completed_at = now()
    WHERE id = v_progress.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_collection_progress
AFTER INSERT ON user_roulette_rewards
FOR EACH ROW
WHEN (NEW.reward_type = 'digital')
EXECUTE FUNCTION update_collection_progress();
```

##### B.3 컬렉션 관리 UI (파트너)
- [ ] 컬렉션 생성/편집 모달
- [ ] 여러 디지털 보상을 하나의 컬렉션으로 묶기
- [ ] 완성 보상 설정 (선택)
- [ ] 컬렉션 미리보기

##### B.4 컬렉션 표시 UI (유저)
- [ ] 디지털 컬렉션 페이지에 컬렉션별 진행률 표시
- [ ] "3/10장 수집" 형태의 카드
- [ ] 미수집 아이템은 실루엣 또는 "?" 표시
- [ ] 완성 시 축하 애니메이션 + 완성 보상 수령 버튼

---

### Part C: 비방송용 룰렛 (프로필 룰렛)

#### 현재 상태
- 룰렛이 방송 내에서만 사용됨
- 파트너 프로필에서는 룰렛 없음

#### 목표 상태
- **방송용 룰렛**: 방송 중 후원 시 실행 (기존)
- **프로필 룰렛**: 파트너 페이지에서 언제든 후원하여 실행
- **동일한 기능**: 수량 제한, 컬렉션 등 모든 기능 동일
- **위치 분리**: 방송용/프로필용 별도 설정 가능

#### 작업 목록

##### C.1 데이터베이스 스키마 확장

```sql
-- partner_roulette_wheels 테이블 확장
ALTER TABLE partner_roulette_wheels ADD COLUMN IF NOT EXISTS 
  wheel_type TEXT DEFAULT 'stream' CHECK (wheel_type IN ('stream', 'profile'));

ALTER TABLE partner_roulette_wheels ADD COLUMN IF NOT EXISTS 
  is_featured BOOLEAN DEFAULT false;  -- 대표 룰렛 여부 (프로필용)

-- donation_roulette_results 테이블 확장
ALTER TABLE donation_roulette_results ADD COLUMN IF NOT EXISTS 
  source_type TEXT DEFAULT 'stream' CHECK (source_type IN ('stream', 'profile'));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partner_roulette_wheels_type 
  ON partner_roulette_wheels(partner_id, wheel_type, is_active);
```

##### C.2 프로필 룰렛 실행 함수

```sql
-- 프로필 룰렛 실행 (방송 없이)
CREATE OR REPLACE FUNCTION execute_profile_roulette(
  p_donor_id UUID,
  p_partner_id UUID,
  p_wheel_id UUID,
  p_donation_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- 휠 유효성 검사
  IF NOT EXISTS (
    SELECT 1 FROM partner_roulette_wheels
    WHERE id = p_wheel_id 
      AND partner_id = p_partner_id 
      AND wheel_type = 'profile'
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PROFILE_WHEEL');
  END IF;
  
  -- 유저가 해당 휠을 돌릴 수 있는지 확인
  SELECT can_spin_roulette_wheel(p_donor_id, p_wheel_id) INTO v_result;
  IF NOT (v_result->>'can_spin')::boolean THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', v_result->>'reason',
      'available_items', v_result->>'available_items'
    );
  END IF;
  
  -- 기존 execute_donation_roulette 함수 재사용
  -- room_id는 NULL, donation_id는 별도 생성
  -- (상세 구현은 execute_donation_roulette 확장)
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

##### C.3 파트너 페이지 UI

###### C.3.1 대표 룰렛 배너 (멤버십 위)
- [ ] `src/components/features/partner/FeaturedRouletteBanner.tsx` (신규)
  - 파트너 페이지 상단, 멤버십 카드 위에 표시
  - 대표 룰렛 미니 프리뷰 (회전하는 룰렛 아이콘)
  - "룰렛 돌리기" 버튼 → 룰렛 모음 페이지로 이동
  - 당첨 상품 미리보기 슬라이드

###### C.3.2 룰렛 버튼 (우측 상단)
- [ ] `src/components/layouts/Navigation.tsx` 수정
  - 후원자 랭킹 버튼 옆에 룰렛 버튼 추가
  - 아이콘: 🎰 또는 커스텀 룰렛 아이콘
  - 클릭 시 해당 파트너의 룰렛 모음 페이지로 이동

##### C.4 룰렛 모음 페이지

###### C.4.1 페이지 구조
- [ ] `src/routes/partner/[partner_id]/roulette.tsx` (신규)
  - 해당 파트너의 프로필 룰렛 목록 표시
  - 각 룰렛별 가격, 상품 미리보기, 돌리기 버튼

###### C.4.2 UI 컨셉: 신비로운 우주/요정 테마
```
디자인 방향:
- 배경: 깊은 우주 느낌의 어두운 그라데이션 (딥 퍼플 → 미드나잇 블루)
- 반짝이는 별/파티클 애니메이션
- 각 룰렛은 마법의 오브 또는 수정구 느낌의 카드
- 부유하는 요정 먼지 효과
- 네온 글로우 테두리
- 호버 시 빛나는 효과

컬러 팔레트:
- Primary: #6B21A8 (보라)
- Secondary: #0EA5E9 (하늘)
- Accent: #F472B6 (핑크)
- Glow: #E0E7FF (은빛)
```

###### C.4.3 룰렛 카드 컴포넌트
- [ ] `src/components/features/partner/RouletteGachaCard.tsx` (신규)
  - 룰렛 이름, 가격
  - 상품 미리보기 (3-5개 주요 상품 아이콘)
  - "N개 상품" 표시
  - 남은 수량 표시 (한정판의 경우)
  - "돌리기" 버튼 (후원 모달 연결)
  - 회전하는 미니 룰렛 애니메이션

##### C.5 룰렛 실행 플로우

```
1. 유저가 룰렛 선택 → "돌리기" 클릭
2. 후원 확인 모달 표시 (가격, 포인트 잔액)
3. 결제 완료 → 룰렛 애니메이션 실행
4. 결과 표시 (당첨 아이템)
5. 인벤토리에 자동 추가
6. "한 번 더?" 또는 "닫기" 선택
```

##### C.6 파트너 설정 UI

- [ ] 기존 룰렛 설정에 "용도" 선택 추가
  - 방송용 / 프로필용 / 둘 다
- [ ] 프로필용 룰렛 중 "대표 룰렛" 지정 (1개)
- [ ] 프로필 룰렛 활성화 토글

##### C.7 인벤토리 출처 표시

- [ ] 당첨 내역에 출처 표시
  - "🎬 방송에서 당첨" / "🎰 프로필에서 당첨"
- [ ] 필터 옵션 추가 (방송/프로필)

---

### 구현 순서 (권장)

```
1단계: 수량 제한 시스템 (Part A)
   - DB 스키마 확장
   - 판정 함수 구현
   - 파트너 설정 UI
   - 룰렛 실행 로직 수정

2단계: 컬렉션 시스템 (Part B)
   - 컬렉션 테이블 생성
   - 진행률 추적 로직
   - 파트너 관리 UI
   - 유저 컬렉션 페이지

3단계: 비방송용 룰렛 (Part C)
   - wheel_type 분리
   - 프로필 룰렛 실행 함수
   - 파트너 페이지 UI
   - 룰렛 모음 페이지
```

---

### 예상 영향도

| 영역 | 변경 사항 |
|------|----------|
| DB 스키마 | partner_roulette_items 확장, 신규 테이블 3개 |
| 룰렛 실행 로직 | calculate_roulette_result 전면 수정 |
| 파트너 대시보드 | 수량 제한 설정, 컬렉션 관리, 휠 타입 설정 |
| 파트너 페이지 | 대표 룰렛 배너, 룰렛 버튼 |
| 룰렛 모음 페이지 | 신규 페이지 |
| 유저 인벤토리 | 컬렉션 진행률, 출처 표시 |
| 후원 플로우 | 프로필 룰렛 후원 처리 |

---

### 신규 파일 (예정)

```
documents/
  migration_roulette_stock_limit.sql       -- 수량 제한 스키마
  migration_roulette_collections.sql       -- 컬렉션 스키마
  migration_roulette_profile.sql           -- 프로필 룰렛 스키마

src/components/features/partner/
  FeaturedRouletteBanner.tsx               -- 대표 룰렛 배너
  RouletteGachaCard.tsx                    -- 룰렛 가챠 카드

src/components/features/stream/roulette/
  StockLimitEditor.tsx                     -- 수량 제한 편집기
  CollectionEditor.tsx                     -- 컬렉션 편집기

src/routes/partner/
  [partner_id]/roulette.tsx                -- 룰렛 모음 페이지

src/hooks/
  useRouletteStock.ts                      -- 수량 제한 관련 훅
  useRouletteCollections.ts                -- 컬렉션 관련 훅
  useProfileRoulette.ts                    -- 프로필 룰렛 훅
```

---

## Phase 6: 사용자 인벤토리/당첨내역 UI 개선 ✅ (완료)

> **상태**: 완료 (2026-02-01)

### 현재 상태
- 사용자 룰렛 당첨내역 페이지 UI가 기본적
- 인벤토리 카드 디자인 개선 필요
- 필터/정렬 기능 부족

### 목표 상태
- 모던하고 직관적인 인벤토리 UI
- 다양한 필터/정렬 옵션
- 보상 타입별 명확한 시각적 구분
- 사용 요청 플로우 개선

### 작업 목록

#### 6.1 당첨내역 페이지 리디자인 ✅
- [x] `src/routes/mypage/inventory/roulette.tsx` 리디자인
- [x] 모던 그라데이션 배경 및 카드 디자인
- [x] 통계 요약 카드 (총 당첨, 사용 가능, 대기 중, 디지털)

#### 6.2 인벤토리 카드 개선 ✅
- [x] `RouletteInventoryCard.tsx` 모던 리디자인
- [x] 보상 타입별 아이콘/색상 구분
  - text: 회색 + FileText 아이콘
  - usable: 보라색 + Ticket 아이콘
  - digital: 핑크색 + Image 아이콘
- [x] 좌측 컬러 인디케이터 바
- [x] 상태 뱃지 (처리 중 표시)

#### 6.3 탭 UI 개선 ✅
- [x] 필형 탭 디자인 (세그먼트 컨트롤 스타일)
- [x] 아이콘 + 텍스트 조합
- [x] 보유 아이템 수 뱃지

#### 6.4 사용 이력 UI 개선 ✅
- [x] 상태별 색상 구분 (승인/거절/대기)
- [x] 상태 아이콘 (CheckCircle/XCircle/Clock)
- [x] 거절 사유 하이라이트 표시
- [x] 빈 상태 UI 개선

#### 6.5 모바일 최적화 ✅
- [x] 그리드 레이아웃 (통계 4열)
- [x] 터치 친화적 탭 크기
- [x] 하단 여백 확보 (pb-24)

### 수정된 파일
- `src/routes/mypage/inventory/roulette.tsx` - 페이지 전체 리디자인
- `src/components/features/inventory/roulette/RouletteInventoryCard.tsx` - 카드 컴포넌트 개선

---

## 개발 우선순위 및 의존성

```
Phase 1 (보상 타입 간소화) ✅
    ↓
Phase 2 (사용형 개선) ✅
    ↓
Phase 3 (디지털 개선) ✅
    ↓
Phase 4 (알림 시스템) ✅
    ↓
Phase 6 (사용자 UI 개선) ✅
    ↓
Phase 5 (룰렛 고도화) ← 현재 단계
    ├─ Part A: 수량 제한 시스템 (우선)
    ├─ Part B: 컬렉션 시스템 (Part A 완료 후)
    └─ Part C: 비방송용 룰렛 (독립적, 병렬 가능)
```

---

## 마이그레이션 전략

### 데이터 호환성
1. 기존 `points`, `custom` 타입 데이터 → 새 타입으로 마이그레이션 ✅
2. 이전 버전 앱 호환성 고려 (API 버전 관리)
3. **Phase 5 추가**:
   - 기존 아이템에 `global_stock_limit`, `per_user_limit` = NULL (무제한) 유지
   - 기존 휠에 `wheel_type` = 'stream' 기본값 설정
   - `is_blank` = false 기본값 (기존 꽝 아이템은 수동 설정 필요)

### 롤백 계획
- 각 Phase별 마이그레이션 스크립트에 롤백 스크립트 포함
- Feature flag로 점진적 배포
- Phase 5는 하위 호환 유지 (새 컬럼은 모두 NULL 허용)

---

## 예상 작업량

| Phase | 작업량 | 상태 | 비고 |
|-------|--------|------|------|
| Phase 1 | 중 | ✅ 완료 | DB 마이그레이션 주의 |
| Phase 2 | 소 | ✅ 완료 | UI 위주 |
| Phase 3 | 중 | ✅ 완료 | Storage 연동 |
| Phase 4 | 중 | ✅ 완료 | 알림 인프라 활용 |
| Phase 6 | 중 | ✅ 완료 | UI/UX 개선 |
| Phase 5-A | 대 | 대기 | 수량 제한 시스템 |
| Phase 5-B | 대 | 대기 | 컬렉션 시스템 |
| Phase 5-C | 대 | 대기 | 비방송용 룰렛 + 신규 페이지 |

---

## 관련 파일

### 수정 완료
- `src/components/features/inventory/roulette/types.ts` ✅
- `src/components/features/stream/roulette/RouletteItemEditor.tsx` ✅
- `src/components/features/inventory/roulette/RouletteInventoryCard.tsx` ✅
- `src/routes/mypage/inventory/roulette.tsx` ✅
- `documents/migration_roulette_type_simplify.sql` ✅
- `documents/migration_roulette_digital_storage.sql` ✅
- `documents/migration_roulette_notifications.sql` ✅

### Phase 5 수정 예정
- `src/components/features/stream/roulette/types.ts` - 수량 제한 필드 추가
- `src/components/features/stream/roulette/RouletteItemEditor.tsx` - 수량 제한 UI
- `src/hooks/usePartnerRouletteSettings.ts` - 컬렉션/휠타입 지원
- `documents/migration_execute_roulette_v2.sql` - 수량 제한 로직 반영

### Phase 5 신규 생성 예정
```
documents/
  migration_roulette_stock_limit.sql       -- 수량 제한 스키마
  migration_roulette_collections.sql       -- 컬렉션 스키마
  migration_roulette_profile.sql           -- 프로필 룰렛 스키마

src/components/features/partner/
  FeaturedRouletteBanner.tsx               -- 대표 룰렛 배너
  RouletteGachaCard.tsx                    -- 룰렛 가챠 카드

src/components/features/stream/roulette/
  StockLimitEditor.tsx                     -- 수량 제한 편집기
  CollectionEditor.tsx                     -- 컬렉션 편집기

src/routes/partner/
  [partner_id]/roulette.tsx                -- 룰렛 모음 페이지

src/hooks/
  useRouletteStock.ts                      -- 수량 제한 관련 훅
  useRouletteCollections.ts                -- 컬렉션 관련 훅
  useProfileRoulette.ts                    -- 프로필 룰렛 훅
```
