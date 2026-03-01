# 후원 룰렛 시스템 설계 v2

## 1. 개요

스트림(보이스룸/비디오룸)에서 **룰렛 타입 후원**을 선택하여 룰렛을 돌리는 기능입니다.

### 핵심 변경사항 (v2)
- **룰렛판(Wheel) 개념 도입**: 파트너가 여러 개의 룰렛판을 만들 수 있음
- **각 룰렛판은 고정 금액**: 1000P 룰렛, 5000P 룰렛 등 각각 다른 금액
- **시청자가 룰렛판을 선택해서 후원**: 금액이 아닌 룰렛판을 선택

### 예시
```
파트너 A의 룰렛:
- 🎰 1000P 럭키 룰렛 → [꽝, +500P, 응원메시지]
- 🎰 5000P 프리미엄 룰렛 → [꽝, +2000P, 1:1 응원, VIP 뱃지]
- 🎰 10000P 레전드 룰렛 → [대박 당첨!, 1:1 통화권, 팬미팅 초대]
```

## 1.1 파트너 대시보드 통합

**룰렛 설정은 파트너 대시보드(/dashboard/partner)에서 관리**합니다.
- 방송을 켜지 않아도 사전에 룰렛 설정 가능
- 파트너 대시보드 → 방송 관리 탭에서 설정

### 파트너 대시보드 방송 관리 탭 구성:
1. **방송 수익 통계**: 총 후원, 진행한 방송 수, 누적 시청자
2. **후원 룰렛 설정**: 룰렛 ON/OFF, **룰렛판 관리**, 각 판별 아이템 관리
3. **누적 후원자 TOP 10**: 가장 많이 후원한 팬 순위
4. **최근 방송 목록**: 과거 방송 기록

## 2. 핵심 기능

### 2.1 파트너(호스트) 기능
- **룰렛판(Wheel) 생성/수정/삭제**
  - 룰렛판 이름 (예: "1000P 럭키 룰렛")
  - **고정 금액** 설정 (예: 1000P, 5000P)
  - 설명 (선택)
- **각 룰렛판 내 아이템 관리**
  - 아이템 이름, 색상
  - **상대적 가중치** (1, 2, 3 등 정수 - 합계 100% 아님)
- 룰렛 활성화/비활성화 토글
- **파트너 대시보드에서 방송 없이도 설정 가능**
- 활성화 시 후원 타입에 "🎰 룰렛" 추가됨

### 2.2 시청자(후원자) 기능
- **룰렛판 선택** (금액이 아닌 룰렛판을 선택)
- 각 룰렛판의 아이템 및 확률 미리보기
- 후원 시 룰렛 **자동 즉시 실행** (수락 불필요)
- 룰렛 결과 획득

### 2.3 공통 기능 (큐 시스템)
- 후원 발생 시 **모든 참가자**에게 룰렛 돌림판 UI 표시
- **룰렛판 이름 + 금액** 표시
- **큐 순서대로 순차 표시** (동시 후원 시 대기 후 차례대로)
- 실시간 애니메이션 (Spin → 감속 → 결과 표시)
- 결과 채팅 메시지 자동 발송
- 하나의 룰렛이 끝나면 다음 큐의 룰렛 자동 시작

## 3. 데이터베이스 스키마

### 3.1 테이블 구조

```sql
-- 파트너 룰렛 설정 (활성화 여부만)
partner_roulette_settings:
  - partner_id (FK → partners)
  - is_enabled: boolean

-- 룰렛판 (각 판마다 고정 금액)
partner_roulette_wheels:
  - id
  - partner_id (FK → partners)
  - name: text (룰렛판 이름)
  - price: integer (고정 금액, 최소 100P)
  - description: text (선택)
  - is_active: boolean
  - sort_order: integer

-- 룰렛 아이템 (각 wheel에 속함)
partner_roulette_items:
  - id
  - wheel_id (FK → partner_roulette_wheels)
  - name: text
  - color: text
  - weight: integer (상대적 가중치, 1 이상)
  - sort_order: integer
  - is_active: boolean

-- 룰렛 결과 (Realtime 전파용)
donation_roulette_results:
  - id
  - donation_id
  - room_id
  - donor_id
  - partner_id
  - wheel_id
  - roulette_item_id
  - wheel_name (스냅샷)
  - wheel_price (스냅샷)
  - item_name (스냅샷)
  - item_color (스냅샷)
  - all_items: JSONB
  - final_rotation: numeric
  - is_processed: boolean
```

### 3.2 관계도

```
partners
  └── partner_roulette_settings (1:1)
  └── partner_roulette_wheels (1:N)
        └── partner_roulette_items (1:N)
```

## 4. 컴포넌트 구조

### 4.1 파트너 설정

```
RouletteSettingsSheet
├── 활성화 토글
├── 룰렛판 목록
│   ├── RouletteWheelCard (각 룰렛판)
│   │   ├── 금액 뱃지
│   │   ├── 이름, 아이템 개수
│   │   ├── 펼치기 → 아이템 목록
│   │   └── 수정/삭제 버튼
│   └── 룰렛판 추가 버튼
├── RouletteWheelEditor (모달: 룰렛판 추가/수정)
└── RouletteItemEditor (모달: 아이템 추가/수정)
```

### 4.2 시청자 후원

```
StreamDonationSheetV2
├── 후원 타입 선택 (basic, mission, video, roulette)
├── 발언자 선택
├── [룰렛 타입일 때]
│   └── 룰렛판 선택 (각 판마다 금액 표시)
│       ├── RouletteWheelSelector
│       └── 선택된 판의 아이템 미리보기
├── [일반 타입일 때]
│   └── 금액 선택
└── 후원하기 버튼
```

### 4.3 룰렛 표시 (오버레이)

```
RouletteOverlay
├── 룰렛판 이름 + 금액 뱃지
├── 후원자 정보
├── RouletteWheel (돌림판)
├── 결과 표시
└── 대기 큐 개수
```

## 5. Realtime 통합 (`useStreamDonations.ts`)

### 5.1 기존 구조 분석

현재 프로젝트의 스트림 관련 Realtime 훅:
- `useUnifiedStreamChannel.ts` - 브로드캐스트 채널 (모더레이션, P2P 시그널링)
- `useStreamDonations.ts` - 후원 이펙트 + 랭킹 (postgres_changes)
- `useDonationQueue.ts` - 도네이션 큐 관리 (미션 등)

### 5.2 룰렛 통합 위치

**`useStreamDonations.ts`에 룰렛 기능 통합**
- 후원 이펙트와 룰렛이 동일한 큐 시스템 공유
- `donation_roulette_results` 테이블 구독 추가

### 5.3 통합 후 Realtime 구독 구조

```typescript
// useStreamDonations.ts 내부
useEffect(() => {
  if (!roomId || !enableRealtime) return

  const channel = supabase
    .channel(`stream-donations-${roomId}`)
    // 1. 후원 이벤트 구독
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_donations',
      filter: `room_id=eq.${roomId}`,
    }, handleDonation)
    // 2. 룰렛 결과 구독
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'donation_roulette_results',
      filter: `room_id=eq.${roomId}`,
    }, handleRouletteResult)
    .subscribe()
}, [roomId])
```

## 6. RPC 함수

### 6.1 execute_donation_roulette (룰렛 실행)

**파라미터:**
- p_donation_id: 후원 ID
- p_room_id: 방 ID
- p_donor_id: 후원자 ID
- p_partner_id: 파트너 ID
- **p_wheel_id: 선택한 룰렛판 ID**

**동작:**
1. 룰렛 설정 확인 (is_enabled)
2. 룰렛판 확인 (is_active)
3. 해당 판의 아이템 조회
4. 가중치 기반 아이템 선택
5. 결과 저장 (Realtime 전파)
6. stream_donations 업데이트

### 6.2 calculate_roulette_result (가중치 기반 선택)

**파라미터:**
- p_wheel_id: 룰렛판 ID

**동작:**
1. 해당 판의 활성 아이템 조회
2. 가중치 합계 계산
3. 랜덤 값 생성
4. 누적 가중치 기반 아이템 선택
5. 선택된 아이템 ID 반환

## 7. UI 흐름

### 7.1 시청자 후원 흐름

```
1. 후원 버튼 클릭
2. StreamDonationSheetV2 열림
3. 후원 타입에서 "🎰 룰렛" 선택
4. 룰렛판 목록 표시 (각 판마다 금액)
5. 원하는 룰렛판 선택
6. 해당 판의 아이템 미리보기 확인
7. "룰렛 돌리기" 버튼 클릭
8. 후원 처리 + 룰렛 RPC 호출
9. Realtime으로 모든 참가자에게 룰렛 결과 전파
10. RouletteOverlay 표시 (모든 참가자)
```

### 7.2 파트너 설정 흐름

```
1. 파트너 대시보드 접속
2. "방송 관리" 탭 선택
3. "룰렛 설정" 카드 클릭
4. RouletteSettingsSheet 열림
5. 룰렛 활성화 토글
6. "룰렛판 추가" 클릭
7. 룰렛판 이름, 금액 입력
8. 저장 후 해당 판 펼치기
9. "아이템 추가" 클릭
10. 아이템 이름, 색상, 가중치 입력
11. 반복하여 여러 아이템 추가
```

## 8. 가중치 시스템

### 8.1 상대적 가중치

- 가중치는 **상대적인 값** (1, 2, 3 등)
- 합계가 100일 필요 없음
- 확률 = (해당 아이템 가중치) / (전체 가중치 합계)

### 8.2 예시

```
아이템 A: 가중치 1
아이템 B: 가중치 2
아이템 C: 가중치 1

전체 가중치 = 4
확률:
- A: 1/4 = 25%
- B: 2/4 = 50%
- C: 1/4 = 25%
```

### 8.3 UI 표시

- 룰렛판 UI: **모든 칸 동일 크기** (가중치는 확률에만 영향)
- 확률 미리보기: 각 아이템별 계산된 확률(%) 표시

## 9. 훅 구조

### 9.1 usePartnerRouletteSettings

```typescript
// 파트너 룰렛 활성화 설정 관리
const {
  settings,           // { is_enabled, wheels, is_valid }
  isLoading,
  updateSettings,     // is_enabled 토글
  toggleEnabled,
} = usePartnerRouletteSettings({ partnerId })
```

### 9.2 useRouletteWheels

```typescript
// 룰렛판 + 아이템 CRUD
const {
  wheels,             // 룰렛판 목록 (각 판에 items 포함)
  isLoading,
  addWheel,           // 룰렛판 추가
  updateWheel,        // 룰렛판 수정
  deleteWheel,        // 룰렛판 삭제 (CASCADE로 아이템도 삭제)
  addItem,            // 아이템 추가
  updateItem,         // 아이템 수정
  deleteItem,         // 아이템 삭제
  isUpdating,
} = useRouletteWheels({ partnerId })
```

### 9.3 useStreamDonations (확장)

```typescript
// 기존 후원 이펙트 + 룰렛 큐
const {
  // 기존
  rankings,
  activeEffects,
  // 추가
  currentRoulette,      // 현재 표시 중인 룰렛
  rouletteQueueLength,  // 대기 중인 룰렛 수
  skipCurrentRoulette,  // 호스트 전용: 현재 룰렛 스킵
} = useStreamDonations({ roomId })
```

## 10. 파일 구조

```
src/
├── components/features/stream/roulette/
│   ├── types.ts                    # 타입 정의
│   ├── RouletteSettingsSheet.tsx   # 파트너 설정 시트
│   ├── RouletteItemEditor.tsx      # 아이템 추가/수정 모달
│   ├── RouletteProbabilityPreview.tsx  # 확률 미리보기
│   ├── RouletteWheel.tsx           # 돌림판 UI
│   ├── RouletteOverlay.tsx         # 전체화면 오버레이
│   └── index.ts                    # 내보내기
│
├── hooks/
│   ├── usePartnerRouletteSettings.ts  # 파트너 설정 훅
│   ├── useRouletteWheels.ts           # 룰렛판/아이템 CRUD 훅
│   └── useStreamDonations.ts          # (확장) 룰렛 큐 포함
│
└── documents/
    ├── donation_roulette_system.md    # 이 문서
    └── migration_donation_roulette.sql  # DB 마이그레이션
```

## 11. 마이그레이션

### 11.1 기존 데이터 호환성

- 기존 `partner_roulette_items` 테이블 구조 변경 필요
- `partner_id` → `wheel_id` 외래키 변경
- 기존 데이터가 있다면 마이그레이션 스크립트 필요

### 11.2 새 테이블

- `partner_roulette_wheels` 테이블 추가
- `donation_roulette_results`에 `wheel_id`, `wheel_name`, `wheel_price` 컬럼 추가

---

**v2 - 2025-12-25**
