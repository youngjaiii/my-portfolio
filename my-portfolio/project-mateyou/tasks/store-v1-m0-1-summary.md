# Session M0-1: 도메인 상수/타입 + 상태전이 규칙 구현 요약

## 구현 완료 사항

### 1. 도메인 타입 및 상수 정의
**파일**: `supabase/functions/_shared/store-types.ts`

- `ProductType`: 'digital' | 'on_site' | 'delivery'
- `ProductSource`: 'partner' | 'collaboration'
- `OrderStatus`: 'pending' | 'paid' | 'shipped' | 'delivered' | 'confirmed' | 'cancelled'
- `ScheduleStatus`: 'pending' | 'reserved' | 'completed' | 'no_show' | 'canceled'
- 각 타입별 상수 객체 및 유효성 검증 함수 제공

### 2. 상태전이 규칙 및 검증 함수
**파일**: `supabase/functions/_shared/store-state-transitions.ts`

#### 주문 상태전이 규칙
```
pending → paid, cancelled
paid → shipped, delivered, cancelled
shipped → delivered
delivered → confirmed
confirmed, cancelled → (종료 상태)
```

#### 스케줄 상태전이 규칙
```
pending → reserved, canceled
reserved → completed, no_show, canceled
completed, no_show, canceled → (종료 상태)
```

#### 주요 함수
- `canTransitionOrder(from, to)`: 주문 상태전이 가능 여부 검증
- `validateOrderTransition(from, to)`: 검증 실패 시 에러 throw
- `canTransitionSchedule(from, to)`: 스케줄 상태전이 가능 여부 검증
- `validateScheduleTransition(from, to)`: 검증 실패 시 에러 throw
- `canReportNoShow(options)`: no_show 신고 조건 검증 (start_at + 30분)
- `stateTransitionErrorToResponse(error)`: 에러를 HTTP 409 응답으로 변환

### 3. 테스트 스니펫
**파일**: `supabase/functions/_shared/store-state-transitions.test.ts`

- 주문 상태전이 테스트 (허용/비허용 케이스)
- 스케줄 상태전이 테스트
- no_show 조건 검증 테스트

### 4. 사용 예시
**파일**: `supabase/functions/_shared/store-state-transitions.example.ts`

- API 핸들러에서 상태전이 검증 적용 방법
- 에러 처리 및 HTTP 응답 변환 예시

## 변경 파일 목록

1. `supabase/functions/_shared/store-types.ts` (신규)
2. `supabase/functions/_shared/store-state-transitions.ts` (신규)
3. `supabase/functions/_shared/store-state-transitions.test.ts` (신규)
4. `supabase/functions/_shared/store-state-transitions.example.ts` (신규)
5. `tasks/store-v1-schema-summary.md` (신규, M0-2 세션용 스키마 후보)

## 수동 테스트 방법

### 1. 타입 검증 테스트
```bash
# Deno 환경에서 테스트 실행
cd supabase/functions/_shared
deno run --allow-all store-state-transitions.test.ts
```

### 2. API 핸들러에서 사용 예시
```typescript
import { validateOrderTransition, stateTransitionErrorToResponse } from '../_shared/store-state-transitions.ts';

// 주문 상태 변경 API에서
try {
  validateOrderTransition(currentStatus, newStatus);
  // DB 업데이트 진행
} catch (error) {
  if (error.name === 'StateTransitionError') {
    return stateTransitionErrorToResponse(error);
  }
  // 기타 에러 처리
}
```

### 3. curl 테스트 (API 핸들러 적용 후)
```bash
# 허용되는 전이
curl -X PUT "https://your-api/api-store-orders/{order_id}/status" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"status": "shipped"}'

# 허용되지 않는 전이 (409 Conflict 예상)
curl -X PUT "https://your-api/api-store-orders/{order_id}/status" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'  # pending → confirmed는 불가
```

## 다음 세션(M0-2) 추천

### 우선순위 1: 데이터베이스 스키마 설계
- `tasks/store-v1-schema-summary.md` 참고
- 핵심 테이블: store_products, store_orders, store_partner_schedules, store_digital_downloads 등
- ENUM 타입 정의 (PostgreSQL)
- 인덱스 및 RLS 정책 설계

### 우선순위 2: 기존 API 핸들러에 상태전이 검증 적용
- `api-store-orders/index.ts`의 `PUT /api-store-orders/:id/status` 엔드포인트
- `api-store-schedules/index.ts`의 스케줄 상태 변경 엔드포인트
- 에러 응답 형식 통일 (409 Conflict)

### 우선순위 3: 타입 안정성 강화
- 기존 API 핸들러에서 문자열 리터럴 대신 타입 상수 사용
- TypeScript 타입 가드 적용

## 참고사항

- 모든 상태전이 규칙은 PRD v1.0 결정사항을 기반으로 구현됨
- 에러 코드는 HTTP 409 Conflict로 반환 (상태 충돌)
- no_show 신고는 예약 시간 30분 후부터 가능 (PRD 기준)
- timesheet 연계는 참조만 하며, 기존 timesheet 코드는 수정하지 않음




