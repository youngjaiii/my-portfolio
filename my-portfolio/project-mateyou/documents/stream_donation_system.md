# 스트림 후원 시스템 설계 문서

## 1. 개요

보이스룸과 비디오룸에서 발언자(호스트)들에게 포인트를 보내는 후원 시스템입니다.
채팅 입력 옆의 후원 버튼을 누르면 바텀시트가 나타나며, 발언자를 선택하고 후원할 포인트를 입력하여 후원합니다.

**핵심 변경사항**:
- ~~gift_items 테이블 사용~~ → **포인트 직접 전송 방식**
- 최소 후원 금액: **1,000P 이상**

## 2. 포인트 시스템 분석 (최신)

### 2.1 포인트 분리 구조

| 구분 | 테이블/컬럼 | 용도 |
|------|------------|------|
| 사용자 보유 포인트 | `members.total_points` | 충전/사용 포인트 (소비자) |
| 파트너 수익 포인트 | `partners.total_points` | 번 포인트 (파트너 수익) |
| 사용자 로그 | `member_points_logs` | 충전(earn), 사용(spend), 출금(withdraw) 기록 |
| 파트너 로그 | `partner_points_logs` | 수익(earn), 출금(withdraw) 기록 |

**중요**: 후원자가 파트너여도 `members.total_points`에서 차감되고 `member_points_logs`에만 기록됩니다.

### 2.2 관련 테이블

#### members (사용자)
```sql
-- 사용자 보유 포인트
members.total_points INTEGER  -- 충전/사용 포인트
```

#### partners (파트너)
```sql
-- 파트너 수익 포인트
partners.total_points INTEGER  -- 번 포인트 (수익)
partners.member_id UUID        -- 연결된 members.id
```

#### member_points_logs (사용자 포인트 로그)
```sql
CREATE TABLE member_points_logs (
    id SERIAL PRIMARY KEY,
    member_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL,  -- 'earn' | 'spend' | 'withdraw'
    amount INTEGER NOT NULL,
    description TEXT,
    log_id TEXT,                -- 중복 방지용 (donation_id)
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### partner_points_logs (파트너 포인트 로그)
```sql
CREATE TABLE partner_points_logs (
    id SERIAL PRIMARY KEY,
    partner_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL,  -- 'earn' | 'spend' | 'withdraw'
    amount INTEGER NOT NULL,
    description TEXT,
    log_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 후원 API (api-members/donation)

**엔드포인트**: `POST /api-members/donation`

**요청 파라미터**:
```typescript
interface DonationRequest {
  partner_id: string    // partners.id (NOT members.id)
  amount: number        // 후원 포인트 (최소 1000)
  description?: string  // 설명 (예: "보이스룸 후원")
  log_id?: string       // 중복 방지 ID
}
```

**처리 로직** (RPC 함수 사용 - 원자적 트랜잭션):
```typescript
// Edge Function (supabase/functions/api-members/index.ts)
const donationLogId = log_id || `donation_${partner_id}_${user.id}_${Date.now()}`;

// RPC 함수 호출 (원자적 트랜잭션)
const { data: result, error: rpcError } = await supabase.rpc('process_donation', {
  p_donor_id: user.id,
  p_partner_id: partner_id,
  p_amount: donationAmount,
  p_description: description || '파트너 후원',
  p_log_id: donationLogId,
});

if (!result.success) {
  // 에러 처리 (INSUFFICIENT_POINTS, DUPLICATE_REQUEST, MIN_AMOUNT_REQUIRED 등)
  return errorResponse(result.error_code, result.error_message);
}
```

**PostgreSQL RPC 함수** (`process_donation`):
```sql
CREATE OR REPLACE FUNCTION process_donation(
  p_donor_id UUID,
  p_partner_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_log_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_member_points INTEGER;
  v_partner_points INTEGER;
BEGIN
  -- 1. 최소 금액 검증 (1000P 이상)
  IF p_amount < 1000 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'MIN_AMOUNT_REQUIRED');
  END IF;

  -- 2. 중복 요청 체크 (log_id UNIQUE 제약)
  IF EXISTS (SELECT 1 FROM member_points_logs WHERE log_id = p_log_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_REQUEST');
  END IF;

  -- 3. 후원자 정보 조회 + 락 (레이스 컨디션 방지)
  SELECT total_points INTO v_member_points
  FROM members WHERE id = p_donor_id FOR UPDATE;

  -- 4. 포인트 부족 체크
  IF v_member_points < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INSUFFICIENT_POINTS');
  END IF;

  -- 5. 파트너 정보 조회 + 락
  SELECT total_points INTO v_partner_points
  FROM partners WHERE id = p_partner_id FOR UPDATE;

  -- 6. 원자적 업데이트 (members, partners, logs)
  UPDATE members SET total_points = v_member_points - p_amount WHERE id = p_donor_id;
  UPDATE partners SET total_points = v_partner_points + p_amount WHERE id = p_partner_id;
  INSERT INTO member_points_logs (...) VALUES (...);
  INSERT INTO partner_points_logs (...) VALUES (...);

  RETURN jsonb_build_object('success', true, ...);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE_REQUEST');
  WHEN OTHERS THEN
    -- 자동 롤백
    RETURN jsonb_build_object('success', false, 'error_code', 'TRANSACTION_FAILED');
END;
$$ LANGUAGE plpgsql;
```

### 2.4 기존 후원 시스템 (1:1 채팅)

`GlobalDonationSheet` 컴포넌트에서 사용하는 방식:

```typescript
// 고정 금액 옵션
const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

// 후원 실행
const donationResponse = await mateYouApi.members.donation({
  partner_id: partnerPartnerId,  // partners.id
  amount: selectedAmount,
  description: `${partnerName} 후원`,
  log_id: `donation_${partnerId}_${Date.now()}`,
})

// 후원 완료 후 채팅 메시지 전송
const donationMessage = `[HEART_GIFT:${heartImage}:${heartCount}:${amount}]`
await sendMessage(currentUserId, partnerId, donationMessage)
```

## 3. 스트림 후원 시스템 설계

### 3.1 바텀시트 UI 구조

```
┌─────────────────────────────────────┐
│           ⬛ (드래그 핸들)            │
├─────────────────────────────────────┤
│              후원하기                │
├─────────────────────────────────────┤
│ 💰 보유 포인트: 15,000P    [충전하기] │
├─────────────────────────────────────┤
│ 후원할 발언자 선택                   │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 👤  │ │ 👤  │ │ 👤  │ │ 모두 │    │
│ │이름1│ │이름2│ │이름3│ │ ALL  │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────────────┤
│ 후원 금액 선택                       │
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │1000P│ │3000P│ │5000P│            │
│ └─────┘ └─────┘ └─────┘            │
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │10kP │ │30kP │ │50kP │            │
│ └─────┘ └─────┘ └─────┘            │
│                                     │
│ 또는 직접 입력: [________] P        │
│ (최소 1,000P 이상)                  │
├─────────────────────────────────────┤
│ 총 금액: 1,000P                     │
│ (모두에게: 1,000P × 3명 = 3,000P)   │
├─────────────────────────────────────┤
│           [ 후원하기 ]               │
└─────────────────────────────────────┘
```

### 3.2 컴포넌트 구조

```
src/components/features/stream/
└── StreamDonationSheet.tsx      # 메인 바텀시트 컴포넌트 (공통)
```

### 3.3 Props 인터페이스

```typescript
// StreamDonationSheet.tsx
interface StreamDonationSheetProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  hosts: StreamHost[]  // 발언자 목록 (파트너만 후원 가능)
  onDonationComplete?: (recipientId: string, amount: number) => void
}

// StreamHost 타입 (기존)
interface StreamHost {
  id: string
  room_id: string
  partner_id: string | null
  member_id: string | null
  role: 'host' | 'co_host' | 'speaker'
  partner?: {
    id: string               // partners.id (후원 시 사용)
    partner_name: string
    member: { 
      id: string             // members.id
      name: string 
      profile_image: string 
    }
  }
}
```

### 3.4 후원 금액 옵션

```typescript
// 기존 GlobalDonationSheet과 동일한 옵션 사용
const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

// 직접 입력 모드
const MIN_DONATION_AMOUNT = 1000  // 최소 1000P
```

### 3.5 데이터 흐름

```
1. 사용자가 후원 버튼 클릭
   ↓
2. StreamDonationSheet 열림
   ↓
3. 데이터 로드
   - 사용자 포인트 조회 (mateYouApi.members.getUserPoints())
   ↓
4. 사용자 선택
   - 후원할 발언자 선택 (파트너만 가능)
   - 후원 금액 선택 또는 직접 입력 (최소 1000P)
   ↓
5. 포인트 검증
   - 보유 포인트 >= 필요 포인트 확인
   - 직접 입력 시 최소 1000P 확인
   - 부족 시 충전 모달 표시
   ↓
6. 후원 실행
   - mateYouApi.members.donation() 호출
   - "모두에게" 선택 시 각 파트너에게 개별 API 호출
   ↓
7. 후원 완료
   - 성공 애니메이션 표시
   - 채팅에 후원 메시지 표시 (선택)
   - 쿼리 무효화 (포인트)
```

### 3.6 발언자 선택 로직

```typescript
// 파트너인 발언자만 필터링 (일반 멤버는 후원 불가)
const donationTargets = hosts.filter(host => host.partner_id !== null)

// "모두에게" 옵션 선택 시
// - 각 파트너에게 동일한 금액으로 개별 API 호출
// - 총 포인트 = 금액 × 발언자 수
const totalAmount = selectedAmount * donationTargets.length
```

### 3.7 후원 실행 코드 예시

```typescript
const handleDonate = async () => {
  if (!selectedAmount || selectedAmount < 1000) {
    toast.error('최소 1,000P 이상 후원해주세요.')
    return
  }

  // 파트너인 발언자 필터링
  const partnerHosts = selectedRecipients === 'all'
    ? hosts.filter(h => h.partner_id)
    : [hosts.find(h => h.partner_id === selectedRecipients)]

  const totalRequired = selectedAmount * partnerHosts.length
  
  if (currentPoints < totalRequired) {
    toast.error(`포인트가 부족합니다. (필요: ${totalRequired.toLocaleString()}P)`)
    return
  }

  // 각 파트너에게 후원
  for (const host of partnerHosts) {
    if (!host?.partner?.id) continue
    
    await mateYouApi.members.donation({
      partner_id: host.partner.id,
      amount: selectedAmount,
      description: `${host.partner.partner_name} 보이스룸 후원`,
      log_id: `stream_donation_${roomId}_${host.partner.id}_${Date.now()}`,
    })
  }

  // 쿼리 무효화
  await queryClient.invalidateQueries({ queryKey: ['member-points'] })
  await queryClient.invalidateQueries({ queryKey: ['user'] })
}
```

## 4. 포인트 흐름 정리

```
[후원자 (Member)]                    [수혜자 (Partner)]
      │                                     │
      │ 후원하기 버튼                         │
      ▼                                     │
┌─────────────────┐                         │
│ API 호출        │                         │
│ /donation       │                         │
└────────┬────────┘                         │
         │                                  │
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│ members         │                │ partners        │
│ total_points    │                │ total_points    │
│     -1000       │                │     +1000       │
│ (충전/사용 잔액) │                │ (번 포인트)      │
└────────┬────────┘                └────────┬────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│ member_points   │                │ partner_points  │
│ _logs           │                │ _logs           │
│ type: 'spend'   │                │ type: 'earn'    │
│ desc: '파트너   │                │ desc: '{이름}   │
│       후원'     │                │       후원'     │
└─────────────────┘                └─────────────────┘
```

## 5. 사용 예시

### 5.1 보이스룸에서 사용

```tsx
// src/routes/stream/chat/$roomId.tsx
import { StreamDonationSheet } from '@/components/features/stream/StreamDonationSheet'

function VoiceRoomPage() {
  const [isDonationSheetOpen, setIsDonationSheetOpen] = useState(false)
  const { hosts, roomId } = useVoiceRoomPage(roomId)

  return (
    <>
      {/* 하단 후원 버튼 */}
      <button 
        onClick={() => setIsDonationSheetOpen(true)}
        className="p-2.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white"
      >
        <Gift className="w-5 h-5" />
      </button>

      {/* 후원 바텀시트 */}
      <StreamDonationSheet
        isOpen={isDonationSheetOpen}
        onClose={() => setIsDonationSheetOpen(false)}
        roomId={roomId}
        hosts={hosts}
      />
    </>
  )
}
```

### 5.2 비디오룸에서 사용

```tsx
// src/routes/stream/video/$roomId.tsx
import { StreamDonationSheet } from '@/components/features/stream/StreamDonationSheet'

function VideoRoomPage() {
  const [isDonationSheetOpen, setIsDonationSheetOpen] = useState(false)
  const { hosts, roomId } = useVideoRoomPage(roomId)

  return (
    <>
      <button onClick={() => setIsDonationSheetOpen(true)}>
        <Gift className="w-5 h-5" />
      </button>

      <StreamDonationSheet
        isOpen={isDonationSheetOpen}
        onClose={() => setIsDonationSheetOpen(false)}
        roomId={roomId}
        hosts={hosts}
      />
    </>
  )
}
```

## 6. 보안 고려사항

### 6.1 프론트엔드 검증
- 포인트 부족 시 UI에서 차단
- 파트너가 아닌 발언자는 선택 불가
- 최소 금액 1,000P 미만 입력 차단

### 6.2 백엔드 검증 (RPC 함수)

| 보안 항목 | 구현 방식 | 상태 |
|----------|----------|------|
| **원자적 트랜잭션** | PostgreSQL RPC 함수 | ✅ |
| **레이스 컨디션 방지** | `FOR UPDATE` 락 | ✅ |
| **중복 요청 방지** | `log_id` UNIQUE 제약 | ✅ |
| **자동 롤백** | `EXCEPTION` 핸들링 | ✅ |
| **최소 금액 검증** | 서버에서 1000P 미만 차단 | ✅ |
| **포인트 부족 검증** | 차감 전 잔액 확인 | ✅ |

### 6.3 마이그레이션 파일

보안 강화를 위한 마이그레이션: `documents/migration_process_donation.sql`

```sql
-- 1. log_id UNIQUE 제약 추가 (중복 요청 방지)
ALTER TABLE member_points_logs 
ADD CONSTRAINT member_points_logs_log_id_unique UNIQUE (log_id);

ALTER TABLE partner_points_logs 
ADD CONSTRAINT partner_points_logs_log_id_unique UNIQUE (log_id);

-- 2. process_donation RPC 함수 생성
CREATE OR REPLACE FUNCTION process_donation(...) RETURNS JSONB AS $$ ... $$;
```

### 6.4 에러 코드

| 에러 코드 | 설명 |
|----------|------|
| `MIN_AMOUNT_REQUIRED` | 최소 1,000P 미만 |
| `INSUFFICIENT_POINTS` | 포인트 부족 |
| `DUPLICATE_REQUEST` | 이미 처리된 요청 |
| `MEMBER_NOT_FOUND` | 사용자 없음 |
| `PARTNER_NOT_FOUND` | 파트너 없음 |
| `TRANSACTION_FAILED` | 트랜잭션 실패 (자동 롤백됨) |

## 7. 구현 체크리스트

- [x] `StreamDonationSheet` 컴포넌트 구현
- [x] 발언자 선택 UI 구현 (파트너만 표시)
- [x] 금액 선택 UI 구현 (고정 옵션)
- [x] 최소 금액(1,000P) 검증 구현
- [x] "모두에게" 후원 로직 구현
- [x] 포인트 부족 시 충전 모달 연동
- [x] 보이스룸 페이지에 연동
- [x] 비디오룸 페이지에 연동
- [x] 후원 완료 UI 구현
- [x] `stream_donations` 테이블 (방별 후원 기록)
- [x] 실시간 후원 이펙트 (`DonationEffectOverlay`)
- [x] Top 5 랭킹 티커 (`DonationRankingTicker`)
- [x] `useStreamDonations` 훅 (실시간 구독)

## 8. 후원 이펙트 & 랭킹 시스템 (v1.3)

### 8.1 stream_donations 테이블

후원이 어느 방에서 발생했는지 기록하기 위한 별도 테이블:

```sql
CREATE TABLE stream_donations (
    id SERIAL PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES stream_rooms(id),
    donor_id UUID NOT NULL REFERENCES members(id),
    recipient_partner_id UUID NOT NULL REFERENCES partners(id),
    amount INTEGER NOT NULL CHECK (amount >= 1000),
    heart_image TEXT,
    message TEXT,
    log_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

마이그레이션: `documents/stream_schema_v2.sql` (통합 스키마)

### 8.2 후원 이펙트 (DonationEffectOverlay)

후원 발생 시 화면에 표시되는 애니메이션:

- 배경 글로우 효과
- 하트 파티클 (화면 하단에서 위로 떠오름)
- 후원 카드 (후원자 정보, 금액, 하트 이미지)
- 5초 후 자동 사라짐
- 큐 기반 순차 표시 (동시 후원 시)

### 8.3 랭킹 티커 (DonationRankingTicker)

채팅 영역 상단에 Top 5 후원자를 뉴스처럼 표시:

- 무한 스크롤 애니메이션
- 순위 배지 (1위: 왕관, 2위: 은색, 3위: 동색)
- 후원자 아바타, 이름, 누적 금액
- 마우스 호버 시 일시정지

### 8.4 실시간 수신 (useStreamDonations)

```tsx
const { 
  rankings,           // Top 5 랭킹
  activeEffects,      // 현재 표시 중인 이펙트
  triggerLocalEffect, // 로컬 후원 완료 시 이펙트 트리거
  refetchRankings,    // 랭킹 갱신
} = useStreamDonations({ roomId, enableRealtime: true })
```

---

## 9. 도네이션 타입 시스템 (v1.4)

### 9.1 도네이션 타입

| 타입 | 설명 | 최소 금액 | 보이스룸 | 비디오룸 |
|------|------|:--------:|:-------:|:-------:|
| `basic` | 일반 하트 후원 | 1,000P | ✅ | ✅ |
| `mission` | 미션 도네이션 | 3,000P | ✅ | ✅ |
| `video` | 영상 도네이션 | 5,000P | ❌ | ✅ |

### 9.2 도네이션 상태

| 상태 | 설명 |
|------|------|
| `pending` | 대기 중 (호스트 확인 전) |
| `accepted` | 수락됨 (미션만 해당, 진행 중) |
| `rejected` | 거절됨 (미션만 해당, 환불 처리) |
| `playing` | 재생 중 (영상 도네이션) |
| `completed` | 처리 완료 |
| `success` | 미션 성공 |
| `failed` | 미션 실패 |
| `skipped` | 스킵됨 |

### 9.2.1 미션 도네이션 플로우

```
[미션 도네이션 생성]
        ↓
    pending (대기)
        ↓
   ┌────┴────┐
   ↓         ↓
accepted   rejected
(수락)      (거절 → 환불)
   ↓
┌──┴──┐
↓     ↓
success failed
(성공)  (실패)
```

**미션 처리 규칙:**
- 일반 도네이션: 즉시 `completed`
- 영상 도네이션: 시청 시 `completed`
- 미션 도네이션: 
  - 수락 전: `pending`
  - 수락 후: `accepted` (미션 목록에 표시)
  - 거절: `rejected` (환불 처리)
  - 미션 수행 결과: `success` 또는 `failed`

### 9.3 컴포넌트 구조

```
src/components/features/stream/donation/
├── types.ts                    # 도네이션 타입 정의
├── index.ts                    # export
├── DonationControlCenter.tsx   # 호스트용 컨트롤 센터 (수락/거절/성공/실패)
├── DonationTypeSelector.tsx    # 타입 선택 UI
├── MissionDonationInput.tsx    # 미션 입력
├── MissionListBar.tsx          # 미션 목록 바 (라이브룸 상단용, 4~5개 표시)
├── MissionListPanel.tsx        # 미션 목록 패널 (보이스룸용, 바텀시트)
└── VideoDonationInput.tsx      # 영상 입력

src/components/features/stream/
└── StreamDonationSheetV2.tsx   # 확장된 후원 시트

src/hooks/
└── useDonationQueue.ts         # 도네이션 큐 관리 (미션 수락/거절/성공/실패 포함)
```

### 9.3.1 미션 UI 구성

**라이브룸 (비디오룸)** - `src/routes/stream/video/$roomId.tsx`
- **호스트**: 영상 상단 (네비게이션/랭킹티커 아래)에 `MissionListBar` 표시
  - 최대 4~5개 미션 표시
  - 수락/거절 → 성공/실패 버튼
- **시청자**: 영상 상단에 `ActiveMissionDisplay` 표시
  - 진행 중인 미션 실시간 표시
  - 미션 성공/실패 결과 알림 (3초간 표시)

**보이스룸** - `src/routes/stream/chat/$roomId.tsx`
- **공통**: 채팅 입력 영역에 미션 목록 버튼 (Target 아이콘)
- **호스트/시청자**: `MissionListPanel` (바텀시트) 사용
  - 섹션별 분류: 대기중 / 진행중 / 완료
  - 호스트만 수락/거절/성공/실패 버튼 표시
- **시청자**: 랭킹 티커 아래에 `ActiveMissionDisplay` 컴팩트 모드 표시
  - 클릭 시 `MissionListPanel` 열림

**호스트 관리 대시보드** - `DonationControlCenter`
- 대기 / 진행중 / 완료 / 스킵 탭
- 진행중 탭에서 수락된 미션 관리
- 성공/실패 처리 가능

### 9.4 사용 예시

```tsx
// 후원자용 시트 (V2)
import { StreamDonationSheetV2 } from '@/components/features/stream/StreamDonationSheetV2'

<StreamDonationSheetV2
  isOpen={isDonationSheetOpen}
  onClose={() => setIsDonationSheetOpen(false)}
  roomId={roomId}
  hosts={hosts}
  roomType="voice"  // 또는 "video"
/>

// 호스트용 컨트롤 센터 (수락/거절/성공/실패 지원)
import { DonationControlCenter } from '@/components/features/stream/donation'

<DonationControlCenter
  isOpen={isControlCenterOpen}
  onClose={() => setIsControlCenterOpen(false)}
  roomId={roomId}
  roomType="video"
  onPlayVideo={(url, donation) => {
    // 영상 재생 로직
  }}
/>

// 라이브룸 미션 목록 바 (상단용)
import { MissionListBar } from '@/components/features/stream/donation'

<MissionListBar
  roomId={roomId}
  isHost={isHost}
  maxItems={5}  // 최대 표시 개수
/>

// 보이스룸 미션 목록 패널 (바텀시트)
import { MissionListPanel } from '@/components/features/stream/donation'

<MissionListPanel
  roomId={roomId}
  isHost={isHost}
  isOpen={isMissionPanelOpen}
  onClose={() => setIsMissionPanelOpen(false)}
/>

// 시청자용 진행 중인 미션 표시 (실시간)
import { ActiveMissionDisplay } from '@/components/features/stream/donation'

<ActiveMissionDisplay
  roomId={roomId}
  maxItems={5}
  compact={false}  // true면 컴팩트 모드
/>
```

### 9.5 마이그레이션

`documents/stream_schema_v2.sql` 참조 (통합 스키마)

---

**작성일**: 2025-12-21
**수정일**: 2025-12-21
**버전**: 1.6

### 변경 이력
- v1.6: 라이브룸/보이스룸 페이지에 미션 UI 실제 연동 (ActiveMissionDisplay, MissionListBar, MissionListPanel)
- v1.5: 미션 처리 확장 (수락/거절/성공/실패), 환불 로직, MissionListBar, MissionListPanel 추가
- v1.4: 도네이션 타입 시스템 추가 (일반/미션/영상), DonationControlCenter, StreamDonationSheetV2
- v1.3: 후원 이펙트, Top 5 랭킹 티커, stream_donations 테이블 추가
- v1.2: RPC 함수 사용으로 보안 강화 (원자적 트랜잭션, 중복 방지, 자동 롤백)
- v1.1: gift_items 테이블 제거, 포인트 직접 전송 방식으로 변경, 최소 1000P 제한 추가
- v1.0: 초기 설계
