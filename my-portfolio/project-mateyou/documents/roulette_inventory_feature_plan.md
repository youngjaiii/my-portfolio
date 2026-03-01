# 룰렛 뽑기 인벤토리 기능 상세 계획서

**작성일**: 2025-12-25  
**버전**: 1.0  
**우선순위**: 중간  
**예상 작업 시간**: 14시간 (사용형 아이템 기능 포함)

---

## 목차

1. [개요](#1-개요)
2. [현재 상태 분석](#2-현재-상태-분석)
3. [요구사항 상세](#3-요구사항-상세)
4. [데이터베이스 설계](#4-데이터베이스-설계)
5. [백엔드 API 설계](#5-백엔드-api-설계)
6. [프론트엔드 설계](#6-프론트엔드-설계)
7. [구현 작업 상세](#7-구현-작업-상세)
8. [테스트 계획](#8-테스트-계획)
9. [배포 가이드](#9-배포-가이드)

---

## 1. 개요

### 1.1 목적

룰렛 후원으로 당첨된 아이템을 사용자와 파트너가 확인할 수 있는 인벤토리 기능을 구현합니다. 이를 통해:
- **사용자**: 자신이 당첨된 룰렛 아이템을 한눈에 확인하고 관리
- **파트너**: 자신의 룰렛으로 당첨된 사용자 목록과 통계를 확인하여 룰렛 전략 개선

### 1.2 핵심 기능

1. **사용자 인벤토리**
   - 본인이 당첨한 룰렛 아이템 목록 조회
   - 파트너별, 날짜별 필터링 및 정렬
   - 당첨 상세 정보 확인 (룰렛판, 아이템, 방송 정보)

2. **파트너 인벤토리**
   - 본인의 룰렛으로 당첨된 사용자 목록 조회
   - 당첨자별, 아이템별 통계 분석
   - 인기 아이템 및 날짜별 통계

### 1.3 비즈니스 가치

- **사용자 경험 향상**: 당첨 내역을 쉽게 확인하여 만족도 증가
- **파트너 인사이트**: 통계를 통해 효과적인 룰렛 전략 수립
- **재참여 유도**: 과거 당첨 내역을 보며 다시 후원하고 싶은 동기 부여

---

## 2. 현재 상태 분석

### 2.1 기존 데이터베이스 구조

**`donation_roulette_results` 테이블 (실제 스키마)**

```sql
CREATE TABLE donation_roulette_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id INTEGER NOT NULL,
    room_id UUID NOT NULL REFERENCES stream_rooms(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    roulette_item_id UUID REFERENCES partner_roulette_items(id) ON DELETE SET NULL,
    -- 당첨 아이템 스냅샷
    item_name TEXT NOT NULL,
    item_color TEXT,
    item_reward_type TEXT NOT NULL,  -- 'text', 'points', 'coupon', 'custom'
    item_reward_value TEXT,          -- 보상 값 (예: "500", "1:1 응원")
    -- 돌림판 렌더링용
    all_items JSONB NOT NULL,
    final_rotation NUMERIC(10, 2) NOT NULL,
    -- 보상 처리
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**주요 특징:**
- ✅ `is_processed` 플래그로 처리 완료된 당첨만 조회 가능
- ✅ 아이템 정보가 스냅샷으로 저장되어 삭제된 아이템도 확인 가능
- ✅ `item_reward_type`, `item_reward_value`로 보상 정보 저장
- ⚠️ **주의**: `wheel_id`, `wheel_name`, `wheel_price` 컬럼이 없음 (스키마 확인 필요)

**보상 타입:**
- `text`: 텍스트만 (예: "응원 메시지")
- `points`: 포인트 (즉시 지급, 예: "+500P")
- `usable`: **사용형 아이템/쿠폰** (전화권, 채팅권, 1:1 통화권 등 - 파트너 승인 필요)
  - 잔여 수량/시간 추적 (`remaining_amount`)
  - 1회성 쿠폰: `initial_amount = 1`, `remaining_amount = 1` (사용하면 0)
  - 사용형 아이템: `initial_amount > 1`, `remaining_amount` 감소 추적
- `digital`: **디지털 보상** (사진, 영상 등 - 파일 다운로드 가능)
- `custom`: 커스텀 보상

**중요:** 쿠폰과 사용형 아이템은 동일한 `usable` 타입으로 통합. 차이점은 `initial_amount`와 `remaining_amount` 값만 다름.

### 2.2 기존 코드 구조

**룰렛 관련 컴포넌트:**
- `src/components/features/stream/roulette/` - 룰렛 UI 컴포넌트
- `src/hooks/useRouletteWheels.ts` - 룰렛판 관리 훅
- `src/hooks/usePartnerRouletteSettings.ts` - 파트너 룰렛 설정 훅

**라우팅 구조:**
- `/mypage` - 마이페이지 (메뉴 아이템으로 인벤토리 추가 가능)
- `/dashboard/partner` - 파트너 대시보드 (인벤토리 탭 추가 가능)

### 2.3 기존 인벤토리/목록 기능 참고

**유사한 기능:**
- `/mypage/purchases` - 구매 내역 페이지
- `/mypage/subscriptions` - 구독 목록
- `/mypage/following` - 팔로잉 목록

**참고할 수 있는 패턴:**
- 필터링 및 정렬 UI
- 무한 스크롤 또는 페이지네이션
- 카드 형태의 목록 표시

### 2.4 스키마 불일치 확인 필요

**문제점:**
- `donation_roulette_system.md` 문서에는 `wheel_id`, `wheel_name`, `wheel_price` 컬럼이 있다고 나와 있음
- 실제 스키마(`stream_schema_v2.sql`)에는 해당 컬럼이 없음
- `item_reward_type`, `item_reward_value`만 존재

**해결 방안:**
1. 실제 스키마를 기준으로 구현 (현재 스키마 사용)
2. 또는 마이그레이션으로 `wheel_id`, `wheel_name`, `wheel_price` 추가 후 구현

**권장사항:**
- 먼저 실제 데이터베이스에서 `donation_roulette_results` 테이블의 실제 컬럼 확인
- 룰렛판 정보가 필요하면 `partner_roulette_wheels` 테이블과 JOIN하여 조회
- 또는 `all_items` JSONB에서 룰렛판 정보 추출

---

## 3. 요구사항 상세

### 3.1 사용자(후원자) 기능

#### 3.1.1 인벤토리 목록 조회

**기능:**
- 본인이 당첨한 룰렛 아이템 목록 조회
- `is_processed = true`인 항목만 표시
- 기본 정렬: 최신순 (`created_at DESC`)

**표시 정보:**
- 룰렛판 이름 (또는 금액 정보)
- 당첨 아이템 이름 및 색상
- 보상 타입 및 값 (`item_reward_type`, `item_reward_value`)
- **사용형 아이템인 경우**: 잔여 수량/시간, 사용 가능 여부, 만료일
- **1회성 쿠폰인 경우**: 사용 여부, 사용 가능 여부, 만료일
- **디지털 보상인 경우**: 파일 미리보기, 다운로드 버튼, 파일 정보
- 파트너 이름
- 방송 제목
- 당첨 날짜/시간

#### 3.1.2 필터링 기능

**파트너별 필터:**
- 전체 파트너
- 특정 파트너 선택 (드롭다운)

**정렬 옵션:**
- 최신순 (기본)
- 과거순
- 파트너별 그룹화

#### 3.1.3 상세 정보 표시

**카드 클릭 시 표시:**
- 당첨 상세 정보
- 방송 정보 (제목, 시작 시간)
- 후원 금액 (연결된 `stream_donations.amount`)
- 보상 상세 설명
- **사용형 아이템인 경우**: 사용 이력, 잔여 수량/시간, 사용 버튼

#### 3.1.4 사용형 아이템/쿠폰 관리

**기능:**
- 사용형 아이템/쿠폰 목록 조회 (전화권, 채팅권, 1:1 통화권 등)
- 잔여 수량/시간 확인
- 사용 가능 여부 확인 (만료일 체크)
- **사용 요청** (사용자가 파트너에게 사용 요청)
- **파트너 승인/거절** (파트너가 확인 후 승인/거절)
- 사용 이력 조회

**사용 프로세스:**
1. 사용자가 인벤토리에서 사용 요청 (`request_roulette_reward_usage` 호출)
2. 보상 상태가 `pending`으로 변경
3. 사용 이력에 `status = 'pending'`으로 기록
4. 파트너에게 알림/요청 전달 (Realtime 또는 알림)
5. 파트너가 승인 (`approve_roulette_reward_usage`) 또는 거절 (`reject_roulette_reward_usage`)
6. 승인 시:
   - 잔여 수량 감소 (`remaining_amount` 업데이트)
   - 보상 상태 업데이트 (`active` 또는 `used`)
   - 사용 이력 상태를 `approved`로 변경
7. 거절 시:
   - 보상 상태를 `active`로 복원
   - 사용 이력 상태를 `rejected`로 변경
   - 거절 사유 저장

#### 3.1.5 디지털 보상 관리

**기능:**
- 디지털 보상 목록 조회 (사진, 영상 등)
- 파일 미리보기 (이미지인 경우)
- 파일 다운로드
- 파일 정보 확인 (파일명, 크기, 타입 등)
- 다운로드 이력 조회 (선택사항)

### 3.2 파트너 기능

#### 3.2.1 당첨자 목록 조회

**기능:**
- 본인의 룰렛으로 당첨된 사용자 목록 조회
- `partner_id`로 필터링
- 기본 정렬: 최신순

**표시 정보:**
- 당첨자 이름 및 프로필 이미지
- 당첨 아이템 정보
- 당첨 날짜/시간
- 방송 정보

#### 3.2.4 사용 요청 관리 (파트너 전용)

**기능:**
- 사용자가 요청한 사용형 아이템/쿠폰 목록 조회
- 승인 대기 중인 요청 목록 (`status = 'pending'`)
- 승인/거절 처리
- 거절 사유 입력
- 승인/거절 이력 조회

**표시 정보:**
- 요청자 이름 및 프로필 이미지
- 요청한 보상 정보
- 요청 수량/시간
- 요청 날짜/시간
- 승인/거절 버튼

#### 3.2.2 통계 기능

**인기 아이템 통계:**
- 아이템별 당첨 횟수
- 아이템별 당첨 비율
- 가장 많이 당첨된 아이템 TOP 10

**날짜별 통계:**
- 일별 당첨 건수
- 주별 당첨 건수
- 월별 당첨 건수
- 기간 선택 (최근 7일, 30일, 전체)

**당첨자 통계:**
- 가장 많이 당첨된 사용자 TOP 10
- 사용자별 총 당첨 횟수
- 사용자별 총 후원 금액 (연결된 `stream_donations`)

**사용 요청 통계:**
- 승인 대기 중인 요청 수
- 승인/거절 비율
- 평균 승인 시간

#### 3.2.3 필터링 및 검색

**필터 옵션:**
- 아이템별 필터
- 날짜 범위 선택
- 당첨자 검색 (이름)

**정렬 옵션:**
- 최신순
- 당첨 횟수순
- 후원 금액순

---

## 4. 데이터베이스 설계

### 4.1 인벤토리 뷰 생성

#### 4.1.1 사용자 인벤토리 뷰

**목적:** 사용자가 본인의 당첨 내역을 쉽게 조회할 수 있도록 조인된 뷰 제공

```sql
CREATE OR REPLACE VIEW user_roulette_inventory AS
SELECT 
    drr.id,
    drr.donation_id,
    drr.donor_id,
    drr.partner_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 파트너 정보
    p.partner_name,
    p.member_id AS partner_member_id,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보 (연결)
    sd.amount AS donation_amount,
    sd.message AS donation_message
FROM donation_roulette_results drr
JOIN partners p ON p.id = drr.partner_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
WHERE drr.is_processed = true
ORDER BY drr.created_at DESC;
```

**RLS 정책:**
```sql
-- 사용자는 본인의 데이터만 조회 가능
CREATE POLICY "user_roulette_inventory_select" ON user_roulette_inventory
FOR SELECT USING (auth.uid() = donor_id);
```

#### 4.1.2 파트너 인벤토리 뷰

**목적:** 파트너가 본인의 룰렛으로 당첨된 사용자 목록을 조회할 수 있도록 조인된 뷰 제공

```sql
CREATE OR REPLACE VIEW partner_roulette_inventory AS
SELECT 
    drr.id,
    drr.donation_id,
    drr.partner_id,
    drr.donor_id,
    drr.room_id,
    drr.roulette_item_id,
    -- 아이템 정보 (스냅샷)
    drr.item_name,
    drr.item_color,
    drr.item_reward_type,
    drr.item_reward_value,
    -- 당첨 정보
    drr.created_at AS won_at,
    drr.is_processed,
    -- 당첨자 정보
    m.id AS donor_member_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    m.member_code AS donor_member_code,
    -- 방송 정보
    sr.title AS room_title,
    sr.started_at AS room_started_at,
    sr.ended_at AS room_ended_at,
    -- 후원 정보 (연결)
    sd.amount AS donation_amount,
    sd.message AS donation_message
FROM donation_roulette_results drr
JOIN members m ON m.id = drr.donor_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
WHERE drr.is_processed = true
ORDER BY drr.created_at DESC;
```

**RLS 정책:**
```sql
-- 파트너는 본인의 파트너 데이터만 조회 가능
CREATE POLICY "partner_roulette_inventory_select" ON partner_roulette_inventory
FOR SELECT USING (
    auth.uid() IN (
        SELECT member_id FROM partners WHERE id = partner_id
    )
);
```

### 4.2 통계 뷰 생성 (선택사항)

#### 4.2.1 아이템별 통계 뷰

```sql
CREATE OR REPLACE VIEW partner_roulette_item_stats AS
SELECT 
    partner_id,
    item_name,
    item_reward_type,
    COUNT(*) AS win_count,
    COUNT(DISTINCT donor_id) AS unique_winners,
    MIN(created_at) AS first_win_at,
    MAX(created_at) AS last_win_at
FROM donation_roulette_results
WHERE is_processed = true
GROUP BY partner_id, item_name, item_reward_type
ORDER BY win_count DESC;
```

#### 4.2.2 날짜별 통계 뷰

```sql
CREATE OR REPLACE VIEW partner_roulette_date_stats AS
SELECT 
    partner_id,
    DATE(created_at) AS win_date,
    COUNT(*) AS win_count,
    COUNT(DISTINCT donor_id) AS unique_winners
FROM donation_roulette_results
WHERE is_processed = true
GROUP BY partner_id, DATE(created_at)
ORDER BY win_date DESC;
```

### 4.3 인덱스 최적화

**기존 인덱스:**
```sql
-- 이미 존재하는 인덱스
CREATE INDEX idx_donation_roulette_results_room 
    ON donation_roulette_results(room_id, created_at DESC);
```

**추가 인덱스:**
```sql
-- 사용자 인벤토리 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_donor 
    ON donation_roulette_results(donor_id, created_at DESC)
    WHERE is_processed = true;

-- 파트너 인벤토리 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_partner 
    ON donation_roulette_results(partner_id, created_at DESC)
    WHERE is_processed = true;

-- 통계 조회 최적화
CREATE INDEX IF NOT EXISTS idx_donation_roulette_results_stats 
    ON donation_roulette_results(partner_id, item_name, created_at)
    WHERE is_processed = true;
```

### 4.4 사용형 아이템 테이블 생성

**목적:** 사용자가 당첨한 사용형 아이템(전화권, 채팅권 등)을 보관하고 사용 이력을 추적

**테이블: `user_roulette_rewards`**
```sql
CREATE TABLE IF NOT EXISTS user_roulette_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    roulette_result_id UUID NOT NULL REFERENCES donation_roulette_results(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    -- 보상 정보
    reward_type TEXT NOT NULL CHECK (reward_type IN ('usable', 'digital')),
    reward_name TEXT NOT NULL,  -- "전화 10분권", "1:1 통화권", "특별 사진" 등
    reward_value TEXT,  -- 원본 값 (예: "10", "20", 또는 파일 URL)
    -- 사용형 아이템 정보 (usable 타입일 때만)
    usable_type TEXT NOT NULL,  -- 'call_minutes', 'chat_count', 'video_minutes', 'message_count' 등
    initial_amount NUMERIC(10, 2) NOT NULL,  -- 초기 수량/시간 (1회성 쿠폰은 1)
    remaining_amount NUMERIC(10, 2) NOT NULL,  -- 잔여 수량/시간 (사용하면 감소)
    -- 디지털 보상 정보 (digital 타입일 때만)
    digital_file_url TEXT,  -- 파일 URL (Storage 경로 또는 공개 URL)
    digital_file_name TEXT,  -- 원본 파일명
    digital_file_size BIGINT,  -- 파일 크기 (bytes)
    digital_file_type TEXT,  -- 파일 타입 (MIME type, 예: 'image/jpeg', 'video/mp4')
    digital_file_path TEXT,  -- Storage 내부 경로
    -- 상태 관리
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'used', 'expired', 'rejected')),
    expires_at TIMESTAMPTZ,  -- 만료일 (NULL이면 무제한)
    -- 파트너 승인 관련
    usage_requested_at TIMESTAMPTZ,  -- 사용 요청 시점
    usage_approved_at TIMESTAMPTZ,  -- 파트너 승인 시점
    usage_rejected_at TIMESTAMPTZ,  -- 파트너 거절 시점
    usage_rejection_reason TEXT,  -- 거절 사유
    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    used_at TIMESTAMPTZ  -- 완전히 사용된 시점 (remaining_amount = 0)
);
```

**인덱스:**
```sql
CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_user 
    ON user_roulette_rewards(user_id, status, created_at DESC);
    
CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_partner 
    ON user_roulette_rewards(partner_id, status);
    
CREATE INDEX IF NOT EXISTS idx_user_roulette_rewards_active 
    ON user_roulette_rewards(user_id, status, expires_at)
    WHERE status = 'active';
```

**RLS 정책:**
```sql
ALTER TABLE user_roulette_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roulette_rewards_select" ON user_roulette_rewards
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_roulette_rewards_insert" ON user_roulette_rewards
FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**사용 이력 테이블: `roulette_reward_usage_logs`**
```sql
CREATE TABLE IF NOT EXISTS roulette_reward_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id UUID NOT NULL REFERENCES user_roulette_rewards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    -- 사용 정보
    usage_type TEXT NOT NULL,  -- 'call', 'chat', 'video', 'message' 등
    amount_used NUMERIC(10, 2) NOT NULL,  -- 사용한 수량/시간
    remaining_amount NUMERIC(10, 2) NOT NULL,  -- 사용 후 잔여 수량/시간
    -- 파트너 승인 정보
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES members(id),  -- 승인한 파트너의 member_id
    approved_at TIMESTAMPTZ,  -- 승인 시점
    rejection_reason TEXT,  -- 거절 사유
    -- 컨텍스트
    room_id UUID REFERENCES stream_rooms(id),
    context JSONB,  -- 추가 컨텍스트 정보
    -- 메타데이터
    requested_at TIMESTAMPTZ DEFAULT now(),  -- 요청 시점
    used_at TIMESTAMPTZ  -- 실제 사용 시점 (승인 후)
);
```

**인덱스:**
```sql
CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_reward 
    ON roulette_reward_usage_logs(reward_id, used_at DESC);
    
CREATE INDEX IF NOT EXISTS idx_roulette_reward_usage_logs_user 
    ON roulette_reward_usage_logs(user_id, used_at DESC);
```

### 4.5 사용형 아이템 뷰 생성

**사용자 보유 아이템 뷰:**
```sql
CREATE OR REPLACE VIEW user_roulette_rewards_inventory AS
SELECT 
    urr.id,
    urr.user_id,
    urr.roulette_result_id,
    urr.partner_id,
    urr.reward_type,
    urr.reward_name,
    urr.reward_value,
    urr.usable_type,
    urr.initial_amount,
    urr.remaining_amount,
    urr.status,
    urr.expires_at,
    urr.created_at AS won_at,
    urr.used_at,
    -- 파트너 정보
    p.partner_name,
    -- 룰렛 결과 정보
    drr.item_name,
    drr.item_color,
    drr.room_id,
    sr.title AS room_title,
    -- 만료 여부 계산
    CASE 
        WHEN urr.expires_at IS NOT NULL AND urr.expires_at < NOW() THEN true
        ELSE false
    END AS is_expired,
    -- 사용 가능 여부
    CASE 
        WHEN urr.status = 'used' THEN false
        WHEN urr.status = 'expired' THEN false
        WHEN urr.status = 'rejected' THEN false
        WHEN urr.expires_at IS NOT NULL AND urr.expires_at < NOW() THEN false
        WHEN urr.reward_type = 'usable' AND urr.remaining_amount <= 0 THEN false
        WHEN urr.reward_type = 'digital' THEN true  -- 디지털 보상은 항상 다운로드 가능
        ELSE true
    END AS is_usable,
    -- 파트너 승인 관련
    urr.usage_requested_at,
    urr.usage_approved_at,
    urr.usage_rejected_at,
    urr.usage_rejection_reason,
    -- 디지털 보상 정보
    urr.digital_file_url,
    urr.digital_file_name,
    urr.digital_file_size,
    urr.digital_file_type,
    urr.digital_file_path
FROM user_roulette_rewards urr
JOIN partners p ON p.id = urr.partner_id
JOIN donation_roulette_results drr ON drr.id = urr.roulette_result_id
LEFT JOIN stream_rooms sr ON sr.id = drr.room_id
ORDER BY urr.created_at DESC;
```

### 4.6 룰렛판 정보 조회 (스키마 확인 필요)

**문제:** `donation_roulette_results`에 `wheel_id`가 없을 수 있음

**해결 방안 1: JOIN으로 조회**
```sql
-- roulette_item_id를 통해 wheel_id 조회
SELECT 
    drr.*,
    pri.wheel_id,
    prw.name AS wheel_name,
    prw.price AS wheel_price
FROM donation_roulette_results drr
LEFT JOIN partner_roulette_items pri ON pri.id = drr.roulette_item_id
LEFT JOIN partner_roulette_wheels prw ON prw.id = pri.wheel_id
```

**해결 방안 2: all_items JSONB에서 추출**
```sql
-- all_items JSONB에서 룰렛판 정보 추출 (구현 복잡)
SELECT 
    drr.*,
    (drr.all_items->0->>'wheel_name')::TEXT AS wheel_name,
    (drr.all_items->0->>'wheel_price')::INTEGER AS wheel_price
FROM donation_roulette_results drr
```

**권장:** 먼저 실제 스키마 확인 후 결정

---

## 5. 백엔드 API 설계

### 5.1 API 구조

**기본 원칙:**
- Supabase RPC 함수 또는 Edge Function 사용
- RLS 정책으로 권한 제어
- 페이지네이션 지원 (필요시)

### 5.2 사용자 인벤토리 API

#### 5.2.1 당첨 내역 조회 API

**방법 1: Supabase 클라이언트 직접 사용 (권장)**
```typescript
// 프론트엔드에서 직접 조회
const { data, error } = await supabase
  .from('user_roulette_inventory')
  .select('*')
  .eq('donor_id', userId)
  .order('won_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

**방법 2: Edge Function (필요시)**
```
GET /api-inventory/user/roulette?page=1&limit=20&partner_id=xxx&sort=latest
```

**응답 형식:**
```typescript
interface UserRouletteInventoryItem {
  id: string;
  donation_id: number;
  partner_id: string;
  room_id: string;
  item_name: string;
  item_color: string | null;
  item_reward_type: string;
  item_reward_value: string | null;
  won_at: string;
  partner_name: string;
  room_title: string | null;
  room_started_at: string | null;
  donation_amount: number;
  donation_message: string | null;
}
```

#### 5.2.2 필터링 및 정렬

**파트너 필터:**
```typescript
.eq('partner_id', partnerId)  // 특정 파트너만
```

**정렬:**
```typescript
.order('won_at', { ascending: false })  // 최신순
.order('won_at', { ascending: true })   // 과거순
```

#### 5.2.3 사용형 아이템 조회 API

**보유 아이템 조회:**
```typescript
const { data, error } = await supabase
  .from('user_roulette_rewards_inventory')
  .select('*')
  .eq('user_id', userId)
  .eq('status', 'active')
  .order('won_at', { ascending: false });
```

**사용 이력 조회:**
```typescript
const { data, error } = await supabase
  .from('roulette_reward_usage_logs')
  .select('*')
  .eq('user_id', userId)
  .order('used_at', { ascending: false });
```

#### 5.2.4 사용형 아이템/쿠폰 사용 요청 API

**사용 요청 (사용자):**
```typescript
const { data, error } = await supabase.rpc('request_roulette_reward_usage', {
  p_reward_id: rewardId,
  p_usage_type: 'call',  // 'call', 'chat', 'video', 'message'
  p_amount: 5,  // 사용할 수량/시간 (1회성 쿠폰은 1)
  p_room_id: roomId,
  p_context: { /* 추가 컨텍스트 */ }
});
```

**파트너 승인 API:**
```typescript
const { data, error } = await supabase.rpc('approve_roulette_reward_usage', {
  p_usage_log_id: usageLogId,
  p_partner_id: partnerId
});
```

**파트너 거절 API:**
```typescript
const { data, error } = await supabase.rpc('reject_roulette_reward_usage', {
  p_usage_log_id: usageLogId,
  p_partner_id: partnerId,
  p_reason: '거절 사유'
});
```

#### 5.2.6 디지털 보상 다운로드 API

**파일 다운로드:**
```typescript
// Storage에서 직접 다운로드 URL 생성
const { data } = supabase.storage
  .from('roulette-rewards')
  .createSignedUrl(digital_file_path, 3600);  // 1시간 유효

// 또는 공개 URL 사용 (공개 버킷인 경우)
const publicUrl = supabase.storage
  .from('roulette-rewards')
  .getPublicUrl(digital_file_path);
```

**다운로드 이력 기록 (선택사항):**
```typescript
const { data, error } = await supabase
  .from('roulette_reward_download_logs')
  .insert({
    reward_id: rewardId,
    user_id: userId,
    downloaded_at: new Date().toISOString()
  });
```

**RPC 함수: `use_roulette_reward`**
```sql
CREATE OR REPLACE FUNCTION use_roulette_reward(
  p_reward_id UUID,
  p_usage_type TEXT,
  p_amount NUMERIC(10, 2),
  p_room_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_reward user_roulette_rewards%ROWTYPE;
  v_remaining NUMERIC(10, 2);
BEGIN
  -- 보상 조회 및 검증
  SELECT * INTO v_reward
  FROM user_roulette_rewards
  WHERE id = p_reward_id
    AND user_id = auth.uid()
    AND status = 'active'
    AND remaining_amount >= p_amount;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_NOT_FOUND_OR_INSUFFICIENT'
    );
  END IF;
  
  -- 만료 확인
  IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < NOW() THEN
    UPDATE user_roulette_rewards
    SET status = 'expired'
    WHERE id = p_reward_id;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REWARD_EXPIRED'
    );
  END IF;
  
  -- 잔여 수량 계산
  v_remaining := v_reward.remaining_amount - p_amount;
  
  -- 보상 업데이트
  UPDATE user_roulette_rewards
  SET 
    remaining_amount = v_remaining,
    status = CASE 
      WHEN v_remaining <= 0 THEN 'used'
      ELSE 'active'
    END,
    used_at = CASE 
      WHEN v_remaining <= 0 THEN NOW()
      ELSE used_at
    END,
    updated_at = NOW()
  WHERE id = p_reward_id;
  
  -- 사용 이력 기록
  INSERT INTO roulette_reward_usage_logs (
    reward_id,
    user_id,
    partner_id,
    usage_type,
    amount_used,
    remaining_amount,
    room_id,
    context
  ) VALUES (
    p_reward_id,
    v_reward.user_id,
    v_reward.partner_id,
    p_usage_type,
    p_amount,
    v_remaining,
    p_room_id,
    p_context
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_amount', v_remaining,
    'status', CASE WHEN v_remaining <= 0 THEN 'used' ELSE 'active' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5.3 파트너 인벤토리 API

#### 5.3.1 당첨자 목록 조회

**Supabase 클라이언트 직접 사용:**
```typescript
const { data, error } = await supabase
  .from('partner_roulette_inventory')
  .select('*')
  .eq('partner_id', partnerId)
  .order('won_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

#### 5.3.2 통계 API

**아이템별 통계:**
```typescript
// RPC 함수 또는 직접 집계
const { data, error } = await supabase
  .from('partner_roulette_item_stats')
  .select('*')
  .eq('partner_id', partnerId)
  .order('win_count', { ascending: false })
  .limit(10);
```

**날짜별 통계:**
```typescript
const { data, error } = await supabase
  .from('partner_roulette_date_stats')
  .select('*')
  .eq('partner_id', partnerId)
  .gte('win_date', startDate)
  .lte('win_date', endDate)
  .order('win_date', { ascending: false });
```

**사용 요청 목록 조회 (파트너):**
```typescript
const { data, error } = await supabase
  .from('roulette_reward_usage_logs')
  .select('*')
  .eq('partner_id', partnerId)
  .eq('status', 'pending')  // 승인 대기 중
  .order('requested_at', { ascending: false });
```

**당첨자 통계 (RPC 함수 필요):**
```sql
CREATE OR REPLACE FUNCTION get_partner_roulette_donor_stats(
  p_partner_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  donor_id UUID,
  donor_name TEXT,
  donor_profile_image TEXT,
  total_wins BIGINT,
  total_donation_amount BIGINT,
  last_win_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    drr.donor_id,
    m.name AS donor_name,
    m.profile_image AS donor_profile_image,
    COUNT(*) AS total_wins,
    COALESCE(SUM(sd.amount), 0) AS total_donation_amount,
    MAX(drr.created_at) AS last_win_at
  FROM donation_roulette_results drr
  JOIN members m ON m.id = drr.donor_id
  LEFT JOIN stream_donations sd ON sd.id = drr.donation_id
  WHERE drr.partner_id = p_partner_id
    AND drr.is_processed = true
  GROUP BY drr.donor_id, m.name, m.profile_image
  ORDER BY total_wins DESC, total_donation_amount DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5.4 API 엔드포인트 설계 (Edge Function 사용 시)

**파일 구조:**
```
supabase/functions/
├── api-inventory/
│   └── index.ts
```

**엔드포인트:**
- `GET /api-inventory/user/roulette` - 사용자 인벤토리 조회
- `GET /api-inventory/partner/roulette` - 파트너 인벤토리 조회
- `GET /api-inventory/partner/stats/items` - 아이템별 통계
- `GET /api-inventory/partner/stats/dates` - 날짜별 통계
- `GET /api-inventory/partner/stats/donors` - 당첨자 통계

**참고:** Supabase 클라이언트 직접 사용이 더 간단하므로 Edge Function은 선택사항

---

## 6. 프론트엔드 설계

### 6.1 컴포넌트 구조

```
src/components/features/inventory/
├── roulette/
│   ├── types.ts                          # 타입 정의
│   ├── UserRouletteInventory.tsx         # 사용자 인벤토리 페이지
│   ├── PartnerRouletteInventory.tsx     # 파트너 인벤토리 페이지
│   ├── RouletteInventoryCard.tsx        # 당첨 내역 카드
│   ├── RouletteInventoryFilter.tsx      # 필터 컴포넌트
│   ├── RouletteInventoryStats.tsx       # 통계 컴포넌트 (파트너용)
│   ├── RouletteInventoryEmpty.tsx       # 빈 상태 컴포넌트
│   ├── RouletteRewardUsageRequestList.tsx # 사용 요청 목록 (파트너용)
│   └── RouletteRewardUsageRequestCard.tsx # 사용 요청 카드 (파트너용)
```

### 6.2 훅 구조

```
src/hooks/
├── useUserRouletteInventory.ts          # 사용자 인벤토리 훅
├── usePartnerRouletteInventory.ts      # 파트너 인벤토리 훅
├── useUserRouletteRewards.ts           # 사용자 보상 훅
└── usePartnerRewardUsageRequests.ts    # 파트너 사용 요청 관리 훅
```

### 6.3 타입 정의

**파일: `src/components/features/inventory/roulette/types.ts`**

```typescript
// 보상 타입
export type RouletteRewardType = 'text' | 'points' | 'usable' | 'digital' | 'custom';

// 사용형 아이템 타입 (쿠폰 포함)
export type UsableRewardType = 'call_minutes' | 'chat_count' | 'video_minutes' | 'message_count';

// 사용 요청 상태
export type RewardUsageStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'expired';

// 사용자 인벤토리 아이템 (당첨 내역)
export interface UserRouletteInventoryItem {
  id: string;
  donation_id: number;
  partner_id: string;
  room_id: string;
  roulette_item_id: string | null;
  item_name: string;
  item_color: string | null;
  item_reward_type: RouletteRewardType;
  item_reward_value: string | null;
  won_at: string;
  partner_name: string;
  room_title: string | null;
  room_started_at: string | null;
  donation_amount: number;
  donation_message: string | null;
}

// 사용형 아이템/쿠폰/디지털 보상 (보유 중인 사용 가능한 아이템)
export interface UserRouletteReward {
  id: string;
  user_id: string;
  roulette_result_id: string;
  partner_id: string;
  reward_type: 'usable' | 'digital';
  reward_name: string;
  reward_value: string | null;
  // 사용형 아이템 정보 (usable 타입일 때만)
  usable_type: UsableRewardType;
  initial_amount: number;  // 1회성 쿠폰은 1, 사용형 아이템은 > 1
  remaining_amount: number;  // 잔여 수량/시간
  // 디지털 보상 정보 (digital 타입일 때만)
  digital_file_url: string | null;
  digital_file_name: string | null;
  digital_file_size: number | null;
  digital_file_type: string | null;
  digital_file_path: string | null;
  // 상태 관리
  status: RewardUsageStatus;
  expires_at: string | null;
  // 파트너 승인 관련
  usage_requested_at: string | null;
  usage_approved_at: string | null;
  usage_rejected_at: string | null;
  usage_rejection_reason: string | null;
  won_at: string;
  used_at: string | null;
  partner_name: string;
  item_name: string;
  item_color: string | null;
  room_id: string | null;
  room_title: string | null;
  is_expired: boolean;
  is_usable: boolean;
}

// 사용 이력
export interface RouletteRewardUsageLog {
  id: string;
  reward_id: string;
  user_id: string;
  partner_id: string;
  usage_type: string;
  amount_used: number;
  remaining_amount: number;
  // 파트너 승인 정보
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  room_id: string | null;
  context: Record<string, any> | null;
  requested_at: string;
  used_at: string | null;  // 승인 후 실제 사용 시점
}

// 파트너 인벤토리 아이템
export interface PartnerRouletteInventoryItem {
  id: string;
  donation_id: number;
  partner_id: string;
  donor_id: string;
  room_id: string;
  roulette_item_id: string | null;
  item_name: string;
  item_color: string | null;
  item_reward_type: string;
  item_reward_value: string | null;
  won_at: string;
  donor_name: string;
  donor_profile_image: string | null;
  donor_member_code: string | null;
  room_title: string | null;
  room_started_at: string | null;
  donation_amount: number;
  donation_message: string | null;
}

// 통계 아이템
export interface RouletteItemStat {
  partner_id: string;
  item_name: string;
  item_reward_type: string;
  win_count: number;
  unique_winners: number;
  first_win_at: string;
  last_win_at: string;
}

export interface RouletteDateStat {
  partner_id: string;
  win_date: string;
  win_count: number;
  unique_winners: number;
}

export interface RouletteDonorStat {
  donor_id: string;
  donor_name: string;
  donor_profile_image: string | null;
  total_wins: number;
  total_donation_amount: number;
  last_win_at: string;
}

// 필터 옵션
export interface RouletteInventoryFilter {
  partner_id?: string;
  sort: 'latest' | 'oldest';
  date_from?: string;
  date_to?: string;
}
```

### 6.4 사용자 인벤토리 페이지

**파일: `src/components/features/inventory/roulette/UserRouletteInventory.tsx`**

**기능:**
- 인벤토리 목록 표시
- 필터 및 정렬 UI
- 무한 스크롤 또는 페이지네이션
- 빈 상태 처리

**레이아웃:**
```
┌─────────────────────────────────────┐
│  ← 뒤로가기    룰렛 당첨 내역          │
├─────────────────────────────────────┤
│ [당첨 내역] [보유 아이템] [사용 이력] │
├─────────────────────────────────────┤
│ 필터: [전체 파트너 ▼] [최신순 ▼]    │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🎰 아이템 이름                   │ │
│ │ 파트너: 김파트너                  │ │
│ │ 보상: +500P                      │ │
│ │ 당첨일: 2025-12-25 15:30        │ │
│ │ 방송: "오늘의 라이브"            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📞 전화 10분권 (사용형)          │ │
│ │ 파트너: 이파트너                  │ │
│ │ 잔여: 7분 / 10분                 │ │
│ │ 만료일: 2026-01-25               │ │
│ │ [사용하기] 버튼                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🎫 1:1 통화권 (1회성)            │ │
│ │ 파트너: 박파트너                  │ │
│ │ 상태: 사용 가능                  │ │
│ │ 만료일: 2026-02-25               │ │
│ │ [사용 요청] 버튼                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📞 전화 10분권 (승인 대기)        │ │
│ │ 파트너: 이파트너                  │ │
│ │ 잔여: 10분 / 10분                │ │
│ │ 상태: 파트너 승인 대기 중...      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📷 특별 사진 (디지털)            │ │
│ │ 파트너: 최파트너                  │ │
│ │ [이미지 미리보기]                │ │
│ │ [다운로드] 버튼                  │ │
│ └─────────────────────────────────┘ │
│ ...                                 │
└─────────────────────────────────────┘
```

### 6.5 파트너 인벤토리 페이지

**파일: `src/components/features/inventory/roulette/PartnerRouletteInventory.tsx`**

**기능:**
- 당첨자 목록 표시
- 통계 섹션 (아이템별, 날짜별, 당첨자별)
- 필터 및 검색 UI

**레이아웃:**
```
┌─────────────────────────────────────┐
│      룰렛 당첨자 관리                │
├─────────────────────────────────────┤
│ [통계 탭] [목록 탭]                  │
├─────────────────────────────────────┤
│ 통계:                                │
│ - 총 당첨: 127건                    │
│ - 인기 아이템: +500P (45건)         │
│ - 최근 7일: 23건                    │
├─────────────────────────────────────┤
│ 필터: [전체 아이템 ▼] [최신순 ▼]    │
├─────────────────────────────────────┤
│ 당첨자 목록...                       │
└─────────────────────────────────────┘
```

### 6.6 라우팅

**사용자 인벤토리:**
- 경로: `/mypage/inventory/roulette`
- 또는: `/inventory/roulette` (독립 페이지)

**파트너 인벤토리:**
- 경로: `/dashboard/partner/inventory/roulette`
- 또는: 파트너 대시보드 내 탭으로 통합

**라우트 파일:**
```
src/routes/
├── mypage/
│   └── inventory/
│       └── roulette.tsx              # 사용자 인벤토리
└── dashboard/
    └── partner/
        └── inventory/
            └── roulette.tsx         # 파트너 인벤토리
```

### 6.7 훅 구현

#### 6.7.1 useUserRouletteInventory

```typescript
export function useUserRouletteInventory(
  userId: string,
  filters?: RouletteInventoryFilter
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-roulette-inventory', userId, filters],
    queryFn: async () => {
      let query = supabase
        .from('user_roulette_inventory')
        .select('*')
        .eq('donor_id', userId)
        .order('won_at', { ascending: false });

      // 필터 적용
      if (filters?.partner_id) {
        query = query.eq('partner_id', filters.partner_id);
      }

      if (filters?.sort === 'oldest') {
        query = query.order('won_at', { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as UserRouletteInventoryItem[];
    },
    enabled: !!userId,
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
```

#### 6.7.4 useUserRouletteRewards

```typescript
export function useUserRouletteRewards(userId: string) {
  const query = useQuery({
    queryKey: ['user-roulette-rewards', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roulette_rewards_inventory')
        .select('*')
        .eq('user_id', userId)
        .order('won_at', { ascending: false });

      if (error) throw error;
      return data as UserRouletteReward[];
    },
    enabled: !!userId,
  });

  const requestUsageMutation = useMutation({
    mutationFn: async ({
      rewardId,
      usageType,
      amount,
      roomId,
      context,
    }: {
      rewardId: string;
      usageType: string;
      amount: number;
      roomId?: string;
      context?: Record<string, any>;
    }) => {
      const { data, error } = await supabase.rpc('request_roulette_reward_usage', {
        p_reward_id: rewardId,
        p_usage_type: usageType,
        p_amount: amount,
        p_room_id: roomId || null,
        p_context: context || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-roulette-rewards', userId]);
    },
  });

  return {
    rewards: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    requestUsage: requestUsageMutation.mutate,
    isRequesting: requestUsageMutation.isLoading,
  };
}
```

#### 6.7.2 usePartnerRewardUsageRequests

```typescript
export function usePartnerRewardUsageRequests(partnerId: string) {
  const query = useQuery({
    queryKey: ['partner-reward-usage-requests', partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roulette_reward_usage_logs')
        .select('*')
        .eq('partner_id', partnerId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      return data as RouletteRewardUsageLog[];
    },
    enabled: !!partnerId,
  });

  const approveMutation = useMutation({
    mutationFn: async (usageLogId: string) => {
      const { data, error } = await supabase.rpc('approve_roulette_reward_usage', {
        p_usage_log_id: usageLogId,
        p_partner_id: partnerId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-reward-usage-requests', partnerId]);
      queryClient.invalidateQueries(['user-roulette-rewards']);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ usageLogId, reason }: { usageLogId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('reject_roulette_reward_usage', {
        p_usage_log_id: usageLogId,
        p_partner_id: partnerId,
        p_reason: reason || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['partner-reward-usage-requests', partnerId]);
      queryClient.invalidateQueries(['user-roulette-rewards']);
    },
  });

  return {
    requests: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    approve: approveMutation.mutate,
    reject: rejectMutation.mutate,
    isApproving: approveMutation.isLoading,
    isRejecting: rejectMutation.isLoading,
  };
}
```

#### 6.7.3 usePartnerRouletteInventory

```typescript
export function usePartnerRouletteInventory(
  partnerId: string,
  filters?: RouletteInventoryFilter
) {
  const query = useQuery({
    queryKey: ['partner-roulette-inventory', partnerId, filters],
    queryFn: async () => {
      let query = supabase
        .from('partner_roulette_inventory')
        .select('*')
        .eq('partner_id', partnerId)
        .order('won_at', { ascending: false });

      // 필터 적용
      if (filters?.sort === 'oldest') {
        query = query.order('won_at', { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PartnerRouletteInventoryItem[];
    },
    enabled: !!partnerId,
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
```

---

## 7. 구현 작업 상세

### 7.1 데이터베이스 작업 (3시간)

#### 7.1.1 테이블 생성

**작업:**
1. `user_roulette_rewards` 테이블 생성 (사용형 아이템 보관)
2. `roulette_reward_usage_logs` 테이블 생성 (사용 이력)

#### 7.1.2 뷰 생성

**작업:**
1. `user_roulette_inventory` 뷰 생성
2. `partner_roulette_inventory` 뷰 생성
3. `user_roulette_rewards_inventory` 뷰 생성 (사용형 아이템)
4. `partner_roulette_item_stats` 뷰 생성 (선택사항)
5. `partner_roulette_date_stats` 뷰 생성 (선택사항)

**마이그레이션 파일:**
- `documents/migration_roulette_inventory_views.sql` (기존)
- `documents/migration_roulette_usable_rewards.sql` (신규)

#### 7.1.2 RLS 정책 설정

**작업:**
1. `user_roulette_inventory` RLS 정책 생성
2. `partner_roulette_inventory` RLS 정책 생성

#### 7.1.3 인덱스 추가

**작업:**
1. `idx_donation_roulette_results_donor` 인덱스 생성
2. `idx_donation_roulette_results_partner` 인덱스 생성
3. `idx_donation_roulette_results_stats` 인덱스 생성

#### 7.1.4 RPC 함수 생성

**작업:**
1. `get_partner_roulette_donor_stats` 함수 생성 (선택사항)
2. `use_roulette_reward` 함수 생성 (필수 - 사용형 아이템 사용)
3. `create_roulette_reward` 함수 생성 (필수 - 당첨 시 사용형 아이템 생성)

### 7.2 백엔드 작업 (3시간)

#### 7.2.1 Edge Function 생성 (선택사항)

**작업:**
1. `api-inventory` Edge Function 생성
2. 사용자 인벤토리 엔드포인트 구현
3. 파트너 인벤토리 엔드포인트 구현
4. 통계 엔드포인트 구현

**참고:** Supabase 클라이언트 직접 사용 시 이 작업 생략 가능

### 7.3 프론트엔드 작업 (7시간)

#### 7.3.1 타입 정의 (0.5시간)

**작업:**
1. `types.ts` 파일 생성
2. 모든 타입 정의 작성

#### 7.3.2 훅 구현 (1시간)

**작업:**
1. `useUserRouletteInventory.ts` 구현
2. `usePartnerRouletteInventory.ts` 구현
3. 통계 조회 훅 구현 (필요시)

#### 7.3.3 컴포넌트 구현 (4시간)

**작업:**
1. `RouletteInventoryCard.tsx` 구현
2. `RouletteInventoryFilter.tsx` 구현
3. `UserRouletteInventory.tsx` 구현
4. `PartnerRouletteInventory.tsx` 구현
5. `RouletteInventoryStats.tsx` 구현
6. `RouletteInventoryEmpty.tsx` 구현
7. `RouletteRewardCard.tsx` 구현 (사용형 아이템/쿠폰/디지털 보상 카드)
8. `RouletteRewardUsageRequestDialog.tsx` 구현 (사용 요청 다이얼로그)
9. `RouletteDigitalRewardViewer.tsx` 구현 (디지털 보상 미리보기/다운로드)
10. `RouletteRewardUsageRequestList.tsx` 구현 (파트너용 사용 요청 목록)
11. `RouletteRewardUsageRequestCard.tsx` 구현 (파트너용 사용 요청 카드)

#### 7.3.4 라우팅 설정 (0.5시간)

**작업:**
1. `/mypage/inventory/roulette` 라우트 추가
2. `/dashboard/partner/inventory/roulette` 라우트 추가
3. 메뉴 아이템 추가 (마이페이지, 파트너 대시보드)

#### 7.3.5 스타일링 및 UX 개선 (1시간)

**작업:**
1. 반응형 디자인 적용
2. 로딩 상태 처리
3. 에러 처리
4. 빈 상태 UI
5. 애니메이션 및 트랜지션

---

## 8. 테스트 계획

### 8.1 기능 테스트

#### 8.1.1 사용자 인벤토리

- [ ] 본인의 당첨 내역이 정상적으로 표시되는지
- [ ] 파트너 필터가 정상 작동하는지
- [ ] 정렬 기능이 정상 작동하는지
- [ ] 빈 상태가 올바르게 표시되는지
- [ ] 페이지네이션/무한 스크롤이 정상 작동하는지

#### 8.1.2 파트너 인벤토리

- [ ] 본인의 룰렛 당첨자 목록이 정상적으로 표시되는지
- [ ] 통계가 정확하게 계산되는지
- [ ] 필터 및 검색이 정상 작동하는지
- [ ] 당첨자 통계가 정확한지

### 8.2 권한 테스트

- [ ] 사용자가 다른 사용자의 인벤토리를 조회할 수 없는지
- [ ] 파트너가 다른 파트너의 인벤토리를 조회할 수 없는지
- [ ] RLS 정책이 올바르게 작동하는지

### 8.3 성능 테스트

- [ ] 대량 데이터 조회 시 성능 확인
- [ ] 인덱스가 올바르게 사용되는지
- [ ] 페이지 로딩 시간 확인

### 8.4 UI/UX 테스트

- [ ] 모바일 반응형 확인
- [ ] 로딩 상태 표시 확인
- [ ] 에러 메시지 표시 확인
- [ ] 빈 상태 UI 확인

---

## 9. 배포 가이드

### 9.1 배포 순서

1. **데이터베이스 마이그레이션** (1단계)
2. **백엔드 배포** (2단계 - Edge Function 사용 시)
3. **프론트엔드 배포** (3단계)

### 9.2 1단계: 데이터베이스 마이그레이션

**Supabase Dashboard에서 실행:**

1. Supabase Dashboard 접속
2. SQL Editor 열기
3. `migration_roulette_inventory_views.sql` 파일 실행
4. 실행 결과 확인

**또는 Supabase CLI 사용:**
```bash
supabase db execute -f documents/migration_roulette_inventory_views.sql
```

### 9.3 2단계: 백엔드 배포 (선택사항)

**Edge Function 배포:**
```bash
supabase functions deploy api-inventory
```

**참고:** Supabase 클라이언트 직접 사용 시 이 단계 생략

### 9.4 3단계: 프론트엔드 배포

**빌드 및 배포:**
```bash
pnpm build
# 배포 환경에 따라 배포 (Vercel, Netlify 등)
```

### 9.5 배포 후 검증

**1. 데이터베이스 검증:**
```sql
-- 뷰 확인
SELECT * FROM user_roulette_inventory LIMIT 5;
SELECT * FROM partner_roulette_inventory LIMIT 5;

-- RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'user_roulette_inventory';
```

**2. 기능 테스트:**
- [ ] 사용자 인벤토리 페이지 접속 확인
- [ ] 파트너 인벤토리 페이지 접속 확인
- [ ] 필터 및 정렬 기능 확인
- [ ] 통계 표시 확인

---

## 10. 추가 고려사항

### 10.1 룰렛판 정보 표시

**문제:** `donation_roulette_results`에 `wheel_id`, `wheel_name`, `wheel_price`가 없을 수 있음

**해결 방안:**
1. 실제 스키마 확인 후 결정
2. 필요시 마이그레이션으로 컬럼 추가
3. 또는 JOIN으로 조회

### 10.2 보상 타입별 표시

**보상 타입:**
- `text`: 텍스트만 (예: "응원 메시지")
- `points`: 포인트 (예: "+500P") - 즉시 지급
- `coupon`: 쿠폰 (예: "1:1 통화권") - 일회성 사용
- `usable`: **사용형 아이템** (예: "전화 10분권", "채팅 20회권") - 잔여 수량/시간 추적
- `custom`: 커스텀 보상

**UI 표시:**
- 타입별 아이콘 표시
- 값에 따른 포맷팅
- **사용형 아이템**: 잔여 수량/시간, 사용 가능 여부, 만료일 표시

### 10.3 룰렛 당첨 시 사용형 아이템 자동 생성

**처리 로직:**
1. 룰렛 당첨 시 `execute_donation_roulette` RPC 함수 실행
2. `item_reward_type = 'usable'`인 경우:
   - `create_roulette_reward` RPC 함수 호출
   - `user_roulette_rewards` 테이블에 레코드 생성
   - `item_reward_value`에서 수량/시간 파싱 (예: "10" → 10분)
   - `usable_type` 결정 (예: "전화 10분권" → `call_minutes`)
   - 만료일 설정 (선택사항)

**예시:**
```sql
-- execute_donation_roulette 함수 내부에서
IF v_winning_item.reward_type = 'usable' THEN
    -- 사용형 아이템 생성
    PERFORM create_roulette_reward(
        v_result_id,
        p_donor_id,
        p_partner_id,
        v_winning_item.name,
        v_winning_item.reward_value,
        -- usable_type 파싱 (reward_value 또는 별도 필드에서)
        CASE 
            WHEN v_winning_item.name LIKE '%전화%' THEN 'call_minutes'
            WHEN v_winning_item.name LIKE '%채팅%' THEN 'chat_count'
            WHEN v_winning_item.name LIKE '%영상%' THEN 'video_minutes'
            ELSE 'message_count'
        END,
        v_winning_item.reward_value::NUMERIC,
        -- 만료일 (예: 30일 후)
        NOW() + INTERVAL '30 days'
    );
ELSIF v_winning_item.reward_type = 'digital' THEN
    -- 디지털 보상 생성 (파일 정보는 별도로 전달 필요)
    -- 파일은 룰렛 설정 시 미리 업로드되어 있어야 함
    PERFORM create_roulette_digital_reward(
        v_result_id,
        p_donor_id,
        p_partner_id,
        v_winning_item.name,
        v_winning_item.reward_value,
        v_winning_item.digital_file_url,  -- 별도 필드 필요
        v_winning_item.digital_file_name,
        v_winning_item.digital_file_size,
        v_winning_item.digital_file_type,
        v_winning_item.digital_file_path
    );
END IF;
```

### 10.4 성능 최적화

**대량 데이터 처리:**
- 페이지네이션 필수
- 무한 스크롤 고려
- 인덱스 최적화
- 쿼리 최적화

### 10.5 Storage 버킷 설정

**디지털 보상 파일 저장:**
- 버킷 이름: `roulette-rewards` (또는 `roulette-digital-rewards`)
- 공개 버킷: `false` (다운로드 시 서명된 URL 사용)
- 파일 경로 구조: `{partner_id}/{roulette_item_id}/{timestamp}-{random}.{ext}`
- 허용 파일 타입: `image/*`, `video/*` (또는 제한 없음)
- 파일 크기 제한: 50MB (또는 설정에 따라)

**RLS 정책:**
- 업로드: 파트너만 가능 (본인의 룰렛 아이템)
- 읽기: 당첨자만 가능 (본인이 당첨한 보상)
- 삭제: 파트너만 가능 (본인의 룰렛 아이템)

### 10.6 확장 가능성

**향후 기능:**
- 당첨 내역 내보내기 (CSV)
- 당첨 내역 공유 기능
- 당첨 뱃지/업적 시스템
- 당첨 통계 대시보드
- 디지털 보상 미리보기 갤러리
- 디지털 보상 다운로드 이력 추적

---

## 11. 작업 체크리스트

### 데이터베이스
- [ ] `user_roulette_rewards` 테이블 생성
- [ ] `roulette_reward_usage_logs` 테이블 생성
- [ ] `user_roulette_inventory` 뷰 생성
- [ ] `partner_roulette_inventory` 뷰 생성
- [ ] `user_roulette_rewards_inventory` 뷰 생성
- [ ] `partner_roulette_item_stats` 뷰 생성 (선택사항)
- [ ] `partner_roulette_date_stats` 뷰 생성 (선택사항)
- [ ] RLS 정책 설정
- [ ] 인덱스 추가
- [ ] `use_roulette_reward` RPC 함수 생성
- [ ] `create_roulette_reward` RPC 함수 생성
- [ ] `create_roulette_digital_reward` RPC 함수 생성
- [ ] `request_roulette_reward_usage` RPC 함수 생성 (사용 요청)
- [ ] `approve_roulette_reward_usage` RPC 함수 생성 (파트너 승인)
- [ ] `reject_roulette_reward_usage` RPC 함수 생성 (파트너 거절)
- [ ] `get_partner_roulette_donor_stats` RPC 함수 생성 (선택사항)
- [ ] Storage 버킷 생성 (`roulette-rewards`)

### 백엔드
- [ ] Edge Function 생성 (선택사항)
- [ ] API 엔드포인트 구현 (선택사항)

### 프론트엔드
- [ ] 타입 정의 (사용형 아이템 포함)
- [ ] 훅 구현 (`useUserRouletteInventory`, `useUserRouletteRewards`)
- [ ] 컴포넌트 구현 (사용형 아이템 UI 포함)
- [ ] 라우팅 설정
- [ ] 스타일링 및 UX 개선
- [ ] 사용형 아이템/쿠폰 사용 요청 플로우 구현
- [ ] 파트너 승인/거절 UI 구현
- [ ] 파트너 사용 요청 목록 페이지 구현
- [ ] Realtime 알림 연동 (사용 요청 시 파트너에게 알림)
- [ ] 디지털 보상 미리보기 및 다운로드 구현

### 테스트
- [ ] 기능 테스트
- [ ] 권한 테스트
- [ ] 성능 테스트
- [ ] UI/UX 테스트

### 배포
- [ ] 데이터베이스 마이그레이션
- [ ] 백엔드 배포 (필요시)
- [ ] 프론트엔드 배포
- [ ] 배포 후 검증

---

**작성자**: AI Assistant  
**검토 필요**: 개발팀 리뷰 후 진행

