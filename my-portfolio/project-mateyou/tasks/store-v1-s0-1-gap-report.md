# Store v1 API 갭 리포트 (Session S0-1)

## 1. 엔드포인트 매핑표

### 1.1 api-store-products

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| GET /api-store-products | ✅ GET /api-store-products | ✅ 일치 | |
| GET /api-store-products/detail?product_id= | ✅ GET /api-store-products/detail?product_id= | ✅ 일치 | |
| POST /api-store-products | ✅ POST /api-store-products | ✅ 일치 | |
| PUT /api-store-products/update?product_id= | ✅ PUT /api-store-products/update?product_id= | ✅ 일치 | |
| DELETE /api-store-products/delete?product_id= | ✅ DELETE /api-store-products/delete?product_id= | ✅ 일치 | |
| GET /api-store-products/partner/my | ✅ GET /api-store-products/partner/my | ✅ 일치 | |

**이슈**: `PUT /api-store-products/update`에서 협업 상품 재고 수정 권한 체크 누락 (정책 위반)

---

### 1.2 api-store-orders

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| GET /api-store-orders | ✅ GET /api-store-orders | ✅ 일치 | |
| GET /api-store-orders/:id | ✅ GET /api-store-orders/:id | ✅ 일치 | |
| POST /api-store-orders | ✅ POST /api-store-orders | ✅ 일치 | |
| PUT /api-store-orders/:id/status | ✅ PUT /api-store-orders/:id/status | ✅ 일치 | |
| PUT /api-store-orders/:id/confirm | ✅ PUT /api-store-orders/:id/confirm | ✅ 일치 | |
| PUT /api-store-orders/:id/cancel | ✅ PUT /api-store-orders/:id/cancel | ✅ 일치 | |
| GET /api-store-orders/partner/orders | ✅ GET /api-store-orders/partner/orders | ✅ 일치 | |

**이슈**: 상태전이 검증 로직 없음 (M0-1에서 구현한 `validateOrderTransition` 미적용)

---

### 1.3 api-store-payments

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| POST /api-store-payments/confirm | ✅ POST /api-store-payments/confirm | ✅ 일치 | |

**이슈**: 
- 디지털 상품 결제 성공 시 `POST /api-store-digital/grant-access` 자동 호출 없음 (직접 권한 부여)
- 현장수령 상품 결제 성공 시 스케줄 row 생성 로직 있음 (✅)
- 개인 택배 결제 성공 시 채팅 구매요청 자동 발송 로직 없음 (❌)

---

### 1.4 api-store-refunds

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| POST /api-store-refunds | ✅ POST /api-store-refunds | ✅ 일치 | |
| GET /api-store-refunds | ✅ GET /api-store-refunds | ✅ 일치 | |
| GET /api-store-refunds/detail?refund_id= | ✅ GET /api-store-refunds/:id | ⚠️ 경로 다름 | PRD: query param, 실제: path param |
| PUT /api-store-refunds/respond?refund_id= | ✅ PUT /api-store-refunds/process?refund_id= | ⚠️ 경로 다름 | PRD: respond, 실제: process |

**추가 구현**: 
- PUT /api-store-refunds/partner/list (파트너 환불 목록)
- PUT /api-store-refunds/return-fee?refund_id= (반품 배송비 결제)

---

### 1.5 api-store-schedules

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| GET /api-store-schedules | ✅ GET /api-store-schedules | ✅ 일치 | |
| GET /api-store-schedules/:id | ✅ GET /api-store-schedules/:id | ✅ 일치 | |
| POST /api-store-schedules | ✅ POST /api-store-schedules | ✅ 일치 | |
| POST /api-store-schedules/bulk | ✅ POST /api-store-schedules/bulk | ✅ 일치 | |
| PUT /api-store-schedules/:id | ✅ PUT /api-store-schedules/:id | ✅ 일치 | |
| DELETE /api-store-schedules/:id | ✅ DELETE /api-store-schedules/:id | ✅ 일치 | |
| GET /api-store-schedules/partner/my | ✅ GET /api-store-schedules/partner/my | ✅ 일치 | |
| PUT /api-store-schedules/:id/pickup | ✅ PUT /api-store-schedules/:id/pickup | ✅ 일치 | |
| PUT /api-store-schedules/order/:order_id/status | ✅ PUT /api-store-schedules/order/:order_id/status | ✅ 일치 | |
| PUT /api-store-schedules/order/:order_id/confirm | ✅ PUT /api-store-schedules/order/:order_id/confirm | ✅ 일치 | |
| GET /api-store-schedules/chat/:chat_room_id | ✅ GET /api-store-schedules/chat/:chat_room_id | ✅ 일치 | |

**정책 위반**: 슬롯 예약 시스템 구현됨 (`max_capacity`, `current_bookings`, `is_available`)

---

### 1.6 api-store-digital

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| GET /api-store-digital/downloads | ✅ GET /api-store-digital/downloads | ✅ 일치 | |
| GET /api-store-digital/downloads?download_id= | ✅ GET /api-store-digital/downloads?download_id= | ✅ 일치 | |
| GET /api-store-digital/downloads?order_id= | ✅ GET /api-store-digital/downloads?order_id= | ✅ 일치 | |
| GET /api-store-digital/assets?product_id= | ✅ GET /api-store-digital/assets?product_id= | ✅ 일치 | |
| GET /api-store-digital/purchased | ✅ GET /api-store-digital/purchased | ✅ 일치 | |
| POST /api-store-digital/grant-access | ✅ POST /api-store-digital/grant-access | ✅ 일치 | |

**이슈**: 
- 다운로드 URL 생성 시 권한 검증 있음 (✅)
- 하지만 결제 성공 시 자동 호출되지 않음 (수동 호출 필요)

---

### 1.7 api-store-collaboration

| PRD 명세 | 실제 구현 | 상태 | 비고 |
|---------|----------|------|------|
| GET /api-store-collaboration/product-requests | ✅ GET /api-store-collaboration/product-requests | ✅ 일치 | |
| GET /api-store-collaboration/product-requests/admin | ✅ GET /api-store-collaboration/product-requests/admin | ✅ 일치 | |
| GET /api-store-collaboration/product-requests/detail?request_id= | ✅ GET /api-store-collaboration/product-requests/detail?request_id= | ✅ 일치 | |
| PUT /api-store-collaboration/product-requests/respond?request_id= | ✅ PUT /api-store-collaboration/product-requests/respond?request_id= | ✅ 일치 | |
| POST /api-store-collaboration/shipment-requests | ✅ POST /api-store-collaboration/shipment-requests | ✅ 일치 | |
| GET /api-store-collaboration/shipment-requests | ✅ GET /api-store-collaboration/shipment-requests | ✅ 일치 | |
| GET /api-store-collaboration/shipment-requests/detail?request_id= | ✅ GET /api-store-collaboration/shipment-requests/detail?request_id= | ✅ 일치 | |
| PUT /api-store-collaboration/shipment-requests/respond?request_id= | ✅ PUT /api-store-collaboration/shipment-requests/respond?request_id= | ✅ 일치 | |
| GET /api-store-collaboration/products | ✅ GET /api-store-collaboration/products | ✅ 일치 | |
| GET /api-store-collaboration/products/detail?product_id= | ✅ GET /api-store-collaboration/products/detail?product_id= | ✅ 일치 | |
| PUT /api-store-collaboration/products/stock?product_id= | ✅ PUT /api-store-collaboration/products/stock?product_id= | ✅ 일치 | Admin 전용 (✅) |
| GET /api-store-collaboration/stats | ✅ GET /api-store-collaboration/stats | ✅ 일치 | |
| GET /api-store-collaboration/partner/pending-orders | ✅ GET /api-store-collaboration/partner/pending-orders | ✅ 일치 | |

---

## 2. 정책 위반 탐지

### 2.1 ❌ Pickup 슬롯 예약/홀드 구현 발견

**위치**: `supabase/functions/api-store-schedules/index.ts`

**발견 사항**:
- `max_capacity`, `current_bookings`, `is_available` 필드 사용
- `availableOnly` 파라미터로 예약 가능한 스케줄만 필터링
- `current_bookings < max_capacity` 조건으로 슬롯 예약 시스템 구현

**PRD 요구사항**:
> Pickup(on_site)은 슬롯 예약형(달력/홀드)이 아니라 채팅 기반 확정형이다.

**수정 방안**:
1. `max_capacity`, `current_bookings`, `is_available` 필드 제거 또는 무시
2. `availableOnly` 파라미터 제거
3. 스케줄 생성 시 `start_time`, `location` null 허용 (채팅 조율 후 확정)
4. `PUT /api-store-schedules/order/:order_id/confirm`에서만 `start_time`, `location` 확정

**우선순위**: 🔴 높음 (PRD 핵심 정책 위반)

---

### 2.2 ✅ Digital 다운로드 URL 권한 검증

**위치**: `supabase/functions/api-store-digital/index.ts` (line 26-44)

**확인 사항**:
- `GET /api-store-digital/downloads?download_id=`에서 권한 검증 있음
- `user_id` 및 `order.status` 확인
- 만료 시간 검증

**이슈**:
- 결제 성공 시 `POST /api-store-digital/grant-access` 자동 호출 없음
- 현재는 `api-store-payments/confirm`에서 직접 권한 부여 (line 111-127)

**수정 방안**:
- `api-store-payments/confirm`에서 `POST /api-store-digital/grant-access` 호출로 변경
- 또는 내부 함수로 권한 부여 로직 분리

**우선순위**: 🟡 중간

---

### 2.3 ❌ Collaboration 재고를 Partner가 수정 가능

**위치**: `supabase/functions/api-store-products/index.ts` (line 421-495)

**발견 사항**:
- `PUT /api-store-products/update`에서 협업 상품 재고 수정 권한 체크 없음
- Partner가 본인 상품이면 재고 수정 가능 (line 475: `stock` 필드 업데이트)

**PRD 요구사항**:
> 협업 상품(source=collaboration)의 재고(옵션 재고 포함) SoT는 관리자(Admin)이며, 관리자만 재고 수정 가능하다.

**수정 방안**:
```typescript
// 상품 소유권 확인 후
if (existingProduct.source === 'collaboration' && stock !== undefined) {
  if (!isAdmin) {
    return errorResponse('FORBIDDEN', '협업 상품 재고는 관리자만 수정할 수 있습니다.', null, 403);
  }
}
```

**우선순위**: 🔴 높음 (재고 관리 권한 위반)

---

### 2.4 ✅ Orders Status Enum 일치

**확인 사항**:
- PRD: `pending`, `paid`, `shipped`, `delivered`, `confirmed`, `cancelled`
- 실제 구현: `cancelled` 사용 (일치)

**이슈**: 상태전이 검증 로직 없음 (M0-1에서 구현한 함수 미적용)

**우선순위**: 🟡 중간

---

## 3. 최소 수정 계획

### Session S0-2: 도메인/상태전이 고정 적용

**타겟 파일**:
1. `supabase/functions/api-store-orders/index.ts`
   - `PUT /api-store-orders/:id/status`에 `validateOrderTransition` 적용
   - `PUT /api-store-orders/:id/cancel`에 상태전이 검증 추가

2. `supabase/functions/api-store-schedules/index.ts`
   - `PUT /api-store-schedules/order/:order_id/status`에 `validateScheduleTransition` 적용
   - `PUT /api-store-schedules/order/:order_id/confirm`에 상태전이 검증 추가
   - `PUT /api-store-schedules/:id/pickup`에 상태전이 검증 추가

**작업**:
- `store-state-transitions.ts` import
- 각 상태 변경 지점에 검증 함수 호출
- 에러 응답 형식 통일 (409 Conflict)

---

### Session S0-3: 슬롯 예약 시스템 제거

**타겟 파일**:
1. `supabase/functions/api-store-schedules/index.ts`
   - `max_capacity`, `current_bookings`, `is_available` 필드 사용 제거
   - `availableOnly` 파라미터 제거
   - 스케줄 생성 시 `start_time`, `location` null 허용 강제
   - `GET /api-store-schedules`에서 슬롯 필터링 로직 제거

**작업**:
- 슬롯 관련 필드/로직 주석 처리 또는 제거
- 채팅 기반 확정형으로 동작하도록 수정
- DB 스키마 변경 필요 시 마이그레이션 계획 수립

---

### Session S0-4: 재고 권한 강화

**타겟 파일**:
1. `supabase/functions/api-store-products/index.ts`
   - `PUT /api-store-products/update`에 협업 상품 재고 수정 권한 체크 추가

**작업**:
- 협업 상품 재고 수정 시 Admin 권한 강제
- 에러 메시지 명확화

---

### Session S1-1: 결제 후 자동 트리거 구현

**타겟 파일**:
1. `supabase/functions/api-store-payments/index.ts`
   - 디지털 상품: `POST /api-store-digital/grant-access` 자동 호출
   - 개인 택배: 채팅 구매요청 메시지 자동 발송
   - 현장수령: 스케줄 row 생성 (이미 구현됨)

**작업**:
- 결제 성공 후 product_type/source 분기 처리
- 채팅 메시지 발송 로직 추가
- 권한 부여 API 호출 또는 내부 함수 호출

---

### Session S1-2: 환불 API 경로 정리

**타겟 파일**:
1. `supabase/functions/api-store-refunds/index.ts`
   - `GET /api-store-refunds/detail?refund_id=` 경로 변경 (query param)
   - `PUT /api-store-refunds/respond?refund_id=` 경로 변경 (respond)

**작업**:
- 경로 매칭 로직 수정
- 기존 경로는 deprecated 처리 또는 리다이렉트

---

## 4. 다음 세션(S0-2) 추천

### 도메인/상태전이 고정 적용 위치

**파일**: `supabase/functions/_shared/store-state-transitions.ts` (이미 생성됨)

**적용 대상**:

1. **`supabase/functions/api-store-orders/index.ts`**
   - Line 205-294: `PUT /api-store-orders/:id/status`
     ```typescript
     import { validateOrderTransition, stateTransitionErrorToResponse } from '../_shared/store-state-transitions.ts';
     
     // 상태 변경 전
     try {
       validateOrderTransition(order.status, status);
     } catch (error) {
       if (error.name === 'StateTransitionError') {
         return stateTransitionErrorToResponse(error);
       }
       throw error;
     }
     ```
   
   - Line 427-465: `PUT /api-store-orders/:id/cancel`
     - 동일한 검증 로직 적용

2. **`supabase/functions/api-store-schedules/index.ts`**
   - Line 498-570: `PUT /api-store-schedules/order/:order_id/status`
     ```typescript
     import { validateScheduleTransition, canReportNoShow, stateTransitionErrorToResponse } from '../_shared/store-state-transitions.ts';
     
     // no_show 전이인 경우
     if (status === 'no_show') {
       const noShowResult = canReportNoShow({ startAt: schedule.start_time });
       if (!noShowResult.valid) {
         return stateTransitionErrorToResponse(noShowResult.error!);
       }
     }
     
     // 상태전이 검증
     validateScheduleTransition(schedule.status, status);
     ```
   
   - Line 671-814: `PUT /api-store-schedules/order/:order_id/confirm`
     - `pending → reserved` 전이 검증
   
   - Line 410-497: `PUT /api-store-schedules/:id/pickup`
     - `reserved → completed` 전이 검증
     - timesheet 조건 확인 (근무형 파트너만)

**예상 작업량**: 각 파일당 20-30분 (총 2-3시간)

---

## 5. 요약

### ✅ 잘 구현된 부분
- 대부분의 엔드포인트가 PRD 명세와 일치
- 디지털 다운로드 권한 검증 구현됨
- 협업 상품 재고 수정 API는 Admin 전용으로 구현됨
- 현장수령 스케줄 확정 로직 구현됨

### ❌ 수정 필요 부분
1. **슬롯 예약 시스템 제거** (PRD 핵심 정책 위반)
2. **협업 상품 재고 수정 권한 체크 추가** (보안 이슈)
3. **상태전이 검증 로직 적용** (데이터 무결성)
4. **결제 후 자동 트리거 구현** (UX 개선)

### 📊 우선순위
1. 🔴 높음: 슬롯 예약 시스템 제거, 재고 권한 강화
2. 🟡 중간: 상태전이 검증 적용, 결제 후 자동 트리거
3. 🟢 낮음: 환불 API 경로 정리




